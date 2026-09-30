import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCurrentGuidance, request } from './api';

describe('publication API corrective contracts', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('requests current guidance with credentials and maps status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'Forbidden', code: 'FORBIDDEN', details: { scope: 'patient' } }), { status: 403 })));
    await expect(getCurrentGuidance('patient-1')).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN', details: { scope: 'patient' } });
  });

  it.each([409, 422])('preserves %s conflict/validation status', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'invalid', code: 'CONTRACT' }), { status })));
    await expect(request('/clinical/test')).rejects.toMatchObject({ status });
  });
});
