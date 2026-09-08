import { AppointmentSlot } from '../../appointments/repo/reads';
import { Roles } from '../../auth/role_guard/roles.enum';
import { Db } from '../../db/types/types';
import { DoctorRow} from '../../doctors/repo';

export type Clinic = {
    clinic_id: number,
    clinic_name: string,
    is_open: boolean,
    clinic_phone_number: string,
    clinic_city_id: number,
    clinic_address: string,
    clinic_description?: string,
    clinic_specialties?: Specialty[],
}

export type Specialty = {
    specialty_id: number,
    specialty_name: string,
    specialty_description?: string
}

export type ClinicScheduleRules = {
    clinic_opening_time: string,
    clinic_close_time: string,
    clinic_break_duration: string,
    clinic_break_time: string,
    clinic_average_appointment_time: string,
}

export async function getAllSpecialties(db: Db): Promise<Specialty[]> {
    return await db.query<Specialty>('SELECT * FROM specialties');
}

export async function getSpecialtyById(db: Db, specialty_id: number): Promise<Specialty | null> {
    const result = await db.query<Specialty>('SELECT * FROM specialties WHERE specialty_id = ?', [specialty_id]);
    return result.length > 0 ? result[0] : null;
}

export async function getRoleByIds(db: Db, clinic_id: number, user_id: number): Promise<{ role_within_clinic: Roles} | null> {
    const ownerverif = await db.query('SELECT 1 FROM clinics WHERE clinic_id = ? AND clinic_owner = ?', [clinic_id, user_id]);
    if(ownerverif.length > 0) return {role_within_clinic: Roles.Owner};
    const role = await db.query<{ role_within_clinic: Roles}>('SELECT role_within_clinic FROM clinic_members WHERE clinic_id = ? AND user_id = ?', [clinic_id, user_id]);
    if(role.length === 0) return null;
    return role[0];
}

export async function getClinics(db: Db): Promise<Clinic[]> {
    return await db.query<Clinic>('SELECT clinic_id, clinic_name, is_open, clinic_phone_number, clinic_city_id, clinic_address, clinic_description FROM clinics');
}

export async function getClinicsWithSpecialties(db: Db, specialty_id: number[]): Promise<Clinic[]> {
    return await db.query<Clinic>('SELECT c.clinic_id, clinic_name, is_open, clinic_phone_number, clinic_city_id, clinic_address, clinic_description FROM clinics c JOIN clinic_specialties cs ON c.clinic_id = cs.clinic_id WHERE cs.specialty_id IN(?)', [specialty_id])
}

export async function getClinicsWithSpecialtyInCity(db: Db, specialty_id: number[], city_id: number): Promise<Clinic[]> {
    return await db.query<Clinic>('SELECT c.clinic_id, clinic_name, is_open, clinic_phone_number, clinic_city_id, clinic_address, clinic_description FROM clinics c JOIN clinic_specialties cs ON c.clinic_id = cs.clinic_id WHERE cs.specialty_id IN(?) AND c.clinic_city_id = ?', [specialty_id, city_id]);
}

export async function getClinicsWithSpecialtyInState(db: Db, specialty_id: number[], state_id: number): Promise<Clinic[]> {
    return await db.query<Clinic>('SELECT c.clinic_id, clinic_name, is_open, clinic_phone_number, clinic_city_id, clinic_address, clinic_description FROM clinics c JOIN clinic_specialties cs ON c.clinic_id = cs.clinic_id JOIN cities ct ON c.clinic_city_id = ct.city_id WHERE cs.specialty_id IN(?) AND ct.state_id = ?',[specialty_id, state_id]);
}

export async function getClinicsWithSpecialtyInCountry(db: Db, specialty_id: number[], country_id: number): Promise<Clinic[]> {
    return await db.query<Clinic>('SELECT c.clinic_id, clinic_name, is_open, clinic_phone_number, clinic_city_id, clinic_address, clinic_description FROM clinics c JOIN clinic_specialties cs ON c.clinic_id = cs.clinic_id JOIN cities ct ON c.clinic_city_id = ct.city_id JOIN states s ON ct.state_id = s.state_id WHERE cs.specialty_id IN(?) AND s.country_id = ?', [specialty_id, country_id]);
}

