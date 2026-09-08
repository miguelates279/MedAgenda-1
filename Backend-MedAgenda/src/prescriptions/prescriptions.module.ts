import { Module } from '@nestjs/common';
import { PrescriptionsService } from './prescriptions.service';
import { PrescriptionsController } from './prescriptions.controller';
import { DatabaseModule } from '../db/database.module';

@Module({
  providers: [PrescriptionsService],
  imports: [DatabaseModule],
  controllers: [PrescriptionsController]
})
export class PrescriptionsModule {}
