import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../db/database.service';
import { AppointmentActionDto, CreateAppointmentDto, UpdateAppointmentDto } from './dto/appointments.dto';
import * as AppointmentWrites from './repo/writes';
import * as AppointmentReads from './repo/reads';
import { getClinicSchedulingRules, getRoleByIds, isClinicDoctor } from '../clinics/repo/reads';
import { allowedAppointmentActions, AppointmentAction, AppointmentRole, AppointmentStateView, canEditAppointmentNotes, canRescheduleAppointment, clinicDate, statusForAppointmentAction } from './appointment-workflow';
import { APPOINTMENT_TIME_ZONE, AppointmentAvailability, BusyInterval, ClinicSchedulingPolicy, clinicDayUnavailableReason, createAvailabilitySlots, isStoredAppointmentInstant, MINIMUM_APPOINTMENT_ADVANCE_MINUTES, parseClinicSchedulingPolicy, validateAppointmentSlot, validateSchedulingDate } from './appointment-scheduling';
import type { Db } from '../db/types/types';

@Injectable()
export class AppointmentsService {
    constructor(private readonly db: DatabaseService) {}

    async createAppointment(dto: CreateAppointmentDto, requesterId: number): Promise<void> {
        if (!requesterId) throw new BadRequestException('Missing critical parameter requester_id.');
        await this.db.inTx(async tx => {
            await this.lockDoctor(tx, dto.doctor_id);
            await this.lockClinic(tx, dto.clinic_id);
            const now = new Date(Date.now());
            await this.validateScheduling(tx, dto.clinic_id, dto.doctor_id, dto.start_date_time, dto.end_date_time, now);
            const appointmentId = await AppointmentWrites.insertAppointment(tx, dto, requesterId);
            await AppointmentWrites.recordAppointmentEvent(tx, appointmentId, null, 'scheduled', 'schedule', requesterId, 0);
        });
    }

    async getAvailability(clinicId: number, doctorId: number, date: string): Promise<AppointmentAvailability> {
        const now = new Date(Date.now());
        return this.buildAvailability(clinicId, doctorId, date, now);
    }

    async getReschedulingAvailability(id: number, patientId: number, date: string): Promise<AppointmentAvailability> {
        const appointment = await AppointmentReads.getAppointmentByIdForActor(this.db, id, patientId);
        if (!appointment || appointment.patient_id !== patientId) throw new NotFoundException('Cita no encontrada.');
        const now = new Date(Date.now());
        if (!canRescheduleAppointment({ ...appointment, actor_role: null }, patientId, now)) {
            throw new BadRequestException('Solo puedes reprogramar citas programadas o confirmadas con al menos una hora de anticipación.');
        }
        return this.buildAvailability(appointment.clinic_id, appointment.doctor_id, date, now, appointment);
    }

    private async buildAvailability(clinicId: number, doctorId: number, date: string, now: Date, current?: AppointmentReads.Appointment): Promise<AppointmentAvailability> {
        const midnight = validateSchedulingDate(date);
        const policy = await this.getSchedulingPolicy(this.db, clinicId, doctorId);
        const unavailableReason = clinicDayUnavailableReason(policy, date);
        const outsideStorageRange = !isStoredAppointmentInstant(midnight + 86_400_000 - 1) && !isStoredAppointmentInstant(midnight);
        const busy = unavailableReason || outsideStorageRange ? [] : await this.getVerifiedDoctorBusyIntervals(this.db, doctorId, clinicId, midnight, midnight + 86_400_000, current?.appointment_id);
        const currentInterval = current ? { start: Date.parse(current.start_date_time), end: Date.parse(current.end_date_time) } : undefined;
        return { clinic_id: clinicId, doctor_id: doctorId, date, time_zone: APPOINTMENT_TIME_ZONE,
            server_now: now.toISOString(), minimum_advance_minutes: MINIMUM_APPOINTMENT_ADVANCE_MINUTES,
            duration_minutes: policy.duration, unavailable_reason: unavailableReason,
            slots: createAvailabilitySlots(policy, date, now, busy, currentInterval) };
    }

    private async getSchedulingPolicy(db: Db, clinicId: number, doctorId: number): Promise<ClinicSchedulingPolicy> {
        const rules = (await getClinicSchedulingRules(db, clinicId))[0];
        if (!rules) throw new NotFoundException('Clínica no encontrada.');
        const doctorRole = await getRoleByIds(db, clinicId, doctorId);
        if (!doctorRole || !['Owner', 'Admin', 'Doctor'].includes(doctorRole.role_within_clinic)) {
            throw new BadRequestException('El médico no pertenece a esta clínica.');
        }
        if (doctorRole.role_within_clinic !== 'Doctor' && !await isClinicDoctor(db, clinicId, doctorId)) throw new BadRequestException('El usuario no atiende como médico en esta clínica.');
        return parseClinicSchedulingPolicy(rules);
    }