export async function getClinicsInCity(db: Db, city_id: number): Promise<Clinic[]> {
    return await db.query<Clinic>('SELECT clinic_id, clinic_name, is_open, clinic_phone_number, clinic_city_id, clinic_address, clinic_description FROM clinics c WHERE clinic_city_id = ?', [city_id]);
}

export async function getClinicsInState(db: Db, state_id: number): Promise<Clinic[]> {
    return await db.query<Clinic>('SELECT clinic_id, clinic_name, is_open, clinic_phone_number, clinic_city_id, clinic_address, clinic_description FROM clinics c JOIN cities ct ON c.clinic_city_id = ct.city_id WHERE ct.state_id = ?', [state_id]);
}

export async function getClinicsInCountry(db: Db, country_id: number): Promise<Clinic[]> {
    return await db.query<Clinic>('SELECT DISTINCT clinic_id, clinic_name, is_open, clinic_phone_number, clinic_city_id, clinic_address, clinic_description FROM clinics c JOIN cities ct on c.clinic_city_id = ct.city_id JOIN states st ON st.state_id = ct.state_id WHERE st.country_id = ?', [country_id]);
}

export async function getClinicDetails(db: Db, clinic_id: number): Promise<Clinic[]> {
    return await db.query<Clinic>('SELECT clinic_id, clinic_name, is_open, clinic_phone_number, clinic_city_id, clinic_address, clinic_description FROM clinics WHERE clinic_id = ?', [clinic_id]);
}

export async function getClinicDoctors(db: Db, clinic_id: number): Promise<DoctorRow[]> {
    return await db.query<DoctorRow>(`SELECT u.user_id, u.first_name, u.second_name, u.first_last_name, u.second_last_name, sp.specialty_id, sp.specialty_name, sp.specialty_description FROM users u JOIN clinic_members cm ON u.user_id = cm.user_id JOIN doctor_specialties ds ON ds.doctor_id = u.user_id JOIN specialties sp ON sp.specialty_id = ds.specialty_id WHERE cm.clinic_id = ? AND cm.role_within_clinic = 'Doctor'`, [clinic_id]);
}

export async function getClinicSchedulingRules(db: Db, clinic_id: number): Promise<ClinicScheduleRules[]> {
    return await db.query<ClinicScheduleRules>('SELECT clinic_opening_time, clinic_break_time, clinic_close_time, clinic_break_duration, clinic_average_appointment_time FROM clinics WHERE clinic_id = ? LIMIT 1', [clinic_id]);
}

export async function getClinicDoctorAppointmentsForDay(db: Db, clinic_id: number, doctor_id: number, appointment_date: string): Promise<AppointmentSlot[]> {
    return await db.query<AppointmentSlot>(
        `
        SELECT 
            a.appointment_id, 
            DATE_FORMAT(CONVERT_TZ(a.scheduled_time_date, '+00:00', '-05:00'), '%Y-%m-%dT%H:%i:%s-05:00') AS start_date_time, 
            DATE_FORMAT(
                DATE_ADD(CONVERT_TZ(a.scheduled_time_date, '+00:00', '-05:00'), INTERVAL c.clinic_average_appointment_time MINUTE),
                '%Y-%m-%dT%H:%i:%s-05:00'
            ) AS end_date_time
        FROM appointments a
        JOIN clinics c ON a.clinic_id = c.clinic_id
        WHERE a.clinic_id = ? 
          AND a.doctor_id = ? 
          AND DATE(CONVERT_TZ(a.scheduled_time_date, '+00:00', '-05:00')) = DATE(STR_TO_DATE(?, '%Y-%m-%d'))
        ORDER BY a.scheduled_time_date ASC
        `,
        [clinic_id, doctor_id, appointment_date]
    );
}

export async function isUserAdminAnywhere(db: Db, user_id: number): Promise<boolean> {
    const q = await db.query(`SELECT 1 FROM clinic_members WHERE user_id = ? AND role_within_clinic = 'Admin'`, [user_id]);
    return q.length > 0;
}
