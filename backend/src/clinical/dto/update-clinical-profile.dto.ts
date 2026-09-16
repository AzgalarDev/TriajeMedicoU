import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateClinicalProfileDto {
  @IsOptional() @IsString() @MaxLength(10000) medicalHistory?: string | null;
  @IsOptional() @IsString() @MaxLength(10000) allergies?: string | null;
  @IsOptional() @IsString() @MaxLength(10000) currentMedications?: string | null;
  @IsOptional() @IsString() @MaxLength(10000) chronicConditions?: string | null;
}
