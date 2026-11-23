import { Db } from '../../db/types/types';

export type Appointment = {
    appointment_id: number,
    clinic_id: number,
    doctor_id: number,
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
            a.doctor_id,
            c.clinic_name,
            u.first_name,
            u.second_name,
            u.first_last_name,
            u.second_last_name,
            UNIX_TIMESTAMP(a.scheduled_time_date) AS starts_at_seconds,
            c.clinic_average_appointment_time AS duration_minutes,
            a.appointment_description
        FROM appointments a
        INNER JOIN clinics c ON a.clinic_id = c.clinic_id
        INNER JOIN users u ON a.doctor_id = u.user_id
        WHERE a.patient_id = ?
        ORDER BY a.scheduled_time_date DESC
    `;

    const rows = await db.query<Omit<Appointment, 'start_date_time' | 'end_date_time'> & {
        starts_at_seconds: number; duration_minutes: number | string;
    }>(query, [patientId]);
    return rows.map(({ starts_at_seconds, duration_minutes, ...appointment }) => ({
        ...appointment,
        start_date_time: new Date(Number(starts_at_seconds) * 1000).toISOString(),
        end_date_time: new Date((Number(starts_at_seconds) + Number(duration_minutes) * 60) * 1000).toISOString(),
    }));
}


export type PatientAppointmentForUpdate = {
    appointment_id: number;
    clinic_id: number;
    doctor_id: number;
    start_timestamp: number;
    duration_minutes: number;
};

export async function getPatientAppointmentForUpdate(
    db: Db, appointmentId: number, patientId: number,
): Promise<PatientAppointmentForUpdate | undefined> {
    const rows = await db.query<PatientAppointmentForUpdate>(
        `SELECT a.appointment_id, a.clinic_id, a.doctor_id,
                UNIX_TIMESTAMP(a.scheduled_time_date) AS start_timestamp,
                c.clinic_average_appointment_time AS duration_minutes
         FROM appointments a JOIN clinics c ON c.clinic_id = a.clinic_id
         WHERE a.appointment_id = ? AND a.patient_id = ? FOR UPDATE`,
        [appointmentId, patientId],
    );
    return rows[0];
}
