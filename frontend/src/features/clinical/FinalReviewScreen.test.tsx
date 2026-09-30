import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthenticatedLanding } from '../auth/AuthenticatedLanding';
import { PatientGuidanceScreen } from './ClinicalScreens';
import { correctPublication, getClinicalPatient, getCurrentGuidance, getPublicationHistory, getRecommendations, publish } from '../../lib/api';

vi.mock('../../lib/api', () => ({
  request: vi.fn(), getClinicalPatient: vi.fn(), getRecommendations: vi.fn(), publish: vi.fn(), correctPublication: vi.fn(), getCurrentGuidance: vi.fn(), getPublicationHistory: vi.fn(),
}));

const physician = { id: 'physician-1', username: 'doctor', role: 'PHYSICIAN', status: 'ACTIVE' };
const patientUser = { id: 'patient-1', username: 'ana', role: 'PATIENT', status: 'ACTIVE' };
const clinicalPatient = { id: 'patient-1', fullName: 'Ana Pérez', nationalId: '12345', dateOfBirth: '1990-01-01T00:00:00.000Z', sex: 'FEMALE', patientProfile: null, patientTriages: [{ id: 'triage-1', status: 'PENDING_REVIEW', createdAt: '2026-09-22T00:00:00.000Z', physician: { fullName: 'Médico Uno' }, versions: [{ id: 'version-1', status: 'PENDING_REVIEW', finalSeverity: 'MODERATE', classificationRevision: 4, recommendationRevision: 4, recommendationCollectionRevision: 6, symptoms: [{ name: 'Tos' }] }] }] };

const renderRoute = (path: string, user = physician) => { window.history.pushState({}, '', path); return render(<AuthenticatedLanding user={user} onLogout={vi.fn()} />); };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getClinicalPatient).mockResolvedValue(clinicalPatient as never);
  vi.mocked(getPublicationHistory).mockResolvedValue({ triageId: 'triage-1', revisions: [] });
  vi.mocked(getRecommendations).mockResolvedValue({ triageId: 'triage-1', versionId: 'version-1', status: 'PENDING_REVIEW', finalSeverity: 'MODERATE', updatedAt: '2026-09-22T00:00:00.000Z', recommendationRevision: 4, recommendationCollectionRevision: 6, recommendations: [{ id: 'r1', content: 'Control clínico.', sortOrder: 1, isApproved: true, source: 'MODEL', revision: 2, updatedAt: '2026-09-22T00:00:00.000Z' }] });
});

