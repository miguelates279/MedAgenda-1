import { Db } from '../../db/types/types';
import { UpdateClinicDto } from '../dto/clinic-management.dto';

export async function updateManagedClinic(db: Db, clinicId: number, dto: UpdateClinicDto): Promise<void> {
    const columns = ['clinic_name', 'clinic_phone_number', 'clinic_city_id', 'clinic_address', 'clinic_description', 'is_open',
        'clinic_opening_time', 'clinic_close_time', 'clinic_average_appointment_time', 'clinic_break_time', 'clinic_break_duration'] as const;
    const entries = columns.filter(column => dto[column] !== undefined);
    if (!entries.length) return;
    await db.execute(`UPDATE clinics SET ${entries.map(column => `${column}=?`).join(',')} WHERE clinic_id=?`, [...entries.map(column => dto[column]), clinicId]);
}

export async function freezeLegacyDurations(db: Db, clinicId: number, duration: number): Promise<void> {
    await db.execute('UPDATE appointments SET duration_minutes=? WHERE clinic_id=? AND duration_minutes IS NULL', [duration, clinicId]);
}

export async function replaceClinicSpecialties(db: Db, clinicId: number, specialtyIds: number[]): Promise<void> {
    await db.execute('DELETE FROM clinic_specialties WHERE clinic_id=?', [clinicId]);
    if (specialtyIds.length) await db.execute(`INSERT INTO clinic_specialties(clinic_id,specialty_id) VALUES ${specialtyIds.map(() => '(?,?)').join(',')}`, specialtyIds.flatMap(id => [clinicId, id]));
}

export async function replaceDoctorClinicSpecialties(db: Db, clinicId: number, doctorId: number, specialtyIds: number[]): Promise<void> {
    await db.execute('DELETE FROM clinic_doctor_specialties WHERE clinic_id=? AND doctor_id=?', [clinicId, doctorId]);
    if (specialtyIds.length) await db.execute(`INSERT INTO clinic_doctor_specialties(clinic_id,doctor_id,specialty_id) VALUES ${specialtyIds.map(() => '(?,?,?)').join(',')}`, specialtyIds.flatMap(id => [clinicId, doctorId, id]));
}
