import * as React from 'react';
import { createTriage, getClinicalPatient, searchPatients, updateClinicalProfile, type ClinicalPatient, type PatientProfile, type PatientSummary } from '../../lib/api';

const emptyProfile: PatientProfile = { medicalHistory: '', allergies: '', currentMedications: '', chronicConditions: '' };

const triageStatusLabels: Record<string, string> = {
  DRAFT: 'Borrador',
  IN_PROGRESS: 'En progreso',
  APPROVED: 'Aprobado',
  REJECTED: 'Rechazado',
};

export function StaffClinicalWorkspace({ physician }: { physician: boolean }) {
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<PatientSummary[]>([]);
  const [patient, setPatient] = React.useState<ClinicalPatient | null>(null);
  const [profileForm, setProfileForm] = React.useState<PatientProfile>(emptyProfile);
  const [error, setError] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [symptoms, setSymptoms] = React.useState('');
  const [description, setDescription] = React.useState('');
  const searchRequest = React.useRef(0);
  const patientRequest = React.useRef(0);
  const [savingTriage, setSavingTriage] = React.useState(false);
  const triageKey = React.useRef<{ intent: string; key: string } | null>(null);

  const syncPatient = (nextPatient: ClinicalPatient) => {
    setPatient(nextPatient);
    setProfileForm({ ...emptyProfile, ...nextPatient.patientProfile });
  };

  const clearPatient = () => {
    patientRequest.current += 1;
    setPatient(null);
    setProfileForm(emptyProfile);
  };

  const search = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = query.trim();
    setError('');
    setStatus('');
    clearPatient();
    if (!trimmed) {
      searchRequest.current += 1;
      setResults([]);
      setError('La búsqueda requiere CI o al menos 2 caracteres del nombre del paciente');
      return;
    }
    const requestId = ++searchRequest.current;
    try {
      const nextResults = await searchPatients(trimmed);
      if (requestId === searchRequest.current) setResults(nextResults);
    } catch (e) {
      if (requestId === searchRequest.current) setError((e as Error).message);
    }
  };

  const select = async (id: string) => {
    const requestId = ++patientRequest.current;
    setError('');
    setStatus('');
    try {
      const nextPatient = await getClinicalPatient(id);
      if (requestId === patientRequest.current) syncPatient(nextPatient);
    } catch (e) {
      if (requestId === patientRequest.current) setError((e as Error).message);
    }
  };

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!patient) return;
    setError('');
    setStatus('');
    try {
      const savedProfile = await updateClinicalProfile(patient.id, profileForm);
      setPatient({ ...patient, patientProfile: savedProfile });
      setProfileForm({ ...emptyProfile, ...savedProfile });
      setStatus('Perfil clínico actualizado.');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!patient) return;
    const patientId = patient.id;
    const requestId = patientRequest.current;
    if (savingTriage) return;
    const input = { status: 'IN_PROGRESS' as const, description, symptoms: symptoms.split('\n').map((name) => ({ name: name.trim() })).filter((symptom) => symptom.name) };
    const intent = JSON.stringify([patientId, input]);
    if (!triageKey.current || triageKey.current.intent !== intent) triageKey.current = { intent, key: crypto.randomUUID() };
    setSavingTriage(true);
    setError('');
    setStatus('');
    try {
      await createTriage(patientId, input, triageKey.current.key);
      const nextPatient = await getClinicalPatient(patientId);
      if (requestId !== patientRequest.current || nextPatient.id !== patientId) return;
      syncPatient(nextPatient);
      setSymptoms('');
      setDescription('');
      triageKey.current = null;
      setStatus('Triaje creado.');
    } catch (e) {
      if (requestId === patientRequest.current) setError((e as Error).message);
    } finally {
      setSavingTriage(false);
    }
  };

  const profile = patient?.patientProfile;

  return <main className="mx-auto mt-8 grid max-w-[900px] gap-5 md:grid-cols-[280px_1fr]">
    <section className="rounded-xl bg-white p-5">
      <h1 className="text-xl font-bold">Buscar paciente</h1>
      <form className="mt-4 flex gap-2" onSubmit={search}>
        <input className="min-w-0 flex-1 rounded border p-2" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="CI o nombre parcial" aria-label="CI o nombre parcial" />
        <button className="rounded bg-[#147d7e] px-3 text-white">Buscar</button>
      </form>
      <div className="mt-4 grid gap-2">
        {results.map((item) => <button className="rounded border p-3 text-left" key={item.id} onClick={() => select(item.id)}>
          <strong>{item.fullName}</strong>
          <span className="block text-sm text-[#678096]">CI: {item.nationalId} · Fecha de nacimiento: {item.dateOfBirth.slice(0, 10)}</span>
        </button>)}
      </div>
    </section>
    <section className="rounded-xl bg-white p-5">
      {error && <p className="mb-3 text-red-700" role="alert">{error}</p>}
      {status && <p className="mb-3 text-green-700" role="status">{status}</p>}
      {!patient ? <p className="text-[#678096]">Seleccione un paciente para ver el historial clínico acumulado.</p> : <>
        <h2 className="text-2xl font-bold">{patient.fullName}</h2>
        <p>CI: {patient.nationalId} · Fecha de nacimiento: {patient.dateOfBirth.slice(0, 10)}</p>
        <div className="mt-4 grid gap-2 text-sm">
          <p><b>Antecedentes médicos:</b> {profile?.medicalHistory || 'Sin antecedentes relevantes'}</p>
          <p><b>Alergias:</b> {profile?.allergies || 'Sin alergias conocidas'}</p>
          <p><b>Medicamentos actuales:</b> {profile?.currentMedications || 'Sin medicamentos actuales'}</p>
          <p><b>Condiciones crónicas:</b> {profile?.chronicConditions || 'Sin registros'}</p>
        </div>
        <section className="mt-5 border-t pt-4">
          <h3 className="font-bold">Historial clínico</h3>
          {patient.patientTriages.length === 0 ? <p className="text-sm text-[#678096]">Aún no hay historial de triaje.</p> : <ul className="mt-2 grid gap-2 text-sm">
            {patient.patientTriages.map((triage) => <li className="rounded border p-2" key={triage.id}>{triageStatusLabels[triage.status] ?? triage.status} · {triage.createdAt.slice(0, 10)} · Dr. {triage.physician.fullName}<span className="block text-[#678096]">{triage.versions[0]?.symptoms.map((symptom) => symptom.name).join(', ')}</span></li>)}
          </ul>}
        </section>
        {physician && <form className="mt-5 grid gap-3 border-t pt-4" onSubmit={saveProfile}>
          <h3 className="font-bold">Actualizar perfil clínico</h3>
          <textarea aria-label="Antecedentes médicos" className="rounded border p-2" value={profileForm.medicalHistory ?? ''} onChange={(e) => setProfileForm({ ...profileForm, medicalHistory: e.target.value })} />
          <textarea aria-label="Alergias" className="rounded border p-2" value={profileForm.allergies ?? ''} onChange={(e) => setProfileForm({ ...profileForm, allergies: e.target.value })} />
          <textarea aria-label="Medicamentos actuales" className="rounded border p-2" value={profileForm.currentMedications ?? ''} onChange={(e) => setProfileForm({ ...profileForm, currentMedications: e.target.value })} />
          <textarea aria-label="Condiciones crónicas" className="rounded border p-2" value={profileForm.chronicConditions ?? ''} onChange={(e) => setProfileForm({ ...profileForm, chronicConditions: e.target.value })} />
          <button className="rounded bg-[#147d7e] p-2 text-white">Actualizar perfil</button>
        </form>}
        {physician && <form className="mt-5 grid gap-3 border-t pt-4" onSubmit={submit}>
          <h3 className="font-bold">Iniciar nuevo triaje</h3>
          <textarea className="rounded border p-2" required value={symptoms} onChange={(e) => setSymptoms(e.target.value)} placeholder="Síntomas esenciales, uno por línea" aria-label="Síntomas esenciales" />
          <textarea className="rounded border p-2" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descripción clínica" aria-label="Descripción clínica" />
           <button disabled={savingTriage} className="rounded bg-[#147d7e] p-2 text-white disabled:cursor-not-allowed disabled:opacity-60">{savingTriage ? 'Guardando triaje...' : 'Guardar borrador en progreso'}</button>
        </form>}
      </>}
    </section>
  </main>;
}
