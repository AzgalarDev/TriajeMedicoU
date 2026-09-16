import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PatientProfile } from './PatientProfile';
import { request, type PatientProfile as PatientProfileData } from '../../lib/api';

vi.mock('../../lib/api', () => ({ request: vi.fn() }));

const loadedProfile: PatientProfileData = { medicalHistory: 'Hipertensión controlada', allergies: 'Penicilina', currentMedications: 'Losartán', chronicConditions: 'Asma' };

beforeEach(() => { vi.clearAllMocks(); });

describe('PatientProfile', () => {
  it('loads and renders the patient clinical profile', async () => {
    vi.mocked(request).mockResolvedValueOnce(loadedProfile);

    render(<PatientProfile />);

    expect(screen.getByRole('status')).toHaveTextContent('Cargando perfil clínico…');
    expect(await screen.findByRole('heading', { name: 'Mi perfil clínico' })).toBeInTheDocument();
    expect(screen.getByLabelText('Antecedentes médicos')).toHaveValue('Hipertensión controlada');
    expect(screen.getByLabelText('Alergias')).toHaveValue('Penicilina');
    expect(screen.getByLabelText('Medicamentos actuales')).toHaveValue('Losartán');
    expect(screen.getByLabelText('Condiciones crónicas')).toHaveValue('Asma');
    expect(request).toHaveBeenCalledWith('/auth/patient-profile');
  });

  it('edits the profile and synchronizes the form with a successful save response', async () => {
    const savedProfile: PatientProfileData = { ...loadedProfile, allergies: '', currentMedications: 'Losartán 50mg' };
    vi.mocked(request).mockResolvedValueOnce(loadedProfile).mockResolvedValueOnce(savedProfile);
    const ui = userEvent.setup();

    render(<PatientProfile />);
    const allergies = await screen.findByLabelText('Alergias');
    await ui.clear(allergies);
    await ui.clear(screen.getByLabelText('Medicamentos actuales'));
    await ui.type(screen.getByLabelText('Medicamentos actuales'), 'Losartán 50mg');
    await ui.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Perfil actualizado correctamente.');
    expect(request).toHaveBeenLastCalledWith('/auth/patient-profile', { method: 'PATCH', body: JSON.stringify({ ...loadedProfile, allergies: '', currentMedications: 'Losartán 50mg' }) });
    await waitFor(() => expect(screen.getByLabelText('Alergias')).toHaveValue(''));
    expect(screen.getByLabelText('Medicamentos actuales')).toHaveValue('Losartán 50mg');
  });

  it('shows a user-visible error when the API fails', async () => {
    vi.mocked(request).mockRejectedValueOnce(new Error('No se pudo cargar el perfil clínico.'));

    render(<PatientProfile />);

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar el perfil clínico.');
  });
});
