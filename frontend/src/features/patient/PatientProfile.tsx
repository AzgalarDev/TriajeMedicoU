import * as React from 'react';
import { request, type PatientProfile as PatientProfileData } from '../../lib/api';

const fields: Array<[keyof PatientProfileData, string]> = [['medicalHistory', 'Antecedentes médicos'], ['allergies', 'Alergias'], ['currentMedications', 'Medicamentos actuales'], ['chronicConditions', 'Condiciones crónicas']];

export function PatientProfile() {
  const [profile, setProfile] = React.useState<PatientProfileData>({ medicalHistory: '', allergies: '', currentMedications: '', chronicConditions: '' });
  const [loading, setLoading] = React.useState(true); const [saving, setSaving] = React.useState(false); const [message, setMessage] = React.useState(''); const [error, setError] = React.useState('');
  React.useEffect(() => { request<PatientProfileData>('/auth/patient-profile').then(data => setProfile(data)).catch(err => setError(err.message)).finally(() => setLoading(false)); }, []);
  const save = async (event: React.FormEvent) => { event.preventDefault(); setSaving(true); setMessage(''); setError(''); try { const saved = await request<PatientProfileData>('/auth/patient-profile', { method: 'PATCH', body: JSON.stringify(profile) }); setProfile(saved); setMessage('Perfil actualizado correctamente.'); } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo actualizar el perfil.'); } finally { setSaving(false); } };
  if (loading) return <main className="mx-auto mt-8 w-full max-w-[680px] rounded-2xl bg-white p-8 shadow"><p role="status">Cargando perfil clínico…</p></main>;
  return <main className="mx-auto mt-8 w-full max-w-[680px] rounded-2xl bg-white p-6 shadow"><p className="mb-2 text-[11px] font-extrabold uppercase tracking-[.12em] text-[#147d7e]">Información clínica</p><h1 className="mb-6 text-2xl font-bold">Mi perfil clínico</h1><form onSubmit={save} className="grid gap-4">{fields.map(([key, label]) => <label key={key} className="grid gap-1 text-sm font-semibold text-[#31516a]">{label}<textarea aria-label={label} value={profile[key] ?? ''} onChange={event => setProfile(current => ({ ...current, [key]: event.target.value }))} rows={3} className="rounded-lg border border-[#b8cbd6] p-3 font-normal" /></label>)}<button disabled={saving} className="rounded-lg bg-[#147d7e] px-4 py-3 font-bold text-white disabled:opacity-60">{saving ? 'Guardando…' : 'Guardar cambios'}</button>{message && <p role="status" className="text-[#176b6b]">{message}</p>}{error && <p role="alert" className="text-red-700">{error}</p>}</form></main>;
}
