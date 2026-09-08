import { Db } from '../../db/types/types';

export type Appointment = {
    appointment_id: number,
    clinic_id: number,
    clinic_name: string,
    first_name: string,
    second_name?: string,
    first_last_name: string,
    second_last_name: string,
    start_date_time: string,
    end_date_time: string,
    appointment_description?: string,
}

export type AppointmentSlot = {
    appointment_id: number,
    start_date_time: string,
    end_date_time: string,
}

export async function getAppointmentsByPatientId(db: Db, patientId: number): Promise<Appointment[]> {
    const query = `
        SELECT
            a.appointment_id,
            a.clinic_id,
            c.clinic_name,
            u.first_name,
            u.second_name,
            u.first_last_name,
            u.second_last_name,
            DATE_FORMAT(CONVERT_TZ(a.scheduled_time_date, @@session.time_zone, '-05:00'), '%Y-%m-%dT%H:%i:%s-05:00') as start_date_time,
            DATE_FORMAT(
                DATE_ADD(CONVERT_TZ(a.scheduled_time_date, @@session.time_zone, '-05:00'), INTERVAL c.clinic_average_appointment_time MINUTE),
                '%Y-%m-%dT%H:%i:%s-05:00'
            ) as end_date_time,
            a.appointment_description
        FROM appointments a
        INNER JOIN clinics c ON a.clinic_id = c.clinic_id
        INNER JOIN users u ON a.doctor_id = u.user_id
        WHERE a.patient_id = ?
        ORDER BY a.scheduled_time_date DESC
    `;

    return await db.query<Appointment>(query, [patientId]);
}


