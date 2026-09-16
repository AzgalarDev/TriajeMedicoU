import { IsIn, IsOptional } from 'class-validator';
import { UserRole, UserStatus } from '@prisma/client';

export class ListUsersDto {
  @IsOptional() @IsIn(Object.values(UserRole)) role?: UserRole;
  @IsOptional() @IsIn(Object.values(UserStatus)) status?: UserStatus;
}
