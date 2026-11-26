import { Db } from '../../db/types/types';

export interface ClinicUser {
    user_id: number;
    clinic_id: number;
    email: string;
    user_email_address: string;
    first_name: string;
    second_name: string | null;
    first_last_name: string;
    second_last_name: string;
    phone_number: string;
    role_within_clinic: 'Owner' | 'Admin' | 'Doctor' | 'Employee' | null;
    is_member: boolean;
    isDoctor: boolean;
    isAdmin: boolean;
    specialty_id: number | null;
    specialty_name: string | null;
    specialties: { specialty_id: number; specialty_name: string }[];
}

export interface Specialty {
    specialty_id: number;
    specialty_name: string;
    specialty_description: string | null;
}

export interface AdminClinic {
    clinic_id: number;
    clinic_name: string;
    role_within_clinic: 'Admin' | 'Owner';
    role_description: string | null;
}

const USER_COLUMNS = `u.user_id,c.clinic_id,u.user_email_address AS email,u.first_name,u.second_name,u.first_last_name,u.second_last_name,
    u.user_phone_number AS phone_number,CASE WHEN c.clinic_owner=u.user_id THEN 'Owner' ELSE cm.role_within_clinic END AS role_within_clinic,
    cds.specialty_id,s.specialty_name`;

function mapUsers(rows: any[]): ClinicUser[] {
    const users = new Map<number, ClinicUser>();
    for (const row of rows) {
        if (!users.has(row.user_id)) users.set(row.user_id, { user_id: row.user_id, clinic_id: row.clinic_id,
            email: row.email, user_email_address: row.email, first_name: row.first_name, second_name: row.second_name,
            first_last_name: row.first_last_name, second_last_name: row.second_last_name, phone_number: row.phone_number,
            role_within_clinic: row.role_within_clinic, is_member: row.role_within_clinic !== null,
            isDoctor: row.role_within_clinic === 'Doctor', isAdmin: ['Owner', 'Admin'].includes(row.role_within_clinic),
            specialty_id: null, specialty_name: null, specialties: [] });
        const user = users.get(row.user_id)!;
        if (row.specialty_id != null) {
            user.specialties.push({ specialty_id: Number(row.specialty_id), specialty_name: row.specialty_name });
            user.isDoctor = true;
            if (user.specialty_id === null) { user.specialty_id = Number(row.specialty_id); user.specialty_name = row.specialty_name; }
        }
    }
    return [...users.values()];
}

export async function getClinicUsers(db: Db, clinicId: number): Promise<ClinicUser[]> {
    const rows = await db.query(`SELECT ${USER_COLUMNS}
        FROM clinics c JOIN users u ON (u.user_id=c.clinic_owner OR EXISTS
          (SELECT 1 FROM clinic_members m WHERE m.clinic_id=c.clinic_id AND m.user_id=u.user_id))
        LEFT JOIN clinic_members cm ON cm.clinic_id=c.clinic_id AND cm.user_id=u.user_id
        LEFT JOIN clinic_doctor_specialties cds ON cds.clinic_id=c.clinic_id AND cds.doctor_id=u.user_id
        LEFT JOIN specialties s ON s.specialty_id=cds.specialty_id
        WHERE c.clinic_id=? ORDER BY u.first_last_name,u.first_name,u.user_id,s.specialty_id`, [clinicId]);
    return mapUsers(rows);
}

export async function searchUserByEmail(db: Db, email: string, clinicId: number): Promise<ClinicUser | null> {
    const rows = await db.query(`SELECT ${USER_COLUMNS}
        FROM users u JOIN clinics c ON c.clinic_id=?
        LEFT JOIN clinic_members cm ON cm.clinic_id=c.clinic_id AND cm.user_id=u.user_id
        LEFT JOIN clinic_doctor_specialties cds ON cds.clinic_id=c.clinic_id AND cds.doctor_id=u.user_id
        LEFT JOIN specialties s ON s.specialty_id=cds.specialty_id
        WHERE u.user_email_address=? ORDER BY s.specialty_id`, [clinicId, email]);
    return mapUsers(rows)[0] ?? null;
}

export async function isUserAdminOfClinic(db: Db, userId: number, clinicId: number): Promise<boolean> {
    return (await db.query("SELECT 1 FROM clinics c LEFT JOIN clinic_members cm ON cm.clinic_id=c.clinic_id AND cm.user_id=? WHERE c.clinic_id=? AND (c.clinic_owner=? OR cm.role_within_clinic='Admin') LIMIT 1", [userId, clinicId, userId])).length > 0;
}

export async function getAdminClinicId(db: Db, userId: number): Promise<number | null> {
    const clinics = await getUserAdminClinics(db, userId);
    return clinics.length === 1 ? clinics[0].clinic_id : null;
}

export async function getAllSpecialties(db: Db): Promise<Specialty[]> {
    return db.query<Specialty>('SELECT specialty_id,specialty_name,specialty_description FROM specialties ORDER BY specialty_name');
}

export async function isUserMemberOfClinic(db: Db, userId: number, clinicId: number): Promise<boolean> {
    return (await db.query('SELECT 1 FROM clinic_members WHERE user_id=? AND clinic_id=? LIMIT 1', [userId, clinicId])).length > 0;
}

export async function getUserAdminClinics(db: Db, userId: number): Promise<AdminClinic[]> {
    return db.query<AdminClinic>(`SELECT c.clinic_id,c.clinic_name,
        CASE WHEN c.clinic_owner=? THEN 'Owner' ELSE 'Admin' END AS role_within_clinic,
        CASE WHEN c.clinic_owner=? THEN 'Propietario' ELSE cm.role_description END AS role_description
        FROM clinics c LEFT JOIN clinic_members cm ON cm.clinic_id=c.clinic_id AND cm.user_id=?
        WHERE c.clinic_owner=? OR cm.role_within_clinic='Admin' ORDER BY c.clinic_name,c.clinic_id`, [userId, userId, userId, userId]);
}
