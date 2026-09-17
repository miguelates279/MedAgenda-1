import { BadRequestException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { AppointmentSlot } from '../appointments/repo/reads';
import * as ClinicReads from './repo/reads';
import { DatabaseService } from '../db/database.service';
import { Roles } from '../auth/role_guard/roles.enum';
import { AddMemberToClinicDto, AddSpecialtiesToClinicDto, CreateClinicDto, CreateSpecialtyDto, GetClinicDoctorAppointmentsDto, GetClinicDto, GetClinicsInCityDto, GetClinicsInCountryDto, GetClinicsInStateDto, GetClinicsWithSpecialtyDto, GetClinicsWithSpecialtyInCityDto, GetClinicsWithSpecialtyInCountryDto } from './dto/clinics.dto';
import * as ClinicWrites from './repo/writes'
import { PublicDoctor } from '../doctors/repo';



@Injectable()
export class ClinicsService {

    constructor(private readonly db: DatabaseService){}
    
    async getAllSpecialties(): Promise<ClinicReads.Specialty[]> {
        return await ClinicReads.getAllSpecialties(this.db);
    }

    async getAllClinics(): Promise<ClinicReads.Clinic[]> {
        return await ClinicReads.getClinics(this.db);
    }

    async getUserClinics(user_id: number): Promise<ClinicReads.Clinic[]> {
        return await ClinicReads.getUserClinics(this.db, user_id);
    }

    async getAllClinicsWithSpecialties(dto: GetClinicsWithSpecialtyDto): Promise<ClinicReads.Clinic[]> {
        return await ClinicReads.getClinicsWithSpecialties(this.db, dto.specialty_ids);
    }

    async getAllClinicsWithSpecialtiesInCity(dto: GetClinicsWithSpecialtyInCityDto): Promise<ClinicReads.Clinic[]> {
        return await ClinicReads.getClinicsWithSpecialtyInCity(this.db, dto.specialty_ids, dto.city_id);
    }

    async getAllClinicsWithSpecialtiesInCountry(dto: GetClinicsWithSpecialtyInCountryDto): Promise<ClinicReads.Clinic[]> {
        return await ClinicReads.getClinicsWithSpecialtyInCountry(this.db, dto.specialty_ids, dto.country_id);
    }

    async getAllClinicsInCity(city_id: number): Promise<ClinicReads.Clinic[]> {
        return await ClinicReads.getClinicsInCity(this.db, city_id);
    } 

    async getAllClinicsInState(state_id: number): Promise<ClinicReads.Clinic[]> {
        return await ClinicReads.getClinicsInState(this.db, state_id);
    } 

    async getAllClinicsInCountry(country_id: number): Promise<ClinicReads.Clinic[]> {
        return await ClinicReads.getClinicsInCountry(this.db, country_id);
    }

    async getAllClinicDoctors(dto: GetClinicDto): Promise<PublicDoctor[]> {
        const rows = await ClinicReads.getClinicDoctors(this.db, dto.clinic_id);

        const doctorsMap = new Map<number, PublicDoctor>();

        for (const row of rows) {
            if (!doctorsMap.has(row.user_id)) {
            doctorsMap.set(row.user_id, {
                doctor_id: row.user_id,
                first_name: row.first_name,
                second_name: row.second_name,
                first_last_name: row.first_last_name,
                second_last_name: row.second_last_name,
                specialties: []
            });
            }

            doctorsMap.get(row.user_id)!.specialties.push({
            specialty_id: row.specialty_id,
            specialty_name: row.specialty_name,
            specialty_description: row.specialty_description
            });
        }

        return Array.from(doctorsMap.values());
    }

    async getClinicDetails(dto: GetClinicDto): Promise<ClinicReads.Clinic> {
        const q = await ClinicReads.getClinicDetails(this.db, dto.clinic_id);
        return q[0];
    }

    async createClinic(dto: CreateClinicDto, requester_id: number): Promise<{ clinic_id: number }> {
        const clinic_id = await ClinicWrites.insertClinic(this.db, dto, requester_id);
        return { clinic_id };
    }

    async deleteClinic(clinic_id: number, requester_id: number): Promise<void> {
        const deleted = await ClinicWrites.deleteClinic(this.db, clinic_id, requester_id);
        if (!deleted) {
            throw new NotFoundException('Clinic not found or user is not its owner');
        }
    }

    async addMemberToClinic(dto: AddMemberToClinicDto, requester_id: number): Promise<void> {
        const requester_role = await ClinicReads.getRoleByIds(this.db, dto.clinic_id, requester_id);
        if(requester_role === null) throw new UnauthorizedException();
        if(this.rankRole(requester_role.role_within_clinic) <= this.rankRole(dto.role_within_clinic)) throw new ForbiddenException(`You can't add members with roles that are higher or the same level as yours.`);
        await ClinicWrites.insertMembership(this.db, dto);
    }

    async addSpecialtiesToClinic(dto: AddSpecialtiesToClinicDto): Promise<void> {
        await ClinicWrites.insertClinicSpecialties(this.db, dto);
    }

    async getClinicScheduleRules(dto: GetClinicDto): Promise<ClinicReads.ClinicScheduleRules> {
        const r = await ClinicReads.getClinicSchedulingRules(this.db, dto.clinic_id);
        return r[0];
    }

    async getClinicDoctorAppointmentsForDay(dto: GetClinicDoctorAppointmentsDto): Promise<AppointmentSlot[]> {
        if(Number.isNaN(dto.appointment_date.getTime())) throw new BadRequestException('Invalid appointment_date');
        const dateOnly = dto.appointment_date.toISOString().slice(0, 10);
        return await ClinicReads.getClinicDoctorAppointmentsForDay(this.db, dto.clinic_id, dto.doctor_id, dateOnly);
    }

    async isUserAdminAnywhere(user_id: number): Promise<boolean> {
        if(!user_id) throw new BadRequestException('Missing critical parameter user_id');
        return await ClinicReads.isUserAdminAnywhere(this.db, user_id);
    }

    async createSpecialty(dto: CreateSpecialtyDto): Promise<ClinicReads.Specialty> {
        const specialty_id = await ClinicWrites.insertSpecialty(this.db, dto);
        const specialty = await ClinicReads.getSpecialtyById(this.db, specialty_id);
        if (!specialty) {
            throw new BadRequestException('Failed to create specialty');
        }
        return specialty;
    }


    //Helpers
    rankRole(role: Roles): number {
        switch(role) {
            case Roles.Owner:
                return 4;
            case Roles.Admin:
                return 3;
            case Roles.Doctor:
                return 2;
            case Roles.Employee:
                return 1;
            default:
                return 0;
        }
    }

}
