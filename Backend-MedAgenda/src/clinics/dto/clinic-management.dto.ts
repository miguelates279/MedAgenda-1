import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsInt, IsOptional, IsPhoneNumber, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';

const trimmed = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;

export class UpdateClinicDto {
    @ApiPropertyOptional({ maxLength: 25 })
    @ValidateIf((_object, value) => value !== undefined)
    @Transform(trimmed)
    @IsString()
    @MinLength(1)
    @MaxLength(25)
    clinic_name?: string;

    @ApiPropertyOptional()
    @ValidateIf((_object, value) => value !== undefined)
    @Transform(trimmed)
    @IsPhoneNumber()
    @MaxLength(13)
    clinic_phone_number?: string;

    @ApiPropertyOptional({ minimum: 1 })
    @ValidateIf((_object, value) => value !== undefined)
    @IsInt()
    @Min(1)
    clinic_city_id?: number;

    @ApiPropertyOptional({ maxLength: 30 })
    @ValidateIf((_object, value) => value !== undefined)
    @Transform(trimmed)
    @IsString()
    @MinLength(1)
    @MaxLength(30)
    clinic_address?: string;

    @ApiPropertyOptional({ maxLength: 5000 })
    @ValidateIf((_object, value) => value !== undefined)
    @Transform(trimmed)
    @IsString()
    @MaxLength(5000)
    clinic_description?: string;

    @ApiPropertyOptional()
    @ValidateIf((_object, value) => value !== undefined)
    @IsBoolean()
    is_open?: boolean;

    @ApiPropertyOptional({ example: '08:00' })
    @ValidateIf((_object, value) => value !== undefined)
    @IsString()
    @Matches(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
    clinic_opening_time?: string;

    @ApiPropertyOptional({ example: '18:00' })
    @ValidateIf((_object, value) => value !== undefined)
    @IsString()
    @Matches(/^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/)
    clinic_close_time?: string;

    @ApiPropertyOptional({ minimum: 1, maximum: 1440 })
    @ValidateIf((_object, value) => value !== undefined)
    @IsInt()
    @Min(1)
    @Max(1440)
    clinic_average_appointment_time?: number;

    @ApiPropertyOptional({ nullable: true, example: '12:00' })
    @IsOptional()
    @IsString()
    @Matches(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
    clinic_break_time?: string | null;

    @ApiPropertyOptional({ minimum: 0, maximum: 1440 })
    @ValidateIf((_object, value) => value !== undefined)
    @IsInt()
    @Min(0)
    @Max(1440)
    clinic_break_duration?: number;

    @ApiPropertyOptional({ type: [Number] })
    @ValidateIf((_object, value) => value !== undefined)
    @IsArray()
    @ArrayMaxSize(100)
    @ArrayUnique()
    @IsInt({ each: true })
    @Min(1, { each: true })
    specialty_ids?: number[];
}

export class OwnerProviderDto {
    @ApiProperty()
    @IsBoolean()
    isDoctor: boolean;

    @ApiPropertyOptional({ minimum: 1 })
    @ValidateIf((_object, value) => value !== undefined)
    @IsInt()
    @Min(1)
    specialty_id?: number;
}
