import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';

const dto = { fullName: 'Doctor Test', dateOfBirth: '1980-01-01', sex: 'MALE' as const, nationalId: '123456789', username: 'doctor.test', password: 'Secret123', role: 'PHYSICIAN' as const };

describe('AuthService provisioning', () => {
  it('hashes passwords and assigns the requested managed role', async () => {
    const prisma = { user: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: '1', fullName: dto.fullName, username: dto.username, role: dto.role, status: 'ACTIVE' }) } };
    const result = await new AuthService(prisma as never, new ConfigService()).provision(dto);
    const data = prisma.user.create.mock.calls[0][0].data;
    expect(result.role).toBe('PHYSICIAN');
    expect(data.passwordHash).not.toBe(dto.password);
    expect(await bcrypt.compare(dto.password, data.passwordHash)).toBe(true);
  });

  it('rejects duplicate username or CI', async () => {
    const prisma = { user: { findFirst: jest.fn().mockResolvedValue({ username: dto.username, nationalId: dto.nationalId }), create: jest.fn() } };
    await expect(new AuthService(prisma as never, new ConfigService()).provision(dto)).rejects.toThrow('El nombre de usuario ya existe');
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('forces public registration to PATIENT', async () => {
    const prisma = { session: { create: jest.fn() }, user: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: '1', username: 'patient', role: 'PATIENT' }) } };
    const register = { ...dto, username: 'patient', role: undefined, passwordConfirmation: dto.password };
    await new AuthService(prisma as never, new ConfigService()).register(register);
    expect(prisma.user.create.mock.calls[0][0].data.role).toBe('PATIENT');
  });
});

describe('AuthService security controls', () => {
  it('defaults cookies to secure in production', () => {
    const service = new AuthService({} as never, { get: (key: string, fallback?: string) => key === 'NODE_ENV' ? 'production' : fallback } as never);

    expect(service.cookieOptions().secure).toBe(true);
  });

  it('rejects insecure production cookie configuration', () => {
    const service = new AuthService({} as never, { get: (key: string, fallback?: string) => key === 'NODE_ENV' ? 'production' : key === 'COOKIE_SECURE' ? 'false' : fallback } as never);

    expect(() => service.cookieOptions()).toThrow('COOKIE_SECURE=false is not allowed');
  });

  it('revokes active sessions when an administrator disables a user', async () => {
    const updated = { id: 'user-2', username: 'staff', fullName: 'Staff', nationalId: '123', role: 'PHYSICIAN', status: 'BLOCKED' };
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue({ id: 'user-2' }), update: jest.fn().mockResolvedValue(updated) }, session: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) }, $transaction: jest.fn((ops) => Promise.all(ops)) };

    await expect(new AuthService(prisma as never, new ConfigService()).updateUserStatus('user-2', 'BLOCKED', 'admin-1')).resolves.toEqual(updated);

    expect(prisma.session.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'user-2', revokedAt: null } }));
  });
});

describe('AuthService patient profile', () => {
  const select = { medicalHistory: true, allergies: true, currentMedications: true, chronicConditions: true };

  it('reads or creates a profile for the current patient only', async () => {
    const profile = { medicalHistory: null, allergies: null, currentMedications: null, chronicConditions: null };
    const prisma = { patientProfile: { upsert: jest.fn().mockResolvedValue(profile) } };

    await expect(new AuthService(prisma as never, new ConfigService()).getPatientProfile('patient-1')).resolves.toEqual(profile);

    expect(prisma.patientProfile.upsert).toHaveBeenCalledWith({ where: { userId: 'patient-1' }, create: { userId: 'patient-1' }, update: {}, select });
  });

  it('applies partial updates without overwriting omitted clinical fields', async () => {
    const updated = { medicalHistory: 'Hipertensión', allergies: 'Penicilina', currentMedications: null, chronicConditions: null };
    const prisma = { patientProfile: { upsert: jest.fn().mockResolvedValue(updated) } };

    await expect(new AuthService(prisma as never, new ConfigService()).updatePatientProfile('patient-1', { medicalHistory: 'Hipertensión' })).resolves.toEqual(updated);

    expect(prisma.patientProfile.upsert).toHaveBeenCalledWith({ where: { userId: 'patient-1' }, create: { userId: 'patient-1', medicalHistory: 'Hipertensión' }, update: { medicalHistory: 'Hipertensión' }, select });
  });

  it('preserves empty strings so patients can clear clinical fields', async () => {
    const cleared = { medicalHistory: 'Hipertensión', allergies: '', currentMedications: 'Losartán', chronicConditions: 'Asma' };
    const prisma = { patientProfile: { upsert: jest.fn().mockResolvedValue(cleared) } };

    await expect(new AuthService(prisma as never, new ConfigService()).updatePatientProfile('patient-1', { allergies: '' })).resolves.toEqual(cleared);

    expect(prisma.patientProfile.upsert).toHaveBeenCalledWith({ where: { userId: 'patient-1' }, create: { userId: 'patient-1', allergies: '' }, update: { allergies: '' }, select });
  });
});
