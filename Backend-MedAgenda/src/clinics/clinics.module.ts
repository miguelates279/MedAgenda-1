import { Module } from '@nestjs/common';
import { ClinicManagementService } from './clinic-management.service';
import { ClinicsService } from './clinics.service';
import { ClinicsController } from './clinics.controller';
import { DatabaseModule } from '../db/database.module';

@Module({
  providers: [ClinicsService, ClinicManagementService],
  imports: [DatabaseModule],
  controllers: [ClinicsController],
  exports: [ClinicManagementService]
})
export class ClinicsModule {}
