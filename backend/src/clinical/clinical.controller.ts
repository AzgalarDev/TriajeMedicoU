import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ClinicalService, assertStaff } from './clinical.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { SearchPatientsDto } from './dto/search-patients.dto';
import { UpdateClinicalProfileDto } from './dto/update-clinical-profile.dto';
import { CreateTriageDto } from './dto/create-triage.dto';
import { AnswerQuestionDto } from './dto/answer-question.dto';
import { AddRecommendationDto, ApproveRecommendationDto, DeleteRecommendationDto, EditRecommendationDto, GenerateRecommendationsDto, RecommendationItemParamsDto, RecommendationParamsDto, ReorderRecommendationsDto } from './dto/recommendation.dto';
import { CorrectionInputDto, PublishInputDto } from './dto/publication.dto';

@Controller('clinical')
@UseGuards(SessionAuthGuard, RolesGuard)
export class ClinicalController {
  constructor(private readonly clinical: ClinicalService) {}
  @Get('patients') @Roles('PHYSICIAN', 'ASSISTANT') search(@Query() dto: SearchPatientsDto) { return this.clinical.searchPatients(dto); }
  @Get('patients/:id') @Roles('PHYSICIAN', 'ASSISTANT') patient(@Param('id') id: string, @CurrentUser() user: { role: string }) { return this.clinical.getPatient(id, user.role); }
  @Patch('patients/:id/profile') @Roles('PHYSICIAN') profile(@Param('id') id: string, @Body() dto: UpdateClinicalProfileDto) { return this.clinical.updateProfile(id, dto); }
  @Post('patients/:id/triages') @Roles('PHYSICIAN') triage(@Param('id') patientId: string, @Headers('idempotency-key') idempotencyKey: string | undefined, @CurrentUser() user: { id: string; role: string }, @Body() dto: CreateTriageDto) { assertStaff(user.role); return this.clinical.createTriage(patientId, user.id, dto, idempotencyKey); }
  @Post('triages/:triageId/versions/:versionId/questions/generate') @Roles('PHYSICIAN') generate(@Param('triageId') triageId: string, @Param('versionId') versionId: string, @CurrentUser() user: { id: string; role: string }) { return this.clinical.generateQuestions(triageId, versionId, user.id); }
  @Put('questions/:questionId/answer') @Roles('PHYSICIAN') answer(@Param('questionId') questionId: string, @Body() dto: AnswerQuestionDto, @CurrentUser() user: { id: string; role: string }) { return this.clinical.answerQuestion(questionId, dto, user.id); }
  @Get('triages/:triageId/versions/:versionId/classification') @Roles('PHYSICIAN') classification(@Param('triageId') triageId: string, @Param('versionId') versionId: string, @CurrentUser() user: { id: string }) { return this.clinical.getClassification(triageId, versionId, user.id); }
  @Post('triages/:triageId/versions/:versionId/classification/generate') @Roles('PHYSICIAN') classify(@Param('triageId') triageId: string, @Param('versionId') versionId: string, @CurrentUser() user: { id: string }) { return this.clinical.classify(triageId, versionId, user.id); }
  @Put('triages/:triageId/versions/:versionId/classification/confirm') @Roles('PHYSICIAN') confirm(@Param('triageId') triageId: string, @Param('versionId') versionId: string, @Body() dto: { severity: string; justification?: string; expectedUpdatedAt: string }, @CurrentUser() user: { id: string }) { return this.clinical.confirmClassification(triageId, versionId, user.id, dto.severity, dto.justification, dto.expectedUpdatedAt); }
  @Get('triages/:triageId/versions/:versionId/recommendations') @Roles('PHYSICIAN') recommendations(@Param('triageId') triageId: string, @Param('versionId') versionId: string, @CurrentUser() user: { id: string }) { return this.clinical.getRecommendations(triageId, versionId, user.id); }
  @Post('triages/:triageId/versions/:versionId/recommendations/generate') @Roles('PHYSICIAN') generateRecommendations(@Param() p: RecommendationParamsDto, @Body() b: GenerateRecommendationsDto, @CurrentUser() user: { id: string }) { return this.clinical.generateRecommendations(p.triageId, p.versionId, user.id, b.collectionRevision); }
  @Patch('triages/:triageId/versions/:versionId/recommendations/:recommendationId') @Roles('PHYSICIAN') editRecommendation(@Param() p: RecommendationItemParamsDto, @Body() b: EditRecommendationDto, @CurrentUser() user: { id: string }) { return this.clinical.editRecommendation(p.triageId, p.versionId, p.recommendationId, user.id, b.content, b.revision, b.updatedAt, b.collectionRevision); }
  @Post('triages/:triageId/versions/:versionId/recommendations') @Roles('PHYSICIAN') addRecommendation(@Param() p: RecommendationParamsDto, @Body() b: AddRecommendationDto, @CurrentUser() user: { id: string }) { return this.clinical.addRecommendation(p.triageId, p.versionId, user.id, b.content, b.collectionRevision); }
  @Delete('triages/:triageId/versions/:versionId/recommendations/:recommendationId') @Roles('PHYSICIAN') deleteRecommendation(@Param() p: RecommendationItemParamsDto, @Body() b: DeleteRecommendationDto, @CurrentUser() user: { id: string }) { return this.clinical.deleteRecommendation(p.triageId, p.versionId, p.recommendationId, user.id, b.revision, b.updatedAt, b.collectionRevision); }
  @Put('triages/:triageId/versions/:versionId/recommendations/order') @Roles('PHYSICIAN') reorderRecommendations(@Param() p: RecommendationParamsDto, @Body() b: ReorderRecommendationsDto, @CurrentUser() user: { id: string }) { return this.clinical.reorderRecommendations(p.triageId, p.versionId, user.id, b.ids, b.collectionRevision); }
  @Put('triages/:triageId/versions/:versionId/recommendations/:recommendationId/approval') @Roles('PHYSICIAN') approveRecommendation(@Param() p: RecommendationItemParamsDto, @Body() b: ApproveRecommendationDto, @CurrentUser() user: { id: string }) { return this.clinical.approveRecommendation(p.triageId, p.versionId, p.recommendationId, user.id, b.approved, b.revision, b.updatedAt, b.collectionRevision); }
  @Post('triages/:triageId/versions/:versionId/publication') @Roles('PHYSICIAN') publish(@Param('triageId') triageId: string, @Param('versionId') versionId: string, @Body() dto: PublishInputDto, @CurrentUser() user: { id: string }) { return this.clinical.publish(triageId, versionId, user.id, dto); }
  @Post('triages/:triageId/versions/:versionId/publication/corrections') @Roles('PHYSICIAN') correctPublication(@Param('triageId') triageId: string, @Param('versionId') versionId: string, @Body() dto: CorrectionInputDto, @CurrentUser() user: { id: string }) { return this.clinical.correctPublication(triageId, versionId, user.id, dto); }
  @Get('patients/:patientId/current-guidance') @Roles('PHYSICIAN', 'ASSISTANT', 'PATIENT') currentGuidance(@Param('patientId') patientId: string, @CurrentUser() user: { id: string; role: string }) { return this.clinical.getCurrentGuidance(patientId, user.id, user.role); }
  @Get('triages/:triageId/publication-history') @Roles('PHYSICIAN') publicationHistory(@Param('triageId') triageId: string, @CurrentUser() user: { id: string }) { return this.clinical.getPublicationHistory(triageId, user.id); }
  @Get('triages/:triageId/publication-audit') @Roles('PHYSICIAN') publicationAudit(@Param('triageId') triageId: string, @CurrentUser() user: { id: string }) { return this.clinical.getPublicationAudit(triageId, user.id); }
}
