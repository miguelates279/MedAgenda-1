import { IsNotEmpty, IsNumber, IsString } from "class-validator";

export class CreatePrescriptionDto {
    @IsNotEmpty()
    @IsNumber()
    patient_id: number;

    @IsNotEmpty()
    @IsNumber()
    clinic_id: number;

    @IsNotEmpty()
    @IsString()
    prescription_description: string;
}

export class UpdatePrescriptionDto {
    @IsNotEmpty()
    @IsString()
    prescription_description: string;
}

