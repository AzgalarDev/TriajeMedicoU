import { ClinicalService } from './clinical.service';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';

const patientSelect = { id: true, fullName: true, nationalId: true, dateOfBirth: true };
const profileSelect = { medicalHistory: true, allergies: true, currentMedications: true, chronicConditions: true };
const makePublicationTx = () => ({
  $queryRaw: jest.fn().mockResolvedValue([{ id: 'physician-1', role: 'PHYSICIAN', status: 'ACTIVE' }]),
  user: { findFirst: jest.fn().mockResolvedValue({ id: 'physician-1', role: 'PHYSICIAN', status: 'ACTIVE' }) },
  triageVersion: { findFirst: jest.fn().mockResolvedValue({ id: 'version-1', triageId: 'triage-1', createdById: 'physician-1', status: 'PENDING_REVIEW', finalSeverity: 'MILD', classificationRevision: 4, recommendationCollectionRevision: 5, recommendationRevision: 6, recommendations: [{ id: 'recommendation-1', content: 'Mantener seguimiento clínico.', sortOrder: 1, isApproved: true }], triage: { id: 'triage-1', status: 'PENDING_REVIEW' } }), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  triage: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  publication: { findFirst: jest.fn(), create: jest.fn().mockResolvedValue({ id: 'publication-1' }), update: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  publicationRevision: { create: jest.fn().mockResolvedValue({ id: 'revision-1', revisionNumber: 1 }) },
  auditEvent: { create: jest.fn() },
});

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

describe('ClinicalService publication transaction', () => {
  const safeRecommendation = { id: 'recommendation-1', content: 'Mantener seguimiento clínico.', sortOrder: 1, isApproved: true };
  const version = { id: 'version-1', triageId: 'triage-1', createdById: 'physician-1', status: 'PENDING_REVIEW', finalSeverity: 'MILD', classificationRevision: 4, recommendationCollectionRevision: 5, recommendationRevision: 6, recommendations: [safeRecommendation], triage: { id: 'triage-1', patientId: 'patient-1', status: 'PENDING_REVIEW' } };

  const publicationTx = () => ({
    $queryRaw: jest.fn().mockResolvedValue([{ id: 'physician-1', role: 'PHYSICIAN', status: 'ACTIVE' }]),
    user: { findFirst: jest.fn().mockResolvedValue({ id: 'physician-1', role: 'PHYSICIAN', status: 'ACTIVE' }) },
    triageVersion: { findFirst: jest.fn().mockResolvedValue(version), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    triage: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    publication: { findFirst: jest.fn(), create: jest.fn().mockResolvedValue({ id: 'publication-1' }), update: jest.fn().mockResolvedValue({ id: 'publication-1' }), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    publicationRevision: { create: jest.fn().mockResolvedValue({ id: 'revision-1', revisionNumber: 1 }) },
    auditEvent: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
  });

  it('publishes the exact ordered approved safe set atomically and creates revision/audit records', async () => {
    const tx = makePublicationTx();
    const prisma = { user: { findFirst: jest.fn().mockResolvedValue({ id: 'physician-1', role: 'PHYSICIAN', status: 'ACTIVE' }) }, $transaction: jest.fn((fn) => fn(tx)) };
    const input = { expectedClinicalRevision: 4, expectedCollectionRevision: 5, expectedRecommendationRevision: 6 };
    await expect(new ClinicalService(prisma as never).publish('triage-1', 'version-1', 'physician-1', input)).resolves.toEqual(expect.objectContaining({ publicationId: 'publication-1', revisionId: 'revision-1' }));
    expect(tx.publication.create).toHaveBeenCalled();
    expect(tx.publicationRevision.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ publicationId: 'publication-1', triageVersionId: 'version-1', revisionNumber: 1, recommendations: [safeRecommendation.content] }) }));
    expect(tx.auditEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ publicationId: 'publication-1', revisionId: 'revision-1', action: 'PUBLISHED' }) }));
  });

  it.each([
    ['stale clinical revision', { expectedClinicalRevision: 3, expectedCollectionRevision: 5, expectedRecommendationRevision: 6 }],
    ['empty recommendations', { expectedClinicalRevision: 4, expectedCollectionRevision: 5, expectedRecommendationRevision: 6 }],
  ])('rejects %s before creating any publication rows', async (_case, input) => {
    const tx = makePublicationTx();
    tx.triageVersion.findFirst.mockResolvedValue(version);
    if (_case === 'empty recommendations') tx.triageVersion.findFirst.mockResolvedValue({ ...version, recommendations: [] });
    const prisma = { user: { findFirst: jest.fn().mockResolvedValue({ id: 'physician-1', role: 'PHYSICIAN', status: 'ACTIVE' }) }, $transaction: jest.fn((fn) => fn(tx)) };
    await expect(new ClinicalService(prisma as never).publish('triage-1', 'version-1', 'physician-1', _case === 'stale clinical revision' ? input : { ...input, expectedClinicalRevision: 4 })).rejects.toThrow();
    expect(tx.publication.create).not.toHaveBeenCalled();
    expect(tx.publicationRevision.create).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });
});

