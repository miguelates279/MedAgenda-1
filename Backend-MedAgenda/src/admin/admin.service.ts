import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../db/database.service';
import { ClinicManagementService } from '../clinics/clinic-management.service';
import * as AdminReads from './repo/reads';
import { UpdateUserRoleDto } from './dto/admin.dto';

@Injectable()
export class AdminService {
    constructor(private readonly db: DatabaseService, private readonly management: ClinicManagementService) {}

    async getClinicUsers(adminUserId: number, clinicId: number): Promise<AdminReads.ClinicUser[]> {
        return this.management.getMembers(clinicId, adminUserId);
    }

    async searchUserByEmail(adminUserId: number, email: string, clinicId: number): Promise<AdminReads.ClinicUser> {
        return this.management.searchMember(clinicId, adminUserId, email);
    }

    async updateUserRole(adminUserId: number, dto: UpdateUserRoleDto): Promise<{ message: string }> {
        return this.management.updateMember(adminUserId, dto);
    }

    async removeMember(clinicId: number, userId: number, actorId: number) {
        return this.management.removeMember(clinicId, userId, actorId);
    }

    async getAllSpecialties(): Promise<AdminReads.Specialty[]> {
        return AdminReads.getAllSpecialties(this.db);
    }

    async getAdminClinics(userId: number): Promise<AdminReads.AdminClinic[]> {
        return AdminReads.getUserAdminClinics(this.db, userId);
    }
}
