import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTriageDto } from './dto/create-triage.dto';
import { SearchPatientsDto } from './dto/search-patients.dto';
import { UpdateClinicalProfileDto } from './dto/update-clinical-profile.dto';
import { AnswerQuestionDto } from './dto/answer-question.dto';
import { CLINICAL_LLM_PROVIDER, ClinicalLlmProvider } from './llm.provider';
import { Inject } from '@nestjs/common';
import { isSafeGeneratedQuestion } from './question-safety';
import { isSafeRecommendation } from './recommendation-safety';

const staffRoles = ['PHYSICIAN', 'ASSISTANT'] as const;
const validAnswerStatuses = ['ANSWERED', 'NOT_APPLICABLE', 'UNKNOWN', 'UNABLE_TO_ASSESS'] as const;
const validSeverities = ['MILD', 'MODERATE', 'SEVERE', 'CRITICAL'] as const;
const profileSelect = { medicalHistory: true, allergies: true, currentMedications: true, chronicConditions: true } as const;
const triageFingerprint = (patientId: string, physicianId: string, dto: CreateTriageDto) => createHash('sha256').update(JSON.stringify({ operation: 'CREATE_TRIAGE', patientId, physicianId, status: dto.status ?? 'DRAFT', description: dto.description?.trim() ?? null, symptoms: dto.symptoms.map((symptom) => ({ name: symptom.name.trim(), description: symptom.description?.trim() ?? null, severity: symptom.severity ?? null })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) })).digest('hex');
const classificationInvalidationData = () => ({ preliminarySeverity: null, classificationRationale: null, classificationRawOutput: null, classificationModelName: null, classificationInputFingerprint: null, classificationInputSnapshot: null, classificationGeneratedAt: null, classificationConfirmedAt: null, classificationGeneratingAt: null, classificationClaimToken: null, classificationClaimedAt: null, finalSeverity: null, overrideJustification: null, classificationRevision: { increment: 1 }, updatedAt: new Date() });
const recommendationFingerprint = (version: { classificationRevision: number; classificationInputFingerprint?: string | null; classificationInputSnapshot?: string | null; finalSeverity?: string | null; overrideJustification?: string | null }) => createHash('sha256').update(JSON.stringify({ classificationRevision: version.classificationRevision, classificationInputSnapshot: version.classificationInputSnapshot ?? null, classificationInputFingerprint: version.classificationInputFingerprint ?? null, finalSeverity: version.finalSeverity ?? null, overrideJustification: version.overrideJustification ?? null })).digest('hex');

@Injectable()
export class ClinicalService {
  constructor(private readonly prisma: PrismaService, @Inject(CLINICAL_LLM_PROVIDER) private readonly llm?: ClinicalLlmProvider) {}

  async searchPatients(dto: SearchPatientsDto) {
    const query = dto.query?.trim();
    const nationalId = dto.nationalId?.trim();

    if (!nationalId && !query) throw new BadRequestException('La búsqueda requiere CI o al menos 2 caracteres del nombre del paciente');
    if (nationalId && !/^\d{1,32}$/.test(nationalId)) throw new BadRequestException('El CI debe contener solo dígitos');
    if (query && query.length < 2) throw new BadRequestException('La búsqueda por nombre del paciente requiere al menos 2 caracteres');

    return this.prisma.user.findMany({
      where: { role: 'PATIENT', ...(nationalId ? { nationalId } : { fullName: { contains: query, mode: 'insensitive' } }) },
      select: { id: true, fullName: true, nationalId: true, dateOfBirth: true }, orderBy: { fullName: 'asc' }, take: 50,
    });
  }

