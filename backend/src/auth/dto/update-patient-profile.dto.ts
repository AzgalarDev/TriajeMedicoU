import { IsOptional, IsString } from 'class-validator';

export class UpdatePatientProfileDto {
  @IsOptional() @IsString() medicalHistory?: string;
  @IsOptional() @IsString() allergies?: string;
  @IsOptional() @IsString() currentMedications?: string;
  @IsOptional() @IsString() chronicConditions?: string;
}
