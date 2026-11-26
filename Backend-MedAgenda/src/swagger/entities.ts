import { ApiProperty } from '@nestjs/swagger';
import { APPOINTMENT_ACTIONS, APPOINTMENT_STATUSES } from '../appointments/appointment-workflow';
import type { AppointmentAction, AppointmentStatus } from '../appointments/appointment-workflow';

export class SpecialtyEntity {
  @ApiProperty({ description: 'Unique specialty identifier.', example: 3 })
  specialty_id: number;

  @ApiProperty({ description: 'Name of the specialty.', example: 'Pediatrics' })
  specialty_name: string;

  @ApiProperty({
    description: 'Optional description of the specialty.',
    example: 'Medical care for infants, children, and adolescents.',
    required: false,
    nullable: true,
  })
  specialty_description?: string;
}

export class ClinicEntity {
  @ApiProperty({ description: 'Unique clinic identifier.', example: 12 })
  clinic_id: number;

  @ApiProperty({ description: 'Display name of the clinic.', example: 'Central Health Clinic' })
  clinic_name: string;

  @ApiProperty({ description: 'Whether the clinic is currently open to patients.', example: true })
  is_open: boolean;

  @ApiProperty({ description: 'Primary phone number of the clinic.', example: '+50378901234' })
  clinic_phone_number: string;

  @ApiProperty({ description: 'City identifier where the clinic is located.', example: 5 })
  clinic_city_id: number;

  @ApiProperty({ description: 'Clinic street address.', example: '123 Medical Ave, Suite 4B' })
  clinic_address: string;

  @ApiProperty({
    description: 'Optional description about the clinic and services.',
    example: 'Open Monday to Friday, specialized in pediatrics and family medicine.',
    required: false,
    nullable: true,
  })
  clinic_description?: string;

  @ApiProperty({
    description: 'Specialties offered by the clinic.',
    type: [SpecialtyEntity],
    required: false,
  })
  clinic_specialties?: SpecialtyEntity[];
}

export class PublicDoctorEntity {
  @ApiProperty({ description: 'Unique doctor identifier.', example: 42 })
  doctor_id: number;

  @ApiProperty({ description: 'First name of the doctor.', example: 'Ana' })
  first_name: string;

  @ApiProperty({
    description: 'Optional middle name of the doctor.',
    example: 'Lucia',
    required: false,
    nullable: true,
  })
  second_name?: string;

  @ApiProperty({ description: 'First surname of the doctor.', example: 'Lopez' })
  first_last_name: string;

  @ApiProperty({ description: 'Second surname of the doctor.', example: 'Garcia' })
  second_last_name: string;

  @ApiProperty({
    description: 'Specialties the doctor practices.',
    type: [SpecialtyEntity],
  })
  specialties: SpecialtyEntity[];
}

export class AppointmentStateEntity {
  @ApiProperty({ example: 101 })
  appointment_id: number;

  @ApiProperty({ enum: APPOINTMENT_STATUSES })
  appointment_status: AppointmentStatus;

  @ApiProperty({ minimum: 0, example: 2 })
  status_version: number;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  status_updated_at: string | null;

  @ApiProperty({ enum: APPOINTMENT_ACTIONS, isArray: true })
  allowed_actions: AppointmentAction[];

  @ApiProperty({ description: 'Whether the authenticated patient may reschedule this appointment.' })
  can_reschedule: boolean;

  @ApiProperty({ description: 'Whether the authenticated patient may edit appointment notes.' })
  can_edit_notes: boolean;

  @ApiProperty({ example: 60, description: 'Minimum advance for scheduling, cancellation and rescheduling.' })
  minimum_advance_minutes: number;

  @ApiProperty({ type: String, format: 'date-time' })
  change_deadline: string;

  @ApiProperty({ type: String, format: 'date-time' })
  server_now: string;
}

export class AppointmentEntity extends AppointmentStateEntity {
  @ApiProperty({ example: 44 })
  patient_id: number;

  @ApiProperty({ example: 42 })
  doctor_id: number;

  @ApiProperty({ description: 'Clinic identifier for the appointment.', example: 12 })
  clinic_id: number;

  @ApiProperty({ description: 'Clinic name.', example: 'Central Health Clinic' })
  clinic_name: string;

