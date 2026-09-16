import { INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as cookieParser from 'cookie-parser';
import * as request from 'supertest';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RolesGuard } from './guards/roles.guard';
import { SessionAuthGuard } from './guards/session-auth.guard';
import { spanishValidationPipeOptions } from '../common/validation/spanish-validation';

describe('AuthController HTTP behavior', () => {
  let app: INestApplication;
  const auth = {
    register: jest.fn().mockResolvedValue({ token: 'register-token', user: { id: '1', username: 'patient', role: 'PATIENT' } }),
    login: jest.fn().mockResolvedValue({ token: 'login-token', user: { id: '1', username: 'patient', role: 'PATIENT' } }),
    provision: jest.fn().mockResolvedValue({ id: '2', username: 'doctor', role: 'PHYSICIAN', status: 'ACTIVE' }),
    recoverPassword: jest.fn().mockResolvedValue({ success: true }),
    logout: jest.fn().mockResolvedValue(undefined),
    getPatientProfile: jest.fn().mockResolvedValue({ medicalHistory: 'Hipertensión controlada', allergies: 'Penicilina', currentMedications: 'Losartán', chronicConditions: 'Asma' }),
    updatePatientProfile: jest.fn().mockResolvedValue({ medicalHistory: 'Hipertensión controlada', allergies: '', currentMedications: 'Losartán', chronicConditions: 'Asma' }), resetManagedPassword: jest.fn().mockResolvedValue({ success: true }), updateUserIdentity: jest.fn().mockResolvedValue({ id: '2', username: 'doctor', fullName: 'Doctor', nationalId: '123458', role: 'PHYSICIAN', status: 'ACTIVE' }),
    cookieOptions: jest.fn().mockReturnValue({ httpOnly: true, secure: false, sameSite: 'strict', maxAge: 1000, path: '/' }),
    findSession: jest.fn(async (token?: string) => {
      if (token === 'admin-token') return { user: { id: 'a', username: 'admin', role: 'ADMINISTRATOR', status: 'ACTIVE' } };
      if (token === 'patient-token') return { user: { id: 'p', username: 'patient', role: 'PATIENT', status: 'ACTIVE' } };
      throw new UnauthorizedException('invalid session');
    }),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [AuthController], providers: [SessionAuthGuard, RolesGuard, { provide: AuthService, useValue: auth }] }).compile();
    app = module.createNestApplication(); app.use(cookieParser()); app.useGlobalPipes(new ValidationPipe(spanishValidationPipeOptions())); await app.init();
  });
  afterAll(async () => app.close());
  beforeEach(() => jest.clearAllMocks());

  it('registers with 201 and an HttpOnly session cookie', async () => {
    const response = await request(app.getHttpServer()).post('/auth/register').send({ fullName: 'Patient', dateOfBirth: '1990-01-01', sex: 'MALE', nationalId: '123456', username: 'patient', password: 'Secret123', passwordConfirmation: 'Secret123' }).expect(201);
    expect(response.body).toEqual({ user: { id: '1', username: 'patient', role: 'PATIENT' } }); expect(response.headers['set-cookie'][0]).toContain('HttpOnly');
  });
  it('logs in and sets a session cookie', async () => { const response = await request(app.getHttpServer()).post('/auth/login').send({ username: 'patient', password: 'Secret123' }).expect(201); expect(response.headers['set-cookie'][0]).toContain('triage_session=login-token'); });
  it('reads the current user from the session cookie', async () => { const response = await request(app.getHttpServer()).get('/auth/session').set('Cookie', 'triage_session=patient-token').expect(200); expect(response.body.username).toBe('patient'); });
  it('revokes logout and clears the cookie', async () => { const response = await request(app.getHttpServer()).post('/auth/logout').set('Cookie', 'triage_session=patient-token').expect(201); expect(auth.logout).toHaveBeenCalledWith('patient-token'); expect(response.headers['set-cookie'][0]).toContain('Expires=Thu, 01 Jan 1970'); });
  it('rejects unauthenticated protected requests', async () => { await request(app.getHttpServer()).get('/auth/session').expect(401); });
  it('allows administrators and rejects non-admin provisioning', async () => { await request(app.getHttpServer()).post('/auth/users').set('Cookie', 'triage_session=admin-token').send({ fullName: 'Doctor', dateOfBirth: '1980-01-01', sex: 'MALE', nationalId: '123457', username: 'doctor', password: 'Secret123', role: 'PHYSICIAN' }).expect(201); await request(app.getHttpServer()).post('/auth/users').set('Cookie', 'triage_session=patient-token').send({ role: 'PHYSICIAN' }).expect(403); });
  it('returns Spanish 400 messages for invalid DTOs', async () => {
    const response = await request(app.getHttpServer()).post('/auth/register').send({ username: 'bad user', password: 'short' }).expect(400);
    expect(response.body.message).toEqual(expect.arrayContaining(['nombre completo debe ser texto', 'usuario tiene un formato inválido', 'contraseña tiene un formato inválido']));
  });
  it('accepts a valid patient recovery request', async () => { await request(app.getHttpServer()).post('/auth/recover-password').send({ username: 'patient', nationalId: '12345', newPassword: 'NewSecret123' }).expect(201); expect(auth.recoverPassword).toHaveBeenCalled(); });
  it('rejects invalid recovery password input with Spanish validation', async () => {
    const response = await request(app.getHttpServer()).post('/auth/recover-password').send({ username: 'patient', nationalId: '12345', newPassword: 'short' }).expect(400);
    expect(response.body.message).toContain('nueva contraseña tiene un formato inválido');
  });
  it('allows only patients to read the clinical profile', async () => {
    const response = await request(app.getHttpServer()).get('/auth/patient-profile').set('Cookie', 'triage_session=patient-token').expect(200);
    expect(response.body).toEqual({ medicalHistory: 'Hipertensión controlada', allergies: 'Penicilina', currentMedications: 'Losartán', chronicConditions: 'Asma' });
    expect(auth.getPatientProfile).toHaveBeenCalledWith('p');

    await request(app.getHttpServer()).get('/auth/patient-profile').set('Cookie', 'triage_session=admin-token').expect(403);
  });
  it('allows only patients to patch the clinical profile', async () => {
    const body = { allergies: '' };
    const response = await request(app.getHttpServer()).patch('/auth/patient-profile').set('Cookie', 'triage_session=patient-token').send(body).expect(200);
    expect(response.body).toEqual({ medicalHistory: 'Hipertensión controlada', allergies: '', currentMedications: 'Losartán', chronicConditions: 'Asma' });
    expect(auth.updatePatientProfile).toHaveBeenCalledWith('p', body);

    await request(app.getHttpServer()).patch('/auth/patient-profile').set('Cookie', 'triage_session=admin-token').send(body).expect(403);
  });
  it('validates patient profile patch payloads while accepting empty strings', async () => {
    const unknownResponse = await request(app.getHttpServer()).patch('/auth/patient-profile').set('Cookie', 'triage_session=patient-token').send({ allergies: '', unknown: 'ignored' }).expect(400);
    expect(unknownResponse.body.message).toContain('unknown no está permitido');
    const invalidTypeResponse = await request(app.getHttpServer()).patch('/auth/patient-profile').set('Cookie', 'triage_session=patient-token').send({ allergies: 42 }).expect(400);
    expect(invalidTypeResponse.body.message).toContain('alergias debe ser texto');
    await request(app.getHttpServer()).patch('/auth/patient-profile').set('Cookie', 'triage_session=patient-token').send({ allergies: '' }).expect(200);
    expect(auth.updatePatientProfile).toHaveBeenCalledWith('p', { allergies: '' });
  });
});
