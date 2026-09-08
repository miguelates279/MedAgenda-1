import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { DatabaseModule } from '../db/database.module';
import { JwtStrategy } from './jwt/jwt.strategy';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  providers: [JwtStrategy, AuthService],
  imports:[
    DatabaseModule, 
    PassportModule,
    ConfigModule,
    JwtModule.registerAsync(
      {
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          secret: config.get<string>('JWT_SECRET'),
          signOptions: {expiresIn: config.getOrThrow('JWT_EXPIRY_TIME')},
        })
      }
    ),

  ],
  controllers: [AuthController]
})
export class AuthModule {}