describe('ClinicalService publication corrections and post-publication safety', () => {
  it('appends a safe correction, supersedes the prior revision, updates current, and audits the link', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'physician-1', role: 'PHYSICIAN', status: 'ACTIVE' }]),
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'physician-1', role: 'PHYSICIAN', status: 'ACTIVE' }) },
      publication: { findFirst: jest.fn().mockResolvedValue({ id: 'publication-1', triageVersionId: 'version-1', currentRevisionId: 'revision-1', revisions: [{ id: 'revision-1', revisionNumber: 1, recommendations: ['Mantener seguimiento clínico.'], contentHash: 'before' }] }), update: jest.fn().mockResolvedValue({ id: 'publication-1', currentRevisionId: 'revision-2' }), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      publicationRevision: { create: jest.fn().mockResolvedValue({ id: 'revision-2', revisionNumber: 2 }) },
      auditEvent: { create: jest.fn().mockResolvedValue({ id: 'audit-2' }) },
    };
    const prisma = { user: { findFirst: jest.fn().mockResolvedValue({ id: 'physician-1', role: 'PHYSICIAN', status: 'ACTIVE' }) }, $transaction: jest.fn((fn) => fn(tx)) };
    await expect(new ClinicalService(prisma as never).correctPublication('triage-1', 'version-1', 'physician-1', { expectedPublicationRevision: 1, reason: 'Actualización clínica', recommendations: ['Mantener seguimiento clínico actualizado.'] })).resolves.toEqual(expect.objectContaining({ revisionId: 'revision-2' }));
    expect(tx.publicationRevision.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ supersedesRevisionId: 'revision-1', reason: 'Actualización clínica' }) }));
    expect(tx.publication.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { currentRevisionId: 'revision-2' } }));
    expect(tx.auditEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'CORRECTED', revisionId: 'revision-2', beforeHash: 'before' }) }));
  });

  it('rejects stale or unsafe corrections without changing publication history', async () => {
    const tx = { user: { findFirst: jest.fn().mockResolvedValue({ id: 'physician-1', role: 'PHYSICIAN', status: 'ACTIVE' }) }, publication: { findFirst: jest.fn().mockResolvedValue({ id: 'publication-1', currentRevisionId: 'revision-2', revisions: [{ id: 'revision-2', revisionNumber: 2, recommendations: ['Mantener seguimiento clínico.'], contentHash: 'before' }] }), update: jest.fn(), updateMany: jest.fn() }, publicationRevision: { create: jest.fn() }, auditEvent: { create: jest.fn() } };
    const prisma = { user: { findFirst: jest.fn().mockResolvedValue({ id: 'physician-1', role: 'PHYSICIAN', status: 'ACTIVE' }) }, $transaction: jest.fn((fn) => fn(tx)) };
    await expect(new ClinicalService(prisma as never).correctPublication('triage-1', 'version-1', 'physician-1', { expectedPublicationRevision: 1, reason: 'Corrección', recommendations: ['Mantener seguimiento clínico.'] })).rejects.toThrow();
    await expect(new ClinicalService(prisma as never).correctPublication('triage-1', 'version-1', 'physician-1', { expectedPublicationRevision: 2, reason: '', recommendations: ['Prescriba 20 mg cada 8 horas.'] })).rejects.toThrow();
    expect(tx.publicationRevision.create).not.toHaveBeenCalled();
    expect(tx.publication.update).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });
});

describe('ClinicalService publication transaction race guards', () => {
  it('aborts publication when the final version or triage lifecycle guard updates zero rows', async () => {
    const tx = makePublicationTx();
    tx.triageVersion.updateMany.mockResolvedValue({ count: 0 });
    const prisma = { user: { findFirst: jest.fn().mockResolvedValue({ id: 'physician-1' }) }, $transaction: jest.fn((fn) => fn(tx)) };
    await expect(new ClinicalService(prisma as never).publish('triage-1', 'version-1', 'physician-1', { expectedClinicalRevision: 4, expectedCollectionRevision: 5, expectedRecommendationRevision: 6 })).rejects.toThrow('cambió');
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
    tx.triageVersion.updateMany.mockResolvedValue({ count: 1 });
    tx.triage.updateMany.mockResolvedValue({ count: 0 });
    await expect(new ClinicalService(prisma as never).publish('triage-1', 'version-1', 'physician-1', { expectedClinicalRevision: 4, expectedCollectionRevision: 5, expectedRecommendationRevision: 6 })).rejects.toThrow('cambió');
  });

  it('reauthorizes inside publication and correction transactions', async () => {
    const publication = makePublicationTx();
    publication.user.findFirst.mockResolvedValue(null);
    publication.$queryRaw.mockResolvedValue([{ id: 'physician-1', role: 'PHYSICIAN', status: 'INACTIVE' }]);
    const publishPrisma = { user: { findFirst: jest.fn().mockResolvedValue({ id: 'physician-1' }) }, $transaction: jest.fn((fn) => fn(publication)) };
    await expect(new ClinicalService(publishPrisma as never).publish('triage-1', 'version-1', 'physician-1', { expectedClinicalRevision: 4, expectedCollectionRevision: 5, expectedRecommendationRevision: 6 })).rejects.toThrow('activo');
    expect(publication.publication.create).not.toHaveBeenCalled();

    const correction = makePublicationTx();
    correction.publication.findFirst.mockResolvedValue({ id: 'publication-1', currentRevisionId: 'revision-1', revisions: [{ id: 'revision-1', revisionNumber: 1, severity: 'MILD', contentHash: 'before' }] });
    correction.user.findFirst.mockResolvedValue(null);
    correction.$queryRaw.mockResolvedValue([]);
    const correctionPrisma = { user: { findFirst: jest.fn().mockResolvedValue({ id: 'physician-1' }) }, $transaction: jest.fn((fn) => fn(correction)) };
    await expect(new ClinicalService(correctionPrisma as never).correctPublication('triage-1', 'version-1', 'physician-1', { expectedPublicationRevision: 1, reason: 'Actualización clínica', recommendations: ['Mantener seguimiento clínico actualizado.'] })).rejects.toThrow('activo');
    expect(correction.publicationRevision.create).not.toHaveBeenCalled();
  });

  it('aborts correction when the current publication pointer update loses the race', async () => {
    const tx = makePublicationTx();
    tx.publication.findFirst.mockResolvedValue({ id: 'publication-1', currentRevisionId: 'revision-1', revisions: [{ id: 'revision-1', revisionNumber: 1, severity: 'MILD', contentHash: 'before' }] });
    tx.publication.updateMany.mockResolvedValue({ count: 0 });
    const prisma = { user: { findFirst: jest.fn().mockResolvedValue({ id: 'physician-1' }) }, $transaction: jest.fn((fn) => fn(tx)) };
    await expect(new ClinicalService(prisma as never).correctPublication('triage-1', 'version-1', 'physician-1', { expectedPublicationRevision: 1, reason: 'Actualización clínica', recommendations: ['Mantener seguimiento clínico actualizado.'] })).rejects.toThrow('cambió');
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });

  it('independently aborts correction when the second current-pointer guard loses the race', async () => {
    const tx = makePublicationTx();
    tx.publication.findFirst.mockResolvedValue({ id: 'publication-1', currentRevisionId: 'revision-1', revisions: [{ id: 'revision-1', revisionNumber: 1, severity: 'MILD', contentHash: 'before' }] });
    tx.publication.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const prisma = { user: { findFirst: jest.fn().mockResolvedValue({ id: 'physician-1' }) }, $transaction: jest.fn((fn) => fn(tx)) };
    await expect(new ClinicalService(prisma as never).correctPublication('triage-1', 'version-1', 'physician-1', { expectedPublicationRevision: 1, reason: 'Actualización clínica', recommendations: ['Mantener seguimiento clínico actualizado.'] })).rejects.toThrow('cambió');
    expect(tx.publicationRevision.create).toHaveBeenCalledTimes(1);
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });

  it('independently aborts publication at either lifecycle guard', async () => {
    const tx = makePublicationTx();
    tx.triageVersion.findFirst.mockResolvedValue({ id: 'version-1', triageId: 'triage-1', createdById: 'physician-1', status: 'PENDING_REVIEW', finalSeverity: 'MILD', classificationRevision: 4, recommendationCollectionRevision: 5, recommendationRevision: 6, recommendations: [{ content: 'Mantener seguimiento clínico.', sortOrder: 1, isApproved: true }] });
    tx.triageVersion.updateMany.mockResolvedValue({ count: 1 });
    tx.triage.updateMany.mockResolvedValue({ count: 0 });
    const prisma = { user: { findFirst: jest.fn().mockResolvedValue({ id: 'physician-1' }) }, $transaction: jest.fn((fn) => fn(tx)) };
    await expect(new ClinicalService(prisma as never).publish('triage-1', 'version-1', 'physician-1', { expectedClinicalRevision: 4, expectedCollectionRevision: 5, expectedRecommendationRevision: 6 })).rejects.toThrow('cambió');
    expect(tx.publication.create).not.toHaveBeenCalled();
  });
});

