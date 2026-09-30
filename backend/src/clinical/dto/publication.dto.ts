import { ArrayMinSize, IsArray, IsInt, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';

export class PublishInputDto {
  @IsInt() @Min(0) @Max(2147483647) expectedClinicalRevision!: number;
  @IsInt() @Min(0) @Max(2147483647) expectedCollectionRevision!: number;
  @IsInt() @Min(0) @Max(2147483647) expectedRecommendationRevision!: number;
}

export class CorrectionInputDto {
  @IsInt() @Min(0) @Max(2147483647) expectedPublicationRevision!: number;
  @IsString() @MinLength(1) @MaxLength(1000) reason!: string;
  @IsArray() @ArrayMinSize(1) @IsString({ each: true }) @MinLength(1, { each: true }) @MaxLength(500, { each: true }) recommendations!: string[];
}

export class CurrentGuidanceParamsDto {
  @IsUUID() patientId!: string;
}

export interface CurrentGuidanceDto {
  publicationId: string;
  revisionId: string;
  publishedAt: string;
  severity: string | null;
  recommendations: string[];
}

export interface PublicationRevisionDto extends CurrentGuidanceDto {
  revisionNumber: number;
  supersedesRevisionId: string | null;
  contentHash: string;
  actorId: string;
  reason: string | null;
}

export interface PublicationHistoryDto {
  triageId: string;
  revisions: PublicationRevisionDto[];
}

export interface AuditEventDto {
  id: string;
  action: string;
  actorId: string;
  publicationId: string;
  revisionId: string | null;
  occurredAt: string;
  beforeHash: string | null;
  afterHash: string | null;
}

export interface ErrorContractDto {
  statusCode: 403 | 409 | 422;
  code: string;
  message: string;
  details?: Record<string, string>;
}
