import { Controller, Get, Query } from '@nestjs/common';
import { ApiBadRequestResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppointmentAvailabilityEntity } from '../swagger/entities';
import { AppointmentsService } from './appointments.service';
import { AppointmentAvailabilityQueryDto } from './dto/appointments.dto';

@ApiTags('Appointments')
@Controller('appointments/availability')
export class AppointmentAvailabilityController {
    constructor(private readonly appointmentService: AppointmentsService) {}

    @Get('day')
    @ApiOperation({ summary: 'Get authoritative clinic day slots without patient or other clinic details.' })
    @ApiOkResponse({ type: AppointmentAvailabilityEntity })
    @ApiBadRequestResponse({ description: 'Invalid date, doctor membership or clinic configuration.' })
    @ApiNotFoundResponse({ description: 'Clinic not found.' })
    getAvailability(@Query() query: AppointmentAvailabilityQueryDto) {
        return this.appointmentService.getAvailability(query.clinic_id, query.doctor_id, query.date);
    }
}
