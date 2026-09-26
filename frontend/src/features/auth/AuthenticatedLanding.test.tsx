import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthenticatedLanding } from './AuthenticatedLanding';
import { answerQuestion, confirmClassification, createTriage, generateClassification, generateQuestions, getClinicalPatient, searchPatients, type ClinicalPatient, type PatientSummary } from '../../lib/api';

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api');
  return { ...actual, request: vi.fn(), searchPatients: vi.fn(), getClinicalPatient: vi.fn(), updateClinicalProfile: vi.fn(), createTriage: vi.fn(), generateQuestions: vi.fn(), answerQuestion: vi.fn(), generateClassification: vi.fn(), confirmClassification: vi.fn() };
});

const physician = { id: 'physician-1', username: 'doctor', role: 'PHYSICIAN', status: 'ACTIVE' };
const assistant = { id: 'assistant-1', username: 'assistant', role: 'ASSISTANT', status: 'ACTIVE' };
const summary: PatientSummary = { id: 'patient-1', fullName: 'Ana Pérez', nationalId: '12345', dateOfBirth: '1990-05-10T00:00:00.000Z' };
const patient: ClinicalPatient = {
  ...summary,
  sex: 'FEMALE',
  address: 'Calle 1',
  patientProfile: { medicalHistory: 'Hipertensión controlada', allergies: 'Penicilina', currentMedications: 'Losartán', chronicConditions: 'Asma' },
  patientTriages: [{ id: 'triage-1', status: 'IN_PROGRESS', createdAt: '2026-09-20T10:00:00.000Z', physician: { fullName: 'Dr. Rojas' }, versions: [{ id: 'version-1', status: 'DRAFT', symptoms: [{ name: 'Tos' }], questions: [{ id: 'question-1', priority: 1, questionText: '¿Tiene fiebre?' }] }] }],
};

beforeEach(() => {
  vi.resetAllMocks();
  sessionStorage.clear();
  window.history.replaceState({}, '', '/');
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'fixed-key') });
  vi.mocked(searchPatients).mockResolvedValue([summary]);
  vi.mocked(getClinicalPatient).mockResolvedValue(patient);
});

