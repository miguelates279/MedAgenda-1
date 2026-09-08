import { Db } from '../../db/types/types';

export async function insertPrescriptionRow(db: Db, clinic_id: number, doctor_id: number, patient_id: number, p_d: string): Promise<void> {
    await db.execute(
        'INSERT INTO prescriptions(doctor_id, clinic_id, patient_id, prescription_description) VALUES (?,?,?,?)',
        [doctor_id, clinic_id, patient_id, p_d]
    );
}
