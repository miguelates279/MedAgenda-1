import { Db } from '../../db/types/types';

/**
 * Update user's role within a clinic
 */
export async function updateUserRoleInClinic(
    db: Db,
    userId: number,
    clinicId: number,
    role: 'Admin' | 'Doctor' | 'Employee'
): Promise<void> {
    await db.execute(
        `UPDATE clinic_members
         SET role_within_clinic = ?
         WHERE user_id = ? AND clinic_id = ?`,
        [role, userId, clinicId]
    );
}

/**
 * Add user to clinic if not already a member
 */
export async function addUserToClinic(
    db: Db,
    userId: number,
    clinicId: number,
    role: 'Admin' | 'Doctor' | 'Employee'
): Promise<void> {
    await db.execute(
        `INSERT INTO clinic_members (user_id, clinic_id, role_within_clinic)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE role_within_clinic = ?`,
        [userId, clinicId, role, role]
    );
}

/**
 * Assign a specialty to a doctor
 */
export async function assignSpecialtyToDoctor(
    db: Db,
    doctorId: number,
    specialtyId: number
): Promise<void> {
    await db.execute(
        `INSERT INTO doctor_specialties (doctor_id, specialty_id)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE doctor_id = doctor_id`,
        [doctorId, specialtyId]
    );
}

/**
 * Remove all specialties from a doctor
 */
export async function removeAllSpecialtiesFromDoctor(
    db: Db,
    doctorId: number
): Promise<void> {
    await db.execute(
        'DELETE FROM doctor_specialties WHERE doctor_id = ?',
        [doctorId]
    );
}

/**
 * Remove a specific specialty from a doctor
 */
export async function removeSpecialtyFromDoctor(
    db: Db,
    doctorId: number,
    specialtyId: number
): Promise<void> {
    await db.execute(
        'DELETE FROM doctor_specialties WHERE doctor_id = ? AND specialty_id = ?',
        [doctorId, specialtyId]
    );
}
