import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../db/database.service';
import { CreatePrescriptionDto } from './dto/appointments.dto';
import * as PrescriptionWrites from './repo/writes';
import * as PrescriptionReads from './repo/reads';
@Injectable()
export class PrescriptionsService {
    constructor(private readonly db: DatabaseService){}


    async createPrescription(dto: CreatePrescriptionDto, requester_id: number): Promise<void> {
        await PrescriptionWrites.insertPrescriptionRow(this.db, dto.clinic_id, requester_id, dto.patient_id, dto.prescription_description);
    }

    async viewUserPrescriptions(requester_id: number): Promise<PrescriptionReads.PrescriptionUserView[]> {
        return await PrescriptionReads.readUserPrescriptions(this.db, requester_id);
    }

    async viewPrescriptionsDoctorAssigned(requester_id: number): Promise<PrescriptionReads.PrescriptionDoctorView[]> {
        return await PrescriptionReads.readDoctorPrescriptions(this.db, requester_id);
    }

}
