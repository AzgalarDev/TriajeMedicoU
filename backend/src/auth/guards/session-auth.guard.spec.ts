import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { SessionAuthGuard } from './session-auth.guard';

const context = (cookies: Record<string, string> = {}) => ({ switchToHttp: () => ({ getRequest: () => ({ cookies }) }) } as ExecutionContext);

describe('SessionAuthGuard', () => {
  it.each(['missing', 'invalid', 'expired', 'revoked'])('rejects %s sessions', async () => {
    const auth = { findSession: jest.fn().mockRejectedValue(new UnauthorizedException()) };
    await expect(new SessionAuthGuard(auth as never).canActivate(context({ triage_session: 'token' }))).rejects.toThrow(UnauthorizedException);
  });

  it('exposes a sanitized active user', async () => {
    const auth = { findSession: jest.fn().mockResolvedValue({ user: { id: '1', username: 'ana', role: 'PATIENT', status: 'ACTIVE', passwordHash: 'secret' } }) };
    const request = { cookies: { triage_session: 'token' } };
    const result = await new SessionAuthGuard(auth as never).canActivate({ switchToHttp: () => ({ getRequest: () => request }) } as never);
    expect(result).toBe(true);
    expect(request).toEqual({ cookies: { triage_session: 'token' }, user: { id: '1', username: 'ana', role: 'PATIENT', status: 'ACTIVE' } });
  });
});
