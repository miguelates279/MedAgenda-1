import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEmail, IsInt, IsOptional, MaxLength, Min } from 'class-validator';

export class ClinicUsersQueryDto {
    @ApiProperty({ minimum: 1 })
    @Type(() => Number)
    @IsInt()
    @Min(1)
    clinic_id: number;
}

export class SearchClinicUserQueryDto extends ClinicUsersQueryDto {
    @ApiProperty()
    @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
    @IsEmail()
    @MaxLength(255)
    email: string;
}

export class UpdateUserRoleDto {
    @ApiProperty({ minimum: 1 })
    @IsInt()
    @Min(1)
    clinic_id: number;

    @ApiProperty()
    @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
    @IsEmail()
    @MaxLength(255)
    email: string;

    @ApiProperty()
    @IsBoolean()
    isDoctor: boolean;

    @ApiProperty()
    @IsBoolean()
    isAdmin: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsInt()
    @Min(1)
    specialty_id?: number;
}
