import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { PrescriptionsService } from './prescriptions.service';
import { JwtAuthGuard } from '../auth/jwt/jwt-auth.guard';
import { RolesGuard } from '../auth/role_guard/roles.guard';
import { CreatePrescriptionDto } from './dto/appointments.dto';
import { roles } from '../auth/role_guard/roles.decorator';
import { Roles } from '../auth/role_guard/roles.enum';
import { PrescriptionDoctorView, PrescriptionUserView } from './repo/reads';

@UseGuards(JwtAuthGuard)
@Controller('prescriptions')
export class PrescriptionsController {
    constructor(private readonly prescriptionService: PrescriptionsService) {}


    @UseGuards(RolesGuard)
    @roles(Roles.Doctor)
    @Post('assignPrescription')
    async assignPrescription(@Body() dto: CreatePrescriptionDto, @Req() req): Promise<void> { 
        return await this.prescriptionService.createPrescription(dto, req.user.id);   
    } 

    @Get('getUserPrescriptions')
    async getUserPrescriptions(@Req() req): Promise<PrescriptionUserView[]> {
        return await this.prescriptionService.viewUserPrescriptions(req.user.id);
    }

    @UseGuards(RolesGuard)
    @roles(Roles.Doctor)
    @Get('getPrescriptionsAssignedByDoctor')
    async getDoctorPrescriptions(@Req() req): Promise<PrescriptionDoctorView[]> {
        return await this.prescriptionService.viewPrescriptionsDoctorAssigned(req.user.id);
    }

}
