import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { DatabaseModule } from '../db/database.module';

@Module({
  providers: [UsersService],
  imports: [DatabaseModule],
  controllers: [UsersController]
})
export class UsersModule {}
