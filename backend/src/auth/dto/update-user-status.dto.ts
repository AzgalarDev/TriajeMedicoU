import { IsIn } from 'class-validator';

export class UpdateUserStatusDto { @IsIn(['ACTIVE', 'INACTIVE', 'BLOCKED']) status!: 'ACTIVE' | 'INACTIVE' | 'BLOCKED'; }
