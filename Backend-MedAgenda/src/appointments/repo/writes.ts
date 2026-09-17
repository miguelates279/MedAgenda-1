import { Db } from '../../db/types/types';
import { CreateAppointmentDto } from "../dto/appointments.dto";

export async function insertAppointment(db: Db, dto: CreateAppointmentDto, patient_id: number): Promise<void> {
    const start_date_time = dto.start_date_time.toISOString().slice(0,19).replace('T',' ');
    const description = dto.appointment_description ?? null;
    await db.execute(
        `INSERT INTO appointments (clinic_id, patient_id, doctor_id, scheduled_time_date, appointment_description) VALUES (?, ?, ?, ?, ?)`,
        [dto.clinic_id, patient_id, dto.doctor_id, start_date_time, description]
    );
}

export async function updateAppointment(
    db: Db,
    appointment_id: number,
    patient_id: number,
    description?: string
): Promise<boolean> {
    const result = await db.execute(
        `UPDATE appointments SET appointment_description = ? WHERE appointment_id = ? AND patient_id = ?`,
        [description ?? null, appointment_id, patient_id]
    );
    return result.affectedRows > 0;
}

export async function deleteAppointment(
    db: Db,
    appointment_id: number,
    patient_id: number
): Promise<boolean> {
    const result = await db.execute(
        `DELETE FROM appointments WHERE appointment_id = ? AND patient_id = ?`,
        [appointment_id, patient_id]
    );
    return result.affectedRows > 0;
}
