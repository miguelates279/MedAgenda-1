import { IsString, Matches, MaxLength } from 'class-validator';

export class PrescriptionDocumentParams {
    @IsString()
    @Matches(/^[1-9]\d*$/)
    @MaxLength(10)
    id: string;
}