  @ApiProperty({ description: 'Patient first name.', example: 'Maria' })
  first_name: string;

  @ApiProperty({
    description: 'Patient middle name.',
    example: 'Isabel',
    required: false,
    nullable: true,
  })
  second_name?: string;

  @ApiProperty({ description: 'Patient first surname.', example: 'Torres' })
  first_last_name: string;

  @ApiProperty({ description: 'Patient second surname.', example: 'Ruiz' })
  second_last_name: string;

  @ApiProperty({
    description: 'Appointment start time in ISO format.',
    example: '2025-01-20T09:00:00Z',
  })
  start_date_time: string;

  @ApiProperty({
    description: 'Appointment end time in ISO format.',
    example: '2025-01-20T09:30:00Z',
  })
  end_date_time: string;

  @ApiProperty({
    description: 'Optional description of the appointment.',
    example: 'Follow-up for blood pressure check.',
    required: false,
    nullable: true,
  })
  appointment_description?: string;
}

export class AppointmentSlotEntity {
  @ApiProperty({ description: 'Unique appointment identifier.', example: 101 })
  appointment_id: number;

  @ApiProperty({
    description: 'Appointment start time in ISO format.',
    example: '2025-01-20T09:00:00Z',
  })
  start_date_time: string;

  @ApiProperty({
    description: 'Appointment end time in ISO format.',
    example: '2025-01-20T09:30:00Z',
  })
  end_date_time: string;
}

export class PatientHistoryEntity {
  @ApiProperty({ description: 'Patient identifier.', example: 44 })
  user_id: number;

  @ApiProperty({ description: 'Patient first name.', example: 'Marcos' })
  first_name: string;

  @ApiProperty({
    description: 'Patient middle name.',
    example: 'Antonio',
    required: false,
    nullable: true,
  })
  second_name?: string;

  @ApiProperty({ description: 'Patient first surname.', example: 'Diaz' })
  first_last_name: string;

  @ApiProperty({
    description: 'Optional description of the appointment.',
    example: 'Annual check-up results discussed.',
    required: false,
    nullable: true,
  })
  appointment_description?: string;

  @ApiProperty({
    description: 'Date of the appointment in ISO string.',
    example: '2025-01-05T14:00:00Z',
  })
  appointment_date: string;
}

export class CountryEntity {
  @ApiProperty({ description: 'Country identifier.', example: 1 })
  country_id: number;

  @ApiProperty({ description: 'Name of the country.', example: 'El Salvador' })
  country_name: string;
}

export class StateEntity {
  @ApiProperty({ description: 'State identifier.', example: 3 })
  state_id: number;

  @ApiProperty({ description: 'Name of the state.', example: 'San Salvador' })
  state_name: string;

  @ApiProperty({ description: 'Identifier of the country the state belongs to.', example: 1 })
  country_id: number;
}

export class CityEntity {
  @ApiProperty({ description: 'City identifier.', example: 9 })
  city_id: number;

  @ApiProperty({ description: 'Identifier of the state the city belongs to.', example: 3 })
  state_id: number;

  @ApiProperty({ description: 'Name of the city.', example: 'Santa Tecla' })
  city_name: string;
}

export class AppointmentAvailabilitySlotEntity {
  @ApiProperty({ type: String, format: 'date-time' })
  start_date_time: string;

  @ApiProperty({ type: String, format: 'date-time' })
  end_date_time: string;

  @ApiProperty({ enum: ['available', 'booked', 'break', 'past', 'too_soon', 'unavailable', 'current'] })
  status: string;
}

export class AppointmentAvailabilityEntity {
  @ApiProperty()
  clinic_id: number;

  @ApiProperty()
  doctor_id: number;

  @ApiProperty({ example: '2026-11-26' })
  date: string;

  @ApiProperty({ example: 'America/Bogota' })
  time_zone: string;

  @ApiProperty({ type: String, format: 'date-time' })
  server_now: string;

  @ApiProperty({ example: 60 })
  minimum_advance_minutes: number;

  @ApiProperty({ example: 30 })
  duration_minutes: number;

  @ApiProperty({ enum: ['closed', 'weekend'], nullable: true })
  unavailable_reason: string | null;

  @ApiProperty({ type: AppointmentAvailabilitySlotEntity, isArray: true })
  slots: AppointmentAvailabilitySlotEntity[];
}
