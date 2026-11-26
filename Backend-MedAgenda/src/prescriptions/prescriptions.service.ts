import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../db/database.service';
import { CreatePrescriptionDto, UpdatePrescriptionDto } from './dto/appointments.dto';
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

    async getPrescriptionDocument(prescription_id: number, requester_id: number): Promise<PrescriptionReads.PrescriptionDocument> {
        if (!Number.isSafeInteger(prescription_id) || prescription_id < 1 || prescription_id > 2147483647) {
            throw new BadRequestException('El identificador de la receta debe ser un entero positivo válido.');
        }
        const document = await PrescriptionReads.readPrescriptionDocument(this.db, prescription_id);
        if (!document) {
            throw new NotFoundException('No se encontró la receta.');
        }
        if (document.doctor_id !== requester_id && document.patient_id !== requester_id) {
            throw new ForbiddenException('Solo el paciente o el médico autor pueden exportar esta receta.');
        }
        if (document.date_emitted === null) {
            throw new ConflictException('La receta no tiene una fecha de emisión válida. Solicita su revisión antes de exportarla.');
        }
        return { ...document, date_emitted: document.date_emitted };
    }

    async updatePrescription(prescription_id: number, dto: UpdatePrescriptionDto, requester_id: number): Promise<void> {
        const existing = await PrescriptionReads.readPrescriptionById(this.db, prescription_id);
        if (!existing) {
            throw new NotFoundException(`Prescription with ID ${prescription_id} not found.`);
        }
        if (existing.doctor_id !== requester_id) {
            throw new ForbiddenException(`You can only update prescriptions created by yourself.`);
        }
        await PrescriptionWrites.updatePrescriptionRow(this.db, prescription_id, requester_id, dto.prescription_description);
    }

    async deletePrescription(prescription_id: number, requester_id: number): Promise<void> {
        const existing = await PrescriptionReads.readPrescriptionById(this.db, prescription_id);
        if (!existing) {
            throw new NotFoundException(`Prescription with ID ${prescription_id} not found.`);
        }
        if (existing.doctor_id !== requester_id) {
            throw new ForbiddenException(`You can only delete prescriptions created by yourself.`);
        }
        await PrescriptionWrites.deletePrescriptionRow(this.db, prescription_id, requester_id);
    }
}
