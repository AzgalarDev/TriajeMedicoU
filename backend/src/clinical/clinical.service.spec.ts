import { ClinicalService } from './clinical.service';
import { createHash } from 'node:crypto';

const patientSelect = { id: true, fullName: true, nationalId: true, dateOfBirth: true };
const profileSelect = { medicalHistory: true, allergies: true, currentMedications: true, chronicConditions: true };

describe('ClinicalService patient search', () => {
  it('rejects empty searches instead of returning the first patients', async () => {
    const prisma = { user: { findMany: jest.fn() } };

    await expect(new ClinicalService(prisma as never).searchPatients({ query: '   ' })).rejects.toThrow('La búsqueda requiere CI o al menos 2 caracteres del nombre del paciente');
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('searches patients by exact CI and never includes non-patient records', async () => {
    const prisma = { user: { findMany: jest.fn().mockResolvedValue([{ id: 'patient-1', fullName: 'Ana Pérez', nationalId: '12345', dateOfBirth: new Date('1990-01-01') }]) } };

    await new ClinicalService(prisma as never).searchPatients({ nationalId: '12345' });

    expect(prisma.user.findMany).toHaveBeenCalledWith({ where: { role: 'PATIENT', nationalId: '12345' }, select: patientSelect, orderBy: { fullName: 'asc' }, take: 50 });
  });

  it('searches patients by partial name only after validation', async () => {
    const prisma = { user: { findMany: jest.fn().mockResolvedValue([]) } };

    await new ClinicalService(prisma as never).searchPatients({ query: 'ana' });

    expect(prisma.user.findMany).toHaveBeenCalledWith({ where: { role: 'PATIENT', fullName: { contains: 'ana', mode: 'insensitive' } }, select: patientSelect, orderBy: { fullName: 'asc' }, take: 50 });
  });
});

describe('ClinicalService patient details and profile updates', () => {
  it('returns identity fields, clinical profile, and cumulative triage history', async () => {
    const patient = { id: 'patient-1', fullName: 'Ana Pérez', nationalId: '12345', dateOfBirth: new Date('1990-01-01'), sex: 'FEMALE', address: 'Calle 1', patientProfile: { medicalHistory: 'Asma' }, patientTriages: [{ id: 'triage-1' }] };
    const prisma = { user: { findFirst: jest.fn().mockResolvedValue(patient) } };

    await expect(new ClinicalService(prisma as never).getPatient('patient-1')).resolves.toEqual(patient);

    expect(prisma.user.findFirst).toHaveBeenCalledWith({ where: { id: 'patient-1', role: 'PATIENT' }, select: expect.objectContaining({ id: true, fullName: true, nationalId: true, dateOfBirth: true, sex: true, address: true, patientProfile: expect.any(Object), patientTriages: expect.any(Object) }) });
  });

  it('verifies the target user exists and is a patient before profile upsert', async () => {
    const prisma = { user: { findFirst: jest.fn().mockResolvedValue(null) }, patientProfile: { upsert: jest.fn() } };

    await expect(new ClinicalService(prisma as never).updateProfile('admin-1', { allergies: 'Penicillin' })).rejects.toThrow('Paciente no encontrado');
    expect(prisma.patientProfile.upsert).not.toHaveBeenCalled();
  });

  it('updates only the submitted clinical fields without overwriting omitted values', async () => {
    const updated = { medicalHistory: 'Diabetes', allergies: 'Penicillin', currentMedications: null, chronicConditions: null };
    const prisma = { user: { findFirst: jest.fn().mockResolvedValue({ id: 'patient-1' }) }, patientProfile: { upsert: jest.fn().mockResolvedValue(updated) } };

    await expect(new ClinicalService(prisma as never).updateProfile('patient-1', { medicalHistory: 'Diabetes' })).resolves.toEqual(updated);

    expect(prisma.patientProfile.upsert).toHaveBeenCalledWith({ where: { userId: 'patient-1' }, create: { userId: 'patient-1', medicalHistory: 'Diabetes' }, update: { medicalHistory: 'Diabetes' }, select: profileSelect });
  });
});

describe('ClinicalService triage creation', () => {
  it('creates an independent triage record for a patient with initial symptoms', async () => {
    const created = { id: 'triage-1', versions: [{ versionNumber: 1, symptoms: [{ name: 'Fever' }] }] };
    const prisma = { user: { findFirst: jest.fn().mockResolvedValueOnce({ id: 'patient-1' }).mockResolvedValueOnce({ id: 'physician-1' }) }, triage: { create: jest.fn().mockResolvedValue(created) } };

    await expect(new ClinicalService(prisma as never).createTriage('patient-1', 'physician-1', { status: 'IN_PROGRESS', description: 'High fever', symptoms: [{ name: ' Fever ' }] })).resolves.toEqual(created);

    expect(prisma.triage.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ patientId: 'patient-1', physicianId: 'physician-1', status: 'IN_PROGRESS', versions: { create: expect.objectContaining({ versionNumber: 1, createdById: 'physician-1', symptoms: { create: [{ name: 'Fever', description: undefined, severity: undefined }] } }) } }) }));
  });

  it('rejects triage creation unless the actor is a physician', async () => {
    const prisma = { user: { findFirst: jest.fn().mockResolvedValueOnce({ id: 'patient-1' }).mockResolvedValueOnce(null) }, triage: { create: jest.fn() } };

    await expect(new ClinicalService(prisma as never).createTriage('patient-1', 'assistant-1', { symptoms: [{ name: 'Fever' }] })).rejects.toThrow('Se requiere acceso de médico');
    expect(prisma.user.findFirst).toHaveBeenLastCalledWith({ where: { id: 'assistant-1', role: 'PHYSICIAN' }, select: { id: true } });
    expect(prisma.triage.create).not.toHaveBeenCalled();
  });

  it('returns the existing triage when a request is retried with the same idempotency key', async () => {
    const existing = { id: 'triage-1', requestFingerprint: createHash('sha256').update(JSON.stringify({ operation: 'CREATE_TRIAGE', patientId: 'patient-1', physicianId: 'physician-1', status: 'DRAFT', description: null, symptoms: [{ name: 'Fever', description: null, severity: null }] })).digest('hex'), versions: [] };
    const prisma = { user: { findFirst: jest.fn().mockResolvedValueOnce({ id: 'patient-1' }).mockResolvedValueOnce({ id: 'physician-1' }) }, triage: { findUnique: jest.fn().mockResolvedValue(existing), create: jest.fn() } };

    await expect(new ClinicalService(prisma as never).createTriage('patient-1', 'physician-1', { symptoms: [{ name: 'Fever' }] }, 'submission-1')).resolves.toEqual(existing);
    expect(prisma.triage.create).not.toHaveBeenCalled();
    expect(prisma.triage.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { idempotencyKey: 'submission-1' } }));
  });

  it('creates a later independent triage with a different idempotency key', async () => {
    const created = { id: 'triage-2' };
    const prisma = { user: { findFirst: jest.fn().mockResolvedValueOnce({ id: 'patient-1' }).mockResolvedValueOnce({ id: 'physician-1' }) }, triage: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue(created) } };

    await expect(new ClinicalService(prisma as never).createTriage('patient-1', 'physician-1', { symptoms: [{ name: 'Cough' }] }, 'submission-2')).resolves.toEqual(created);
    expect(prisma.triage.create).toHaveBeenCalled();
  });

  it('rejects reusing a key for another patient or payload', async () => {
    const prisma = { user: { findFirst: jest.fn().mockResolvedValueOnce({ id: 'patient-2' }).mockResolvedValueOnce({ id: 'physician-1' }) }, triage: { findUnique: jest.fn().mockResolvedValue({ id: 'triage-1', requestFingerprint: 'different', versions: [] }), create: jest.fn() } };

    await expect(new ClinicalService(prisma as never).createTriage('patient-2', 'physician-1', { symptoms: [{ name: 'Cough' }] }, 'submission-1')).rejects.toThrow('La clave de idempotencia ya fue utilizada para otra solicitud de triaje');
    expect(prisma.triage.create).not.toHaveBeenCalled();
  });
});
