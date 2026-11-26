import { Transform, Type } from "class-transformer";
import { IsDate, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Min, ValidateIf, isISO8601 } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { APPOINTMENT_ACTIONS } from "../appointment-workflow";
import type { AppointmentAction } from "../appointment-workflow";

export class CreateAppointmentDto {
    @ApiProperty({
        description: 'Identifier of the clinic where the appointment will take place.',
        example: 12,
    })
    @IsNotEmpty()
    @IsInt()
    @Min(1)
    clinic_id: number;

    @ApiProperty({
        description: 'Identifier of the doctor for the appointment.',
        example: 8,
    })
    @IsNotEmpty()
    @IsInt()
    @Min(1)
    doctor_id: number;

    @ApiProperty({
        description: 'ISO date-time string for the start of the appointment.',
        example: '2025-01-20T09:00:00Z',
        type: String,
        format: 'date-time',
    })
    @Transform(({ value }) => strictAppointmentDate(value), { toClassOnly: true })
    @IsNotEmpty()
    @IsDate()
    start_date_time: Date;

    @ApiProperty({
        description: 'ISO date-time string for the end of the appointment.',
        example: '2025-01-20T09:30:00Z',
        type: String,
        format: 'date-time',
    })
    @Transform(({ value }) => strictAppointmentDate(value), { toClassOnly: true })
    @IsNotEmpty()
    @IsDate()
    end_date_time: Date;

    @ApiPropertyOptional({
        description: 'Optional details about the appointment reason.',
        example: 'Follow-up for blood pressure check.',
    })
    @IsOptional()
    @IsString()
    appointment_description?: string;
}


export class UpdateAppointmentDto {
    @ApiPropertyOptional({ minimum: 0, description: 'Last observed appointment version.' })
    @ValidateIf((_object, value) => value !== undefined)
    @IsInt()
    @Min(0)
    expected_version?: number;

    @ApiPropertyOptional({ description: 'Updated appointment notes.' })
    @ValidateIf((_object, value) => value !== undefined)
    @IsString()
    appointment_description?: string;

    @ApiPropertyOptional({ type: String, format: 'date-time' })
    @ValidateIf((_object, value) => value !== undefined)
    @Transform(({ value }) => strictAppointmentDate(value), { toClassOnly: true })
    @IsDate()
    start_date_time?: Date;

    @ApiPropertyOptional({ type: String, format: 'date-time' })
    @ValidateIf((_object, value) => value !== undefined)
    @Transform(({ value }) => strictAppointmentDate(value), { toClassOnly: true })
    @IsDate()
    end_date_time?: Date;
}

export class AppointmentActionDto {
    @ApiProperty({ enum: APPOINTMENT_ACTIONS })
    @IsIn(APPOINTMENT_ACTIONS)
    action: AppointmentAction;

    @ApiProperty({ minimum: 0, description: 'Version returned by the last appointment read.' })
    @IsInt()
    @Min(0)
    expected_version: number;
}

function strictAppointmentDate(value: unknown): Date {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value) ||
        !isISO8601(value, { strict: true, strictSeparator: true })) return new Date(NaN);
    return new Date(value);
}

export class AppointmentAvailabilityQueryDto {
    @ApiProperty({ minimum: 1, example: 2 })
    @Type(() => Number)
    @IsInt()
    @Min(1)
    clinic_id: number;

    @ApiProperty({ minimum: 1, example: 3 })
    @Type(() => Number)
    @IsInt()
    @Min(1)
    doctor_id: number;

    @ApiProperty({ example: '2026-11-26', format: 'date' })
    @IsString()
    date: string;
}

export class AppointmentAvailabilityDateDto {
    @ApiProperty({ example: '2026-11-26', format: 'date' })
    @IsString()
    date: string;
}
