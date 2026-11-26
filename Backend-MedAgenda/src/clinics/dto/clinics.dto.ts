import { Transform, Type } from "class-transformer";
import { ArrayMaxSize, ArrayUnique, IsBoolean, IsInt, Matches, Max, Min, MinLength, ValidateIf, IsArray, IsDate, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsPhoneNumber, IsString, MaxLength } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Roles } from '../../auth/role_guard/roles.enum';


export class CreateClinicDto {

    @ApiProperty({
        description: 'Clinic display name.',
        example: 'Central Health Clinic',
        maxLength: 25,
    })
    @IsNotEmpty()
    @IsString()
    @MaxLength(25)
    @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
    @MinLength(1)
    clinic_name: string;

    @ApiProperty({
        description: 'Primary phone number for the clinic.',
        example: '+50378901234',
    })
    @IsNotEmpty()
    @IsPhoneNumber()
    @MaxLength(13)
    clinic_phone_number: string;

    @ApiProperty({
        description: 'City identifier where the clinic is located.',
        example: 5,
    })
    @IsNotEmpty()
    @IsInt()
    @Min(1)
    clinic_city_id: number;

    @ApiProperty({
        description: 'Street address of the clinic.',
        example: '123 Medical Ave, Suite 4B',
        maxLength: 30,
    })
    @IsNotEmpty()
    @IsString()
    @MaxLength(30)
    @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
    @MinLength(1)
    clinic_address: string;

    @ApiPropertyOptional({
        description: 'Short description about the clinic and services.',
        example: 'Open Monday to Friday, specialized in pediatrics and family medicine.',
    })
    @IsOptional()
    @IsString()
    @MaxLength(5000)
    clinic_description?: string;

    @ApiPropertyOptional()
    @ValidateIf((_object, value) => value !== undefined)
    @IsBoolean()
    is_open?: boolean;

    @ApiPropertyOptional()
    @ValidateIf((_object, value) => value !== undefined)
    @IsString()
    @Matches(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
    clinic_opening_time?: string;

    @ApiPropertyOptional()
    @ValidateIf((_object, value) => value !== undefined)
    @IsString()
    @Matches(/^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/)
    clinic_close_time?: string;

    @ApiPropertyOptional()
    @ValidateIf((_object, value) => value !== undefined)
    @IsInt()
    @Min(1)
    @Max(1440)
    clinic_average_appointment_time?: number;

    @ApiPropertyOptional({ nullable: true })
    @IsOptional()
    @IsString()
    @Matches(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
    clinic_break_time?: string | null;

    @ApiPropertyOptional()
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

export class AddMemberToClinicDto {
    @ApiProperty({
        description: 'Clinic identifier where the member will be added.',
        example: 12,
    })
    @IsNotEmpty()
    @IsNumber()
    clinic_id: number;

    @ApiProperty({
        description: 'User identifier for the member to add.',
        example: 42,
    })
    @IsNotEmpty()
    @IsNumber()
    user_id: number;

    @ApiProperty({
        description: 'Role the user will hold within the clinic.',
        enum: Roles,
        example: Roles.Employee,
    })
    @IsNotEmpty()
    @IsEnum(Roles)
    role_within_clinic: Roles;

    @ApiPropertyOptional({
        description: 'Optional description of the member’s responsibilities.',
        example: 'Front desk and scheduling',
    })
    @IsOptional()
    @IsString()
    role_description?: string;

}

export class AddSpecialtiesToClinicDto {

    @ApiProperty({
        description: 'List of specialty identifiers to link with the clinic.',
        example: [1, 3, 7],
        type: [Number],
    })
    @IsNotEmpty()
    @IsArray()
    @IsNumber({}, {each: true})
    specialty_ids: number[];
    
    @ApiProperty({
        description: 'Clinic identifier.',
        example: 12,
    })
    @IsNotEmpty()
    @IsNumber()
    clinic_id: number;

}

export class GetClinicsWithSpecialtyDto {
    @ApiProperty({
        description: 'List of specialty identifiers to filter clinics.',
        example: [2, 5],
        type: [Number],
    })
    @IsNotEmpty()
    @IsArray()
    specialty_ids: number[];
}

export class GetClinicsInCityDto {
    @ApiProperty({
        description: 'City identifier to filter clinics.',
        example: 9,
    })
    @IsNotEmpty()
    @IsNumber()
    city_id: number;
}

export class GetClinicsInStateDto {
    @ApiProperty({
        description: 'State identifier to filter clinics.',
        example: 3,
    })
    @IsNotEmpty()
    @IsNumber()
    state_id: number;
}

export class GetClinicsInCountryDto {
    @ApiProperty({
        description: 'Country identifier to filter clinics.',
        example: 1,
    })
    @IsNotEmpty()
    @IsNumber()
    country_id: number;
}

export class GetClinicsWithSpecialtyInCityDto {
  @ApiProperty({
    description: 'Specialty identifiers to include when searching within a city.',
    example: [2, 4],
    type: [Number],
  })
  @IsNotEmpty()
  @IsArray()
  @Transform(({ value }) =>
    Array.isArray(value) ? value.map(Number) : [Number(value)]
  )
  specialty_ids: number[];

  @ApiProperty({
    description: 'City identifier.',
    example: 9,
    type: Number,
  })
  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  city_id: number;
}

export class GetClinicsWithSpecialtyInCountryDto {
  @ApiProperty({
    description: 'Specialty identifiers to include when searching within a country.',
    example: [2, 4],
    type: [Number],
  })
  @IsNotEmpty()
  @IsArray()
  @Transform(({ value }) =>
    Array.isArray(value) ? value.map(Number) : [Number(value)]
  )
  specialty_ids: number[];

  @ApiProperty({
    description: 'Country identifier.',
    example: 1,
    type: Number,
  })
  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  country_id: number;
}

export class GetClinicDto {
  @ApiProperty({
    description: 'Clinic identifier.',
    example: 12,
    type: Number,
  })
  @Type(() => Number)
  @IsNotEmpty()
  @IsNumber()
  clinic_id: number;
}

export class GetClinicDoctorAppointmentsDto {
  @ApiProperty({
    description: 'Clinic identifier where the doctor works.',
    example: 12,
    type: Number,
  })
  @Type(() => Number)
  @IsNotEmpty()
  @IsNumber()
  clinic_id: number;

  @ApiProperty({
    description: 'Doctor identifier to filter appointments.',
    example: 8,
    type: Number,
  })
  @Type(() => Number)
  @IsNotEmpty()
  @IsNumber()
  doctor_id: number;

  @ApiProperty({
    description: 'Target day for which to list appointments (date portion is used).',
    example: '2025-01-20',
    type: String,
    format: 'date',
  })
  @Type(() => Date)
  @IsNotEmpty()
  @IsDate()
  appointment_date: Date;
}

export class CreateSpecialtyDto {
  @ApiProperty({
    description: 'Name of the medical specialty.',
    example: 'Cardiología',
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  specialty_name: string;

  @ApiPropertyOptional({
    description: 'Optional description of the specialty.',
    example: 'Especialidad médica que se ocupa de las afecciones del corazón',
  })
  @IsOptional()
  @IsString()
  specialty_description?: string;
}

