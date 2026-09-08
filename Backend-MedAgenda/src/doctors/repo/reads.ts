import { Appointment } from '../../appointments/repo/reads';
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
  return await db.query<Appointment>(
    `
    SELECT a.appointment_id, c.clinic_id, c.clinic_name, p.first_name, p.second_name, p.first_last_name, p.second_last_name,
           DATE_FORMAT(CONVERT_TZ(a.scheduled_time_date, @@session.time_zone, '+00:00'), '%Y-%m-%dT%H:%i:%sZ') AS start_date_time,
           DATE_FORMAT(
             DATE_ADD(CONVERT_TZ(a.scheduled_time_date, @@session.time_zone, '+00:00'), INTERVAL c.clinic_average_appointment_time MINUTE),
             '%Y-%m-%dT%H:%i:%sZ'
           ) AS end_date_time,
           a.appointment_description
    FROM appointments a 
    JOIN users p ON a.patient_id = p.user_id
    JOIN clinics c ON a.clinic_id = c.clinic_id
    WHERE a.doctor_id = ?
    `, [doctor_id]);
};

export async function getDoctorPatientHistory(db: Db, doctor_id: number): Promise<PatientHistoryRow[]> {
  return await db.query<PatientHistoryRow>(
    `
    SELECT u.user_id, u.first_name, u.second_name, u.first_last_name, a.clinic_id, c.clinic_name, a.appointment_description, 
           DATE_FORMAT(CONVERT_TZ(a.scheduled_time_date, @@session.time_zone, '+00:00'), '%Y-%m-%dT%H:%i:%sZ') AS appointment_date 
    FROM users u 
    JOIN appointments a ON u.user_id = a.patient_id 
    JOIN clinics c ON a.clinic_id = c.clinic_id
    WHERE a.doctor_id = ?
    `, [doctor_id]);
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
