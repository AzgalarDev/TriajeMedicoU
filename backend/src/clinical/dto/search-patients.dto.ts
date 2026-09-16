import { IsOptional, IsString, Length, Matches } from 'class-validator';

export class SearchPatientsDto {
  @IsOptional() @IsString() @Length(2, 64) query?: string;
  @IsOptional() @Matches(/^\d{1,32}$/) nationalId?: string;
}
