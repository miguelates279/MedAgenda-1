import { Db } from '../../db/types/types';

export interface ClinicUser {
    user_id: number;
    email: string;
    first_name: string;
    second_name: string | null;
    first_last_name: string;
    second_last_name: string;
    phone_number: string;
    isDoctor: boolean;
    isAdmin: boolean;
    specialty_id: number | null;
    specialty_name: string | null;
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

/**
 * Get all users from a specific clinic
 */
export async function getClinicUsers(db: Db, clinicId: number): Promise<ClinicUser[]> {
    const users = await db.query<any>(
        `SELECT
            u.user_id,
            u.user_email_address as email,
            u.first_name,
            u.second_name,
            u.first_last_name,
            u.second_last_name,
            u.user_phone_number as phone_number,
            cm.role_within_clinic,
            ds.specialty_id,
            s.specialty_name
        FROM users u
        JOIN clinic_members cm ON u.user_id = cm.user_id
        LEFT JOIN doctor_specialties ds ON u.user_id = ds.doctor_id
        LEFT JOIN specialties s ON ds.specialty_id = s.specialty_id
        WHERE cm.clinic_id = ?
        ORDER BY u.first_last_name, u.first_name`,
        [clinicId]
    );

    return users.map(user => ({
        user_id: user.user_id,
        email: user.email,
        first_name: user.first_name,
        second_name: user.second_name,
        first_last_name: user.first_last_name,
        second_last_name: user.second_last_name,
        phone_number: user.phone_number,
        isDoctor: user.role_within_clinic === 'Doctor' || user.role_within_clinic === 'Admin',
        isAdmin: user.role_within_clinic === 'Admin',
        specialty_id: user.specialty_id,
        specialty_name: user.specialty_name
    }));
}

/**
 * Search for a user by email and return their info with clinic relationship
 */
export async function searchUserByEmail(db: Db, email: string, adminClinicId: number): Promise<ClinicUser | null> {
    const users = await db.query<any>(
        `SELECT
            u.user_id,
            u.user_email_address as email,
            u.first_name,
            u.second_name,
            u.first_last_name,
            u.second_last_name,
            u.user_phone_number as phone_number,
            cm.role_within_clinic,
            ds.specialty_id,
            s.specialty_name
        FROM users u
        LEFT JOIN clinic_members cm ON u.user_id = cm.user_id AND cm.clinic_id = ?
        LEFT JOIN doctor_specialties ds ON u.user_id = ds.doctor_id
        LEFT JOIN specialties s ON ds.specialty_id = s.specialty_id
        WHERE u.user_email_address = ?`,
        [adminClinicId, email]
    );

    if (users.length === 0) return null;

    const user = users[0];
    return {
        user_id: user.user_id,
        email: user.email,
        first_name: user.first_name,
        second_name: user.second_name,
        first_last_name: user.first_last_name,
        second_last_name: user.second_last_name,
        phone_number: user.phone_number,
        isDoctor: user.role_within_clinic === 'Doctor' || user.role_within_clinic === 'Admin',
        isAdmin: user.role_within_clinic === 'Admin',
        specialty_id: user.specialty_id,
        specialty_name: user.specialty_name
    };
}

/**
 * Check if a user is an admin of a specific clinic
 */
export async function isUserAdminOfClinic(db: Db, userId: number, clinicId: number): Promise<boolean> {
    const result = await db.query(
        'SELECT 1 FROM clinic_members WHERE user_id = ? AND clinic_id = ? AND role_within_clinic = ? LIMIT 1',
        [userId, clinicId, 'Admin']
    );
    return result.length > 0;
}

/**
 * Get the clinic ID for an admin user (returns first clinic if admin of multiple)
 */
export async function getAdminClinicId(db: Db, userId: number): Promise<number | null> {
    const result = await db.query<{ clinic_id: number }>(
        'SELECT clinic_id FROM clinic_members WHERE user_id = ? AND role_within_clinic = ? LIMIT 1',
        [userId, 'Admin']
    );
    return result.length > 0 ? result[0].clinic_id : null;
}

/**
 * Get all specialties
 */
export async function getAllSpecialties(db: Db): Promise<Specialty[]> {
    return await db.query<Specialty>(
        'SELECT specialty_id, specialty_name, specialty_description FROM specialties ORDER BY specialty_name'
    );
}

/**
 * Check if a user is a member of a specific clinic
 */
export async function isUserMemberOfClinic(db: Db, userId: number, clinicId: number): Promise<boolean> {
    const result = await db.query(
        'SELECT 1 FROM clinic_members WHERE user_id = ? AND clinic_id = ? LIMIT 1',
        [userId, clinicId]
    );
    return result.length > 0;
}

/**
 * Get all clinics where user is Admin or Owner
 */
export async function getUserAdminClinics(db: Db, userId: number): Promise<AdminClinic[]> {
    const clinics = await db.query<any>(
        `SELECT
            c.clinic_id,
            c.clinic_name,
            cm.role_within_clinic,
            cm.role_description
        FROM clinic_members cm
        JOIN clinics c ON cm.clinic_id = c.clinic_id
        WHERE cm.user_id = ?
        AND cm.role_within_clinic = 'Admin'

        UNION

        SELECT
            c.clinic_id,
            c.clinic_name,
            'Owner' as role_within_clinic,
            'Propietario' as role_description
        FROM clinics c
        WHERE c.clinic_owner = ?

        ORDER BY clinic_name`,
        [userId, userId]
    );

    return clinics.map(clinic => ({
        clinic_id: clinic.clinic_id,
        clinic_name: clinic.clinic_name,
        role_within_clinic: clinic.role_within_clinic,
        role_description: clinic.role_description
    }));
}
