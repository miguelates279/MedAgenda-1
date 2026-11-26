import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../db/database.service';
import { AppointmentActionDto, CreateAppointmentDto, UpdateAppointmentDto } from './dto/appointments.dto';
import * as AppointmentWrites from './repo/writes';
import * as AppointmentReads from './repo/reads';
import { getRoleByIds } from '../clinics/repo/reads';
import { allowedAppointmentActions, AppointmentAction, AppointmentRole, AppointmentStateView, canRescheduleAppointment, clinicDate, statusForAppointmentAction } from './appointment-workflow';
import type { Db } from '../db/types/types';

@Injectable()
export class AppointmentsService {
    constructor(private readonly db: DatabaseService) {}

    async createAppointment(dto: CreateAppointmentDto, requesterId: number): Promise<void> {
        if (!requesterId) throw new BadRequestException('Missing critical parameter requester_id.');
        if (dto.start_date_time.getTime() <= Date.now() || dto.start_date_time >= dto.end_date_time) {
            throw new BadRequestException('La cita debe tener un horario futuro válido.');
        }
        await this.db.inTx(async tx => {
            await this.lockDoctor(tx, dto.doctor_id);
            const doctorRole = await getRoleByIds(tx, dto.clinic_id, dto.doctor_id);
            if (!doctorRole || !['Owner', 'Admin', 'Doctor'].includes(doctorRole.role_within_clinic)) {
                throw new BadRequestException('El médico no pertenece a esta clínica.');
            }
            if (!await this.isDoctorAvailable(dto.doctor_id, dto.clinic_id, dto.start_date_time, dto.end_date_time, undefined, tx)) {
                throw new ConflictException('El médico no está disponible en este horario.');
            }
            if (!await this.isClinicAvailable(dto.clinic_id, dto.start_date_time, tx)) {
                throw new ConflictException('La clínica no está disponible en este horario.');
            }
            const appointmentId = await AppointmentWrites.insertAppointment(tx, dto, requesterId);
            await AppointmentWrites.recordAppointmentEvent(tx, appointmentId, null, 'scheduled', 'schedule', requesterId, 0);
        });
    }

    async getPatientAppointments(patientId: number): Promise<AppointmentReads.Appointment[]> {
        return AppointmentReads.getAppointmentsByPatientId(this.db, patientId);
    }

    async getAppointment(id: number, actorId: number): Promise<AppointmentReads.Appointment> {
        const appointment = await AppointmentReads.getAppointmentByIdForActor(this.db, id, actorId);
        if (!appointment) throw new NotFoundException('Cita no encontrada.');
        return appointment;
    }

    async getDispatchClinics(actorId: number): Promise<AppointmentReads.DispatchClinic[]> {
        return AppointmentReads.getDispatchClinics(this.db, actorId);
    }