describe('ClinicalService database authorization lock', () => {
  it('locks and validates the physician row inside publication and correction transactions', async () => {
    const publication = makePublicationTx();
    publication.user.findFirst.mockResolvedValue(null);
    publication.$queryRaw = jest.fn().mockResolvedValue([{ id: 'physician-1', role: 'PHYSICIAN', status: 'INACTIVE' }]);
    const publishPrisma = { user: { findFirst: jest.fn().mockResolvedValue({ id: 'physician-1' }) }, $transaction: jest.fn((fn) => fn(publication)) };
    await expect(new ClinicalService(publishPrisma as never).publish('triage-1', 'version-1', 'physician-1', { expectedClinicalRevision: 4, expectedCollectionRevision: 5, expectedRecommendationRevision: 6 })).rejects.toThrow('activo');
    expect(publication.$queryRaw).toHaveBeenCalledTimes(1);

    const correction = makePublicationTx();
    correction.user.findFirst.mockResolvedValue(null);
    correction.$queryRaw.mockResolvedValue([]);
    correction.$queryRaw = jest.fn().mockResolvedValue([]);
    correction.publication.findFirst.mockResolvedValue({ id: 'publication-1', currentRevisionId: 'revision-1', revisions: [{ id: 'revision-1', revisionNumber: 1, severity: 'MILD', contentHash: 'before' }] });
    const correctionPrisma = { user: { findFirst: jest.fn().mockResolvedValue({ id: 'physician-1' }) }, $transaction: jest.fn((fn) => fn(correction)) };
    await expect(new ClinicalService(correctionPrisma as never).correctPublication('triage-1', 'version-1', 'physician-1', { expectedPublicationRevision: 1, reason: 'Actualización clínica', recommendations: ['Mantener seguimiento clínico actualizado.'] })).rejects.toThrow('activo');
    expect(correction.$queryRaw).toHaveBeenCalledTimes(1);
  });
});

