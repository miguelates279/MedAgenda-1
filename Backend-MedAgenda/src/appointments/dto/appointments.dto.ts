import { Type } from "class-transformer";
import { IsDate, IsNotEmpty, IsNumber, IsOptional, IsString } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreateAppointmentDto {
    @ApiProperty({
        description: 'Identifier of the clinic where the appointment will take place.',
        example: 12,
    })
    @IsNotEmpty()
    @IsNumber()
    clinic_id: number;

    @ApiProperty({
        description: 'Identifier of the doctor for the appointment.',
        example: 8,
    })
    @IsNotEmpty()
    @IsNumber()
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
    @ApiPropertyOptional({
        description: 'Updated details or reason about the appointment.',
        example: 'Follow-up for blood pressure check and prescription renewal.',
    })
    @IsOptional()
    @IsString()
    appointment_description?: string;
}
