import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiBody, ApiConflictResponse, ApiCreatedResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt/jwt-auth.guard';
import { AppointmentsService } from './appointments.service';
import { AppointmentActionDto, CreateAppointmentDto, UpdateAppointmentDto } from './dto/appointments.dto';
import { AppointmentEntity, AppointmentStateEntity } from '../swagger/entities';

@ApiTags('Appointments')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('bearer')
@Controller('appointments')
export class AppointmentsController {
    constructor(private readonly appointmentService: AppointmentsService){}

    @Post('scheduleAppointment')
    @ApiOperation({ summary: 'Schedule a new appointment for the authenticated patient.' })
    @ApiBody({ type: CreateAppointmentDto })
    @ApiCreatedResponse({ description: 'Appointment scheduled successfully.' })
    @ApiBadRequestResponse({ description: 'Validation failed or missing required data.' })
    @ApiConflictResponse({ description: 'Doctor or clinic is not available for the specified time range.' })
    @ApiUnauthorizedResponse({ description: 'Invalid or missing authentication token.' })
    async scheduleAppointment(@Body() dto: CreateAppointmentDto, @Req() req): Promise<void> {
        return await this.appointmentService.createAppointment(dto, req.user.id);
    }

    @Get('patient')
    @ApiOperation({ summary: 'Get all appointments for the authenticated patient.' })
    @ApiOkResponse({ description: 'Appointments retrieved successfully.', type: AppointmentEntity, isArray: true })
    @ApiUnauthorizedResponse({ description: 'Invalid or missing authentication token.' })
    async getPatientAppointments(@Req() req): Promise<any> {
        return await this.appointmentService.getPatientAppointments(req.user.id);
    }


    @Get('dispatch-clinics')
    @ApiOperation({ summary: 'List clinics where the authenticated user has reception permissions.' })
    @ApiOkResponse({ description: 'Clinic identifiers, names and Owner, Admin or Employee roles.' })
    async getDispatchClinics(@Req() req) {
        return this.appointmentService.getDispatchClinics(req.user.id);
    }

    @Get('clinic/:clinicId')
    @ApiOperation({ summary: 'Get a clinic day agenda for its owner, administrators or reception staff.' })
    @ApiParam({ name: 'clinicId', type: Number })
    @ApiQuery({ name: 'date', example: '2026-11-26', required: true })
    @ApiOkResponse({ type: AppointmentEntity, isArray: true })
    @ApiNotFoundResponse({ description: 'Clinic not found or not accessible.' })
    async getClinicAppointments(@Param('clinicId', ParseIntPipe) clinicId: number, @Query('date') date: string, @Req() req) {
        return this.appointmentService.getClinicAppointments(clinicId, req.user.id, date);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get an appointment visible to its patient, assigned doctor or clinic staff.' })
    @ApiOkResponse({ type: AppointmentEntity })
    @ApiNotFoundResponse({ description: 'Appointment not found or not accessible.' })
    async getAppointment(@Param('id', ParseIntPipe) id: number, @Req() req) {
        return this.appointmentService.getAppointment(id, req.user.id);
    }

    @Post(':id/actions')
    @HttpCode(200)
    @ApiOperation({ summary: 'Apply an allowed appointment workflow action using the last observed version.' })
    @ApiBody({ type: AppointmentActionDto })
    @ApiOkResponse({ type: AppointmentStateEntity })
    @ApiBadRequestResponse({ description: 'The action is not allowed in the current state, date or role.' })
    @ApiConflictResponse({ description: 'Appointment version changed or the doctor already has a consultation in progress.' })
    @ApiNotFoundResponse({ description: 'Appointment not found or not accessible.' })
    async performAction(@Param('id', ParseIntPipe) id: number, @Body() dto: AppointmentActionDto, @Req() req) {
        return this.appointmentService.performAction(id, req.user.id, dto);
    }

    @Put(':id')
    @ApiOperation({ summary: 'Update notes or reschedule an appointment owned by the authenticated patient.' })
    @ApiParam({ name: 'id', description: 'ID of the appointment to update', type: Number })
    @ApiBody({ type: UpdateAppointmentDto })
    @ApiOkResponse({ description: 'Appointment updated.' })
    @ApiBadRequestResponse({ description: 'Invalid changes.' })
    @ApiConflictResponse({ description: 'The selected slot is unavailable.' })
    @ApiNotFoundResponse({ description: 'No appointment owned by this patient was found.' })
    @ApiUnauthorizedResponse({ description: 'Invalid or missing authentication token.' })
    async updateAppointment(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateAppointmentDto, @Req() req) {
        return this.appointmentService.updateAppointment(id, req.user.id, dto);
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Cancel a future appointment owned by the authenticated patient.' })
    @ApiParam({ name: 'id', description: 'ID of the appointment to cancel', type: Number })
    @ApiOkResponse({ description: 'Appointment cancelled and slot released.' })
    @ApiBadRequestResponse({ description: 'Past appointments cannot be cancelled.' })
    @ApiNotFoundResponse({ description: 'No appointment owned by this patient was found.' })
    @ApiUnauthorizedResponse({ description: 'Invalid or missing authentication token.' })
    async cancelAppointment(@Param('id', ParseIntPipe) id: number, @Req() req) {
        return this.appointmentService.deleteAppointment(id, req.user.id);
    }
}
