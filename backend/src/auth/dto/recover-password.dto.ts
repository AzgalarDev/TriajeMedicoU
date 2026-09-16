import { Matches, MinLength, IsString } from 'class-validator';
export class RecoverPasswordDto { @IsString() username!: string; @Matches(/^\d+$/) nationalId!: string; @Matches(/^(?=.*[A-Za-z])(?=.*\d).{8,}$/) newPassword!: string; }
