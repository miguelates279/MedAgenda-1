import { Db } from '../../db/types/types';

export type ManagedClinicRow = {
    clinic_id: number;
    clinic_owner: number;
    clinic_name: string;
    is_open: boolean | number;
    clinic_phone_number: string;
    clinic_city_id: number;
    clinic_address: string;
    clinic_description: string | null;
    clinic_opening_time: string | null;
    clinic_close_time: string | null;
    clinic_average_appointment_time: string | number | null;
    clinic_break_time: string | null;
    clinic_break_duration: string | number | null;
    city_name?: string;
    state_id?: number;
    state_name?: string;
    country_id?: number;
    country_name?: string;
};

export async function getManagedClinic(db: Db, clinicId: number, lock = false): Promise<ManagedClinicRow | undefined> {
    if (lock) return (await db.query<ManagedClinicRow>('SELECT * FROM clinics WHERE clinic_id = ? FOR UPDATE', [clinicId]))[0];
    return (await db.query<ManagedClinicRow>(`SELECT c.*,ct.city_name,st.state_id,st.state_name,co.country_id,co.country_name
        FROM clinics c LEFT JOIN cities ct ON ct.city_id=c.clinic_city_id
        LEFT JOIN states st ON st.state_id=ct.state_id LEFT JOIN countries co ON co.country_id=st.country_id
        WHERE c.clinic_id=?`, [clinicId]))[0];
}

export async function getClinicSpecialtyIds(db: Db, clinicId: number): Promise<number[]> {
    return (await db.query<{ specialty_id: number }>('SELECT specialty_id FROM clinic_specialties WHERE clinic_id=? ORDER BY specialty_id', [clinicId])).map(row => Number(row.specialty_id));
}

export async function hasUnknownAppointmentDurations(db: Db, clinicId: number): Promise<boolean> {
    return (await db.query('SELECT 1 FROM appointments WHERE clinic_id=? AND duration_minutes IS NULL LIMIT 1', [clinicId])).length > 0;
}

export async function hasClinicalRecords(db: Db, clinicId: number): Promise<boolean> {
    return (await db.query(`SELECT 1 FROM appointments WHERE clinic_id=? UNION ALL SELECT 1 FROM prescriptions WHERE clinic_id=?
        UNION ALL SELECT 1 FROM absences WHERE clinic_id=? LIMIT 1`, [clinicId, clinicId, clinicId])).length > 0;
}

export async function hasPendingDoctorAppointments(db: Db, clinicId: number, doctorId: number, now: number): Promise<boolean> {
    return (await db.query(`SELECT 1 FROM appointments WHERE clinic_id=? AND doctor_id=? AND
        (appointment_status IN ('waiting','called','in_progress') OR
        (appointment_status IN ('scheduled','confirmed') AND scheduled_time_date>=FROM_UNIXTIME(?))) LIMIT 1`, [clinicId, doctorId, now / 1000])).length > 0;
}

export async function getAssignedClinicSpecialties(db: Db, clinicId: number): Promise<number[]> {
    return (await db.query<{ specialty_id: number }>('SELECT DISTINCT specialty_id FROM clinic_doctor_specialties WHERE clinic_id=?', [clinicId])).map(row => Number(row.specialty_id));
}
