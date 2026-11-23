import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../db/database.service';
import { CreateAppointmentDto, UpdateAppointmentDto } from './dto/appointments.dto';
import * as AppointmentWrites from './repo/writes';
import * as AppointmentReads from './repo/reads';
import type { Db } from '../db/types/types';

@Injectable()
export class AppointmentsService {
    constructor(private readonly db: DatabaseService){}

    async createAppointment(dto: CreateAppointmentDto, requester_id: number): Promise<void> {
        if(!requester_id) throw new BadRequestException('Missing critrical param requester_id.');
        if(dto.start_date_time >= dto.end_date_time) throw new BadRequestException('start_date_time must be earlier than end_date_time.');
        await this.db.inTx(async tx => {
            await this.lockDoctor(tx, dto.doctor_id);
            if(!await this.isDoctorAvailable(dto.doctor_id, dto.clinic_id, dto.start_date_time, dto.end_date_time, undefined, tx)) throw new ConflictException('This doctor is not available at the specified time range.');
            if(!await this.isClinicAvailable(dto.clinic_id, dto.start_date_time, tx)) throw new ConflictException('This clinic is not available at the specified time range.');
            await AppointmentWrites.insertAppointment(tx, dto, requester_id);
        });
    }

    async getPatientAppointments(patientId: number): Promise<AppointmentReads.Appointment[]> {
        return await AppointmentReads.getAppointmentsByPatientId(this.db, patientId);
    }


    async updateAppointment(id: number, patientId: number, dto: UpdateAppointmentDto): Promise<{ message: string }> {
        const changesTime = dto.start_date_time !== undefined || dto.end_date_time !== undefined;
        if (changesTime && (!dto.start_date_time || !dto.end_date_time)) {
            throw new BadRequestException('start_date_time and end_date_time must be supplied together.');
        }
        if (!changesTime && dto.appointment_description === undefined) {
            throw new BadRequestException('No appointment changes supplied.');
        }
        return this.db.inTx(async tx => {
            const current = await AppointmentReads.getPatientAppointmentForUpdate(tx, id, patientId);
            if (!current) throw new NotFoundException('Appointment not found.');
            if (changesTime) {
                const start = dto.start_date_time!;
                const end = dto.end_date_time!;
                if (start.getTime() <= Date.now() || start >= end ||
                    Number(current.start_timestamp) * 1000 <= Date.now()) {
                    throw new BadRequestException('Only future appointments can be rescheduled to a valid future time.');
                }
                if (end.getTime() - start.getTime() !== Number(current.duration_minutes) * 60_000) {
                    throw new BadRequestException('The appointment duration must match the clinic schedule.');
                }
                await this.lockDoctor(tx, current.doctor_id);
                if (!await this.isDoctorAvailable(current.doctor_id, current.clinic_id, start, end, id, tx) ||
                    !await this.isClinicAvailable(current.clinic_id, start, tx)) {
                    throw new ConflictException('Doctor or clinic is not available at the specified time.');
                }
            }
            await AppointmentWrites.updatePatientAppointment(tx, id, patientId, dto);
            return { message: 'Appointment updated successfully.' };
        });
    }

    async deleteAppointment(id: number, patientId: number): Promise<{ message: string }> {
        return this.db.inTx(async tx => {
            const current = await AppointmentReads.getPatientAppointmentForUpdate(tx, id, patientId);
            if (!current) throw new NotFoundException('Appointment not found.');
            if (Number(current.start_timestamp) * 1000 <= Date.now()) {
                throw new BadRequestException('Past appointments cannot be cancelled.');
            }
            await AppointmentWrites.deletePatientAppointment(tx, id, patientId);
            return { message: 'Appointment cancelled successfully.' };
        });
    }

    private async lockDoctor(db: Db, doctorId: number): Promise<void> {
        // Serialize scheduling and rescheduling for this doctor, including across different clinics.
        const doctors = await db.query('SELECT user_id FROM users WHERE user_id = ? FOR UPDATE', [doctorId]);
        if (doctors.length === 0) throw new BadRequestException('Doctor not found.');
    }

    //Helpers below
    async isDoctorAvailable(
        dr_id: number, clinic_id: number, start: Date, end: Date,
        excludeAppointmentId?: number, db: Db = this.db,
    ): Promise<boolean> {
        const parameters: number[] = [dr_id, end.getTime() / 1000, start.getTime() / 1000];
        if (excludeAppointmentId !== undefined) parameters.push(excludeAppointmentId);
        const q = await db.query(
            `SELECT 1 FROM appointments a JOIN clinics c ON a.clinic_id = c.clinic_id
             WHERE a.doctor_id = ? AND a.scheduled_time_date < FROM_UNIXTIME(?)
             AND DATE_ADD(a.scheduled_time_date, INTERVAL c.clinic_average_appointment_time MINUTE) > FROM_UNIXTIME(?)
             ${excludeAppointmentId === undefined ? '' : 'AND a.appointment_id <> ?'} LIMIT 1`,
            parameters,
        );
        if (q.length > 0) return false;
        const absences = await db.query(
            'SELECT 1 FROM absences WHERE doctor_id = ? AND clinic_id = ? AND start_date_time < FROM_UNIXTIME(?) AND end_date_time > FROM_UNIXTIME(?)',
            [dr_id, clinic_id, end.getTime() / 1000, start.getTime() / 1000],
        );
        return absences.length === 0;
    }

    async isClinicAvailable(clinic_id: number, start: Date, db: Db = this.db): Promise<boolean> {
        const q = await db.query('SELECT 1 FROM clinics WHERE clinic_id = ? AND is_open = FALSE', [clinic_id]);
        if(q.length > 0) return false;
        const start_day = start.getUTCDay();
        if(start_day === 0 || start_day === 6) return false;
        return true;  
    }

}
