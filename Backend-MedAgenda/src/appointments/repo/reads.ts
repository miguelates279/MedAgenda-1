import { Db } from '../../db/types/types';
import { allowedAppointmentActions, AppointmentRole, AppointmentStateView, AppointmentStatus, canRescheduleAppointment } from '../appointment-workflow';

export type Appointment = AppointmentStateView & {
    clinic_id: number;
    doctor_id: number;
    patient_id: number;
    clinic_name: string;
    first_name: string;
    second_name?: string;
    first_last_name: string;
    second_last_name: string;
    doctor_first_name?: string;
    doctor_second_name?: string;
    doctor_first_last_name?: string;
    doctor_second_last_name?: string;
    start_date_time: string;
    end_date_time: string;
    appointment_description?: string;
};

export type AppointmentSlot = {
    appointment_id: number;
    start_date_time: string;
    end_date_time: string;
};

type AppointmentRow = Omit<Appointment, 'start_date_time' | 'end_date_time' | 'allowed_actions' | 'can_reschedule' | 'can_edit_notes'> & {
    starts_at_seconds: number;
    duration_minutes: number | string;
    updated_at_seconds: number | null;
    actor_role: AppointmentRole;
};

const APPOINTMENT_COLUMNS = `a.appointment_id, a.clinic_id, a.doctor_id, a.patient_id, c.clinic_name,
    a.appointment_description, a.appointment_status, a.status_version,
    UNIX_TIMESTAMP(a.status_updated_at) AS updated_at_seconds,
    UNIX_TIMESTAMP(a.scheduled_time_date) AS starts_at_seconds,
    c.clinic_average_appointment_time AS duration_minutes,
    CASE WHEN c.clinic_owner = ? THEN 'Owner' ELSE cm.role_within_clinic END AS actor_role`;

function mapAppointments(rows: AppointmentRow[], actorId: number): Appointment[] {
    const now = new Date();
    return rows.map(({ starts_at_seconds, duration_minutes, updated_at_seconds, actor_role, ...row }) => {
        const appointment = {
            ...row,
            status_version: Number(row.status_version),
            status_updated_at: updated_at_seconds == null ? null : new Date(Number(updated_at_seconds) * 1000).toISOString(),
            start_date_time: new Date(Number(starts_at_seconds) * 1000).toISOString(),
            end_date_time: new Date((Number(starts_at_seconds) + Number(duration_minutes) * 60) * 1000).toISOString(),
        };
        const context = { ...appointment, actor_role };
        return { ...appointment, allowed_actions: allowedAppointmentActions(context, actorId, now),
            can_reschedule: canRescheduleAppointment(context, actorId, now), can_edit_notes: canRescheduleAppointment(context, actorId, now) };
    });
}

export async function getAppointmentsByPatientId(db: Db, patientId: number): Promise<Appointment[]> {
    const rows = await db.query<AppointmentRow>(
        `SELECT ${APPOINTMENT_COLUMNS}, u.first_name, u.second_name, u.first_last_name, u.second_last_name
         FROM appointments a JOIN clinics c ON a.clinic_id = c.clinic_id
         JOIN users u ON a.doctor_id = u.user_id
         LEFT JOIN clinic_members cm ON cm.clinic_id = a.clinic_id AND cm.user_id = ?
         WHERE a.patient_id = ? ORDER BY a.scheduled_time_date DESC, a.appointment_id DESC`,
        [patientId, patientId, patientId],
    );
    return mapAppointments(rows, patientId);
}

export async function getAppointmentsByDoctorId(db: Db, doctorId: number): Promise<Appointment[]> {
    const rows = await db.query<AppointmentRow>(
        `SELECT ${APPOINTMENT_COLUMNS}, p.first_name, p.second_name, p.first_last_name, p.second_last_name
         FROM appointments a JOIN clinics c ON a.clinic_id = c.clinic_id
         JOIN users p ON a.patient_id = p.user_id
         LEFT JOIN clinic_members cm ON cm.clinic_id = a.clinic_id AND cm.user_id = ?
         WHERE a.doctor_id = ? AND (c.clinic_owner = ? OR cm.role_within_clinic IN ('Doctor', 'Admin'))
         ORDER BY a.scheduled_time_date ASC, a.appointment_id ASC`,
        [doctorId, doctorId, doctorId, doctorId],
    );
    return mapAppointments(rows, doctorId);
}