    private async validateScheduling(db: Db, clinicId: number, doctorId: number, start: Date, end: Date, now: Date, excludeAppointmentId?: number): Promise<void> {
        const policy = await this.getSchedulingPolicy(db, clinicId, doctorId);
        validateAppointmentSlot(policy, start, end, now);
        if (!await this.isDoctorAvailable(doctorId, clinicId, start, end, excludeAppointmentId, db)) {
            throw new ConflictException('El médico no está disponible en este horario.');
        }
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
        validateSchedulingDate(date);
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
        const clinicId = await AppointmentReads.getAppointmentClinicId(this.db, id, patientId);
        if (clinicId === undefined) throw new NotFoundException('Cita no encontrada.');
        return this.db.inTx(async tx => {
            await this.lockDoctor(tx, doctorId);
            if (changesTime) await this.lockClinic(tx, clinicId);
            const current = await AppointmentReads.getPatientAppointmentForUpdate(tx, id, patientId);
            if (!current) throw new NotFoundException('Cita no encontrada.');
            this.assertVersion(current, dto.expected_version);
            const now = new Date(Date.now());
            const context = this.workflowContext(current, null);
            if (changesTime ? !canRescheduleAppointment(context, patientId, now) : !canEditAppointmentNotes(context, patientId, now)) {
                throw new BadRequestException(changesTime ?
                    'Solo puedes reprogramar citas programadas o confirmadas con al menos una hora de anticipación.' :
                    'Solo puedes editar notas de citas futuras programadas o confirmadas.');
            }
            if (changesTime) {
                if (dto.start_date_time!.getTime() === Number(current.start_timestamp)*1000) throw new BadRequestException('Selecciona un horario diferente al actual.');
                await this.validateScheduling(tx, current.clinic_id, current.doctor_id, dto.start_date_time!, dto.end_date_time!, now, id);
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
            if (!allowedAppointmentActions(context, actorId, new Date(Date.now())).includes(action)) {
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
        const { appointment_id, appointment_status, status_version, status_updated_at, allowed_actions, can_reschedule, can_edit_notes, minimum_advance_minutes, change_deadline, server_now } = appointment;
        return { appointment_id, appointment_status, status_version, status_updated_at, allowed_actions, can_reschedule,
            can_edit_notes, minimum_advance_minutes, change_deadline, server_now };
    }

    private async lockClinic(db: Db, clinicId: number): Promise<void> {
        const clinics = await db.query('SELECT clinic_id FROM clinics WHERE clinic_id=? FOR SHARE', [clinicId]);
        if (!clinics.length) throw new NotFoundException('Clínica no encontrada.');
    }

    private async lockDoctor(db: Db, doctorId: number): Promise<void> {
        const doctors = await db.query('SELECT user_id FROM users WHERE user_id = ? FOR UPDATE', [doctorId]);
        if (!doctors.length) throw new BadRequestException('Doctor not found.');
    }

    private async getVerifiedDoctorBusyIntervals(db: Db, doctorId: number, clinicId: number, start: number, end: number, excludeAppointmentId?: number): Promise<BusyInterval[]> {
        if (await AppointmentReads.hasUnverifiableDoctorAppointments(db, doctorId, end, excludeAppointmentId)) {
            throw new BadRequestException('No se puede verificar la disponibilidad del médico. Contacta a la clínica.');
        }
        return AppointmentReads.getDoctorBusyIntervals(db, doctorId, clinicId, start, end, excludeAppointmentId);
    }

    async isDoctorAvailable(drId: number, clinicId: number, start: Date, end: Date, excludeAppointmentId?: number, db: Db = this.db): Promise<boolean> {
        const busy = await this.getVerifiedDoctorBusyIntervals(db, drId, clinicId, start.getTime(), end.getTime(), excludeAppointmentId);
        return busy.length === 0;
    }

    async isClinicAvailable(clinicId: number, start: Date, db: Db = this.db): Promise<boolean> {
        const clinics = await db.query('SELECT 1 FROM clinics WHERE clinic_id = ? AND is_open = FALSE', [clinicId]);
        if (clinics.length) return false;
        const day = new Date(`${clinicDate(start)}T00:00:00.000Z`).getUTCDay();
        return day !== 0 && day !== 6;
    }
}