describe('ClinicalService post-publication mutation guards', () => {
  it('rejects recommendation mutations after publication and unsafe content before persistence', async () => {
    const prisma = { recommendation: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() }, triageVersion: { findFirst: jest.fn().mockResolvedValue({ status: 'APPROVED' }) } };
    await expect(new ClinicalService(prisma as never).addRecommendation('triage-1', 'version-1', 'physician-1', 'Prescriba 20 mg cada 8 horas.', 0)).rejects.toThrow();
    expect(prisma.recommendation.create).not.toHaveBeenCalled();
  });

  it('rejects editing a published recommendation before attempting a write', async () => {
    const prisma = { recommendation: { findFirst: jest.fn().mockResolvedValue(null), updateMany: jest.fn() }, triageVersion: { findFirst: jest.fn().mockResolvedValue({ status: 'APPROVED' }) } };
    await expect(new ClinicalService(prisma as never).editRecommendation('triage-1', 'version-1', 'recommendation-1', 'physician-1', 'Mantener seguimiento clínico.', 0, new Date().toISOString(), 0)).rejects.toThrow();
    expect(prisma.recommendation.updateMany).not.toHaveBeenCalled();
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
    const tx = { patientProfile: { upsert: jest.fn().mockResolvedValue(updated) }, triageVersion: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) } };
    const prisma = { user: { findFirst: jest.fn().mockResolvedValue({ id: 'patient-1' }) }, patientProfile: tx.patientProfile, $transaction: jest.fn((fn) => fn(tx)) };

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

describe('ClinicalService clinical questions and answers', () => {
  const version = { id: 'version-1', status: 'IN_PROGRESS', description: 'Tos', symptoms: [{ name: 'Tos' }], questions: [], triage: { patient: { patientProfile: { medicalHistory: 'Asma', allergies: null, currentMedications: null, chronicConditions: null } } } };
  const answeredQuestions = [{ id: 'q-low', priority: 2, answer: { answerText: 'Tarde', updatedAt: new Date('2026-09-21T00:00:00.000Z') } }, { id: 'q-high', priority: 1, answer: { answerText: 'Temprano', updatedAt: new Date('2026-09-20T00:00:00.000Z') } }];
  it('generates atomically, persists model output, and is idempotent without a second provider call', async () => {
    const llm = { generateQuestions: jest.fn().mockResolvedValue({ raw: '{"questions":[]}', questions: [{ question: '¿Desde cuándo?', priority: 1 }] }) };
    const tx = { triageQuestion: { findMany: jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce(answeredQuestions), create: jest.fn().mockResolvedValue({ id: 'q1', priority: 1 }) }, triageVersion: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) } };
    const prisma = { triageVersion: { findFirst: jest.fn().mockResolvedValue({ ...version, questions: [] }) }, $transaction: jest.fn((fn) => fn(tx)), triageQuestion: { findMany: jest.fn() } };
    const service = new ClinicalService(prisma as never, llm);
    await expect(service.generateQuestions('triage-1', 'version-1', 'physician-1')).resolves.toEqual({ versionId: 'version-1', questions: answeredQuestions });
    expect(tx.triageVersion.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: { notIn: ['PENDING_REVIEW', 'APPROVED', 'CANCELLED'] } }), data: { modelOutput: '{"questions":[]}' } }));
    prisma.triageVersion.findFirst.mockResolvedValue({ ...version, questions: [{ id: 'q1' }] });
    await service.generateQuestions('triage-1', 'version-1', 'physician-1'); expect(llm.generateQuestions).toHaveBeenCalledTimes(1);
  });
  it('returns existing answered questions sorted by priority without calling the provider', async () => {
    const prisma = { triageVersion: { findFirst: jest.fn().mockResolvedValue({ ...version, questions: answeredQuestions }) } };
    const llm = { generateQuestions: jest.fn() };
    await expect(new ClinicalService(prisma as never, llm).generateQuestions('t', 'version-1', 'p')).resolves.toEqual({ versionId: 'version-1', questions: answeredQuestions });
    expect(prisma.triageVersion.findFirst).toHaveBeenCalledWith(expect.objectContaining({ include: expect.objectContaining({ questions: { include: { answer: true }, orderBy: { priority: 'asc' } } }) }));
    expect(llm.generateQuestions).not.toHaveBeenCalled();
  });
  it('returns the in-transaction winner with answers sorted by priority', async () => {
    const tx = { triageQuestion: { findMany: jest.fn().mockResolvedValueOnce([{ id: 'existing' }]).mockResolvedValueOnce(answeredQuestions) }, triageVersion: { update: jest.fn() } };
    const prisma = { triageVersion: { findFirst: jest.fn().mockResolvedValue({ ...version, questions: [] }) }, $transaction: jest.fn((fn) => fn(tx)), triageQuestion: { findMany: jest.fn() } };
    const llm = { generateQuestions: jest.fn().mockResolvedValue({ raw: '{}', questions: [{ question: '¿A?', priority: 1 }] }) };
    await expect(new ClinicalService(prisma as never, llm).generateQuestions('t', 'version-1', 'p')).resolves.toEqual({ versionId: 'version-1', questions: answeredQuestions });
    expect(tx.triageQuestion.findMany).toHaveBeenLastCalledWith({ where: { triageVersionId: 'version-1' }, include: { answer: true }, orderBy: { priority: 'asc' } });
  });
  it('returns the winner outside the aborted transaction on P2002 with answers sorted by priority', async () => {
    const error = new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: 'test' });
    const prisma = { triageVersion: { findFirst: jest.fn().mockResolvedValue({ ...version, questions: [] }) }, $transaction: jest.fn().mockRejectedValue(error), triageQuestion: { findMany: jest.fn().mockResolvedValue(answeredQuestions) } };
    const llm = { generateQuestions: jest.fn().mockResolvedValue({ raw: '{}', questions: [{ question: '¿A?', priority: 1 }] }) };
    await expect(new ClinicalService(prisma as never, llm).generateQuestions('t', 'version-1', 'p')).resolves.toEqual({ versionId: 'version-1', questions: answeredQuestions });
    expect(prisma.triageQuestion.findMany).toHaveBeenCalledWith({ where: { triageVersionId: 'version-1' }, include: { answer: true }, orderBy: { priority: 'asc' } });
  });
  it('rejects duplicate provider priorities before persistence', async () => {
    const prisma = { triageVersion: { findFirst: jest.fn().mockResolvedValue({ ...version, questions: [] }) }, $transaction: jest.fn(), triageQuestion: { findMany: jest.fn() } };
    const llm = { generateQuestions: jest.fn().mockResolvedValue({ raw: '{}', questions: [
      { question: '¿Desde cuándo inició la tos?', priority: 1 },
      { question: '¿Ha tenido fiebre medida?', priority: 1 },
      { question: '¿Tiene dificultad para respirar?', priority: 2 },
      { question: '¿Presenta dolor en el pecho?', priority: 3 },
      { question: '¿Ha usado salbutamol recientemente?', priority: 4 },
    ] }) };

    await expect(new ClinicalService(prisma as never, llm).generateQuestions('t', 'version-1', 'p')).rejects.toThrow('prioridades inválidas');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('rejects unsafe provider questions before persisting model output or questions', async () => {
    const prisma = { triageVersion: { findFirst: jest.fn().mockResolvedValue({ ...version, questions: [] }) }, $transaction: jest.fn(), triageQuestion: { findMany: jest.fn() } };
    const llm = { generateQuestions: jest.fn().mockResolvedValue({ raw: '{"questions":[{"question":"¿Recomienda reposo?","priority":1}]}', questions: [{ question: '¿Recomienda reposo?', priority: 1 }] }) };

    await expect(new ClinicalService(prisma as never, llm).generateQuestions('t', 'version-1', 'p')).rejects.toThrow('preguntas no permitidas');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('locks approved versions and enforces answer semantics and optimistic updates', async () => {
    const prisma = { triageVersion: { findFirst: jest.fn().mockResolvedValue({ ...version, status: 'APPROVED' }) }, triageQuestion: { findFirst: jest.fn() } };
    await expect(new ClinicalService(prisma as never).generateQuestions('t', 'v', 'p')).rejects.toThrow('bloqueadas');
    const answer = { id: 'a', questionId: 'q', status: 'ANSWERED', answerText: 'Sí', observations: null, updatedAt: new Date() };
    const tx = { triageVersion: { findFirst: jest.fn().mockResolvedValue({ id: 'v' }), updateMany: jest.fn().mockResolvedValue({ count: 1 }) }, triageAnswer: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue(answer) } };
    const p = { triageQuestion: { findFirst: jest.fn().mockResolvedValue({ id: 'q', triageVersionId: 'v' }) }, $transaction: jest.fn((fn) => fn(tx)) };
    await expect(new ClinicalService(p as never).answerQuestion('q', { status: 'ANSWERED', answerText: ' Sí ', expectedUpdatedAt: new Date().toISOString() }, 'p')).resolves.toEqual(answer);
    await expect(new ClinicalService(p as never).answerQuestion('q', { status: 'ANSWERED', expectedUpdatedAt: new Date().toISOString() }, 'p')).rejects.toThrow('requiere texto');
  });
  it('serializes answer before confirmation by invalidating the version before answer creation', async () => {
    const calls: string[] = [];
    const tx = { triageVersion: { updateMany: jest.fn().mockImplementation(() => { calls.push('invalidate-version'); return { count: 1 }; }) }, triageAnswer: { findUnique: jest.fn().mockImplementation(() => { calls.push('read-answer'); return null; }), create: jest.fn().mockImplementation(() => { calls.push('create-answer'); return { id: 'a1', updatedAt: new Date('2026-09-22T00:00:01.000Z') }; }) } };
    const answerPrisma = { triageQuestion: { findFirst: jest.fn().mockResolvedValue({ id: 'q1', triageVersionId: 'version-1' }) }, $transaction: jest.fn((fn) => fn(tx)) } as any;

    await new ClinicalService(answerPrisma as never).answerQuestion('q1', { status: 'ANSWERED', answerText: 'Sí', expectedUpdatedAt: new Date(0).toISOString() }, 'physician-1');
    expect(calls).toEqual(['invalidate-version', 'read-answer', 'create-answer']);
    const confirmTx = { triageVersion: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) }, triage: { updateMany: jest.fn() } };
    const staleVersion = { id: 'version-1', triageId: 'triage-1', createdById: 'physician-1', status: 'IN_PROGRESS', updatedAt: new Date('2026-09-22T00:00:00.000Z'), preliminarySeverity: 'MILD' };
    const confirmPrisma = { triageVersion: { findFirst: jest.fn().mockResolvedValue(staleVersion) }, $transaction: jest.fn((fn) => fn(confirmTx)) } as any;
    await expect(new ClinicalService(confirmPrisma as never).confirmClassification('triage-1', 'version-1', 'physician-1', 'MILD', undefined, staleVersion.updatedAt.toISOString())).rejects.toThrow('cambió mientras la revisaba');
    expect(confirmTx.triage.updateMany).not.toHaveBeenCalled();
  });
  it('serializes confirmation before answer by rejecting the atomic version invalidation before answer mutation', async () => {
    const tx = { triageVersion: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) }, triageAnswer: { findUnique: jest.fn(), create: jest.fn(), updateMany: jest.fn() } };
    const prisma = { triageQuestion: { findFirst: jest.fn().mockResolvedValue({ id: 'q1', triageVersionId: 'version-1' }) }, $transaction: jest.fn((fn) => fn(tx)) } as any;

    await expect(new ClinicalService(prisma as never).answerQuestion('q1', { status: 'ANSWERED', answerText: 'Sí', expectedUpdatedAt: new Date(0).toISOString() }, 'physician-1')).rejects.toThrow('clasificación confirmada requiere una nueva versión futura');
    expect(tx.triageAnswer.findUnique).not.toHaveBeenCalled();
    expect(tx.triageAnswer.create).not.toHaveBeenCalled();
  });
  it('rolls back classification invalidation when an optimistic answer update conflicts', async () => {
    const calls: string[] = [];
    const tx = { triageVersion: { updateMany: jest.fn().mockImplementation(() => { calls.push('invalidate-version'); return { count: 1 }; }) }, triageAnswer: { findUnique: jest.fn().mockResolvedValue({ id: 'a1' }), updateMany: jest.fn().mockImplementation(() => { calls.push('update-answer'); return { count: 0 }; }), findUniqueOrThrow: jest.fn() } };
    const prisma = { triageQuestion: { findFirst: jest.fn().mockResolvedValue({ id: 'q1', triageVersionId: 'version-1' }) }, $transaction: jest.fn(async (fn) => fn(tx)) } as any;

    await expect(new ClinicalService(prisma as never).answerQuestion('q1', { status: 'UNKNOWN', expectedUpdatedAt: '2026-09-20T00:00:00.000Z' }, 'physician-1')).rejects.toThrow('La respuesta cambió mientras la editaba');
    expect(calls).toEqual(['invalidate-version', 'update-answer']);
    expect(tx.triageAnswer.findUniqueOrThrow).not.toHaveBeenCalled();
  });
});