  async getPatient(id: string, role: string = 'PHYSICIAN') {
     const patient = await this.prisma.user.findFirst({ where: { id, role: 'PATIENT' }, select: { id: true, fullName: true, nationalId: true, dateOfBirth: true, sex: true, address: true, patientProfile: { select: { medicalHistory: true, allergies: true, currentMedications: true, chronicConditions: true } }, patientTriages: { orderBy: { createdAt: 'desc' }, select: { id: true, status: true, createdAt: true, physician: { select: { fullName: true } }, versions: { orderBy: { versionNumber: 'desc' }, take: 1, select: { id: true, status: true, updatedAt: role === 'PHYSICIAN', preliminarySeverity: role === 'PHYSICIAN', classificationRationale: role === 'PHYSICIAN', classificationGeneratedAt: role === 'PHYSICIAN', finalSeverity: role === 'PHYSICIAN', classificationConfirmedAt: role === 'PHYSICIAN', recommendationRevision: role === 'PHYSICIAN', description: role === 'PHYSICIAN', symptoms: true, ...(role === 'PHYSICIAN' ? { questions: { orderBy: { priority: 'asc' }, include: { answer: true } }, recommendations: { orderBy: { sortOrder: 'asc' }, select: { id: true, content: true, sortOrder: true, isApproved: true, source: true, revision: true, createdAt: true, updatedAt: true, approvedAt: true, createdBy: { select: { fullName: true } }, updatedBy: { select: { fullName: true } }, approvedBy: { select: { fullName: true } } } } } : {}) } } } } } });
    if (!patient) throw new NotFoundException('Paciente no encontrado');
    return patient;
  }

  async updateProfile(id: string, dto: UpdateClinicalProfileDto) {
    const patient = await this.prisma.user.findFirst({ where: { id, role: 'PATIENT' }, select: { id: true } });
    if (!patient) throw new NotFoundException('Paciente no encontrado');
    return this.prisma.$transaction(async (tx) => {
      const profile = await tx.patientProfile.upsert({ where: { userId: id }, create: { userId: id, ...dto }, update: dto, select: profileSelect });
      await (tx.triageVersion.updateMany as any)({
        where: { triage: { patientId: id }, status: { in: ['DRAFT', 'IN_PROGRESS'] }, classificationInputFingerprint: { not: null } },
        data: { preliminarySeverity: null, classificationRationale: null, classificationRawOutput: null, classificationModelName: null, classificationInputFingerprint: null, classificationInputSnapshot: null, classificationGeneratedAt: null, classificationGeneratingAt: null, classificationClaimToken: null, classificationClaimedAt: null, classificationConfirmedAt: null, finalSeverity: null, overrideJustification: null, classificationRevision: { increment: 1 } },
      });
      // PENDING_REVIEW is an accepted historical snapshot and is intentionally immutable here.
      return profile;
    });
  }

  async createTriage(patientId: string, physicianId: string, dto: CreateTriageDto, idempotencyKey?: string) {
    const patient = await this.prisma.user.findFirst({ where: { id: patientId, role: 'PATIENT' }, select: { id: true } });
    if (!patient) throw new NotFoundException('Paciente no encontrado');
    const physician = await this.prisma.user.findFirst({ where: { id: physicianId, role: 'PHYSICIAN' }, select: { id: true } });
    if (!physician) throw new ForbiddenException('Se requiere acceso de médico');
    if (!dto.symptoms.length) throw new ForbiddenException('Se requiere al menos un síntoma esencial');
    const key = idempotencyKey?.trim();
    const requestFingerprint = triageFingerprint(patientId, physicianId, dto);
    if (key) {
      const existing = await this.prisma.triage.findUnique({ where: { idempotencyKey: key }, include: { versions: { include: { symptoms: true } } } });
      if (existing) {
        if ((existing as typeof existing & { requestFingerprint: string | null }).requestFingerprint !== requestFingerprint) throw new ConflictException('La clave de idempotencia ya fue utilizada para otra solicitud de triaje.');
        return existing;
      }
    }
    try {
      return await this.prisma.triage.create({ data: { idempotencyKey: key, requestFingerprint, patientId, physicianId, status: dto.status ?? 'DRAFT', versions: { create: { versionNumber: 1, createdById: physicianId, status: dto.status ?? 'DRAFT', description: dto.description?.trim(), symptoms: { create: dto.symptoms.map((symptom) => ({ name: symptom.name.trim(), description: symptom.description?.trim(), severity: symptom.severity })) } } } } as any, include: { versions: { include: { symptoms: true } } } });
    } catch (error) {
      if (key && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.prisma.triage.findUniqueOrThrow({ where: { idempotencyKey: key }, include: { versions: { include: { symptoms: true } } } });
        if ((existing as typeof existing & { requestFingerprint: string | null }).requestFingerprint !== requestFingerprint) throw new ConflictException('La clave de idempotencia ya fue utilizada para otra solicitud de triaje.');
        return existing;
      }
      throw error;
    }
  }

