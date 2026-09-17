import { Db } from '../../db/types/types';

export async function insertPrescriptionRow(db: Db, clinic_id: number, doctor_id: number, patient_id: number, p_d: string): Promise<void> {
    await db.execute(
        'INSERT INTO prescriptions(doctor_id, clinic_id, patient_id, prescription_description) VALUES (?,?,?,?)',
        [doctor_id, clinic_id, patient_id, p_d]
    );
}

export async function updatePrescriptionRow(db: Db, prescription_id: number, doctor_id: number, description: string): Promise<void> {
    await db.execute(
        'UPDATE prescriptions SET prescription_description = ? WHERE prescription_id = ? AND doctor_id = ?',
        [description, prescription_id, doctor_id]
    );
}

export async function deletePrescriptionRow(db: Db, prescription_id: number, doctor_id: number): Promise<void> {
    await db.execute(
        'DELETE FROM prescriptions WHERE prescription_id = ? AND doctor_id = ?',
        [prescription_id, doctor_id]
    );
}
