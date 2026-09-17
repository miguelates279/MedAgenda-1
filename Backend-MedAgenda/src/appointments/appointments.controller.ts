import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiBody, ApiConflictResponse, ApiCreatedResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt/jwt-auth.guard';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto, UpdateAppointmentDto } from './dto/appointments.dto';

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
    @ApiOkResponse({ description: 'Appointments retrieved successfully.' })
    @ApiUnauthorizedResponse({ description: 'Invalid or missing authentication token.' })
    async getPatientAppointments(@Req() req): Promise<any> {
        return await this.appointmentService.getPatientAppointments(req.user.id);
    }

    @Put(':id')
    @ApiOperation({ summary: 'Update appointment notes/details for the authenticated patient.' })
    @ApiParam({ name: 'id', description: 'ID of the appointment to update', type: Number })
    @ApiBody({ type: UpdateAppointmentDto })
    @ApiOkResponse({ description: 'Appointment updated successfully.' })
    @ApiNotFoundResponse({ description: 'Appointment not found or not owned by user.' })
    @ApiUnauthorizedResponse({ description: 'Invalid or missing authentication token.' })
    async updateAppointment(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateAppointmentDto,
        @Req() req
    ): Promise<{ message: string }> {
        return await this.appointmentService.updateAppointment(id, req.user.id, dto);
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Cancel/Delete an appointment for the authenticated patient.' })
    @ApiParam({ name: 'id', description: 'ID of the appointment to cancel', type: Number })
    @ApiOkResponse({ description: 'Appointment cancelled successfully.' })
    @ApiNotFoundResponse({ description: 'Appointment not found or not owned by user.' })
    @ApiUnauthorizedResponse({ description: 'Invalid or missing authentication token.' })
    async cancelAppointment(
        @Param('id', ParseIntPipe) id: number,
        @Req() req
    ): Promise<{ message: string }> {
        return await this.appointmentService.deleteAppointment(id, req.user.id);
    }
}
