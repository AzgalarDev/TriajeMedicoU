import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StaffClinicalWorkspace } from './StaffClinicalWorkspace';
import { createTriage, getClinicalPatient, searchPatients, updateClinicalProfile, type ClinicalPatient, type PatientSummary } from '../../lib/api';

vi.mock('../../lib/api', () => ({ searchPatients: vi.fn(), getClinicalPatient: vi.fn(), updateClinicalProfile: vi.fn(), createTriage: vi.fn() }));

const summary: PatientSummary = { id: 'patient-1', fullName: 'Ana Pérez', nationalId: '12345', dateOfBirth: '1990-01-01T00:00:00.000Z' };
const patient: ClinicalPatient = { ...summary, sex: 'FEMALE', address: 'Calle 1', patientProfile: { medicalHistory: 'Asma', allergies: 'Sin alergias conocidas', currentMedications: 'Salbutamol', chronicConditions: 'Asma' }, patientTriages: [{ id: 'triage-1', status: 'APPROVED', createdAt: '2026-09-01T00:00:00.000Z', physician: { fullName: 'Médico Uno' }, versions: [{ status: 'APPROVED', symptoms: [{ name: 'Fiebre' }] }] }] };
const otherSummary: PatientSummary = { id: 'patient-2', fullName: 'Ben Gómez', nationalId: '67890', dateOfBirth: '1988-02-02T00:00:00.000Z' };
const otherPatient: ClinicalPatient = { ...patient, ...otherSummary, patientTriages: [] };

beforeEach(() => { vi.clearAllMocks(); });

