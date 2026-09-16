import { Matches } from 'class-validator';

export class UpdateUserIdentityDto {
  @Matches(/^\d+$/)
  nationalId!: string;
}
