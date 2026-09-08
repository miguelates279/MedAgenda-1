import { Module } from '@nestjs/common';
import { LocationService } from './location.service';
import { LocationController } from './location.controller';
import { DatabaseModule } from '../db/database.module';

@Module({
  providers: [LocationService],
  imports: [DatabaseModule],
  controllers: [LocationController]
})
export class LocationModule {}
