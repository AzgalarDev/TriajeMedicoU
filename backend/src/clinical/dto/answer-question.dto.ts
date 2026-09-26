import { IsDateString, IsIn, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
export class AnswerQuestionDto {
  @IsIn(['ANSWERED', 'NOT_APPLICABLE', 'UNKNOWN', 'UNABLE_TO_ASSESS']) status!: string;
  @ValidateIf((o) => o.status === 'ANSWERED') @IsString() @MaxLength(4000) answerText?: string;
  @IsOptional() @IsString() @MaxLength(4000) observations?: string;
  @IsDateString() expectedUpdatedAt!: string;
}
