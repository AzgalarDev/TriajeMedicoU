import { ForbiddenException } from '@nestjs/common';
import { ClinicalService } from './clinical.service';

describe('publication projections corrective TDD', () => {
  it('rejects a patient requesting another patient guidance', async () => {
    const service = new ClinicalService({} as never);
    await expect(service.getCurrentGuidance('patient-2', 'patient-1', 'PATIENT')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns only the current revision for an authorized assistant', async () => {
    const prisma = { publication: { findFirst: jest.fn().mockResolvedValue({ id: 'pub-2', currentRevision: { id: 'rev-2', publishedAt: new Date('2026-09-26'), severity: 'MILD', recommendations: ['Second'] } }) } };
    const service = new ClinicalService(prisma as never);
    await expect(service.getCurrentGuidance('patient-1', 'assistant-1', 'ASSISTANT')).resolves.toMatchObject({ publicationId: 'pub-2', revisionId: 'rev-2', recommendations: ['Second'] });
    expect(prisma.publication.findFirst).toHaveBeenCalledWith(expect.objectContaining({ orderBy: [{ createdAt: 'desc' }, { updatedAt: 'desc' }] }));
  });
});
