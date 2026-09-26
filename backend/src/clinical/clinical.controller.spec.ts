import { CanActivate, ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { spanishValidationPipeOptions } from '../common/validation/spanish-validation';
import { ClinicalController } from './clinical.controller';
import { ClinicalService } from './clinical.service';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';

const triageId = '11111111-1111-4111-8111-111111111111';
const versionId = '22222222-2222-4222-8222-222222222222';
const recommendationId = '33333333-3333-4333-8333-333333333333';

describe('ClinicalController classification routes', () => {
  it('keeps classification endpoints physician-scoped through service user identity', async () => {
    const service = { getClassification: jest.fn(), classify: jest.fn(), confirmClassification: jest.fn() };
    const controller = new ClinicalController(service as never);
    await controller.classification(triageId, versionId, { id: 'physician-1' });
    await controller.classify(triageId, versionId, { id: 'physician-1' });
    await controller.confirm(triageId, versionId, { severity: 'MILD', expectedUpdatedAt: '2026-09-22T00:00:00.000Z' }, { id: 'physician-1' });
    expect(service.getClassification).toHaveBeenCalledWith(triageId, versionId, 'physician-1');
    expect(service.classify).toHaveBeenCalledWith(triageId, versionId, 'physician-1');
    expect(service.confirmClassification).toHaveBeenCalledWith(triageId, versionId, 'physician-1', 'MILD', undefined, '2026-09-22T00:00:00.000Z');
  });
});

describe('ClinicalController recommendation routes', () => {
  it('keeps every recommendation endpoint physician-scoped and forwards optimistic revisions', async () => {
    const service = { getRecommendations: jest.fn(), generateRecommendations: jest.fn(), addRecommendation: jest.fn(), editRecommendation: jest.fn(), deleteRecommendation: jest.fn(), reorderRecommendations: jest.fn(), approveRecommendation: jest.fn() };
    const controller = new ClinicalController(service as never);
    const user = { id: 'physician-1' };
    await controller.recommendations(triageId, versionId, user);
    await controller.generateRecommendations({ triageId, versionId }, { collectionRevision: 6 }, user);
    await controller.addRecommendation({ triageId, versionId }, { content: 'Manual segura', collectionRevision: 7 }, user);
    await controller.editRecommendation({ triageId, versionId, recommendationId }, { content: 'Editada segura', revision: 2, updatedAt: '2026-09-22T00:00:00.000Z', collectionRevision: 8 }, user);
    await controller.deleteRecommendation({ triageId, versionId, recommendationId }, { revision: 3, updatedAt: '2026-09-22T00:00:01.000Z', collectionRevision: 9 }, user);
    await controller.reorderRecommendations({ triageId, versionId }, { ids: [versionId, recommendationId], collectionRevision: 10 }, user);
    await controller.approveRecommendation({ triageId, versionId, recommendationId }, { approved: true, revision: 4, updatedAt: '2026-09-22T00:00:02.000Z', collectionRevision: 11 }, user);
    expect(service.getRecommendations).toHaveBeenCalledWith(triageId, versionId, 'physician-1');
    expect(service.generateRecommendations).toHaveBeenCalledWith(triageId, versionId, 'physician-1', 6);
    expect(service.addRecommendation).toHaveBeenCalledWith(triageId, versionId, 'physician-1', 'Manual segura', 7);
    expect(service.editRecommendation).toHaveBeenCalledWith(triageId, versionId, recommendationId, 'physician-1', 'Editada segura', 2, '2026-09-22T00:00:00.000Z', 8);
    expect(service.deleteRecommendation).toHaveBeenCalledWith(triageId, versionId, recommendationId, 'physician-1', 3, '2026-09-22T00:00:01.000Z', 9);
    expect(service.reorderRecommendations).toHaveBeenCalledWith(triageId, versionId, 'physician-1', [versionId, recommendationId], 10);
    expect(service.approveRecommendation).toHaveBeenCalledWith(triageId, versionId, recommendationId, 'physician-1', true, 4, '2026-09-22T00:00:02.000Z', 11);
  });
});

describe('ClinicalController recommendation HTTP validation', () => {
  let app: INestApplication;
  const service = { getRecommendations: jest.fn(), generateRecommendations: jest.fn(), addRecommendation: jest.fn(), editRecommendation: jest.fn(), deleteRecommendation: jest.fn(), reorderRecommendations: jest.fn(), approveRecommendation: jest.fn() };
  class TestGuard implements CanActivate { canActivate(context: ExecutionContext) { context.switchToHttp().getRequest().user = { id: 'physician-1', role: 'PHYSICIAN' }; return true; } }

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({ controllers: [ClinicalController], providers: [{ provide: ClinicalService, useValue: service }] }).overrideGuard(SessionAuthGuard).useClass(TestGuard).overrideGuard(RolesGuard).useClass(TestGuard).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe(spanishValidationPipeOptions()));
    await app.init();
  });

  afterEach(async () => { await app.close(); });

  it.each([
    ['post', `/clinical/triages/${triageId}/versions/${versionId}/recommendations/generate`, {}],
    ['post', `/clinical/triages/not-a-uuid/versions/${versionId}/recommendations`, { content: 'Recomendación manual segura.', collectionRevision: 0 }],
    ['post', `/clinical/triages/${triageId}/versions/${versionId}/recommendations`, { content: 'corta', collectionRevision: 0 }],
    ['patch', `/clinical/triages/${triageId}/versions/${versionId}/recommendations/${recommendationId}`, { content: 'Recomendación manual segura.', revision: 0, updatedAt: 'bad-date', collectionRevision: 0 }],
    ['delete', `/clinical/triages/${triageId}/versions/${versionId}/recommendations/${recommendationId}`, { revision: -1, updatedAt: '2026-09-22T00:00:00.000Z', collectionRevision: 0 }],
    ['put', `/clinical/triages/${triageId}/versions/${versionId}/recommendations/order`, { ids: [recommendationId, recommendationId], collectionRevision: 0 }],
    ['put', `/clinical/triages/${triageId}/versions/${versionId}/recommendations/${recommendationId}/approval`, { approved: 'yes', revision: 0, updatedAt: '2026-09-22T00:00:00.000Z', collectionRevision: 0 }],
  ])('returns 400 before service for malformed %s %s', async (method, url, body) => {
    await (request(app.getHttpServer()) as any)[method](url).send(body).expect(400);
    expect(Object.values(service).every((fn) => (fn as jest.Mock).mock.calls.length === 0)).toBe(true);
  });
});
