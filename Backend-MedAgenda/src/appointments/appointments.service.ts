import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../db/database.service';
import { CreateAppointmentDto, UpdateAppointmentDto } from './dto/appointments.dto';
import * as AppointmentWrites from './repo/writes';
import * as AppointmentReads from './repo/reads';

@Injectable()
export class AppointmentsService {
    constructor(private readonly db: DatabaseService){}

    async createAppointment(dto: CreateAppointmentDto, requester_id: number): Promise<void> {
        if(!requester_id) throw new BadRequestException('Missing critrical param requester_id.');
        if(dto.start_date_time >= dto.end_date_time) throw new BadRequestException('start_date_time must be earlier than end_date_time.');
        if(!await this.isDoctorAvailable(dto.doctor_id, dto.clinic_id, dto.start_date_time, dto.end_date_time)) throw new ConflictException('This doctor is not available at the specified time range.');
        if(!await this.isClinicAvailable(dto.clinic_id, dto.start_date_time)) throw new ConflictException('This clinic is not available at the specified time range.');
        await AppointmentWrites.insertAppointment(this.db, dto, requester_id);
    }

    async getPatientAppointments(patientId: number): Promise<AppointmentReads.Appointment[]> {
        return await AppointmentReads.getAppointmentsByPatientId(this.db, patientId);
    }

    async updateAppointment(appointment_id: number, patient_id: number, dto: UpdateAppointmentDto): Promise<{ message: string }> {
        if(!patient_id) throw new BadRequestException('Missing critical param patient_id.');
        const updated = await AppointmentWrites.updateAppointment(this.db, appointment_id, patient_id, dto.appointment_description);
        if(!updated) throw new NotFoundException('Appointment not found or you do not have permission to modify it.');
        return { message: 'Appointment updated successfully.' };
    }

    async deleteAppointment(appointment_id: number, patient_id: number): Promise<{ message: string }> {
        if(!patient_id) throw new BadRequestException('Missing critical param patient_id.');
        const deleted = await AppointmentWrites.deleteAppointment(this.db, appointment_id, patient_id);
        if(!deleted) throw new NotFoundException('Appointment not found or you do not have permission to cancel it.');
        return { message: 'Appointment cancelled successfully.' };
    }

    //Helpers below
    async isDoctorAvailable(dr_id: number, clinic_id: number, start: Date, end: Date): Promise<boolean> {
        const sqlstart = start.toISOString().slice(0,19).replace('T',' ');
        const sqlfinish = end.toISOString().slice(0,19).replace('T',' ');
        const q = await this.db.query(
            `
            SELECT 1
            FROM appointments a
            JOIN clinics c ON a.clinic_id = c.clinic_id
            WHERE a.doctor_id = ?
              AND a.scheduled_time_date < ?
              AND DATE_ADD(a.scheduled_time_date, INTERVAL c.clinic_average_appointment_time MINUTE) > ?
            LIMIT 1
            `,
            [dr_id, sqlfinish, sqlstart]
        );
        if(q.length > 0) return false;
        const absences = await this.db.query('SELECT 1 FROM absences WHERE doctor_id = ? AND clinic_id = ? AND start_date_time < ? AND end_date_time > ?',[dr_id, clinic_id, sqlfinish, sqlstart]);
        return absences.length === 0;
    }

    async isClinicAvailable(clinic_id: number, start: Date): Promise<boolean> {
        const q = await this.db.query('SELECT 1 FROM clinics WHERE clinic_id = ? AND is_open = FALSE', [clinic_id]);
        if(q.length > 0) return false;
        const start_day = start.getUTCDay();
        if(start_day === 0 || start_day === 6) return false;
        return true;  
    }

}
