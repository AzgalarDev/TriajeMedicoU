import * as React from 'react';
import { answerQuestion, createTriage, generateQuestions, getClinicalPatient, searchPatients, updateClinicalProfile, type ClinicalPatient, type PatientProfile, type PatientSummary } from '../../lib/api';

const emptyProfile: PatientProfile = { medicalHistory: '', allergies: '', currentMedications: '', chronicConditions: '' };
const triageIntentKey = (patientId: string) => `triajemedicou.triage-intent.${patientId}`;
const normalizeTriageInput = (patientId: string, symptoms: string, description: string) => {
  const input = { status: 'IN_PROGRESS' as const, description: description.trim(), symptoms: symptoms.split('\n').map((name) => ({ name: name.trim() })).filter((symptom) => symptom.name) };
  return { input, intent: JSON.stringify({ patientId, input }) };
};
const getStoredTriageKey = (patientId: string, intent: string) => { try { const stored = JSON.parse(sessionStorage.getItem(triageIntentKey(patientId)) ?? 'null') as { intent?: string; key?: string } | null; if (stored?.intent === intent && stored.key) return stored.key; } catch { /* ignore invalid local state */ } const key = crypto.randomUUID(); sessionStorage.setItem(triageIntentKey(patientId), JSON.stringify({ intent, key })); return key; };

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
  const [generating, setGenerating] = React.useState(false);
  const [generationFeedback, setGenerationFeedback] = React.useState<{ type: 'error' | 'success'; message: string } | null>(null);
  const [savingAnswers, setSavingAnswers] = React.useState<Set<string>>(new Set());

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
    const { input, intent } = normalizeTriageInput(patientId, symptoms, description);
    const key = getStoredTriageKey(patientId, intent);
    setSavingTriage(true);
    setError('');
    setStatus('');
    try {
      await createTriage(patientId, input, key);
      const nextPatient = await getClinicalPatient(patientId);
      if (requestId !== patientRequest.current || nextPatient.id !== patientId) return;
      syncPatient(nextPatient);
      setSymptoms('');
      setDescription('');
      sessionStorage.removeItem(triageIntentKey(patientId));
      setStatus('Triaje creado.');
    } catch (e) {
      if (requestId === patientRequest.current) setError((e as Error).message);
    } finally {
      setSavingTriage(false);
    }
  };

  const profile = patient?.patientProfile;
  const currentVersion = patient?.patientTriages[0]?.versions[0];
  const generate = async () => { if (!currentVersion?.id || !patient) return; const patientId = patient.id; const requestId = patientRequest.current; const versionId = currentVersion.id; setGenerating(true); setError(''); setGenerationFeedback(null); try { const result = await generateQuestions(patient.patientTriages[0].id, versionId); if (requestId !== patientRequest.current || patientId !== patient.id || versionId !== patient.patientTriages[0]?.versions[0]?.id) return; setPatient((latest) => latest ? { ...latest, patientTriages: latest.patientTriages.map((t, i) => i ? t : { ...t, versions: t.versions.map((v, j) => j ? v : { ...v, questions: result.questions }) }) } : latest); setStatus('Preguntas clínicas generadas.'); setGenerationFeedback({ type: 'success', message: 'Preguntas clínicas generadas.' }); } catch (e) { if (requestId === patientRequest.current) { const message = (e as Error).message; setError(message); setGenerationFeedback({ type: 'error', message }); } } finally { setGenerating(false); } };
  const saveAnswer = async (questionId: string, status: string, answerText: string, observations: string, expectedUpdatedAt: string) => { if (savingAnswers.has(questionId)) return; setSavingAnswers((s) => new Set(s).add(questionId)); try { const answer = await answerQuestion(questionId, { status, answerText, observations, expectedUpdatedAt }); setPatient((latest) => latest ? { ...latest, patientTriages: latest.patientTriages.map((t) => ({ ...t, versions: t.versions.map((v) => ({ ...v, questions: v.questions?.map((q) => q.id === questionId ? { ...q, answer } : q) })) })) } : latest); setStatus('Respuesta guardada.'); } catch (e) { setError((e as Error).message); } finally { setSavingAnswers((s) => { const next = new Set(s); next.delete(questionId); return next; }); } };

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
         {physician && currentVersion && <section className="mt-5 grid gap-3 border-t pt-4"><h3 className="font-bold">Preguntas clínicas adicionales</h3><p className="text-sm text-[#678096]">La asistencia local solo propone preguntas; no diagnostica ni recomienda tratamientos.</p><button type="button" disabled={currentVersion.status === 'APPROVED' || generating} onClick={generate} className="rounded bg-[#147d7e] p-2 text-white disabled:opacity-60">{generating ? 'Generando preguntas...' : currentVersion.status === 'APPROVED' ? 'Versión aprobada (bloqueada)' : 'Generar preguntas'}</button>{generationFeedback && <p className={generationFeedback.type === 'error' ? 'text-sm text-red-700' : 'text-sm text-green-700'} role={generationFeedback.type === 'error' ? 'alert' : 'status'}>{generationFeedback.message}</p>}{(currentVersion.questions ?? []).length === 0 ? <p className="text-sm text-[#678096]">Aún no hay preguntas generadas.</p> : <ol className="grid gap-3">{currentVersion.questions?.map((question) => <li className="rounded border p-3" key={question.id}><b>{question.priority}. {question.questionText}</b><select className="mt-2 rounded border p-2" defaultValue={question.answer?.status ?? 'ANSWERED'} aria-label={`Estado: ${question.questionText}`}><option value="ANSWERED">Respondida</option><option value="NOT_APPLICABLE">No aplica</option><option value="UNKNOWN">No se conoce</option><option value="UNABLE_TO_ASSESS">No se pudo evaluar</option></select><textarea className="mt-2 w-full rounded border p-2" placeholder="Respuesta del médico" defaultValue={question.answer?.answerText ?? ''} aria-label={`Respuesta: ${question.questionText}`} /><textarea className="mt-2 w-full rounded border p-2" placeholder="Observaciones" defaultValue={question.answer?.observations ?? ''} aria-label={`Observaciones: ${question.questionText}`} /><button type="button" disabled={currentVersion.status === 'APPROVED'} className="mt-2 rounded bg-[#147d7e] px-3 py-1 text-white disabled:opacity-60" onClick={(event) => { const item = event.currentTarget.parentElement!; const fields = item.querySelectorAll('textarea, select'); void saveAnswer(question.id, (fields[0] as HTMLSelectElement).value, (fields[1] as HTMLTextAreaElement).value, (fields[2] as HTMLTextAreaElement).value, question.answer?.updatedAt ?? new Date(0).toISOString()); }}>Guardar respuesta</button></li>)}</ol>}</section>}
      </>}
    </section>
  </main>;
}
