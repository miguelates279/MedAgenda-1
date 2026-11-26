import { Appointment, getAppointmentsByDoctorId } from '../../appointments/repo/reads';
import { Specialty } from '../../clinics/repo'
import { Db } from '../../db/types/types';

export type PublicDoctor = {
    doctor_id: number, 
    first_name: string,
    second_name?: string,
    first_last_name: string,
    second_last_name: string,
    specialties: Specialty[]
};

export type DoctorRow = {
  user_id: number,
  first_name: string,
  second_name?: string,
  first_last_name: string,
  second_last_name: string,
  specialty_id: number,
  specialty_name: string,
  specialty_description?: string
};

export type PatientHistoryRow = {
  user_id: number,
  first_name: string,
  second_name?: string,
  first_last_name: string,
  clinic_id: number,
  clinic_name: string,
  appointment_description?: string,
  appointment_date: string,
};

export async function getAllDoctorAppointments(db: Db, doctor_id: number): Promise<Appointment[]> {
  return getAppointmentsByDoctorId(db, doctor_id);
}

export async function getDoctorPatientHistory(db: Db, doctor_id: number): Promise<PatientHistoryRow[]> {
  const rows = await db.query<Omit<PatientHistoryRow, 'appointment_date'> & { starts_at_seconds: number }>(
    `SELECT u.user_id, u.first_name, u.second_name, u.first_last_name, a.clinic_id, c.clinic_name,
            a.appointment_description, UNIX_TIMESTAMP(a.scheduled_time_date) AS starts_at_seconds
     FROM users u JOIN appointments a ON u.user_id = a.patient_id JOIN clinics c ON a.clinic_id = c.clinic_id
     WHERE a.doctor_id = ? AND a.appointment_status = 'completed'
       AND (c.clinic_owner = a.doctor_id OR EXISTS (SELECT 1 FROM clinic_members cm
         WHERE cm.clinic_id = a.clinic_id AND cm.user_id = a.doctor_id AND cm.role_within_clinic IN ('Doctor', 'Admin')))
     ORDER BY a.scheduled_time_date DESC, a.appointment_id DESC`, [doctor_id],
  );
  return rows.map(({ starts_at_seconds, ...row }) => ({
    ...row, appointment_date: new Date(Number(starts_at_seconds) * 1000).toISOString(),
  }));
}

export async function isUserDoctorAnywhere(db: Db, userId: number): Promise<boolean> {
  // Un usuario es doctor si tiene rol 'Doctor' o 'Admin' en clinic_members, o si tiene especialidades registradas
  try {
    const clinicMember = await db.query(
      'SELECT 1 FROM clinic_members WHERE user_id = ? AND role_within_clinic IN (?, ?) LIMIT 1',
      [userId, 'Doctor', 'Admin']
    );
    if (clinicMember.length > 0) return true;

    const doctorSpecialty = await db.query(
      'SELECT 1 FROM doctor_specialties WHERE doctor_id = ? LIMIT 1',
      [userId]
    );
    return doctorSpecialty.length > 0;
  } catch (error) {
    console.error('Error in isUserDoctorAnywhere:', error);
    console.error('userId:', userId);
    throw error;
  }
}
