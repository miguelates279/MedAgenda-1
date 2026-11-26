import { Module } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { AppointmentsController } from './appointments.controller';
import { AppointmentAvailabilityController } from './appointment-availability.controller';
import { DatabaseModule } from '../db/database.module';

@Module({
  providers: [AppointmentsService],
  imports: [DatabaseModule],
  controllers: [AppointmentAvailabilityController, AppointmentsController]
})
export class AppointmentsModule {}
