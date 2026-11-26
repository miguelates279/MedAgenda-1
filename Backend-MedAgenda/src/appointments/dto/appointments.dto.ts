import { Type } from "class-transformer";
import { IsDate, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min, ValidateIf } from "class-validator";
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
    @Type(() => Date)
    @IsNotEmpty()
    @IsDate()
    start_date_time: Date;

    @ApiProperty({
        description: 'ISO date-time string for the end of the appointment.',
        example: '2025-01-20T09:30:00Z',
        type: String,
        format: 'date-time',
    })
    @Type(() => Date)
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
    @Type(() => Date)
    @IsDate()
    start_date_time?: Date;

    @ApiPropertyOptional({ type: String, format: 'date-time' })
    @ValidateIf((_object, value) => value !== undefined)
    @Type(() => Date)
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
