import * as bcrypt from 'bcryptjs';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';

const dto = { username: 'patient', nationalId: '12345', newPassword: 'NewSecret123' };
function prisma(user: any) { return { user: { findUnique: jest.fn().mockResolvedValue(user), update: jest.fn().mockResolvedValue({}), }, session: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) }, $transaction: jest.fn((ops) => Promise.all(ops)) }; }

describe('patient password recovery', () => {
  it('rehashes the password and revokes active sessions', async () => { const db = prisma({ id: 'p1', username: 'patient', nationalId: '12345', role: 'PATIENT', status: 'ACTIVE', passwordHash: 'old' }); await expect(new AuthService(db as never, new ConfigService()).recoverPassword(dto)).resolves.toEqual({ success: true }); const hash = db.user.update.mock.calls[0][0].data.passwordHash; expect(await bcrypt.compare(dto.newPassword, hash)).toBe(true); expect(db.session.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'p1', revokedAt: null } })); });
  it.each([{ nationalId: 'wrong' }, { role: 'PHYSICIAN' }, { status: 'INACTIVE' }, { missing: true }])('rejects unsafe recovery with a generic error', async (override) => { const db = prisma(override.missing ? null : { id: 'p1', username: 'patient', nationalId: '12345', role: 'PATIENT', status: 'ACTIVE', ...override }); await expect(new AuthService(db as never, new ConfigService()).recoverPassword({ ...dto, nationalId: dto.nationalId })).rejects.toThrow('No se pudo restablecer'); expect(db.user.update).not.toHaveBeenCalled(); });
  it('throttles repeated public recovery attempts in memory', async () => { const db = prisma(null); const config = { get: (key: string, fallback?: string) => key === 'PASSWORD_RECOVERY_LIMIT' ? '2' : key === 'PASSWORD_RECOVERY_WINDOW_MINUTES' ? '15' : fallback }; const service = new AuthService(db as never, config as never); await expect(service.recoverPassword(dto)).rejects.toThrow('No se pudo restablecer'); await expect(service.recoverPassword(dto)).rejects.toThrow('No se pudo restablecer'); await expect(service.recoverPassword(dto)).rejects.toThrow('Demasiados intentos de recuperación de contraseña'); });
});
