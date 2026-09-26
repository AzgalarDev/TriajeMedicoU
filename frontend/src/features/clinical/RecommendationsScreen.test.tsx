import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthenticatedLanding } from '../auth/AuthenticatedLanding';
import { addRecommendation, approveRecommendation, deleteRecommendation, editRecommendation, generateRecommendations, getClinicalPatient, getRecommendations, reorderRecommendations, type ClinicalPatient, type Recommendation, type RecommendationCollection } from '../../lib/api';

vi.mock('../../lib/api', () => ({
  request: vi.fn(), searchPatients: vi.fn(), getClinicalPatient: vi.fn(), updateClinicalProfile: vi.fn(), createTriage: vi.fn(), generateQuestions: vi.fn(), answerQuestion: vi.fn(), generateClassification: vi.fn(), confirmClassification: vi.fn(),
  getRecommendations: vi.fn(), generateRecommendations: vi.fn(), addRecommendation: vi.fn(), editRecommendation: vi.fn(), deleteRecommendation: vi.fn(), reorderRecommendations: vi.fn(), approveRecommendation: vi.fn(),
}));

const user = { id: 'physician-1', username: 'doctor', role: 'PHYSICIAN', status: 'ACTIVE' };
const baseItem = (overrides: Partial<Recommendation> = {}): Recommendation => ({ id: 'r1', content: 'Control clínico y reevaluación documentada.', sortOrder: 1, isApproved: false, source: 'MODEL', revision: 2, updatedAt: '2026-09-22T00:00:00.000Z', ...overrides });
const patient = (status = 'PENDING_REVIEW', finalSeverity: string | null = 'MODERATE'): ClinicalPatient => ({ id: 'patient-1', fullName: 'Ana Pérez', nationalId: '12345', dateOfBirth: '1990-01-01T00:00:00.000Z', sex: 'FEMALE', address: 'Calle 1', patientProfile: null, patientTriages: [{ id: 'triage-1', status, createdAt: '2026-09-22T00:00:00.000Z', physician: { fullName: 'Médico Uno' }, versions: [{ id: 'version-1', status, finalSeverity, recommendationRevision: 4, recommendationCollectionRevision: 6, symptoms: [{ name: 'Tos' }], recommendations: [] }] }] });
const collection = (items: Recommendation[], revisions = { recommendationRevision: 4, recommendationCollectionRevision: 6 }): RecommendationCollection => ({ triageId: 'triage-1', versionId: 'version-1', status: 'PENDING_REVIEW', finalSeverity: 'MODERATE', updatedAt: '2026-09-22T00:00:00.000Z', ...revisions, recommendations: items });

function renderRoute(path = '/pacientes/patient-1/triajes/triage-1/recomendaciones', role = 'PHYSICIAN') {
  window.history.pushState({}, '', path);
  return render(<AuthenticatedLanding user={{ ...user, role }} onLogout={vi.fn()} />);
}

beforeEach(() => { vi.clearAllMocks(); window.history.pushState({}, '', '/'); vi.mocked(getClinicalPatient).mockResolvedValue(patient()); vi.mocked(getRecommendations).mockResolvedValue(collection([baseItem()])); });

