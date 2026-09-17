import { ClinicSearchFilters } from "../hooks/useClinicsSearch";
import { AppointmentSlot } from "../interfaces/appointment";
import { Clinic } from "../interfaces/clinic";
import { ClinicSchedule } from "../interfaces/clinicSchedule";
import { Doctor } from "../interfaces/doctor";
import { apiFetch } from "./singletonFetch";
import { UserClinic } from "../interfaces/adminUser";


/*export const getClinics = (filters: ClinicSearchFilters): Promise<Clinic[]> => {
    return apiFetch('/clinics/getAllClinics','GET');
}*/

export const getClinicsByCountry = (countryId: number): Promise<Clinic[]> => {
  return apiFetch(`/clinics/getAllClinicsInCountry?country_id=${countryId}`, 'GET');
};

export const getClinicsByCity = (cityId: number): Promise<Clinic[]> => {
  return apiFetch(`/clinics/getAllClinicsInCity?city_id=${cityId}`, 'GET');
};

export const getClinicsByState = (stateId: number): Promise<Clinic[]> => {
  return apiFetch(`/clinics/getAllClinicsInState?state_id=${stateId}`,'GET');
};

export const getClinicsWithSpecialtiesInCountry = (
  specialty_ids: number[],
  country_id: number
): Promise<Clinic[]> => {
  const params = new URLSearchParams();

  specialty_ids.forEach(id => params.append('specialty_ids', id.toString()));

  params.append('country_id', country_id.toString());

  return apiFetch(`/clinics/getAllClinicsWithSpecialtiesInCountry?${params.toString()}`, 'GET');
};

export const getClinicsWithSpecialtiesInCity = (
  specialty_ids: number[],
  city_id: number
): Promise<Clinic[]> => {
  const params = new URLSearchParams();

  specialty_ids.forEach(id => params.append('specialty_ids', id.toString()));

  params.append('city_id', city_id.toString());

  return apiFetch(`/clinics/getAllClinicsWithSpecialtiesInCity?${params.toString()}`, 'GET');
};

export const getClinicDetails = (clinic_id: number): Promise<Clinic> => {
  return apiFetch(`/clinics/getClinicDetails?clinic_id=${clinic_id}`, 'GET');
};

export const getClinicDoctors = (clinic_id: number): Promise<Doctor[]> => {
  return apiFetch(`/clinics/getClinicDoctors?clinic_id=${clinic_id}`,'GET');
};

export const getClinicScheduleRules = (clinic_id: number): Promise<ClinicSchedule> => {
  return apiFetch(`/clinics/getClinicScheduleRules?clinic_id=${clinic_id}`,'GET');
};

export const getClinicDoctorAppointmentsForDay = (clinic_id: number, doctor_id: number, appointment_date: string): Promise<AppointmentSlot[]> => {
  return apiFetch(`/clinics/getClinicDoctorAppointmentsForDay?clinic_id=${clinic_id}&doctor_id=${doctor_id}&appointment_date=${appointment_date}`, 'GET');
};

export const searchCities = (searchTerm: string): Promise<import('../interfaces/clinic').CitySearchResult[]> => {
  return apiFetch(`/location/searchCities?search=${encodeURIComponent(searchTerm)}`, 'GET');
};

export const createClinic = (data: import('../interfaces/clinic').CreateClinicDTO): Promise<Clinic> => {
  return apiFetch('/clinics/createClinic', 'POST', data);
};

export const getMyClinics = (): Promise<(Clinic & UserClinic)[]> => {
  return apiFetch('/clinics/my-clinics', 'GET');
};

export const deleteClinic = (clinicId: number): Promise<void> => {
  return apiFetch(`/clinics/${clinicId}`, 'DELETE');
};