export async function getClinicAppointmentsForDay(db: Db, clinicId: number, actorId: number, date: string): Promise<Appointment[]> {
    const start = Date.parse(`${date}T00:00:00-05:00`) / 1000;
    const rows = await db.query<AppointmentRow>(
        `SELECT ${APPOINTMENT_COLUMNS}, p.first_name, p.second_name, p.first_last_name, p.second_last_name,
                d.first_name AS doctor_first_name, d.second_name AS doctor_second_name,
                d.first_last_name AS doctor_first_last_name, d.second_last_name AS doctor_second_last_name
         FROM appointments a JOIN clinics c ON a.clinic_id = c.clinic_id
         JOIN users p ON a.patient_id = p.user_id JOIN users d ON a.doctor_id = d.user_id
         LEFT JOIN clinic_members cm ON cm.clinic_id = a.clinic_id AND cm.user_id = ?
         WHERE a.clinic_id = ? AND a.scheduled_time_date >= FROM_UNIXTIME(?)
           AND a.scheduled_time_date < FROM_UNIXTIME(?)
         ORDER BY a.scheduled_time_date ASC, a.appointment_id ASC`,
        [actorId, actorId, clinicId, start, start + 86_400],
    );
    return mapAppointments(rows, actorId);
}

export async function getAppointmentByIdForActor(db: Db, appointmentId: number, actorId: number): Promise<Appointment | undefined> {
    const rows = await db.query<AppointmentRow>(
        `SELECT ${APPOINTMENT_COLUMNS},
                CASE WHEN a.patient_id = ? THEN d.first_name ELSE p.first_name END AS first_name,
                CASE WHEN a.patient_id = ? THEN d.second_name ELSE p.second_name END AS second_name,
                CASE WHEN a.patient_id = ? THEN d.first_last_name ELSE p.first_last_name END AS first_last_name,
                CASE WHEN a.patient_id = ? THEN d.second_last_name ELSE p.second_last_name END AS second_last_name,
                d.first_name AS doctor_first_name, d.second_name AS doctor_second_name,
                d.first_last_name AS doctor_first_last_name, d.second_last_name AS doctor_second_last_name
         FROM appointments a JOIN clinics c ON a.clinic_id = c.clinic_id
         JOIN users p ON a.patient_id = p.user_id JOIN users d ON a.doctor_id = d.user_id
         LEFT JOIN clinic_members cm ON cm.clinic_id = a.clinic_id AND cm.user_id = ?
         WHERE a.appointment_id = ? AND (a.patient_id = ? OR c.clinic_owner = ? OR cm.role_within_clinic IN ('Admin', 'Employee')
           OR (a.doctor_id = ? AND cm.role_within_clinic = 'Doctor'))`,
        [actorId, actorId, actorId, actorId, actorId, actorId, appointmentId, actorId, actorId, actorId],
    );
    return mapAppointments(rows, actorId)[0];
}

export type PatientAppointmentForUpdate = {
    appointment_id: number;
    patient_id: number;
    clinic_id: number;
    doctor_id: number;
    start_timestamp: number;
    duration_minutes: number;
    appointment_status: AppointmentStatus;
    status_version: number;
    status_updated_at: string | null;
};

export async function getAppointmentDoctorId(db: Db, appointmentId: number, patientId?: number): Promise<number | undefined> {
    const rows = await db.query<{ doctor_id: number }>(
        `SELECT doctor_id FROM appointments WHERE appointment_id = ?${patientId === undefined ? '' : ' AND patient_id = ?'}`,
        patientId === undefined ? [appointmentId] : [appointmentId, patientId],
    );
    return rows[0]?.doctor_id;
}

export async function getPatientAppointmentForUpdate(db: Db, appointmentId: number, patientId?: number): Promise<PatientAppointmentForUpdate | undefined> {
    const rows = await db.query<PatientAppointmentForUpdate>(
        `SELECT a.appointment_id, a.patient_id, a.clinic_id, a.doctor_id, a.appointment_status, a.status_version,
                a.status_updated_at, UNIX_TIMESTAMP(a.scheduled_time_date) AS start_timestamp,
                (SELECT clinic_average_appointment_time FROM clinics c WHERE c.clinic_id = a.clinic_id) AS duration_minutes
         FROM appointments a WHERE a.appointment_id = ?${patientId === undefined ? '' : ' AND a.patient_id = ?'} FOR UPDATE`,
        patientId === undefined ? [appointmentId] : [appointmentId, patientId],
    );
    return rows[0];
}


export type DispatchClinic = {
    clinic_id: number;
    clinic_name: string;
    role_within_clinic: 'Owner' | 'Admin' | 'Employee';
};

export async function getDispatchClinics(db: Db, actorId: number): Promise<DispatchClinic[]> {
    return db.query<DispatchClinic>(
        `SELECT c.clinic_id, c.clinic_name,
                CASE WHEN c.clinic_owner = ? THEN 'Owner' ELSE cm.role_within_clinic END AS role_within_clinic
         FROM clinics c LEFT JOIN clinic_members cm ON cm.clinic_id = c.clinic_id AND cm.user_id = ?
         WHERE c.clinic_owner = ? OR cm.role_within_clinic IN ('Admin', 'Employee')
         ORDER BY c.clinic_name, c.clinic_id`, [actorId, actorId, actorId],
    );
}
