import { Db } from '../../db/types/types';
import { CreateAppointmentDto, UpdateAppointmentDto } from '../dto/appointments.dto';
import { AppointmentStatus } from '../appointment-workflow';
import { PatientAppointmentForUpdate } from './reads';

export async function insertAppointment(db: Db, dto: CreateAppointmentDto, patient_id: number): Promise<number> {
    const result = await db.execute(
        `INSERT INTO appointments (clinic_id, patient_id, doctor_id, scheduled_time_date, appointment_description, status_updated_at) VALUES (?, ?, ?, FROM_UNIXTIME(?), ?, CURRENT_TIMESTAMP)`,
        [dto.clinic_id, patient_id, dto.doctor_id, dto.start_date_time.getTime() / 1000, dto.appointment_description ?? null],
    );
    return Number(result.insertId);
}

export async function recordAppointmentEvent(
    db: Db, appointmentId: number, fromStatus: AppointmentStatus | null, toStatus: AppointmentStatus,
    action: string, actorId: number, version: number,
): Promise<void> {
    await db.execute(
        `INSERT INTO appointment_status_events (appointment_id, from_status, to_status, action, actor_user_id, version)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [appointmentId, fromStatus, toStatus, action, actorId, version],
    );
}

export async function updateAppointmentState(
    db: Db, current: PatientAppointmentForUpdate, status: AppointmentStatus, dto?: UpdateAppointmentDto,
): Promise<boolean> {
    const assignments = ['appointment_status = ?', 'status_version = status_version + 1', 'status_updated_at = CURRENT_TIMESTAMP'];
    const values: (string | number)[] = [status];
    if (dto?.appointment_description !== undefined) {
        assignments.push('appointment_description = ?');
        values.push(dto.appointment_description);
    }
    if (dto?.start_date_time !== undefined) {
        assignments.push('scheduled_time_date = FROM_UNIXTIME(?)');
        values.push(dto.start_date_time.getTime() / 1000);
    }
    const result = await db.execute(
        `UPDATE appointments SET ${assignments.join(', ')} WHERE appointment_id = ? AND status_version = ?`,
        [...values, current.appointment_id, current.status_version],
    );
    return result.affectedRows === 1;
}
