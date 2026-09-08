import { Module } from '@nestjs/common';
import { ClinicsService } from './clinics.service';
import { ClinicsController } from './clinics.controller';
import { DatabaseModule } from '../db/database.module';

@Module({
  providers: [ClinicsService],
  imports: [DatabaseModule],
  controllers: [ClinicsController]
})
export class ClinicsModule {}
