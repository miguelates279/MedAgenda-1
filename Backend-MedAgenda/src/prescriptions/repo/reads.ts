import { Db } from '../../db/types/types';

export type PrescriptionUserView = {
    prescription_id: number,
    clinic_name: string,
    clinic_id: number,
    date_emitted: string,
    doctor_first_name: string,
    doctor_second_name?: string,
    doctor_last_name: string,
    prescription_description: string,
}

export type PrescriptionDoctorView = {
    prescription_id: number,
    patient_id: number,
    clinic_id: number,
    date_emitted: string,
    prescription_description: string,
}

export type PrescriptionEntity = {
    prescription_id: number,
    doctor_id: number,
    clinic_id: number,
    patient_id: number,
    prescription_description: string,
    date_emitted: string,
}

export async function readPrescriptionById(db: Db, prescription_id: number): Promise<PrescriptionEntity | null> {
    const rows = await db.query<PrescriptionEntity>(
        'SELECT * FROM prescriptions WHERE prescription_id = ?',
        [prescription_id]
    );
    return rows[0] || null;
}

export async function readUserPrescriptions(db: Db, user_id: number): Promise<PrescriptionUserView[]> {
    return await db.query<PrescriptionUserView>(
        `
        SELECT p.prescription_id,
               DATE_FORMAT(CONVERT_TZ(p.date_emitted, @@session.time_zone, '-05:00'), '%Y-%m-%dT%H:%i:%s-05:00') AS date_emitted, 
               d.first_name AS doctor_first_name , d.second_name AS doctor_second_name, d.first_last_name AS doctor_last_name, p.prescription_description, c.clinic_name, p.clinic_id
        FROM prescriptions p JOIN users d ON p.doctor_id = d.user_id JOIN clinics c ON p.clinic_id = c.clinic_id
        WHERE patient_id = ?
        ORDER BY p.date_emitted DESC
        `, [user_id]
    );
}

export async function readDoctorPrescriptions(db: Db, doctor_id: number): Promise<PrescriptionDoctorView[]> {
    return await db.query<PrescriptionDoctorView>(
        `SELECT p.prescription_id, p.patient_id, p.clinic_id, DATE_FORMAT(CONVERT_TZ(p.date_emitted, @@session.time_zone, '+00:00'), '%Y-%m-%dT%H:%i:%sZ') AS date_emitted, p.prescription_description 
         FROM prescriptions p WHERE doctor_id = ?
         ORDER BY p.date_emitted DESC`,
        [doctor_id]
    );
}