describe('ClinicalService classification', () => {
  const baseVersion: any = {
    id: 'version-1', triageId: 'triage-1', createdById: 'physician-1', status: 'IN_PROGRESS', updatedAt: new Date('2026-09-22T00:00:00.000Z'), preliminarySeverity: null, classificationInputFingerprint: null,
    description: 'Tos y fiebre', symptoms: [{ name: 'Tos', description: null, severity: 'MODERATE' }],
    questions: [{ id: 'q1', questionText: '¿Tiene fiebre?', answer: { status: 'ANSWERED', answerText: 'Sí', observations: null } }],
    triage: { patient: { patientProfile: { medicalHistory: 'Asma', allergies: null, currentMedications: null, chronicConditions: null } } },
  };
  const prismaForClassify = (version = baseVersion) => {
    const tx = { triageVersion: { update: jest.fn().mockResolvedValue(version) } };
    return { tx, prisma: { triageVersion: { findFirst: jest.fn().mockResolvedValue(version), updateMany: jest.fn().mockResolvedValue({ count: 1 }), update: jest.fn().mockResolvedValue(version) }, triage: { update: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) }, $transaction: jest.fn((fn) => fn(tx)) } };
  };

  it('enforces eligibility: generated questions exist and every answer has valid semantics', async () => {
    for (const bad of [[], [{ id: 'q1', questionText: '¿Tiene fiebre?', answer: null }], [{ id: 'q1', questionText: '¿Tiene fiebre?', answer: { status: 'ANSWERED', answerText: ' ' } }], [{ id: 'q1', questionText: '¿Tiene fiebre?', answer: { status: 'INVALID', answerText: null } }]]) {
      const { prisma } = prismaForClassify({ ...baseVersion, questions: bad as never });
      await expect(new ClinicalService(prisma as never, { classify: jest.fn() } as never).classify('triage-1', 'version-1', 'physician-1')).rejects.toThrow('Todas las preguntas deben tener una respuesta válida');
    }
  });

  it('uses exact triage/version ownership and blocks approved or cancelled versions', async () => {
    const { prisma } = prismaForClassify(null as never);
    await expect(new ClinicalService(prisma as never, {} as never).classify('other-triage', 'version-1', 'physician-1')).rejects.toThrow('Versión de triaje no encontrada');
    expect(prisma.triageVersion.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'version-1', triageId: 'other-triage', createdById: 'physician-1' } }));
    for (const status of ['APPROVED', 'CANCELLED']) {
      const locked = prismaForClassify({ ...baseVersion, status });
      await expect(new ClinicalService(locked.prisma as never, {} as never).classify('triage-1', 'version-1', 'physician-1')).rejects.toThrow('bloqueada');
    }
  });

  it('is fingerprint-idempotent and invalidates generated classification when an answer changes', async () => {
    const input = { medicalHistory: 'Asma', allergies: null, currentMedications: null, chronicConditions: null, description: 'Tos y fiebre', symptoms: [{ name: 'Tos', description: null, severity: 'MODERATE' }], answers: [{ question: '¿Tiene fiebre?', status: 'ANSWERED', answerText: 'Sí', observations: null }] };
    const fingerprint = createHash('sha256').update(JSON.stringify({ revision: 0, input })).digest('hex');
    const { prisma } = prismaForClassify({ ...baseVersion, preliminarySeverity: 'MILD', classificationInputFingerprint: fingerprint });
    await new ClinicalService(prisma as never, { classify: jest.fn() } as never).classify('triage-1', 'version-1', 'physician-1');
    expect(prisma.triageVersion.updateMany).not.toHaveBeenCalled();
    const answerTx = { triageVersion: { findFirst: jest.fn().mockResolvedValue({ id: 'version-1' }), updateMany: jest.fn().mockResolvedValue({ count: 1 }) }, triageAnswer: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'a1' }) } };
    const answerPrisma = { triageQuestion: { findFirst: jest.fn().mockResolvedValue({ id: 'q1', triageVersionId: 'version-1' }) }, triageAnswer: answerTx.triageAnswer, triageVersion: answerTx.triageVersion, $transaction: jest.fn((fn) => fn(answerTx)) } as any;
    await new ClinicalService(answerPrisma as never).answerQuestion('q1', { status: 'UNKNOWN', expectedUpdatedAt: new Date().toISOString() }, 'physician-1');
    expect(answerPrisma.triageVersion.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: 'version-1' }), data: expect.objectContaining({ preliminarySeverity: null, classificationInputFingerprint: null, classificationRevision: { increment: 1 } }) }));
  });

  it('claims generation, persists atomically, returns winner on concurrent claim, and cleans claim after provider failure', async () => {
    const ok = prismaForClassify();
    await new ClinicalService(ok.prisma as never, { classify: jest.fn().mockResolvedValue({ severity: 'MODERATE', rationale: 'Razonamiento clínico suficiente.', raw: '{}', model: 'qwen-test' }) } as never).classify('triage-1', 'version-1', 'physician-1');
    expect(ok.prisma.triageVersion.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ classificationClaimToken: expect.any(String), status: { notIn: ['PENDING_REVIEW', 'APPROVED', 'CANCELLED'] } }) }));
    expect(ok.prisma.triageVersion.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ preliminarySeverity: 'MODERATE', classificationGeneratingAt: null, classificationClaimToken: null }) }));
    const busy = prismaForClassify(); busy.prisma.triageVersion.updateMany.mockResolvedValue({ count: 0 });
    await expect(new ClinicalService(busy.prisma as never, { classify: jest.fn() } as never).classify('triage-1', 'version-1', 'physician-1')).rejects.toThrow('Ya hay una clasificación en generación');
    const failing = prismaForClassify();
    await expect(new ClinicalService(failing.prisma as never, { classify: jest.fn().mockRejectedValue(new Error('offline')) } as never).classify('triage-1', 'version-1', 'physician-1')).rejects.toThrow('offline');
    expect(failing.prisma.triageVersion.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'version-1', classificationClaimToken: expect.any(String) }, data: expect.objectContaining({ classificationGeneratingAt: null, classificationClaimToken: null }) }));
  });

  it('confirms same severity without justification, requires bounded override, detects conflicts and moves to pending review', async () => {
    const tx = { triageVersion: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) }, triage: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) } };
    const prisma = { triageVersion: { findFirst: jest.fn().mockResolvedValue({ ...baseVersion, preliminarySeverity: 'MILD' }) }, triage: { update: jest.fn() }, $transaction: jest.fn((fn) => fn(tx)) };
    await new ClinicalService(prisma as never).confirmClassification('triage-1', 'version-1', 'physician-1', 'MILD', undefined, baseVersion.updatedAt.toISOString());
    expect(tx.triageVersion.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ finalSeverity: 'MILD', overrideJustification: null, status: 'PENDING_REVIEW' }) }));
    expect(tx.triage.updateMany).toHaveBeenCalledWith({ where: { id: 'triage-1', status: { notIn: ['APPROVED', 'CANCELLED'] } }, data: { status: 'PENDING_REVIEW' } });
    await expect(new ClinicalService(prisma as never).confirmClassification('triage-1', 'version-1', 'physician-1', 'SEVERE', '', baseVersion.updatedAt.toISOString())).rejects.toThrow('justificación válida');
    await expect(new ClinicalService(prisma as never).confirmClassification('triage-1', 'version-1', 'physician-1', 'SEVERE', 'x'.repeat(1001), baseVersion.updatedAt.toISOString())).rejects.toThrow('justificación válida');
    tx.triageVersion.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(new ClinicalService(prisma as never).confirmClassification('triage-1', 'version-1', 'physician-1', 'MILD', undefined, baseVersion.updatedAt.toISOString())).rejects.toThrow('cambió mientras la revisaba');
  });

  it('keeps classification private from assistant patient projections', async () => {
    const prisma = { user: { findFirst: jest.fn().mockResolvedValue({ id: 'patient-1', patientTriages: [] }) } };
    await new ClinicalService(prisma as never).getPatient('patient-1', 'ASSISTANT');
    const versionSelect = prisma.user.findFirst.mock.calls[0][0].select.patientTriages.select.versions.select;
    expect(versionSelect.preliminarySeverity).toBe(false);
    expect(versionSelect.classificationRationale).toBe(false);
    expect(versionSelect.questions).toBeUndefined();
  });
});