    async getClinicAppointments(clinicId: number, actorId: number, date: string): Promise<AppointmentReads.Appointment[]> {
        const parsed = new Date(`${date}T00:00:00.000Z`);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
            throw new BadRequestException('La fecha debe ser válida y usar el formato AAAA-MM-DD.');
        }
        const role = await getRoleByIds(this.db, clinicId, actorId);
        if (!role || !['Owner', 'Admin', 'Employee'].includes(role.role_within_clinic)) {
            throw new NotFoundException('Clínica no encontrada.');
        }
        return AppointmentReads.getClinicAppointmentsForDay(this.db, clinicId, actorId, date);
    }

    async updateAppointment(id: number, patientId: number, dto: UpdateAppointmentDto): Promise<{ message: string }> {
        const changesTime = dto.start_date_time !== undefined || dto.end_date_time !== undefined;
        if (changesTime && (!dto.start_date_time || !dto.end_date_time)) {
            throw new BadRequestException('start_date_time and end_date_time must be supplied together.');
        }
        if (!changesTime && dto.appointment_description === undefined) throw new BadRequestException('No appointment changes supplied.');
        const doctorId = await AppointmentReads.getAppointmentDoctorId(this.db, id, patientId);
        if (doctorId === undefined) throw new NotFoundException('Cita no encontrada.');
        return this.db.inTx(async tx => {
            await this.lockDoctor(tx, doctorId);
            const current = await AppointmentReads.getPatientAppointmentForUpdate(tx, id, patientId);
            if (!current) throw new NotFoundException('Cita no encontrada.');
            this.assertVersion(current, dto.expected_version);
            const context = this.workflowContext(current, null);
            if (!canRescheduleAppointment(context, patientId)) {
                throw new BadRequestException('Solo puedes editar citas futuras programadas o confirmadas.');
            }
            if (changesTime) {
                const start = dto.start_date_time!;
                const end = dto.end_date_time!;
                if (start.getTime() <= Date.now() || start >= end) throw new BadRequestException('El nuevo horario debe ser futuro y válido.');
                if (end.getTime() - start.getTime() !== Number(current.duration_minutes) * 60_000) {
                    throw new BadRequestException('La duración debe coincidir con el horario de la clínica.');
                }
                if (!await this.isDoctorAvailable(current.doctor_id, current.clinic_id, start, end, id, tx) ||
                    !await this.isClinicAvailable(current.clinic_id, start, tx)) {
                    throw new ConflictException('El médico o la clínica no están disponibles en este horario.');
                }
            }
            const nextStatus = changesTime ? 'scheduled' : current.appointment_status;
            if (!await AppointmentWrites.updateAppointmentState(tx, current, nextStatus, dto)) throw new ConflictException('La cita cambió. Actualiza e inténtalo de nuevo.');
            await AppointmentWrites.recordAppointmentEvent(tx, id, current.appointment_status, nextStatus,
                changesTime ? 'reschedule' : 'update_notes', patientId, Number(current.status_version) + 1);
            return { message: 'Appointment updated successfully.' };
        });
    }

    async deleteAppointment(id: number, patientId: number): Promise<{ message: string }> {
        await this.runAction(id, patientId, 'cancel', undefined, true);
        return { message: 'Appointment cancelled successfully.' };
    }

    async performAction(id: number, actorId: number, dto: AppointmentActionDto): Promise<AppointmentStateView> {
        return this.runAction(id, actorId, dto.action, dto.expected_version);
    }

    private async runAction(id: number, actorId: number, action: AppointmentAction, expectedVersion?: number, patientOnly = false): Promise<AppointmentStateView> {
        const doctorId = await AppointmentReads.getAppointmentDoctorId(this.db, id, patientOnly ? actorId : undefined);
        if (doctorId === undefined) throw new NotFoundException('Cita no encontrada.');
        return this.db.inTx(async tx => {
            await this.lockDoctor(tx, doctorId);
            const current = await AppointmentReads.getPatientAppointmentForUpdate(tx, id, patientOnly ? actorId : undefined);
            if (!current) throw new NotFoundException('Cita no encontrada.');
            const role = await getRoleByIds(tx, current.clinic_id, actorId);
            const actorRole = role?.role_within_clinic ?? null;
            const hasAccess = current.patient_id === actorId || ['Owner', 'Admin', 'Employee'].includes(actorRole ?? '') ||
                (current.doctor_id === actorId && actorRole === 'Doctor');
            if (!hasAccess) throw new NotFoundException('Cita no encontrada.');
            this.assertVersion(current, expectedVersion);
            if (patientOnly && current.appointment_status === 'cancelled') return this.snapshot(tx, id, actorId);
            const context = this.workflowContext(current, patientOnly ? null : actorRole);
            if (!allowedAppointmentActions(context, actorId).includes(action)) {
                throw new BadRequestException('Esta acción no está permitida para el estado, horario o rol actual de la cita.');
            }
            if (action === 'start') {
                const active = await tx.query(
                    `SELECT appointment_id FROM appointments WHERE doctor_id = ? AND appointment_status = 'in_progress' AND appointment_id <> ? LIMIT 1`,
                    [current.doctor_id, id],
                );
                if (active.length) throw new ConflictException('Finaliza la consulta en curso antes de atender otra cita.');
            }
            const status = statusForAppointmentAction(action);
            if (!await AppointmentWrites.updateAppointmentState(tx, current, status)) throw new ConflictException('La cita cambió. Actualiza e inténtalo de nuevo.');
            await AppointmentWrites.recordAppointmentEvent(tx, id, current.appointment_status, status, action, actorId, Number(current.status_version) + 1);
            return this.snapshot(tx, id, actorId);
        });
    }

    private workflowContext(current: AppointmentReads.PatientAppointmentForUpdate, actorRole: AppointmentRole) {
        return { ...current, start_date_time: new Date(Number(current.start_timestamp) * 1000).toISOString(), actor_role: actorRole };
    }

    private assertVersion(current: AppointmentReads.PatientAppointmentForUpdate, expectedVersion?: number): void {
        if (expectedVersion !== undefined && Number(current.status_version) !== expectedVersion) {
            throw new ConflictException('La cita cambió en otro dispositivo. Actualiza antes de volver a intentarlo.');
        }
    }

    private async snapshot(db: Db, id: number, actorId: number): Promise<AppointmentStateView> {
        const appointment = await AppointmentReads.getAppointmentByIdForActor(db, id, actorId);
        if (!appointment) throw new NotFoundException('Cita no encontrada.');
        const { appointment_id, appointment_status, status_version, status_updated_at, allowed_actions, can_reschedule } = appointment;
        return { appointment_id, appointment_status, status_version, status_updated_at, allowed_actions, can_reschedule,
            can_edit_notes: can_reschedule };
    }

    private async lockDoctor(db: Db, doctorId: number): Promise<void> {
        const doctors = await db.query('SELECT user_id FROM users WHERE user_id = ? FOR UPDATE', [doctorId]);
        if (!doctors.length) throw new BadRequestException('Doctor not found.');
    }

    async isDoctorAvailable(drId: number, clinicId: number, start: Date, end: Date, excludeAppointmentId?: number, db: Db = this.db): Promise<boolean> {
        const parameters: number[] = [drId, end.getTime() / 1000, start.getTime() / 1000];
        if (excludeAppointmentId !== undefined) parameters.push(excludeAppointmentId);
        const appointments = await db.query(
            `SELECT 1 FROM appointments a JOIN clinics c ON a.clinic_id = c.clinic_id
             WHERE a.doctor_id = ? AND a.appointment_status NOT IN ('cancelled', 'no_show')
             AND a.scheduled_time_date < FROM_UNIXTIME(?)
             AND DATE_ADD(a.scheduled_time_date, INTERVAL c.clinic_average_appointment_time MINUTE) > FROM_UNIXTIME(?)
             ${excludeAppointmentId === undefined ? '' : 'AND a.appointment_id <> ?'} LIMIT 1`, parameters,
        );
        if (appointments.length) return false;
        const absences = await db.query(
            'SELECT 1 FROM absences WHERE doctor_id = ? AND clinic_id = ? AND start_date_time < FROM_UNIXTIME(?) AND end_date_time > FROM_UNIXTIME(?)',
            [drId, clinicId, end.getTime() / 1000, start.getTime() / 1000],
        );
        return absences.length === 0;
    }

    async isClinicAvailable(clinicId: number, start: Date, db: Db = this.db): Promise<boolean> {
        const clinics = await db.query('SELECT 1 FROM clinics WHERE clinic_id = ? AND is_open = FALSE', [clinicId]);
        if (clinics.length) return false;
        const day = new Date(`${clinicDate(start)}T00:00:00.000Z`).getUTCDay();
        return day !== 0 && day !== 6;
    }
}
