import { IsArray, IsIn, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class EssentialSymptomDto {
  @IsString() @MaxLength(200) name!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsIn(['MILD', 'MODERATE', 'SEVERE', 'CRITICAL']) severity?: 'MILD' | 'MODERATE' | 'SEVERE' | 'CRITICAL';
}

export class CreateTriageDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => EssentialSymptomDto) symptoms!: EssentialSymptomDto[];
  @IsOptional() @IsString() @MaxLength(10000) description?: string;
  @IsOptional() @IsIn(['DRAFT', 'IN_PROGRESS']) status?: 'DRAFT' | 'IN_PROGRESS';
}