  async generateQuestions(triageId: string, versionId: string, physicianId: string) {
    const questionInclude = { answer: true } as const;
    const version = await this.prisma.triageVersion.findFirst({ where: { id: versionId, triageId, createdById: physicianId }, include: { questions: { include: questionInclude, orderBy: { priority: 'asc' } }, symptoms: true, triage: { include: { patient: { include: { patientProfile: true } } } } } });
    if (!version) throw new NotFoundException('Versión de triaje no encontrada');
    if (version.status === 'PENDING_REVIEW' || version.status === 'APPROVED' || version.status === 'CANCELLED') throw new ConflictException('Las versiones confirmadas, aprobadas o canceladas están bloqueadas y no pueden generar preguntas.');
    if (version.questions.length) return { versionId, questions: version.questions };
    if (!this.llm) throw new ServiceUnavailableException('El servicio clínico local no está disponible.');
    const generated = await this.llm.generateQuestions({ ...version.triage.patient.patientProfile, description: version.description, symptoms: version.symptoms });
    const priorities = generated.questions.map((q) => q.priority);
    if (new Set(priorities).size !== priorities.length || priorities.some((priority, index) => priority !== index + 1)) throw new BadRequestException('La respuesta clínica local contiene prioridades inválidas.');
    if (generated.questions.some((q) => !isSafeGeneratedQuestion(q.question))) throw new BadRequestException('La respuesta clínica local contiene preguntas no permitidas. No se guardaron preguntas; intente generar nuevamente.');
    try {
      return await this.prisma.$transaction(async (tx) => {
        const current = await tx.triageQuestion.findMany({ where: { triageVersionId: versionId } });
        if (current.length) return { versionId, questions: await tx.triageQuestion.findMany({ where: { triageVersionId: versionId }, include: questionInclude, orderBy: { priority: 'asc' } }) };
        const locked = await (tx.triageVersion.updateMany as any)({ where: { id: versionId, status: { notIn: ['PENDING_REVIEW', 'APPROVED', 'CANCELLED'] } }, data: { modelOutput: generated.raw } });
        if (!locked.count) throw new ConflictException('La versión está bloqueada y no admite preguntas.');
        const questions = await Promise.all(generated.questions.map((q) => tx.triageQuestion.create({ data: { triageVersionId: versionId, questionText: q.question, priority: q.priority } })));
        return { versionId, questions: await tx.triageQuestion.findMany({ where: { triageVersionId: versionId }, include: questionInclude, orderBy: { priority: 'asc' } }) };
      });
    } catch (error) {
      // The transaction is aborted after P2002; use the normal client for the winner lookup.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return { versionId, questions: await this.prisma.triageQuestion.findMany({ where: { triageVersionId: versionId }, include: questionInclude, orderBy: { priority: 'asc' } }) };
      }
      throw error;
    }
  }

  async answerQuestion(questionId: string, dto: AnswerQuestionDto, physicianId: string) {
    const question = await this.prisma.triageQuestion.findFirst({ where: { id: questionId, triageVersion: { createdById: physicianId } }, select: { id: true, triageVersionId: true } });
    if (!question) throw new NotFoundException('Pregunta no encontrada');
    if (!validAnswerStatuses.includes(dto.status as typeof validAnswerStatuses[number])) throw new BadRequestException('El estado de respuesta no es válido.');
    if (dto.status === 'ANSWERED' && !dto.answerText?.trim()) throw new BadRequestException('La respuesta requiere texto');
    const data = { status: dto.status as any, answerText: dto.status === 'ANSWERED' ? dto.answerText?.trim() : null, observations: dto.observations?.trim() || null };
    try { return await this.prisma.$transaction(async (tx) => {
      const invalidated = await (tx.triageVersion.updateMany as any)({ where: { id: question.triageVersionId, createdById: physicianId, status: { in: ['DRAFT', 'IN_PROGRESS'] } }, data: classificationInvalidationData() });
      if (invalidated.count !== 1) throw new ConflictException('La versión está bloqueada y no admite correcciones. La clasificación confirmada requiere una nueva versión futura.');
      const existing = await tx.triageAnswer.findUnique({ where: { questionId } });
      if (!existing) {
        const created = await tx.triageAnswer.create({ data: { questionId, ...data } });
        return created;
      }
      const updated = await tx.triageAnswer.updateMany({ where: { questionId, updatedAt: new Date(dto.expectedUpdatedAt) }, data });
      if (!updated.count) throw new ConflictException('La respuesta cambió mientras la editaba. Recargue la pregunta e intente nuevamente.');
      const answer = await tx.triageAnswer.findUniqueOrThrow({ where: { questionId } });
      return answer;
    }); } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('La respuesta fue creada por otra sesión. Recargue la pregunta.'); throw error; }
  }

  private classificationInclude = { symptoms: true, questions: { include: { answer: true }, orderBy: { priority: 'asc' as const } }, triage: { include: { patient: { include: { patientProfile: true } } } } };
  async getClassification(triageId: string, versionId: string, physicianId: string) { const v = await this.prisma.triageVersion.findFirst({ where: { id: versionId, triageId, createdById: physicianId }, include: this.classificationInclude }); if (!v) throw new NotFoundException('Versión de triaje no encontrada'); return { versionId: v.id, triageId, status: v.status, preliminarySeverity: v.preliminarySeverity, rationale: v.classificationRationale, generatedAt: v.classificationGeneratedAt, updatedAt: v.updatedAt, finalSeverity: v.finalSeverity }; }
  async classify(triageId: string, versionId: string, physicianId: string) {
    const v = await this.prisma.triageVersion.findFirst({ where: { id: versionId, triageId, createdById: physicianId }, include: this.classificationInclude }); if (!v) throw new NotFoundException('Versión de triaje no encontrada'); if (v.status === 'PENDING_REVIEW' || v.status === 'APPROVED' || v.status === 'CANCELLED') throw new ConflictException('La versión está bloqueada.'); if (!v.questions.length || v.questions.some(q => !q.answer || !validAnswerStatuses.includes(q.answer.status as typeof validAnswerStatuses[number]) || (q.answer.status === 'ANSWERED' && !q.answer.answerText?.trim()))) throw new BadRequestException('Todas las preguntas deben tener una respuesta válida.');
    const input = { medicalHistory: v.triage.patient.patientProfile?.medicalHistory, allergies: v.triage.patient.patientProfile?.allergies, currentMedications: v.triage.patient.patientProfile?.currentMedications, chronicConditions: v.triage.patient.patientProfile?.chronicConditions, description: v.description, symptoms: v.symptoms.map(s => ({ name: s.name, description: s.description, severity: s.severity })), answers: v.questions.map(q => ({ question: q.questionText, status: q.answer!.status, answerText: q.answer!.answerText, observations: q.answer!.observations })) };
     const snapshot = JSON.stringify({ revision: (v as any).classificationRevision ?? 0, input }); const fingerprint = createHash('sha256').update(snapshot).digest('hex'); if (v.preliminarySeverity && v.classificationInputFingerprint === fingerprint) return this.getClassification(triageId, versionId, physicianId);
     const token = randomUUID(); const now = new Date(); const leaseMs = Math.max(Number(process.env.OLLAMA_TIMEOUT_MS ?? 30000) * 2 + 10000, 90000); const claim = await this.prisma.triageVersion.updateMany({ where: { id: versionId, createdById: physicianId, classificationRevision: (v as any).classificationRevision ?? 0, classificationInputFingerprint: v.classificationInputFingerprint, status: { notIn: ['PENDING_REVIEW', 'APPROVED', 'CANCELLED'] }, OR: [{ classificationClaimToken: null }, { classificationClaimedAt: { lt: new Date(now.getTime() - leaseMs) } }] }, data: { classificationGeneratingAt: now, classificationClaimToken: token, classificationClaimedAt: now, classificationInputSnapshot: snapshot } }); if (!claim.count) throw new ConflictException('Ya hay una clasificación en generación o la versión cambió.');
     try { if (!this.llm?.classify) throw new ServiceUnavailableException('El servicio clínico local no está disponible.'); const result = await this.llm.classify(input); const persisted = await this.prisma.triageVersion.updateMany({ where: { id: versionId, createdById: physicianId, classificationClaimToken: token, classificationRevision: (v as any).classificationRevision ?? 0, classificationInputFingerprint: v.classificationInputFingerprint, classificationInputSnapshot: snapshot, status: { notIn: ['PENDING_REVIEW', 'APPROVED', 'CANCELLED'] } }, data: { preliminarySeverity: result.severity, classificationRationale: result.rationale, classificationRawOutput: result.raw, classificationModelName: result.model, classificationInputFingerprint: fingerprint, classificationGeneratedAt: new Date(), classificationGeneratingAt: null, classificationClaimToken: null, classificationClaimedAt: null, classificationInputSnapshot: snapshot, classificationRevision: { increment: 1 } } }); if (!persisted.count) throw new ConflictException('La versión cambió mientras se generaba la clasificación. Genere nuevamente para usar datos actuales.'); return this.getClassification(triageId, versionId, physicianId); } catch (error) { await this.prisma.triageVersion.updateMany({ where: { id: versionId, classificationClaimToken: token }, data: { classificationGeneratingAt: null, classificationClaimToken: null, classificationClaimedAt: null, classificationInputSnapshot: null } }); throw error; }
  }
  async confirmClassification(triageId: string, versionId: string, physicianId: string, severity: string, justification: string | undefined, expectedUpdatedAt: string) {
    const v = await this.prisma.triageVersion.findFirst({ where: { id: versionId, triageId, createdById: physicianId } });
    if (!v) throw new NotFoundException('Versión de triaje no encontrada');
    if (v.status === 'APPROVED' || v.status === 'CANCELLED') throw new ConflictException('La versión está bloqueada.');
    if (!validSeverities.includes(severity as typeof validSeverities[number])) throw new BadRequestException('La severidad no es válida.');
    if (!v.preliminarySeverity) throw new BadRequestException('Debe generar una clasificación preliminar antes de confirmar.');
    if (severity !== v.preliminarySeverity && (!justification?.trim() || justification.trim().length > 1000)) throw new BadRequestException('El cambio de severidad requiere una justificación válida.');
    try {
      await this.prisma.$transaction(async (tx) => {
        const nextFinalSeverity = severity as any;
        const nextJustification = severity === v.preliminarySeverity ? null : justification!.trim();
        const nextRecommendationFingerprint = recommendationFingerprint({ ...v, finalSeverity: nextFinalSeverity, overrideJustification: nextJustification });
        const staleRecommendations = Boolean(v.recommendationInputFingerprint && v.recommendationInputFingerprint !== nextRecommendationFingerprint);
        const updated = await (tx.triageVersion.updateMany as any)({ where: { id: versionId, triageId, createdById: physicianId, updatedAt: new Date(expectedUpdatedAt), status: { notIn: ['APPROVED', 'CANCELLED'] } }, data: { finalSeverity: nextFinalSeverity, overrideJustification: nextJustification, status: 'PENDING_REVIEW', classificationConfirmedAt: new Date(), ...(staleRecommendations ? { recommendationInputFingerprint: null, recommendationRawOutput: null, recommendationModelName: null, recommendationGeneratedAt: null, recommendationClaimToken: null, recommendationClaimedAt: null, recommendationClaimFingerprint: null, recommendationClaimCollectionRevision: null, recommendationRevision: { increment: 1 } } : {}) } });
        if (!updated.count) throw new ConflictException('La clasificación cambió mientras la revisaba.');
        if (staleRecommendations) await tx.recommendation.deleteMany({ where: { triageVersionId: versionId } });
        const triageUpdated = await tx.triage.updateMany({ where: { id: triageId, status: { notIn: ['APPROVED', 'CANCELLED'] } }, data: { status: 'PENDING_REVIEW' } });
        if (!triageUpdated.count) throw new ConflictException('El triaje cambió mientras lo confirmaba.');
      });
    } catch (error) { if (error instanceof ConflictException) throw error; throw error; }
    return this.getClassification(triageId, versionId, physicianId);
  }
  private recommendationInclude = { recommendations: { orderBy: { sortOrder: 'asc' as const }, include: { createdBy: { select: { fullName: true } }, updatedBy: { select: { fullName: true } }, approvedBy: { select: { fullName: true } } } } };
  async getRecommendations(triageId: string, versionId: string, physicianId: string) {
    const v = await this.prisma.triageVersion.findFirst({ where: { id: versionId, triageId, createdById: physicianId }, include: this.recommendationInclude });
    if (!v) throw new NotFoundException('Versión de triaje no encontrada');
    return { triageId, versionId, status: v.status, finalSeverity: v.finalSeverity, updatedAt: v.updatedAt, recommendationRevision: v.recommendationRevision ?? 0, recommendationCollectionRevision: v.recommendationCollectionRevision ?? 0, recommendations: v.recommendations };
  }
  private async recommendationVersion(triageId: string, versionId: string, physicianId: string) {
    const v = await this.prisma.triageVersion.findFirst({ where: { id: versionId, triageId, createdById: physicianId }, include: { ...this.classificationInclude, recommendations: true } });
    if (!v) throw new NotFoundException('Versión de triaje no encontrada');
    if (v.status !== 'PENDING_REVIEW' || !v.finalSeverity || !v.classificationConfirmedAt) throw new ConflictException('Las recomendaciones solo están disponibles después de confirmar la clasificación.');
    if (!v.questions.length || v.questions.some(q => !q.answer || !validAnswerStatuses.includes(q.answer.status as typeof validAnswerStatuses[number]))) throw new BadRequestException('Las preguntas y respuestas clínicas deben permanecer completas.');
    return v;
  }
  async generateRecommendations(triageId: string, versionId: string, physicianId: string, collectionRevision: number) {
    const v = await this.recommendationVersion(triageId, versionId, physicianId);
    let snapshot: { input?: Record<string, unknown> };
    try { snapshot = JSON.parse(v.classificationInputSnapshot ?? ''); } catch { throw new ConflictException('La clasificación confirmada no tiene una instantánea válida. Genere y confirme nuevamente.'); }
    if (!snapshot || !snapshot.input || typeof snapshot.input !== 'object') throw new ConflictException('La clasificación confirmada no tiene una instantánea válida. Genere y confirme nuevamente.');
    const input = { ...(snapshot.input as any), finalSeverity: v.finalSeverity!, justification: v.overrideJustification };
    const fingerprint = recommendationFingerprint(v);
    if (v.recommendations.length && v.recommendationGeneratedAt && v.recommendationInputFingerprint === fingerprint) return this.getRecommendations(triageId, versionId, physicianId);
    const token = randomUUID(); const now = new Date(); const leaseMs = Math.max(Number(process.env.OLLAMA_TIMEOUT_MS ?? 30000) * 2 + 10000, 90000);
    const claim = await (this.prisma.triageVersion.updateMany as any)({ where: { id: versionId, triageId, createdById: physicianId, status: 'PENDING_REVIEW', classificationRevision: v.classificationRevision, recommendationCollectionRevision: collectionRevision, OR: [{ recommendationClaimToken: null }, { recommendationClaimedAt: { lt: new Date(now.getTime() - leaseMs) } }] }, data: { recommendationClaimToken: token, recommendationClaimedAt: now, recommendationClaimFingerprint: fingerprint, recommendationClaimCollectionRevision: collectionRevision } });
    if (!claim.count) throw new ConflictException('Ya hay recomendaciones en generación o la versión cambió.');
    try {
      if (!this.llm?.recommend) throw new ServiceUnavailableException('El servicio clínico local no está disponible.');
      const result = await this.llm.recommend(input);
       if (result.recommendations.some((r, index) => r.order !== index + 1 || !isSafeRecommendation(r.content))) throw new BadRequestException('La respuesta clínica local contiene recomendaciones no permitidas. No se guardaron recomendaciones.');
       const persisted = await this.prisma.$transaction(async tx => { const claimed = await (tx.triageVersion.updateMany as any)({ where: { id: versionId, triageId, createdById: physicianId, status: 'PENDING_REVIEW', classificationRevision: v.classificationRevision, recommendationCollectionRevision: collectionRevision, recommendationClaimToken: token, recommendationClaimFingerprint: fingerprint, recommendationClaimCollectionRevision: collectionRevision }, data: {} }); if (claimed.count !== 1) throw new ConflictException('La versión cambió mientras se generaban las recomendaciones.'); await tx.recommendation.deleteMany({ where: { triageVersionId: versionId } }); await tx.recommendation.createMany({ data: result.recommendations.map(r => ({ triageVersionId: versionId, content: r.content, sortOrder: r.order, source: 'MODEL' as const })) }); return (tx.triageVersion.updateMany as any)({ where: { id: versionId, createdById: physicianId, status: 'PENDING_REVIEW', classificationRevision: v.classificationRevision, recommendationCollectionRevision: collectionRevision, recommendationClaimToken: token, recommendationClaimFingerprint: fingerprint, recommendationClaimCollectionRevision: collectionRevision }, data: { recommendationRawOutput: result.raw, recommendationModelName: result.model, recommendationGeneratedAt: new Date(), recommendationClaimToken: null, recommendationClaimedAt: null, recommendationClaimFingerprint: null, recommendationClaimCollectionRevision: null, recommendationInputFingerprint: fingerprint, recommendationRevision: { increment: 1 }, recommendationCollectionRevision: { increment: 1 } } }); });
      if (!persisted.count) throw new ConflictException('La versión cambió mientras se generaban las recomendaciones.');
      return this.getRecommendations(triageId, versionId, physicianId);
    } catch (error) { await (this.prisma.triageVersion.updateMany as any)({ where: { id: versionId, recommendationClaimToken: token }, data: { recommendationClaimToken: null, recommendationClaimedAt: null, recommendationClaimFingerprint: null, recommendationClaimCollectionRevision: null } }); throw error; }
  }
  private async editableRecommendation(triageId: string, versionId: string, recommendationId: string, physicianId: string, revision?: number) {
    const r = await this.prisma.recommendation.findFirst({ where: { id: recommendationId, triageVersionId: versionId, triageVersion: { triageId, id: versionId, createdById: physicianId, status: 'PENDING_REVIEW' } } });
    if (!r) throw new NotFoundException('Recomendación no encontrada');
    if (revision !== undefined && r.revision !== revision) throw new ConflictException('La recomendación cambió mientras la editaba. Conserva los valores actuales y recarga.');
    return r;
  }
  async editRecommendation(triageId: string, versionId: string, recommendationId: string, physicianId: string, content: string, revision: number, expectedUpdatedAt: string, collectionRevision: number) {
    const r = await this.editableRecommendation(triageId, versionId, recommendationId, physicianId, revision); const value = content.trim();
    if (!isSafeRecommendation(value)) throw new BadRequestException('La recomendación no cumple las reglas de seguridad.');
    return this.prisma.$transaction(async tx => { const guard = await tx.triageVersion.updateMany({ where: { id: versionId, triageId, createdById: physicianId, status: 'PENDING_REVIEW', recommendationCollectionRevision: collectionRevision }, data: { recommendationCollectionRevision: { increment: 1 } } }); if (guard.count !== 1) throw new ConflictException('La colección cambió mientras la editaba. Conserva los valores actuales y recarga.'); const updated = await tx.recommendation.updateMany({ where: { id: r.id, revision, updatedAt: new Date(expectedUpdatedAt) }, data: { content: value, updatedById: physicianId, isApproved: false, approvedById: null, approvedAt: null, revision: { increment: 1 } } }); if (updated.count !== 1) throw new ConflictException('La recomendación cambió mientras la editaba. Conserva los valores actuales y recarga.'); return tx.recommendation.findUniqueOrThrow({ where: { id: r.id } }); });
  }
  async addRecommendation(triageId: string, versionId: string, physicianId: string, content: string, collectionRevision: number) { await this.recommendationVersion(triageId, versionId, physicianId); const value = content.trim(); if (!isSafeRecommendation(value)) throw new BadRequestException('La recomendación no cumple las reglas de seguridad.'); return this.prisma.$transaction(async tx => { const guard = await tx.triageVersion.updateMany({ where: { id: versionId, triageId, createdById: physicianId, status: 'PENDING_REVIEW', recommendationCollectionRevision: collectionRevision }, data: { recommendationCollectionRevision: { increment: 1 } } }); if (guard.count !== 1) throw new ConflictException('La colección cambió. Conserva los valores actuales y recarga.'); const last = await tx.recommendation.findFirst({ where: { triageVersionId: versionId }, orderBy: { sortOrder: 'desc' } }); return tx.recommendation.create({ data: { triageVersionId: versionId, content: value, sortOrder: (last?.sortOrder ?? 0) + 1, source: 'MANUAL', createdById: physicianId, updatedById: physicianId } }); }); }
  async deleteRecommendation(triageId: string, versionId: string, recommendationId: string, physicianId: string, revision: number, expectedUpdatedAt: string, collectionRevision: number) { const r = await this.editableRecommendation(triageId, versionId, recommendationId, physicianId, revision); return this.prisma.$transaction(async tx => { const guard = await tx.triageVersion.updateMany({ where: { id: versionId, triageId, createdById: physicianId, status: 'PENDING_REVIEW', recommendationCollectionRevision: collectionRevision }, data: { recommendationCollectionRevision: { increment: 1 } } }); if (guard.count !== 1) throw new ConflictException('La colección cambió. Conserva los valores actuales y recarga.'); const deleted = await tx.recommendation.deleteMany({ where: { id: r.id, revision, updatedAt: new Date(expectedUpdatedAt) } }); if (deleted.count !== 1) throw new ConflictException('La recomendación cambió. Conserva los valores actuales y recarga.'); const rest = await tx.recommendation.findMany({ where: { triageVersionId: versionId }, orderBy: { sortOrder: 'asc' } }); for (const [i, item] of rest.entries()) await tx.recommendation.update({ where: { id: item.id }, data: { sortOrder: -(i + 1) } }); for (const [i, item] of rest.entries()) await tx.recommendation.update({ where: { id: item.id }, data: { sortOrder: i + 1, revision: { increment: 1 }, updatedById: physicianId } }); return { deleted: true }; }); }
  async reorderRecommendations(triageId: string, versionId: string, physicianId: string, ids: string[], collectionRevision: number) { await this.recommendationVersion(triageId, versionId, physicianId); const current = await this.prisma.recommendation.findMany({ where: { triageVersionId: versionId }, orderBy: { sortOrder: 'asc' } }); if (ids.length !== current.length || new Set(ids).size !== ids.length || ids.some(id => !current.some(r => r.id === id))) throw new ConflictException('El orden de las recomendaciones cambió. Recarga antes de reordenar.'); return this.prisma.$transaction(async tx => { const guard = await tx.triageVersion.updateMany({ where: { id: versionId, triageId, createdById: physicianId, status: 'PENDING_REVIEW', recommendationCollectionRevision: collectionRevision }, data: { recommendationCollectionRevision: { increment: 1 } } }); if (guard.count !== 1) throw new ConflictException('La colección cambió. Conserva los valores actuales y recarga.'); for (const [i, id] of ids.entries()) await tx.recommendation.update({ where: { id }, data: { sortOrder: -(i + 1) } }); for (const [i, id] of ids.entries()) await tx.recommendation.update({ where: { id }, data: { sortOrder: i + 1, revision: { increment: 1 }, updatedById: physicianId } }); return { recommendations: await tx.recommendation.findMany({ where: { triageVersionId: versionId }, orderBy: { sortOrder: 'asc' } }) }; }); }
  async approveRecommendation(triageId: string, versionId: string, recommendationId: string, physicianId: string, approved: boolean, revision: number, expectedUpdatedAt: string, collectionRevision: number) { const r = await this.editableRecommendation(triageId, versionId, recommendationId, physicianId, revision); return this.prisma.$transaction(async tx => { const guard = await tx.triageVersion.updateMany({ where: { id: versionId, triageId, createdById: physicianId, status: 'PENDING_REVIEW', recommendationCollectionRevision: collectionRevision }, data: { recommendationCollectionRevision: { increment: 1 } } }); if (guard.count !== 1) throw new ConflictException('La colección cambió. Conserva los valores actuales y recarga.'); const updated = await tx.recommendation.updateMany({ where: { id: r.id, revision, updatedAt: new Date(expectedUpdatedAt) }, data: { isApproved: approved, approvedById: approved ? physicianId : null, approvedAt: approved ? new Date() : null, updatedById: physicianId, revision: { increment: 1 } } }); if (updated.count !== 1) throw new ConflictException('La recomendación cambió. Conserva los valores actuales y recarga.'); return tx.recommendation.findUniqueOrThrow({ where: { id: r.id } }); }); }
}

export function assertStaff(role: string): asserts role is typeof staffRoles[number] { if (!staffRoles.includes(role as typeof staffRoles[number])) throw new ForbiddenException('Se requiere acceso del personal clínico'); }

