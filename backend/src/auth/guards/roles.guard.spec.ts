import { RolesGuard } from './roles.guard';

const context = (user: { role: string }, roles: string[]) => ({ switchToHttp: () => ({ getRequest: () => ({ user }) }), getHandler: () => ({ roles }), getClass: () => ({ roles }) } as never);

describe('RolesGuard', () => {
  it('allows a matching role', () => { const reflector = { getAllAndOverride: jest.fn().mockReturnValue(['ADMINISTRATOR']) }; expect(new RolesGuard(reflector as never).canActivate(context({ role: 'ADMINISTRATOR' }, []))).toBe(true); });
  it('rejects a mismatched role', () => { const reflector = { getAllAndOverride: jest.fn().mockReturnValue(['ADMINISTRATOR']) }; expect(() => new RolesGuard(reflector as never).canActivate(context({ role: 'PATIENT' }, []))).toThrow('Permisos insuficientes'); });
});
