import { BadRequestException, Injectable } from '@nestjs/common';
import * as DoctorReads from './repo/reads'
import { DatabaseService } from '../db/database.service';
import { Appointment } from '../appointments/repo/reads';

@Injectable()
export class DoctorsService {
    constructor(private readonly db: DatabaseService){}

    async getDoctorAppointments(doctor_id: number): Promise<Appointment[]> {
        if(!doctor_id) throw new BadRequestException('Missing critical parameter doctor_id');
        return await DoctorReads.getAllDoctorAppointments(this.db, doctor_id);
    }

    async getDoctorsPatientHistory(doctor_id: number): Promise<DoctorReads.PatientHistoryRow[]> {
        if(!doctor_id) throw new BadRequestException('Missing critical parameter doctor_id');
        return await DoctorReads.getDoctorPatientHistory(this.db, doctor_id);
    }   

    async isUserDoctorAnywhere(user_id: number): Promise<boolean> {
        return await DoctorReads.isUserDoctorAnywhere(this.db, user_id);
    }    

}