describe('AuthenticatedLanding routed clinical workflow', () => {
  it('loads the physician default route and navigates to Pacientes', async () => {
    const ui = userEvent.setup();
    render(<AuthenticatedLanding user={physician} onLogout={vi.fn()} />);
    expect(await screen.findByRole('heading', { name: 'Hola, doctor' })).toBeInTheDocument();
    await ui.click(screen.getByRole('link', { name: 'Pacientes' }));
    expect(await screen.findByRole('heading', { name: 'Pacientes' })).toBeInTheDocument();
  });

  it('searches, selects a patient, and reaches summary, existing profile, history, and new triage', async () => {
    const ui = userEvent.setup();
    render(<AuthenticatedLanding user={physician} onLogout={vi.fn()} />);
    await ui.click(await screen.findByRole('link', { name: 'Pacientes' }));
    await ui.type(screen.getByLabelText('CI o nombre parcial'), 'Ana');
    await ui.click(screen.getByRole('button', { name: 'Buscar' }));
    await ui.click(await screen.findByRole('link', { name: 'Abrir expediente' }));
    expect(await screen.findByRole('heading', { name: 'Resumen del paciente' })).toBeInTheDocument();
    await ui.click(screen.getByRole('button', { name: 'Perfil clínico' }));
    expect(await screen.findByRole('heading', { name: 'Perfil clínico' })).toBeInTheDocument();
    expect(screen.getByLabelText('Antecedentes médicos')).toHaveValue('Hipertensión controlada');
    await ui.click(screen.getByRole('button', { name: 'Historial' }));
    expect(await screen.findByRole('heading', { name: 'Historial clínico' })).toBeInTheDocument();
    expect(screen.getByText(/Tos/)).toBeInTheDocument();
    await ui.click(screen.getByRole('button', { name: 'Nuevo triaje' }));
    expect(await screen.findByRole('heading', { name: 'Nuevo triaje' })).toBeInTheDocument();
  });

  it('lets the physician reach the exact triage questions route', async () => {
    const ui = userEvent.setup();
    window.history.replaceState({}, '', '/pacientes/patient-1/historial');
    render(<AuthenticatedLanding user={physician} onLogout={vi.fn()} />);
    await ui.click(await screen.findByRole('button', { name: 'Ver preguntas' }));
    expect(await screen.findByRole('heading', { name: 'Preguntas clínicas' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/pacientes/patient-1/triajes/triage-1/preguntas');
  });

  it('keeps assistant profile and history read-only and hides mutation/question controls', async () => {
    const ui = userEvent.setup();
    window.history.replaceState({}, '', '/pacientes/patient-1/perfil');
    render(<AuthenticatedLanding user={assistant} onLogout={vi.fn()} />);
    expect(await screen.findByRole('heading', { name: 'Perfil clínico' })).toBeInTheDocument();
    expect(screen.getByLabelText('Antecedentes médicos')).toHaveAttribute('readonly');
    expect(screen.queryByRole('button', { name: 'Actualizar perfil' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nuevo triaje' })).not.toBeInTheDocument();
    await ui.click(screen.getByRole('button', { name: 'Historial' }));
    expect(await screen.findByRole('heading', { name: 'Historial clínico' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ver preguntas' })).not.toBeInTheDocument();
    window.history.pushState({}, '', '/pacientes/patient-1/nuevo-triaje');
    cleanup();
    render(<AuthenticatedLanding user={assistant} onLogout={vi.fn()} />);
    expect(await screen.findByRole('heading', { name: 'Hola, assistant' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Nuevo triaje' })).not.toBeInTheDocument();
    window.history.pushState({}, '', '/pacientes/patient-1/triajes/triage-1/preguntas');
    cleanup();
    render(<AuthenticatedLanding user={assistant} onLogout={vi.fn()} />);
    expect(await screen.findByRole('heading', { name: 'Hola, assistant' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Preguntas clínicas' })).not.toBeInTheDocument();
  });

  it('does not claim saved when createTriage POST fails', async () => {
    const ui = userEvent.setup();
    vi.mocked(createTriage).mockRejectedValue(new Error('Tiempo de espera agotado'));
    window.history.replaceState({}, '', '/pacientes/patient-1/nuevo-triaje');
    render(<AuthenticatedLanding user={physician} onLogout={vi.fn()} />);
    await screen.findByRole('heading', { name: 'Nuevo triaje' });
    await ui.type(screen.getByLabelText('Síntomas esenciales'), 'Fiebre');
    await ui.type(screen.getByLabelText('Descripción clínica'), 'Dos días');
    await ui.click(screen.getByRole('button', { name: 'Guardar triaje y continuar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo guardar el triaje: Tiempo de espera agotado');
    expect(screen.queryByText(/fue guardado/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Síntomas esenciales')).toHaveValue('Fiebre');
  });

  it('claims saved after successful POST plus failed refresh and preserves retry state and key', async () => {
    const ui = userEvent.setup();
    vi.mocked(createTriage).mockResolvedValue({ id: 'triage-2' });
    vi.mocked(getClinicalPatient).mockResolvedValueOnce(patient).mockRejectedValueOnce(new Error('Sin conexión')).mockResolvedValueOnce(patient);
    window.history.replaceState({}, '', '/pacientes/patient-1/nuevo-triaje');
    render(<AuthenticatedLanding user={physician} onLogout={vi.fn()} />);
    await screen.findByRole('heading', { name: 'Nuevo triaje' });
    await ui.type(screen.getByLabelText('Síntomas esenciales'), 'Fiebre');
    await ui.type(screen.getByLabelText('Descripción clínica'), 'Dos días');
    await ui.click(screen.getByRole('button', { name: 'Guardar triaje y continuar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('El triaje fue guardado, pero no se pudo actualizar el historial: Sin conexión');
    expect(screen.getByLabelText('Síntomas esenciales')).toHaveValue('Fiebre');
    const firstKey = vi.mocked(createTriage).mock.calls[0][2];
    await ui.click(screen.getByRole('button', { name: 'Guardar triaje y continuar' }));
    await waitFor(() => expect(createTriage).toHaveBeenCalledTimes(2));
    expect(vi.mocked(createTriage).mock.calls[1][2]).toBe(firstKey);
  });

  it('reuses the persisted triage idempotency key after remount with identical intent', async () => {
    const ui = userEvent.setup();
    vi.mocked(createTriage).mockRejectedValue(new Error('Tiempo de espera agotado'));
    vi.mocked(crypto.randomUUID).mockReturnValueOnce('00000000-0000-4000-8000-000000000001');
    window.history.replaceState({}, '', '/pacientes/patient-1/nuevo-triaje');
    const first = render(<AuthenticatedLanding user={physician} onLogout={vi.fn()} />);
    await screen.findByRole('heading', { name: 'Nuevo triaje' });
    await ui.type(screen.getByLabelText('Síntomas esenciales'), 'Fiebre');
    await ui.type(screen.getByLabelText('Descripción clínica'), 'Dos días');
    await ui.click(screen.getByRole('button', { name: 'Guardar triaje y continuar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo guardar el triaje');
    first.unmount();
    render(<AuthenticatedLanding user={physician} onLogout={vi.fn()} />);
    await screen.findByRole('heading', { name: 'Nuevo triaje' });
    await ui.type(screen.getByLabelText('Síntomas esenciales'), 'Fiebre');
    await ui.type(screen.getByLabelText('Descripción clínica'), 'Dos días');
    await ui.click(screen.getByRole('button', { name: 'Guardar triaje y continuar' }));
    await waitFor(() => expect(createTriage).toHaveBeenCalledTimes(2));
    expect(vi.mocked(createTriage).mock.calls[1][2]).toBe('00000000-0000-4000-8000-000000000001');
  });

  it('rotates the persisted triage idempotency key when intent changes', async () => {
    const ui = userEvent.setup();
    vi.mocked(createTriage).mockRejectedValue(new Error('Tiempo de espera agotado'));
    vi.mocked(crypto.randomUUID).mockReturnValueOnce('00000000-0000-4000-8000-000000000002').mockReturnValueOnce('00000000-0000-4000-8000-000000000003');
    window.history.replaceState({}, '', '/pacientes/patient-1/nuevo-triaje');
    render(<AuthenticatedLanding user={physician} onLogout={vi.fn()} />);
    await screen.findByRole('heading', { name: 'Nuevo triaje' });
    await ui.type(screen.getByLabelText('Síntomas esenciales'), 'Fiebre');
    await ui.click(screen.getByRole('button', { name: 'Guardar triaje y continuar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo guardar');
    await ui.type(screen.getByLabelText('Síntomas esenciales'), '{selectall}Fiebre alta');
    await ui.click(screen.getByRole('button', { name: 'Guardar triaje y continuar' }));
    await waitFor(() => expect(createTriage).toHaveBeenCalledTimes(2));
    expect(vi.mocked(createTriage).mock.calls[0][2]).toBe('00000000-0000-4000-8000-000000000002');
    expect(vi.mocked(createTriage).mock.calls[1][2]).toBe('00000000-0000-4000-8000-000000000003');
  });

  it('clears the persisted triage idempotency key after confirmed save and refresh', async () => {
    const ui = userEvent.setup();
    vi.mocked(crypto.randomUUID).mockReturnValueOnce('00000000-0000-4000-8000-000000000004');
    vi.mocked(createTriage).mockResolvedValue({ id: 'triage-new' });
    window.history.replaceState({}, '', '/pacientes/patient-1/nuevo-triaje');
    render(<AuthenticatedLanding user={physician} onLogout={vi.fn()} />);
    await screen.findByRole('heading', { name: 'Nuevo triaje' });
    await ui.type(screen.getByLabelText('Síntomas esenciales'), 'Fiebre');
    await ui.click(screen.getByRole('button', { name: 'Guardar triaje y continuar' }));
    await waitFor(() => expect(window.location.pathname).toBe('/pacientes/patient-1/triajes/triage-new/preguntas'));
    expect(sessionStorage.getItem('triajemedicou.triage-intent.patient-1')).toBeNull();
  });

  it('keeps patient context and active contextual navigation visible on every physician route', async () => {
    const ui = userEvent.setup();
    window.history.replaceState({}, '', '/pacientes/patient-1/resumen');
    render(<AuthenticatedLanding user={physician} onLogout={vi.fn()} />);
    expect(await screen.findByRole('region', { name: 'Paciente seleccionado' })).toHaveTextContent('Ana Pérez');
    expect(screen.getByRole('region', { name: 'Paciente seleccionado' })).toHaveTextContent('CI: 12345');
    expect(screen.getByRole('button', { name: 'Resumen' })).toHaveAttribute('aria-current', 'page');
    await ui.click(screen.getByRole('button', { name: 'Historial' }));
    expect(await screen.findByRole('heading', { name: 'Historial clínico' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Historial' })).toHaveAttribute('aria-current', 'page');
    await ui.click(screen.getByRole('button', { name: 'Nuevo triaje' }));
    expect(await screen.findByRole('heading', { name: 'Nuevo triaje' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Ruta clínica' })).toHaveTextContent('Ana Pérez');
  });

  it('navigates to the exact questions route after a successful triage save', async () => {
    const ui = userEvent.setup();
    vi.mocked(createTriage).mockResolvedValue({ id: 'triage-new' });
    vi.mocked(getClinicalPatient).mockResolvedValueOnce(patient).mockResolvedValueOnce({ ...patient, patientTriages: [{ ...patient.patientTriages[0], id: 'triage-new' }] });
    window.history.replaceState({}, '', '/pacientes/patient-1/nuevo-triaje');
    render(<AuthenticatedLanding user={physician} onLogout={vi.fn()} />);
    await screen.findByRole('heading', { name: 'Nuevo triaje' });
    await ui.type(screen.getByLabelText('Síntomas esenciales'), 'Fiebre');
    await ui.click(screen.getByRole('button', { name: 'Guardar triaje y continuar' }));
    await waitFor(() => expect(window.location.pathname).toBe('/pacientes/patient-1/triajes/triage-new/preguntas'));
    expect(await screen.findByRole('heading', { name: 'Preguntas clínicas' })).toBeInTheDocument();
    expect(screen.getByText(/asistencia local solo propone preguntas/i)).toBeInTheDocument();
  });

  it('shows question generation, answer feedback, and approved controls as locked', async () => {
    const ui = userEvent.setup();
    vi.mocked(generateQuestions).mockResolvedValue({ questions: [{ id: 'question-2', priority: 2, questionText: '¿Ha tenido fiebre?' }] });
    vi.mocked(answerQuestion).mockResolvedValue({ status: 'ANSWERED', answerText: 'Sí', observations: 'Observado', updatedAt: '2026-09-21T00:00:00.000Z' });
    window.history.replaceState({}, '', '/pacientes/patient-1/triajes/triage-1/preguntas');
    render(<AuthenticatedLanding user={physician} onLogout={vi.fn()} />);
    expect(await screen.findByRole('heading', { name: 'Preguntas clínicas' })).toBeInTheDocument();
    await ui.click(screen.getByRole('button', { name: 'Generar preguntas' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Preguntas clínicas generadas.');
    const answerButton = screen.getByRole('button', { name: 'Guardar respuesta' });
    await ui.click(answerButton);
    expect(await screen.findByRole('status')).toHaveTextContent('Respuesta guardada.');
    const approved = { ...patient, patientTriages: [{ ...patient.patientTriages[0], versions: [{ ...patient.patientTriages[0].versions[0], status: 'APPROVED', questions: [{ id: 'question-1', priority: 1, questionText: '¿Tiene fiebre?' }] }] }] };
    vi.mocked(getClinicalPatient).mockResolvedValueOnce(approved);
    window.history.replaceState({}, '', '/pacientes/patient-1/triajes/triage-1/preguntas');
    cleanup();
    render(<AuthenticatedLanding user={physician} onLogout={vi.fn()} />);
    expect(await screen.findByRole('button', { name: 'Versión bloqueada' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Respuesta bloqueada' })).toBeDisabled();
  });

  it('locks pending-review question controls with explicit future-version guidance', async () => {
    const pending = { ...patient, patientTriages: [{ ...patient.patientTriages[0], versions: [{ ...patient.patientTriages[0].versions[0], status: 'PENDING_REVIEW', questions: [{ id: 'question-1', priority: 1, questionText: '¿Tiene fiebre?', answer: { status: 'ANSWERED', answerText: 'Sí', updatedAt: '2026-09-22T00:00:00.000Z' } }] }] }] };
    vi.mocked(getClinicalPatient).mockResolvedValueOnce(pending);
    window.history.replaceState({}, '', '/pacientes/patient-1/triajes/triage-1/preguntas');
    render(<AuthenticatedLanding user={physician} onLogout={vi.fn()} />);
    expect(await screen.findByRole('heading', { name: 'Preguntas clínicas' })).toBeInTheDocument();
    expect(screen.getByText('La clasificación ya fue confirmada. Las correcciones requieren crear una nueva versión futura.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Versión bloqueada' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Respuesta bloqueada' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Continuar a clasificación' })).toBeDisabled();
  });

  it('keeps generated answered questions and uses the latest answer timestamp on the next save', async () => {
    const ui = userEvent.setup();
    vi.mocked(generateQuestions).mockResolvedValue({ questions: [{ id: 'question-1', priority: 1, questionText: '¿Tiene fiebre?', answer: { status: 'ANSWERED', answerText: 'Sí', observations: 'Inicial', updatedAt: '2026-09-20T00:00:00.000Z' } }] });
    vi.mocked(answerQuestion).mockResolvedValueOnce({ status: 'ANSWERED', answerText: 'Sí', observations: 'Nuevo', updatedAt: '2026-09-21T00:00:00.000Z' }).mockResolvedValueOnce({ status: 'ANSWERED', answerText: 'Sí', observations: 'Nuevo', updatedAt: '2026-09-22T00:00:00.000Z' });
    window.history.replaceState({}, '', '/pacientes/patient-1/triajes/triage-1/preguntas');
    render(<AuthenticatedLanding user={physician} onLogout={vi.fn()} />);
    expect(await screen.findByRole('heading', { name: 'Preguntas clínicas' })).toBeInTheDocument();
    await ui.click(screen.getByRole('button', { name: 'Generar preguntas' }));
    expect(await screen.findByDisplayValue('Sí')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Inicial')).toBeInTheDocument();
    await ui.click(screen.getByRole('button', { name: 'Guardar respuesta' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Respuesta guardada.');
    expect(answerQuestion).toHaveBeenNthCalledWith(1, 'question-1', expect.objectContaining({ expectedUpdatedAt: '2026-09-20T00:00:00.000Z' }));
    await ui.click(screen.getByRole('button', { name: 'Guardar respuesta' }));
    await waitFor(() => expect(answerQuestion).toHaveBeenCalledTimes(2));
    expect(answerQuestion).toHaveBeenNthCalledWith(2, 'question-1', expect.objectContaining({ expectedUpdatedAt: '2026-09-21T00:00:00.000Z' }));
  });

  it('enables the classification CTA only when exact loaded questions all have valid persisted answers and shows the workflow stepper', async () => {
    const ui = userEvent.setup();
    window.history.replaceState({}, '', '/pacientes/patient-1/triajes/triage-1/preguntas');
    render(<AuthenticatedLanding user={physician} onLogout={vi.fn()} />);
    expect(await screen.findByRole('heading', { name: 'Preguntas clínicas' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Pasos del triaje' })).toHaveTextContent('Información inicial');
    expect(screen.getByText('Preguntas y respuestas').closest('li')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByText('Recomendaciones').closest('li')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Revisión final').closest('li')).toHaveTextContent('Próximamente');
    const cta = screen.getByRole('button', { name: 'Continuar a clasificación' });
    expect(cta).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('Para continuar falta responder: ¿Tiene fiebre?');
    vi.mocked(answerQuestion).mockResolvedValue({ status: 'ANSWERED', answerText: 'Sí', observations: '', updatedAt: '2026-09-22T00:00:00.000Z' });
    await ui.type(screen.getByLabelText('Respuesta'), 'Sí');
    await ui.click(screen.getByRole('button', { name: 'Guardar respuesta' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Respuesta guardada.');
    expect(screen.getByRole('button', { name: 'Continuar a clasificación' })).toBeEnabled();
    await ui.click(screen.getByRole('button', { name: 'Continuar a clasificación' }));
    expect(window.location.pathname).toBe('/pacientes/patient-1/triajes/triage-1/clasificacion');
  });

  it('supports classification deep links, generation success/error, same-severity confirmation and override validation', async () => {
    const ui = userEvent.setup();
    const answered = { ...patient, patientTriages: [{ ...patient.patientTriages[0], versions: [{ ...patient.patientTriages[0].versions[0], updatedAt: '2026-09-22T00:00:00.000Z', questions: [{ id: 'question-1', priority: 1, questionText: '¿Tiene fiebre?', answer: { status: 'ANSWERED', answerText: 'Sí', updatedAt: '2026-09-22T00:00:00.000Z' } }] }] }] };
    vi.mocked(getClinicalPatient).mockResolvedValue(answered);
    vi.mocked(generateClassification).mockResolvedValue({ triageId: 'triage-1', versionId: 'version-1', status: 'IN_PROGRESS', preliminarySeverity: 'MODERATE', rationale: 'Fiebre persistente con tos requiere priorización moderada.', updatedAt: '2026-09-22T00:00:01.000Z' });
    vi.mocked(confirmClassification).mockResolvedValue({ triageId: 'triage-1', versionId: 'version-1', status: 'PENDING_REVIEW', preliminarySeverity: 'MODERATE' });
    window.history.replaceState({}, '', '/pacientes/patient-1/triajes/triage-1/clasificacion');
    render(<AuthenticatedLanding user={physician} onLogout={vi.fn()} />);
    expect(await screen.findByRole('heading', { name: 'Clasificación preliminar' })).toBeInTheDocument();
    expect(screen.getByText('Clasificación', { selector: 'li' })).toHaveAttribute('aria-current', 'step');
    await ui.click(screen.getByRole('button', { name: 'Generar clasificación' }));
    expect(await screen.findByText(/Fiebre persistente/)).toBeInTheDocument();
    await ui.click(screen.getByRole('button', { name: 'Confirmar clasificación' }));
    await waitFor(() => expect(confirmClassification).toHaveBeenCalledWith('triage-1', 'version-1', expect.objectContaining({ severity: 'MODERATE', expectedUpdatedAt: '2026-09-22T00:00:01.000Z' })));
    vi.mocked(confirmClassification).mockRejectedValueOnce(new Error('El cambio de severidad requiere una justificación válida.'));
    vi.mocked(getClinicalPatient).mockResolvedValueOnce({ ...answered, patientTriages: [{ ...answered.patientTriages[0], versions: [{ ...answered.patientTriages[0].versions[0], preliminarySeverity: 'MODERATE', classificationRationale: 'Fiebre persistente con tos requiere priorización moderada.' }] }] });
    window.history.replaceState({}, '', '/pacientes/patient-1/triajes/triage-1/clasificacion');
    cleanup();
    render(<AuthenticatedLanding user={physician} onLogout={vi.fn()} />);
    await ui.selectOptions(await screen.findByLabelText('Severidad final'), 'SEVERE');
    await ui.click(screen.getByRole('button', { name: 'Confirmar clasificación' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('justificación válida');
  });

  it('handles classification errors, approved/cancelled locks, assistant redirect and stale triage guard', async () => {
    const ui = userEvent.setup();
    vi.mocked(generateClassification).mockRejectedValue(new Error('Todas las preguntas deben tener una respuesta válida.'));
    window.history.replaceState({}, '', '/pacientes/patient-1/triajes/triage-1/clasificacion');
    render(<AuthenticatedLanding user={physician} onLogout={vi.fn()} />);
    await ui.click(await screen.findByRole('button', { name: 'Generar clasificación' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Todas las preguntas deben tener una respuesta válida.');
    const approved = { ...patient, patientTriages: [{ ...patient.patientTriages[0], versions: [{ ...patient.patientTriages[0].versions[0], status: 'APPROVED', preliminarySeverity: 'MILD', classificationRationale: 'Ya aprobada.' }] }] };
    vi.mocked(getClinicalPatient).mockResolvedValueOnce(approved);
    cleanup();
    render(<AuthenticatedLanding user={physician} onLogout={vi.fn()} />);
    expect(await screen.findByRole('button', { name: 'Versión bloqueada' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Confirmar clasificación' })).toBeDisabled();
    window.history.pushState({}, '', '/pacientes/patient-1/triajes/triage-1/clasificacion');
    cleanup();
    render(<AuthenticatedLanding user={assistant} onLogout={vi.fn()} />);
    expect(await screen.findByRole('heading', { name: 'Hola, assistant' })).toBeInTheDocument();
    expect(screen.queryByText('Clasificación preliminar')).not.toBeInTheDocument();
    vi.mocked(getClinicalPatient).mockResolvedValueOnce({ ...patient, patientTriages: [] });
    window.history.pushState({}, '', '/pacientes/patient-1/triajes/stale/clasificacion');
    cleanup();
    render(<AuthenticatedLanding user={physician} onLogout={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Triaje no encontrado.');
  });

  it('locks pending-review classification controls with explicit future-version guidance', async () => {
    const pending = { ...patient, patientTriages: [{ ...patient.patientTriages[0], versions: [{ ...patient.patientTriages[0].versions[0], status: 'PENDING_REVIEW', preliminarySeverity: 'MILD', classificationRationale: 'Clasificación ya confirmada.', updatedAt: '2026-09-22T00:00:00.000Z' }] }] };
    vi.mocked(getClinicalPatient).mockResolvedValueOnce(pending);
    window.history.replaceState({}, '', '/pacientes/patient-1/triajes/triage-1/clasificacion');
    render(<AuthenticatedLanding user={physician} onLogout={vi.fn()} />);
    expect(await screen.findByRole('heading', { name: 'Clasificación preliminar' })).toBeInTheDocument();
    expect(screen.getByText('La clasificación ya fue confirmada. Las correcciones requieren crear una nueva versión futura.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Versión bloqueada' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Confirmar clasificación' })).toBeDisabled();
  });
});
