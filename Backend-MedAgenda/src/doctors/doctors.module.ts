import { Module } from '@nestjs/common';
import { DoctorsService } from './doctors.service';
import { DoctorsController } from './doctors.controller';
import { DatabaseModule } from '../db/database.module';

@Module({
  providers: [DoctorsService],
  imports: [DatabaseModule],
  controllers: [DoctorsController]
})
export class DoctorsModule {}
