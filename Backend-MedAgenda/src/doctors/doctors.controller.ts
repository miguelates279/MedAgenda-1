import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Appointment } from '../appointments/repo/reads';
import { JwtAuthGuard } from '../auth/jwt/jwt-auth.guard';
import { AppointmentEntity, PatientHistoryEntity } from '../swagger/entities';
import { DoctorsService } from './doctors.service';
import { PatientHistoryRow } from './repo';

@ApiTags('Doctors')
@ApiBearerAuth('bearer')
@Controller('doctors')
@UseGuards(JwtAuthGuard)
export class DoctorsController {
    constructor(private readonly doctorService: DoctorsService){}

    @ApiOperation({ summary: 'Retrieve all appointments assigned to the authenticated doctor.' })
    @ApiOkResponse({ description: 'Appointments retrieved successfully.', type: AppointmentEntity, isArray: true })
    @Get('getDoctorAppointments')
    async getDoctorAppointments(@Req() req): Promise<Appointment[]> {
        return await this.doctorService.getDoctorAppointments(req.user.id);
    }

    @ApiOperation({ summary: 'Get historical appointments for the authenticated doctor.' })
    @ApiOkResponse({ description: 'Patient history retrieved successfully.', type: PatientHistoryEntity, isArray: true })
    @Get('getDoctorPatientHistories')
    async getDoctorPatientHistories(@Req() req): Promise<PatientHistoryRow[]> {
        return await this.doctorService.getDoctorsPatientHistory(req.user.id);
    }

    @ApiOperation({ summary: 'Check if the authenticated user is a doctor in any clinic.' })
    @ApiOkResponse({ description: 'True when the user is a doctor in at least one clinic.', schema: { type: 'boolean' } })
    @Get('isUserDoctorAnywhere')
    async isUserDoctorAnywhere(@Req() req): Promise<boolean> {
        return await this.doctorService.isUserDoctorAnywhere(req.user.id);
    }

}
