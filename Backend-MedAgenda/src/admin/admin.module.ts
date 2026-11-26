import { Module } from '@nestjs/common';
import { ClinicsModule } from '../clinics/clinics.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { DatabaseModule } from '../db/database.module';

@Module({
  imports: [DatabaseModule, ClinicsModule],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService]
})
export class AdminModule {}
