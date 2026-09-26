import { ArrayMinSize, IsArray, IsBoolean, IsDateString, IsInt, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, Validate } from 'class-validator';
import { ValidatorConstraint, ValidatorConstraintInterface, ValidationArguments } from 'class-validator';

@ValidatorConstraint({ name: 'uniqueStringArray', async: false })
class UniqueStringArrayConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean { return Array.isArray(value) && new Set(value).size === value.length; }
  defaultMessage(args: ValidationArguments): string { return `${args.property} no debe contener valores repetidos`; }
}

export class RecommendationParamsDto {
  @IsUUID() triageId!: string;
  @IsUUID() versionId!: string;
}

export class RecommendationItemParamsDto extends RecommendationParamsDto {
  @IsUUID() recommendationId!: string;
}

export class GenerateRecommendationsDto {
  @IsInt() @Min(0) @Max(2147483647) collectionRevision!: number;
}

export class AddRecommendationDto {
  @IsString() @Matches(/\S/) @MinLength(10) @MaxLength(500) content!: string;
  @IsInt() @Min(0) @Max(2147483647) collectionRevision!: number;
}

export class EditRecommendationDto extends AddRecommendationDto {
  @IsInt() @Min(0) @Max(2147483647) revision!: number;
  @IsDateString() updatedAt!: string;
}

export class DeleteRecommendationDto {
  @IsInt() @Min(0) @Max(2147483647) revision!: number;
  @IsDateString() updatedAt!: string;
  @IsInt() @Min(0) @Max(2147483647) collectionRevision!: number;
}

export class ReorderRecommendationsDto {
  @IsArray() @ArrayMinSize(1) @IsUUID('4', { each: true }) @Validate(UniqueStringArrayConstraint) ids!: string[];
  @IsInt() @Min(0) @Max(2147483647) collectionRevision!: number;
}

export class ApproveRecommendationDto extends DeleteRecommendationDto {
  @IsBoolean() approved!: boolean;
}