describe('ClinicalService recommendations', () => {
  const baseVersion: any = {
    id: 'version-1', triageId: 'triage-1', createdById: 'physician-1', status: 'PENDING_REVIEW', finalSeverity: 'MODERATE', classificationConfirmedAt: new Date('2026-09-22T00:00:00.000Z'), classificationRevision: 3,
    classificationInputSnapshot: JSON.stringify({ input: { medicalHistory: 'Asma', allergies: null, currentMedications: null, chronicConditions: null, description: 'Tos', symptoms: [{ name: 'Tos' }], answers: [{ question: '¿Fiebre?', status: 'ANSWERED', answerText: 'Sí', observations: null }] } }),
    recommendationInputFingerprint: null, recommendationGeneratedAt: null, recommendations: [], questions: [{ id: 'q1', answer: { status: 'ANSWERED' } }], triage: { patient: { patientProfile: { medicalHistory: 'Asma', allergies: null, currentMedications: null, chronicConditions: null } } }, symptoms: [{ name: 'Tos' }], overrideJustification: 'Riesgo moderado', updatedAt: new Date('2026-09-22T00:00:00.000Z'), recommendationRevision: 0, recommendationCollectionRevision: 0,
  };
  const rec = { id: 'r1', triageVersionId: 'version-1', content: 'Control clínico y reevaluación documentada.', sortOrder: 1, isApproved: false, source: 'MANUAL', revision: 0, updatedAt: new Date('2026-09-22T00:00:00.000Z') };

  it('enforces eligibility, exact ownership/status and hides recommendations from assistants and patients', async () => {
    const prisma = { triageVersion: { findFirst: jest.fn().mockResolvedValue(null) }, user: { findFirst: jest.fn().mockResolvedValue({ id: 'patient-1', patientTriages: [] }) } };
    await expect(new ClinicalService(prisma as never).getRecommendations('other', 'version-1', 'physician-1')).rejects.toThrow('Versión de triaje no encontrada');
    expect(prisma.triageVersion.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'version-1', triageId: 'other', createdById: 'physician-1' } }));
    for (const bad of [{ ...baseVersion, status: 'IN_PROGRESS' }, { ...baseVersion, finalSeverity: null }, { ...baseVersion, classificationConfirmedAt: null }, { ...baseVersion, questions: [] }, { ...baseVersion, questions: [{ answer: { status: 'INVALID' } }] }]) {
      prisma.triageVersion.findFirst.mockResolvedValueOnce(bad);
      await expect(new ClinicalService(prisma as never).generateRecommendations('triage-1', 'version-1', 'physician-1', 0)).rejects.toThrow(/después de confirmar|completas/);
    }
    await new ClinicalService(prisma as never).getPatient('patient-1', 'ASSISTANT');
    const versionSelect = prisma.user.findFirst.mock.calls[0][0].select.patientTriages.select.versions.select;
    expect(versionSelect.recommendationRevision).toBe(false);
    expect(versionSelect.recommendations).toBeUndefined();
  });

  it('generates from the confirmed snapshot, fingerprints input, claims leases, persists winners, caches completed output and cleans up on failure', async () => {
    const saved = { ...rec, source: 'MODEL' };
    const fingerprint = createHash('sha256').update(JSON.stringify({ classificationRevision: baseVersion.classificationRevision, classificationInputSnapshot: baseVersion.classificationInputSnapshot, classificationInputFingerprint: null, finalSeverity: baseVersion.finalSeverity, overrideJustification: baseVersion.overrideJustification })).digest('hex');
    const tx = { triageVersion: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) }, recommendation: { deleteMany: jest.fn(), createMany: jest.fn(), findMany: jest.fn().mockResolvedValue([saved]) } };
    const prisma = { triageVersion: { findFirst: jest.fn().mockResolvedValueOnce(baseVersion).mockResolvedValueOnce({ ...baseVersion, recommendationRevision: 1, recommendationCollectionRevision: 0, recommendations: [saved] }), updateMany: jest.fn().mockResolvedValue({ count: 1 }) }, recommendation: { findMany: jest.fn() }, $transaction: jest.fn((fn) => fn(tx)) };
    const llm = { recommend: jest.fn().mockResolvedValue({ recommendations: [{ content: saved.content, order: 1 }], raw: '{"recommendations":[]}', model: 'qwen-test' }) };
    const result = await new ClinicalService(prisma as never, llm as never).generateRecommendations('triage-1', 'version-1', 'physician-1', 0);
    expect(result.recommendationRevision).toBe(1);
    expect(llm.recommend).toHaveBeenCalledWith(expect.objectContaining({ medicalHistory: 'Asma', finalSeverity: 'MODERATE', justification: 'Riesgo moderado' }));
    expect(prisma.triageVersion.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ OR: expect.any(Array), classificationRevision: 3, status: 'PENDING_REVIEW', recommendationCollectionRevision: 0 }), data: expect.objectContaining({ recommendationClaimToken: expect.any(String), recommendationClaimedAt: expect.any(Date), recommendationClaimCollectionRevision: 0, recommendationClaimFingerprint: fingerprint }) }));
    expect(tx.triageVersion.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ recommendationCollectionRevision: 0, recommendationClaimCollectionRevision: 0, recommendationClaimFingerprint: fingerprint, recommendationClaimToken: expect.any(String) }) }));
    expect(tx.recommendation.deleteMany).toHaveBeenCalledWith({ where: { triageVersionId: 'version-1' } });
    expect(tx.recommendation.createMany).toHaveBeenCalledWith({ data: [{ triageVersionId: 'version-1', content: saved.content, sortOrder: 1, source: 'MODEL' }] });

    prisma.triageVersion.findFirst.mockResolvedValueOnce({ ...baseVersion, recommendationGeneratedAt: new Date(), recommendationInputFingerprint: fingerprint, recommendations: [saved] }).mockResolvedValueOnce({ ...baseVersion, recommendations: [saved] });
    await new ClinicalService(prisma as never, llm as never).generateRecommendations('triage-1', 'version-1', 'physician-1', 0);
    expect(llm.recommend).toHaveBeenCalledTimes(1);

    const busy = { ...prisma, triageVersion: { ...prisma.triageVersion, findFirst: jest.fn().mockResolvedValue(baseVersion), updateMany: jest.fn().mockResolvedValue({ count: 0 }) } };
    await expect(new ClinicalService(busy as never, llm as never).generateRecommendations('triage-1', 'version-1', 'physician-1', 0)).rejects.toThrow('Ya hay recomendaciones en generación');
    const failing = { ...prisma, triageVersion: { ...prisma.triageVersion, findFirst: jest.fn().mockResolvedValue(baseVersion), updateMany: jest.fn().mockResolvedValue({ count: 1 }) }, $transaction: prisma.$transaction };
    await expect(new ClinicalService(failing as never, { recommend: jest.fn().mockRejectedValue(new Error('offline')) } as never).generateRecommendations('triage-1', 'version-1', 'physician-1', 0)).rejects.toThrow('offline');
    expect(failing.triageVersion.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'version-1', recommendationClaimToken: expect.any(String) }, data: { recommendationClaimToken: null, recommendationClaimedAt: null, recommendationClaimFingerprint: null, recommendationClaimCollectionRevision: null } }));
  });

  it('does not persist recommendations when provider output is unsafe', async () => {
    const prisma = { triageVersion: { findFirst: jest.fn().mockResolvedValue(baseVersion), updateMany: jest.fn().mockResolvedValue({ count: 1 }) }, $transaction: jest.fn() };
    await expect(new ClinicalService(prisma as never, { recommend: jest.fn().mockResolvedValue({ recommendations: [{ content: 'Administre amoxicilina 500 mg cada 8 horas.', order: 1 }], raw: '{}', model: 'qwen' }) } as never).generateRecommendations('triage-1', 'version-1', 'physician-1', 0)).rejects.toThrow('recomendaciones no permitidas');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('applies CRUD/reorder/approval with collection and item optimistic conflicts, contiguous order and rollback-safe writes', async () => {
    const tx = { triageVersion: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) }, recommendation: { findFirst: jest.fn().mockResolvedValue(rec), create: jest.fn().mockResolvedValue({ ...rec, id: 'r2', sortOrder: 2 }), updateMany: jest.fn().mockResolvedValue({ count: 1 }), findUniqueOrThrow: jest.fn().mockResolvedValue({ ...rec, content: 'Recomendación actualizada segura.', revision: 1, isApproved: false }), deleteMany: jest.fn().mockResolvedValue({ count: 1 }), findMany: jest.fn().mockResolvedValue([{ ...rec, id: 'r2', sortOrder: 2, isApproved: true }]), update: jest.fn() } };
    const prisma = { triageVersion: { findFirst: jest.fn().mockResolvedValue(baseVersion) }, recommendation: { findFirst: jest.fn().mockResolvedValue(rec), findMany: jest.fn().mockResolvedValue([rec, { ...rec, id: 'r2', sortOrder: 2 }]) }, $transaction: jest.fn((fn) => fn(tx)) };
    const service = new ClinicalService(prisma as never);
    await service.addRecommendation('triage-1', 'version-1', 'physician-1', 'Recomendación manual segura.', 0);
    expect(tx.triageVersion.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: expect.objectContaining({ recommendationCollectionRevision: 0 }), data: { recommendationCollectionRevision: { increment: 1 } } }));
    expect(tx.recommendation.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ sortOrder: 2, source: 'MANUAL', createdById: 'physician-1', updatedById: 'physician-1' }) }));
    await service.editRecommendation('triage-1', 'version-1', 'r1', 'physician-1', 'Recomendación actualizada segura.', 0, rec.updatedAt.toISOString(), 1);
    expect(tx.recommendation.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: 'r1', revision: 0, updatedAt: rec.updatedAt }), data: expect.objectContaining({ isApproved: false, approvedById: null, approvedAt: null, revision: { increment: 1 } }) }));
    await service.approveRecommendation('triage-1', 'version-1', 'r1', 'physician-1', true, 0, rec.updatedAt.toISOString(), 2);
    expect(tx.recommendation.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ isApproved: true, approvedById: 'physician-1', revision: { increment: 1 } }) }));
    await service.deleteRecommendation('triage-1', 'version-1', 'r1', 'physician-1', 0, rec.updatedAt.toISOString(), 3);
    expect(tx.recommendation.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ sortOrder: -1 }) }));
    expect(tx.recommendation.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ sortOrder: 1, revision: { increment: 1 }, updatedById: 'physician-1' }) }));
    await service.reorderRecommendations('triage-1', 'version-1', 'physician-1', ['r2', 'r1'], 4);
    expect(tx.recommendation.update).toHaveBeenCalledWith({ where: { id: 'r2' }, data: { sortOrder: -1 } });
    expect(tx.recommendation.update).toHaveBeenCalledWith({ where: { id: 'r2' }, data: { sortOrder: 1, revision: { increment: 1 }, updatedById: 'physician-1' } });

    tx.triageVersion.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.addRecommendation('triage-1', 'version-1', 'physician-1', 'Otra recomendación segura.', 999)).rejects.toThrow('La colección cambió');
    tx.recommendation.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.editRecommendation('triage-1', 'version-1', 'r1', 'physician-1', 'Otra recomendación segura.', 0, rec.updatedAt.toISOString(), 5)).rejects.toThrow('La recomendación cambió');
    await expect(service.reorderRecommendations('triage-1', 'version-1', 'physician-1', ['r1'], 5)).rejects.toThrow('El orden de las recomendaciones cambió');
  });

  it('rejects unsafe manual add/edit before persistence so approved content and audit remain unchanged', async () => {
    const prisma = { triageVersion: { findFirst: jest.fn().mockResolvedValue(baseVersion) }, recommendation: { findFirst: jest.fn().mockResolvedValue({ ...rec, isApproved: true, approvedById: 'physician-1', approvedAt: new Date('2026-09-22T01:00:00.000Z') }) }, $transaction: jest.fn() };
    const service = new ClinicalService(prisma as never);
    await expect(service.addRecommendation('triage-1', 'version-1', 'physician-1', 'Administre amoxicilina 500 mg cada 8 horas.', 0)).rejects.toThrow('reglas de seguridad');
    await expect(service.editRecommendation('triage-1', 'version-1', 'r1', 'physician-1', 'Tome paracetamol 500 mg cada 8 horas.', 0, rec.updatedAt.toISOString(), 0)).rejects.toThrow('reglas de seguridad');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('lets physician edits win over stale generation when collection revision changes during provider call', async () => {
    const tx = { triageVersion: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) }, recommendation: { deleteMany: jest.fn(), createMany: jest.fn() } };
    const prisma = { triageVersion: { findFirst: jest.fn().mockResolvedValue(baseVersion), updateMany: jest.fn().mockResolvedValue({ count: 1 }) }, $transaction: jest.fn((fn) => fn(tx)) };
    const llm = { recommend: jest.fn().mockResolvedValue({ recommendations: [{ content: 'Control clínico y reevaluación según evolución documentada.', order: 1 }], raw: '{}', model: 'qwen-test' }) };
    await expect(new ClinicalService(prisma as never, llm as never).generateRecommendations('triage-1', 'version-1', 'physician-1', 0)).rejects.toThrow('La versión cambió');
    expect(tx.recommendation.deleteMany).not.toHaveBeenCalled();
    expect(tx.recommendation.createMany).not.toHaveBeenCalled();
    expect(prisma.triageVersion.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { id: 'version-1', recommendationClaimToken: expect.any(String) }, data: expect.objectContaining({ recommendationClaimToken: null }) }));
  });

  it('lets completed generation advance collection revision so stale physician edits conflict', async () => {
    const saved = { ...rec, source: 'MODEL' };
    const tx = { triageVersion: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) }, recommendation: { deleteMany: jest.fn(), createMany: jest.fn(), findMany: jest.fn().mockResolvedValue([saved]) } };
    const prisma = { triageVersion: { findFirst: jest.fn().mockResolvedValueOnce(baseVersion).mockResolvedValueOnce({ ...baseVersion, recommendationRevision: 1, recommendationCollectionRevision: 1, recommendations: [saved] }).mockResolvedValue(baseVersion), updateMany: jest.fn().mockResolvedValue({ count: 1 }) }, recommendation: { findFirst: jest.fn().mockResolvedValue(rec) }, $transaction: jest.fn((fn) => fn(tx)) };
    const llm = { recommend: jest.fn().mockResolvedValue({ recommendations: [{ content: saved.content, order: 1 }], raw: '{}', model: 'qwen-test' }) };
    await new ClinicalService(prisma as never, llm as never).generateRecommendations('triage-1', 'version-1', 'physician-1', 0);
    tx.triageVersion.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(new ClinicalService(prisma as never).editRecommendation('triage-1', 'version-1', 'r1', 'physician-1', 'Control clínico actualizado y seguimiento documentado.', 0, rec.updatedAt.toISOString(), 0)).rejects.toThrow('La colección cambió');
  });

  it('invalidates upstream recommendation cache when classification inputs change', async () => {
    const tx = { triageVersion: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) }, triage: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) }, recommendation: { deleteMany: jest.fn() } };
    const prisma = { triageVersion: { findFirst: jest.fn().mockResolvedValue({ ...baseVersion, preliminarySeverity: 'MILD', updatedAt: baseVersion.updatedAt, recommendationInputFingerprint: 'old', questions: [{ questionText: '¿Fiebre?', answer: { status: 'ANSWERED', answerText: 'Sí', observations: null } }], symptoms: [{ name: 'Tos' }] }) }, $transaction: jest.fn((fn) => fn(tx)) };
    await new ClinicalService(prisma as never).confirmClassification('triage-1', 'version-1', 'physician-1', 'MILD', undefined, baseVersion.updatedAt.toISOString());
    expect(tx.triageVersion.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ recommendationInputFingerprint: null, recommendationRawOutput: null, recommendationModelName: null, recommendationGeneratedAt: null, recommendationRevision: { increment: 1 } }) }));
    expect(tx.recommendation.deleteMany).toHaveBeenCalledWith({ where: { triageVersionId: 'version-1' } });
  });
});