describe('RecommendationsScreen routed workflow', () => {
  it('guards the route for assistants and shows a clinical CTA when recommendations are not eligible', async () => {
    renderRoute('/pacientes/patient-1/triajes/triage-1/recomendaciones', 'ASSISTANT');
    expect(await screen.findByRole('heading', { name: 'Hola, doctor' })).toBeInTheDocument();
    cleanup(); vi.clearAllMocks(); vi.mocked(getClinicalPatient).mockResolvedValue(patient('IN_PROGRESS', null));
    renderRoute();
    expect(await screen.findByRole('alert')).toHaveTextContent('solo están disponibles después de confirmar la severidad final');
    expect(getRecommendations).not.toHaveBeenCalled();
  });

  it('loads source labels, generates with loading/error feedback, and handles manual add/edit/delete/move/approval sequentially', async () => {
    const ui = userEvent.setup();
    const second = baseItem({ id: 'r2', content: 'Seguimiento clínico según signos de alarma.', sortOrder: 2, source: 'MANUAL', revision: 1, updatedAt: '2026-09-22T00:01:00.000Z' });
    vi.mocked(getRecommendations)
      .mockResolvedValueOnce(collection([baseItem()]))
      .mockResolvedValueOnce(collection([baseItem(), second], { recommendationRevision: 5, recommendationCollectionRevision: 7 }))
      .mockResolvedValueOnce(collection([baseItem(), second], { recommendationRevision: 5, recommendationCollectionRevision: 8 }))
      .mockResolvedValueOnce(collection([{ ...baseItem(), content: 'Control clínico actualizado y documentado.', revision: 3 }, second], { recommendationRevision: 5, recommendationCollectionRevision: 9 }))
      .mockResolvedValueOnce(collection([second, { ...baseItem(), sortOrder: 2 }], { recommendationRevision: 5, recommendationCollectionRevision: 10 }))
      .mockResolvedValueOnce(collection([{ ...second, isApproved: true, revision: 2 }, { ...baseItem(), sortOrder: 2 }], { recommendationRevision: 5, recommendationCollectionRevision: 11 }))
      .mockResolvedValueOnce(collection([{ ...second, isApproved: false, revision: 3 }, { ...baseItem(), sortOrder: 2 }], { recommendationRevision: 5, recommendationCollectionRevision: 12 }))
      .mockResolvedValueOnce(collection([{ ...baseItem(), sortOrder: 1 }], { recommendationRevision: 5, recommendationCollectionRevision: 13 }));
    vi.mocked(generateRecommendations).mockResolvedValue(collection([baseItem(), second], { recommendationRevision: 5, recommendationCollectionRevision: 7 }));
    vi.mocked(addRecommendation).mockResolvedValue(second); vi.mocked(editRecommendation).mockResolvedValue({ ...baseItem(), revision: 3 }); vi.mocked(reorderRecommendations).mockResolvedValue({ recommendations: [second, baseItem()] }); vi.mocked(approveRecommendation).mockResolvedValue({ ...second, isApproved: true, revision: 2 }); vi.mocked(deleteRecommendation).mockResolvedValue({ deleted: true });
    renderRoute();
    expect(await screen.findByText('Fuente: Modelo')).toBeInTheDocument();
    await ui.click(screen.getByRole('button', { name: 'Generar borradores' }));
    expect(generateRecommendations).toHaveBeenCalledWith('triage-1', 'version-1', 6);
    expect(await screen.findByText('Fuente: Manual')).toBeInTheDocument();
    await ui.type(screen.getByLabelText('Agregar recomendación manual'), 'Seguimiento clínico según signos de alarma.');
    await ui.click(screen.getByRole('button', { name: 'Agregar manual' }));
    expect(addRecommendation).toHaveBeenCalledWith('triage-1', 'version-1', 'Seguimiento clínico según signos de alarma.', 7);
    await ui.clear(screen.getByLabelText('Contenido de recomendación 1'));
    await ui.type(screen.getByLabelText('Contenido de recomendación 1'), 'Control clínico actualizado y documentado.');
    await ui.tab();
    expect(editRecommendation).toHaveBeenCalledWith('triage-1', 'version-1', 'r1', 'Control clínico actualizado y documentado.', 2, '2026-09-22T00:00:00.000Z', 8);
    await ui.click(screen.getByRole('button', { name: 'Bajar recomendación 1' }));
    expect(reorderRecommendations).toHaveBeenCalledWith('triage-1', 'version-1', ['r2', 'r1'], 9);
    await ui.click(screen.getAllByRole('button', { name: 'Aprobar' })[0]);
    expect(approveRecommendation).toHaveBeenCalledWith('triage-1', 'version-1', 'r2', true, 1, '2026-09-22T00:01:00.000Z', 10);
    await ui.click(await screen.findByRole('button', { name: 'Quitar aprobación' }));
    expect(approveRecommendation).toHaveBeenCalledWith('triage-1', 'version-1', 'r2', false, 2, '2026-09-22T00:01:00.000Z', 11);
    await ui.click(screen.getAllByRole('button', { name: 'Eliminar' })[0]);
    expect(deleteRecommendation).toHaveBeenCalledWith('triage-1', 'version-1', 'r2', 3, '2026-09-22T00:01:00.000Z', 12);
    expect(await screen.findByRole('status')).toHaveTextContent('Recomendación eliminada.');
  });

  it('preserves unsaved content and offers safe reload guidance on 409 conflicts', async () => {
    const ui = userEvent.setup();
    vi.mocked(addRecommendation).mockRejectedValue(Object.assign(new Error('La colección cambió.'), { status: 409 }));
    renderRoute();
    await screen.findByText('Fuente: Modelo');
    await ui.type(screen.getByLabelText('Agregar recomendación manual'), 'Texto manual seguro conservado.');
    await ui.click(screen.getByRole('button', { name: 'Agregar manual' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Conserva tu texto en pantalla');
    expect(screen.getByLabelText('Agregar recomendación manual')).toHaveValue('Texto manual seguro conservado.');
    expect(screen.getByRole('button', { name: 'Recargar recomendaciones guardadas' })).toBeEnabled();
  });

  it('keeps locked states and all-approved future-review state accessible', async () => {
    vi.mocked(getClinicalPatient).mockResolvedValue(patient('APPROVED', 'MODERATE'));
    vi.mocked(getRecommendations).mockResolvedValue(collection([baseItem({ isApproved: true })]));
    renderRoute();
    expect(await screen.findByText('La versión está bloqueada y no admite cambios.')).toBeInTheDocument();
    expect(screen.getByText('Todas las recomendaciones están aprobadas. Revisión final próximamente.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Generar borradores' })).toBeDisabled();
  });

  it('clears action busy state after a later sequential recommendation action', async () => {
    const ui = userEvent.setup();
    vi.mocked(getRecommendations).mockResolvedValueOnce(collection([baseItem({ id: 'fresh', content: 'Recomendación vigente segura.' })], { recommendationRevision: 8, recommendationCollectionRevision: 9 })).mockResolvedValueOnce(collection([baseItem({ id: 'fresh', isApproved: true, content: 'Recomendación vigente segura.' })], { recommendationRevision: 8, recommendationCollectionRevision: 10 }));
    vi.mocked(approveRecommendation).mockResolvedValue(baseItem({ id: 'fresh', isApproved: true, revision: 1, updatedAt: '2026-09-22T00:00:00.000Z' }));
    renderRoute();
    expect(await screen.findByDisplayValue('Recomendación vigente segura.')).toBeInTheDocument();
    await ui.click(await screen.findByRole('button', { name: 'Aprobar' }));
    expect(approveRecommendation).toHaveBeenCalledWith('triage-1', 'version-1', 'fresh', true, 2, '2026-09-22T00:00:00.000Z', 9);
    expect(await screen.findByRole('button', { name: 'Quitar aprobación' })).toBeEnabled();
    expect(within(screen.getAllByRole('list').at(-1)!).getByText('Aprobada')).toBeInTheDocument();
  });
});