describe('StaffClinicalWorkspace', () => {
  it('validates empty searches and does not call the API', async () => {
    const ui = userEvent.setup();
    render(<StaffClinicalWorkspace physician={false} />);

    await ui.click(screen.getByRole('button', { name: 'Buscar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('La búsqueda requiere CI o al menos 2 caracteres del nombre del paciente');
    expect(searchPatients).not.toHaveBeenCalled();
  });

  it('searches by CI or partial name and renders patient identity fields', async () => {
    vi.mocked(searchPatients).mockResolvedValue([summary]);
    vi.mocked(getClinicalPatient).mockResolvedValue(patient);
    const ui = userEvent.setup();
    render(<StaffClinicalWorkspace physician={false} />);

    await ui.type(screen.getByLabelText('CI o nombre parcial'), '12345');
    await ui.click(screen.getByRole('button', { name: 'Buscar' }));
    await ui.click(await screen.findByRole('button', { name: /Ana Pérez/ }));

    expect(searchPatients).toHaveBeenCalledWith('12345');
    expect(await screen.findByRole('heading', { name: 'Ana Pérez' })).toBeInTheDocument();
    expect(screen.getAllByText('CI: 12345 · Fecha de nacimiento: 1990-01-01')).toHaveLength(2);

    vi.mocked(searchPatients).mockClear().mockResolvedValue([summary]);
    await ui.clear(screen.getByLabelText('CI o nombre parcial'));
    await ui.type(screen.getByLabelText('CI o nombre parcial'), 'Ana');
    await ui.click(screen.getByRole('button', { name: 'Buscar' }));

    expect(searchPatients).toHaveBeenCalledWith('Ana');
  });

  it('renders cumulative clinical profile and triage history for assistants without edit controls', async () => {
    vi.mocked(searchPatients).mockResolvedValue([summary]);
    vi.mocked(getClinicalPatient).mockResolvedValue(patient);
    const ui = userEvent.setup();
    render(<StaffClinicalWorkspace physician={false} />);

    await ui.type(screen.getByLabelText('CI o nombre parcial'), 'Ana');
    await ui.click(screen.getByRole('button', { name: 'Buscar' }));
    await ui.click(await screen.findByRole('button', { name: /Ana Pérez/ }));

    expect(await screen.findAllByText('Asma')).toHaveLength(2);
    expect(screen.getByText(/Aprobado · 2026-09-01 · Dr. Médico Uno/)).toBeInTheDocument();
    expect(screen.getByText('Fiebre')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Actualizar perfil' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Guardar borrador en progreso' })).not.toBeInTheDocument();
  });

  it('lets physicians update clinical profile fields without dropping existing values', async () => {
    vi.mocked(searchPatients).mockResolvedValue([summary]);
    vi.mocked(getClinicalPatient).mockResolvedValue(patient);
    vi.mocked(updateClinicalProfile).mockResolvedValue({ ...patient.patientProfile!, allergies: 'Penicilina' });
    const ui = userEvent.setup();
    render(<StaffClinicalWorkspace physician />);

    await ui.type(screen.getByLabelText('CI o nombre parcial'), 'Ana');
    await ui.click(screen.getByRole('button', { name: 'Buscar' }));
    await ui.click(await screen.findByRole('button', { name: /Ana Pérez/ }));
    await ui.clear(await screen.findByLabelText('Alergias'));
    await ui.type(screen.getByLabelText('Alergias'), 'Penicilina');
    await ui.click(screen.getByRole('button', { name: 'Actualizar perfil' }));

    expect(updateClinicalProfile).toHaveBeenCalledWith('patient-1', { medicalHistory: 'Asma', allergies: 'Penicilina', currentMedications: 'Salbutamol', chronicConditions: 'Asma' });
    expect(await screen.findByRole('status')).toHaveTextContent('Perfil clínico actualizado.');
  });

  it('creates a new triage and refreshes history without overwriting prior triages', async () => {
    const refreshed = { ...patient, patientTriages: [{ id: 'triage-2', status: 'IN_PROGRESS', createdAt: '2026-09-11T00:00:00.000Z', physician: { fullName: 'Médico Uno' }, versions: [{ status: 'IN_PROGRESS', symptoms: [{ name: 'Tos' }] }] }, ...patient.patientTriages] };
    vi.mocked(searchPatients).mockResolvedValue([summary]);
    vi.mocked(getClinicalPatient).mockResolvedValueOnce(patient).mockResolvedValueOnce(refreshed);
    vi.mocked(createTriage).mockResolvedValue({});
    const ui = userEvent.setup();
    render(<StaffClinicalWorkspace physician />);

    await ui.type(screen.getByLabelText('CI o nombre parcial'), 'Ana');
    await ui.click(screen.getByRole('button', { name: 'Buscar' }));
    await ui.click(await screen.findByRole('button', { name: /Ana Pérez/ }));
    await ui.type(await screen.findByLabelText('Síntomas esenciales'), 'Tos');
    await ui.type(screen.getByLabelText('Descripción clínica'), 'Dos días');
    await ui.click(screen.getByRole('button', { name: 'Guardar borrador en progreso' }));

    expect(createTriage).toHaveBeenCalledWith('patient-1', { status: 'IN_PROGRESS', description: 'Dos días', symptoms: [{ name: 'Tos' }] }, expect.any(String));
    await waitFor(() => expect(screen.getByText(/En progreso · 2026-09-11/)).toBeInTheDocument());
    expect(screen.getByText(/Aprobado · 2026-09-01/)).toBeInTheDocument();
  });

  it('reuses the key after a committed POST whose response was lost', async () => {
    vi.mocked(searchPatients).mockResolvedValue([summary]);
    vi.mocked(getClinicalPatient).mockResolvedValue(patient);
    vi.mocked(createTriage).mockRejectedValueOnce(new Error('Tiempo de espera agotado')).mockResolvedValueOnce({});
    const ui = userEvent.setup(); render(<StaffClinicalWorkspace physician />);
    await ui.type(screen.getByLabelText('CI o nombre parcial'), 'Ana'); await ui.click(screen.getByRole('button', { name: 'Buscar' })); await ui.click(await screen.findByRole('button', { name: /Ana Pérez/ }));
    await ui.type(await screen.findByLabelText('Síntomas esenciales'), 'Tos'); await ui.click(screen.getByRole('button', { name: 'Guardar borrador en progreso' }));
    await screen.findByRole('alert'); await ui.click(screen.getByRole('button', { name: 'Guardar borrador en progreso' }));
    expect(createTriage).toHaveBeenCalledTimes(2); expect(vi.mocked(createTriage).mock.calls[0][2]).toBe(vi.mocked(createTriage).mock.calls[1][2]);
  });

  it('reuses the key when history refresh fails after a successful POST', async () => {
    vi.mocked(searchPatients).mockResolvedValue([summary]); vi.mocked(getClinicalPatient).mockResolvedValueOnce(patient).mockRejectedValueOnce(new Error('No se pudo actualizar el historial')).mockResolvedValueOnce(patient);
    vi.mocked(createTriage).mockResolvedValue({}); const ui = userEvent.setup(); render(<StaffClinicalWorkspace physician />);
    await ui.type(screen.getByLabelText('CI o nombre parcial'), 'Ana'); await ui.click(screen.getByRole('button', { name: 'Buscar' })); await ui.click(await screen.findByRole('button', { name: /Ana Pérez/ })); await ui.type(await screen.findByLabelText('Síntomas esenciales'), 'Tos');
    await ui.click(screen.getByRole('button', { name: 'Guardar borrador en progreso' })); await screen.findByRole('alert'); await ui.click(screen.getByRole('button', { name: 'Guardar borrador en progreso' }));
    expect(createTriage).toHaveBeenCalledTimes(2); expect(vi.mocked(createTriage).mock.calls[0][2]).toBe(vi.mocked(createTriage).mock.calls[1][2]);
  });

  it('ignores a second click while the triage request is saving', async () => {
    let resolveCreate: (value: unknown) => void = () => undefined;
    vi.mocked(searchPatients).mockResolvedValue([summary]);
    vi.mocked(getClinicalPatient).mockResolvedValue(patient);
    vi.mocked(createTriage).mockReturnValue(new Promise((resolve) => { resolveCreate = resolve; }));
    const ui = userEvent.setup();
    render(<StaffClinicalWorkspace physician />);
    await ui.type(screen.getByLabelText('CI o nombre parcial'), 'Ana');
    await ui.click(screen.getByRole('button', { name: 'Buscar' }));
    await ui.click(await screen.findByRole('button', { name: /Ana Pérez/ }));
    await ui.type(await screen.findByLabelText('Síntomas esenciales'), 'Tos');
    const submit = screen.getByRole('button', { name: 'Guardar borrador en progreso' });
    await ui.click(submit);
    expect(await screen.findByRole('button', { name: 'Guardando triaje...' })).toBeDisabled();
    await ui.click(submit);
    expect(createTriage).toHaveBeenCalledTimes(1);
    await act(async () => resolveCreate({}));
  });

  it('ignores stale concurrent search and patient responses', async () => {
    const firstSummary = { ...summary, id: 'patient-1', fullName: 'Old Patient' };
    const secondSummary = { ...summary, id: 'patient-2', fullName: 'New Patient', nationalId: '67890' };
    let resolveFirstSearch: (value: PatientSummary[]) => void = () => undefined;
    vi.mocked(searchPatients).mockReturnValueOnce(new Promise((resolve) => { resolveFirstSearch = resolve; })).mockResolvedValueOnce([secondSummary]);
    const ui = userEvent.setup();
    render(<StaffClinicalWorkspace physician={false} />);

    await ui.type(screen.getByLabelText('CI o nombre parcial'), 'Old');
    await ui.click(screen.getByRole('button', { name: 'Buscar' }));
    await ui.clear(screen.getByLabelText('CI o nombre parcial'));
    await ui.type(screen.getByLabelText('CI o nombre parcial'), 'New');
    await ui.click(screen.getByRole('button', { name: 'Buscar' }));
    expect(await screen.findByRole('button', { name: /New Patient/ })).toBeInTheDocument();
    resolveFirstSearch([firstSummary]);

    await waitFor(() => expect(screen.queryByRole('button', { name: /Old Patient/ })).not.toBeInTheDocument());

    let resolveFirstPatient: (value: ClinicalPatient) => void = () => undefined;
    vi.mocked(getClinicalPatient).mockReturnValueOnce(new Promise((resolve) => { resolveFirstPatient = resolve; })).mockResolvedValueOnce({ ...patient, ...secondSummary });
    await ui.click(screen.getByRole('button', { name: /New Patient/ }));
    await ui.click(screen.getByRole('button', { name: /New Patient/ }));
    expect(await screen.findByRole('heading', { name: 'New Patient' })).toBeInTheDocument();
    resolveFirstPatient({ ...patient, fullName: 'Old Patient' });

    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Old Patient' })).not.toBeInTheDocument());
  });

  it('does not let a stale patient detail response repopulate after a new or empty search', async () => {
    let resolvePatient: (value: ClinicalPatient) => void = () => undefined;
    vi.mocked(searchPatients).mockResolvedValueOnce([summary]).mockResolvedValueOnce([otherSummary]);
    vi.mocked(getClinicalPatient).mockReturnValueOnce(new Promise((resolve) => { resolvePatient = resolve; }));
    const ui = userEvent.setup();
    render(<StaffClinicalWorkspace physician={false} />);

    await ui.type(screen.getByLabelText('CI o nombre parcial'), 'Ana');
    await ui.click(screen.getByRole('button', { name: 'Buscar' }));
    await ui.click(await screen.findByRole('button', { name: /Ana Pérez/ }));
    await ui.clear(screen.getByLabelText('CI o nombre parcial'));
    await ui.type(screen.getByLabelText('CI o nombre parcial'), 'Ben');
    await ui.click(screen.getByRole('button', { name: 'Buscar' }));
    await act(async () => { resolvePatient(patient); });

    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Ana Pérez' })).not.toBeInTheDocument());
    expect(await screen.findByRole('button', { name: /Ben Gómez/ })).toBeInTheDocument();

    await ui.clear(screen.getByLabelText('CI o nombre parcial'));
    await ui.click(screen.getByRole('button', { name: 'Buscar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('La búsqueda requiere CI o al menos 2 caracteres del nombre del paciente');
    expect(screen.queryByRole('heading', { name: 'Ana Pérez' })).not.toBeInTheDocument();
  });

  it('does not let stale triage completion overwrite a newly selected patient', async () => {
    let resolveCreate: (value: unknown) => void = () => undefined;
    const refreshed = { ...patient, patientTriages: [{ id: 'triage-2', status: 'IN_PROGRESS', createdAt: '2026-09-11T00:00:00.000Z', physician: { fullName: 'Médico Uno' }, versions: [{ status: 'IN_PROGRESS', symptoms: [{ name: 'Tos' }] }] }, ...patient.patientTriages] };
    vi.mocked(searchPatients).mockResolvedValue([summary, otherSummary]);
    vi.mocked(getClinicalPatient).mockResolvedValueOnce(patient).mockResolvedValueOnce(otherPatient).mockResolvedValueOnce(refreshed);
    vi.mocked(createTriage).mockReturnValue(new Promise((resolve) => { resolveCreate = resolve; }));
    const ui = userEvent.setup();
    render(<StaffClinicalWorkspace physician />);

    await ui.type(screen.getByLabelText('CI o nombre parcial'), 'Ana');
    await ui.click(screen.getByRole('button', { name: 'Buscar' }));
    await ui.click(await screen.findByRole('button', { name: /Ana Pérez/ }));
    expect(await screen.findByRole('heading', { name: 'Ana Pérez' })).toBeInTheDocument();
    await ui.type(await screen.findByLabelText('Síntomas esenciales'), 'Tos');
    await ui.click(screen.getByRole('button', { name: 'Guardar borrador en progreso' }));
    await ui.click(screen.getByRole('button', { name: /Ben Gómez/ }));
    expect(await screen.findByRole('heading', { name: 'Ben Gómez' })).toBeInTheDocument();
    await act(async () => { resolveCreate({}); });

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Ben Gómez' })).toBeInTheDocument());
    expect(screen.queryByRole('heading', { name: 'Ana Pérez' })).not.toBeInTheDocument();
    expect(screen.queryByText(/En progreso · 2026-09-11/)).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
