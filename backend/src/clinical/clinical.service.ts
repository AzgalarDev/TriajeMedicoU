import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTriageDto } from './dto/create-triage.dto';
import { SearchPatientsDto } from './dto/search-patients.dto';
import { UpdateClinicalProfileDto } from './dto/update-clinical-profile.dto';

const staffRoles = ['PHYSICIAN', 'ASSISTANT'] as const;
const triageFingerprint = (patientId: string, physicianId: string, dto: CreateTriageDto) => createHash('sha256').update(JSON.stringify({ operation: 'CREATE_TRIAGE', patientId, physicianId, status: dto.status ?? 'DRAFT', description: dto.description?.trim() ?? null, symptoms: dto.symptoms.map((symptom) => ({ name: symptom.name.trim(), description: symptom.description?.trim() ?? null, severity: symptom.severity ?? null })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) })).digest('hex');

@Injectable()
export class ClinicalService {
  constructor(private readonly prisma: PrismaService) {}

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

  async getPatient(id: string) {
    const patient = await this.prisma.user.findFirst({ where: { id, role: 'PATIENT' }, select: { id: true, fullName: true, nationalId: true, dateOfBirth: true, sex: true, address: true, patientProfile: { select: { medicalHistory: true, allergies: true, currentMedications: true, chronicConditions: true } }, patientTriages: { orderBy: { createdAt: 'desc' }, select: { id: true, status: true, createdAt: true, physician: { select: { fullName: true } }, versions: { orderBy: { versionNumber: 'desc' }, take: 1, select: { status: true, symptoms: true } } } } } });
    if (!patient) throw new NotFoundException('Paciente no encontrado');
    return patient;
  }

  async updateProfile(id: string, dto: UpdateClinicalProfileDto) {
    const patient = await this.prisma.user.findFirst({ where: { id, role: 'PATIENT' }, select: { id: true } });
    if (!patient) throw new NotFoundException('Paciente no encontrado');
    return this.prisma.patientProfile.upsert({ where: { userId: id }, create: { userId: id, ...dto }, update: dto, select: { medicalHistory: true, allergies: true, currentMedications: true, chronicConditions: true } });
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
}

export function assertStaff(role: string): asserts role is typeof staffRoles[number] { if (!staffRoles.includes(role as typeof staffRoles[number])) throw new ForbiddenException('Se requiere acceso del personal clínico'); }
