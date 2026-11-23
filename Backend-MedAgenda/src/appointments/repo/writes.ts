import { Db } from '../../db/types/types';
import { CreateAppointmentDto, UpdateAppointmentDto } from "../dto/appointments.dto";

export async function insertAppointment(db: Db, dto: CreateAppointmentDto, patient_id: number): Promise<void> {
    const start_date_time = dto.start_date_time.getTime() / 1000;
    const description = dto.appointment_description ?? null;
    await db.execute(
        `INSERT INTO appointments (clinic_id, patient_id, doctor_id, scheduled_time_date, appointment_description) VALUES (?, ?, ?, FROM_UNIXTIME(?), ?)`,
        [dto.clinic_id, patient_id, dto.doctor_id, start_date_time, description]
    );
}


export async function updatePatientAppointment(
    db: Db, appointmentId: number, patientId: number, dto: UpdateAppointmentDto,
): Promise<void> {
    const assignments: string[] = [];
    const values: (string | number)[] = [];
    if (dto.appointment_description !== undefined) {
        assignments.push('appointment_description = ?');
        values.push(dto.appointment_description);
    }
    if (dto.start_date_time !== undefined) {
        assignments.push('scheduled_time_date = FROM_UNIXTIME(?)');
        values.push(dto.start_date_time.getTime() / 1000);
    }
    await db.execute(
        `UPDATE appointments SET ${assignments.join(', ')} WHERE appointment_id = ? AND patient_id = ?`,
        [...values, appointmentId, patientId],
    );
}

export async function deletePatientAppointment(db: Db, appointmentId: number, patientId: number): Promise<void> {
    await db.execute('DELETE FROM appointments WHERE appointment_id = ? AND patient_id = ?', [appointmentId, patientId]);
}