describe('final review and publication workflow', () => {
  it('shows final review, distinguishes approval from publication, and publishes safely', async () => {
    const ui = userEvent.setup();
    vi.mocked(publish).mockResolvedValue({ publicationId: 'pub-1', revisionId: 'rev-1', snapshot: {}, contentHash: 'hash' });
    renderRoute('/pacientes/patient-1/triajes/triage-1/revision-final');
    expect(await screen.findByRole('heading', { name: 'Revisión final' })).toBeInTheDocument();
    expect(screen.getByText(/La aprobación individual no equivale a publicación/)).toBeInTheDocument();
    await ui.click(screen.getByRole('button', { name: 'Publicar' }));
    await ui.click(screen.getByRole('button', { name: 'Confirmar publicación' }));
    expect(publish).toHaveBeenCalledWith('triage-1', 'version-1', { expectedClinicalRevision: 4, expectedCollectionRevision: 6, expectedRecommendationRevision: 4 });
    expect(await screen.findByRole('status')).toHaveTextContent('Publicación completada.');
  });

  it('requires correction reason and keeps stale publication out of success state after conflict', async () => {
    const ui = userEvent.setup();
    vi.mocked(correctPublication).mockRejectedValue(Object.assign(new Error('La publicación cambió.'), { status: 409 }));
    vi.mocked(getPublicationHistory).mockResolvedValue({ triageId: 'triage-1', revisions: [{ publicationId: 'pub-1', revisionId: 'rev-1', revisionNumber: 1, publishedAt: '2026-09-22T00:00:00.000Z', severity: 'MODERATE', recommendations: ['Control clínico.'], supersedesRevisionId: null, contentHash: 'hash', actorId: 'physician-1', reason: null }] });
    renderRoute('/pacientes/patient-1/triajes/triage-1/revision-final');
    await screen.findByRole('heading', { name: 'Revisión final' });
    await ui.click(screen.getByRole('button', { name: 'Corregir publicación' }));
    await ui.click(screen.getByRole('button', { name: 'Ver historial inmutable' }));
    expect(await screen.findByText(/Historial de publicaciones/)).toBeInTheDocument();
    await ui.click(screen.getByRole('button', { name: 'Guardar corrección' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Indica el motivo');
    await ui.type(screen.getByLabelText('Motivo de la corrección'), 'Actualizar seguimiento');
    await ui.type(screen.getByLabelText('Recomendaciones corregidas'), 'Seguimiento actualizado.');
    await ui.click(screen.getByRole('button', { name: 'Guardar corrección' }));
    expect(correctPublication).toHaveBeenCalledWith('triage-1', 'version-1', expect.objectContaining({ expectedPublicationRevision: 1 }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Recarga la publicación antes de volver a intentarlo');
    expect(screen.queryByText('Publicación completada.')).not.toBeInTheDocument();
  });

  it('refreshes the authoritative publication revision after a successful correction', async () => {
    const ui = userEvent.setup();
    vi.mocked(getPublicationHistory)
      .mockResolvedValueOnce({ triageId: 'triage-1', revisions: [{ revisionNumber: 1 }] } as never)
      .mockResolvedValueOnce({ triageId: 'triage-1', revisions: [{ revisionNumber: 1 }, { revisionNumber: 2 }] } as never);
    vi.mocked(correctPublication).mockResolvedValue({ publicationId: 'pub-2', revisionId: 'rev-2', snapshot: {}, contentHash: 'hash-2' });
    renderRoute('/pacientes/patient-1/triajes/triage-1/revision-final');
    await screen.findByRole('heading', { name: 'Revisión final' });
    await ui.click(screen.getAllByRole('button', { name: 'Corregir publicación' })[0]);
    await ui.type(screen.getByLabelText('Motivo de la corrección'), 'Primera corrección');
    await ui.click(screen.getByRole('button', { name: 'Guardar corrección' }));
    expect(correctPublication).toHaveBeenLastCalledWith('triage-1', 'version-1', expect.objectContaining({ expectedPublicationRevision: 1 }));
    await screen.findByText('Corrección publicada.');
    await ui.click(screen.getByRole('button', { name: 'Corregir publicación' }));
    await ui.type(screen.getByLabelText('Motivo de la corrección'), 'Segunda corrección');
    await ui.click(screen.getByRole('button', { name: 'Guardar corrección' }));
    expect(correctPublication).toHaveBeenLastCalledWith('triage-1', 'version-1', expect.objectContaining({ expectedPublicationRevision: 2 }));
  });

  it('shows only published guidance to patient and does not request private history', async () => {
    vi.mocked(getCurrentGuidance).mockResolvedValue({ publicationId: 'pub-1', revisionId: 'rev-1', publishedAt: '2026-09-22T00:00:00.000Z', severity: 'MODERATE', recommendations: ['Control clínico.'] });
    renderRoute('/orientacion-clinica', patientUser);
    expect(await screen.findByText('Orientación clínica publicada')).toBeInTheDocument();
    expect(screen.getByText('Control clínico.')).toBeInTheDocument();
    expect(getPublicationHistory).not.toHaveBeenCalled();
  });

  it('shows the same published-only guidance route to an assistant without private history', async () => {
    vi.mocked(getCurrentGuidance).mockResolvedValue({ publicationId: 'pub-1', revisionId: 'rev-1', publishedAt: '2026-09-22T00:00:00.000Z', severity: 'MODERATE', recommendations: ['Control clínico.'] });
    renderRoute('/pacientes/patient-1/orientacion-clinica', { ...patientUser, id: 'assistant-1', role: 'ASSISTANT' });
    expect(await screen.findByText('Orientación clínica publicada')).toBeInTheDocument();
    expect(screen.getByText('Control clínico.')).toBeInTheDocument();
    expect(getPublicationHistory).not.toHaveBeenCalled();
  });

  it('clears guidance on patient change and ignores a late response from patient A', async () => {
    let resolveA!: (value: Awaited<ReturnType<typeof getCurrentGuidance>>) => void;
    let resolveB!: (value: Awaited<ReturnType<typeof getCurrentGuidance>>) => void;
    vi.mocked(getCurrentGuidance).mockImplementation((id) => new Promise(resolve => id === 'patient-a' ? (resolveA = resolve) : (resolveB = resolve)));
    const { rerender } = render(<PatientGuidanceScreen patientId="patient-a" />);
    resolveA({ publicationId: 'pub-a', revisionId: 'rev-a', publishedAt: '2026-09-22T00:00:00.000Z', severity: 'MILD', recommendations: ['Privada A'] });
    expect(await screen.findByText('Privada A')).toBeInTheDocument();
    rerender(<PatientGuidanceScreen patientId="patient-b" />);
    expect(screen.queryByText('Privada A')).not.toBeInTheDocument();
    resolveB({ publicationId: 'pub-b', revisionId: 'rev-b', publishedAt: '2026-09-22T00:00:00.000Z', severity: 'MODERATE', recommendations: ['Pública B'] });
    expect(await screen.findByText('Pública B')).toBeInTheDocument();
    expect(screen.queryByText('Privada A')).not.toBeInTheDocument();
  });
});
