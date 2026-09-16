import { IsDateString, IsIn, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class ProvisionUserDto {
  @IsString() @MinLength(1) fullName!: string;
  @IsDateString() dateOfBirth!: string;
  @IsIn(['MALE', 'FEMALE']) sex!: 'MALE' | 'FEMALE';
  @Matches(/^\d+$/) nationalId!: string;
  @IsOptional() @IsString() address?: string;
  @Matches(/^[A-Za-z0-9._-]+$/) username!: string;
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).{8,}$/) password!: string;
  @IsIn(['PHYSICIAN', 'ASSISTANT', 'ADMINISTRATOR']) role!: 'PHYSICIAN' | 'ASSISTANT' | 'ADMINISTRATOR';
}
