import { Matches } from 'class-validator';

export class AdminResetPasswordDto {
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).{8,}$/)
  newPassword!: string;
}
