import * as React from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import type { ClinicalPatient } from '../../lib/api';
import { Button } from '../ui/Button';

export function ClinicalPageHeader({ eyebrow = 'Atención clínica', title, description, action }: { eyebrow?: string; title: string; description?: string; action?: React.ReactNode }) {
  return <div className="mb-6 flex flex-col gap-4 border-b border-[#dce7ee] pb-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="mb-1 text-xs font-extrabold uppercase tracking-[.12em] text-[#147d7e]">{eyebrow}</p><h1 className="text-[clamp(25px,5vw,34px)] font-bold tracking-[-.04em] text-[#17324d]">{title}</h1>{description && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#678096]">{description}</p>}</div>{action}</div>;
}

export function FeedbackMessage({ message, type = 'status' }: { message?: string; type?: 'status' | 'alert' }) {
  if (!message) return null;
  return <p role={type} aria-live="polite" className={`rounded-[10px] border px-3 py-2.5 text-sm ${type === 'alert' ? 'border-[#f0caca] bg-[#fff7f7] text-[#a33b3b]' : 'border-[#b9e0dd] bg-[#effaf8] text-[#176765]'}`}>{message}</p>;
}

export function ClinicalBreadcrumbs({ items }: { items: Array<{ label: string; to?: string }> }) {
  return <nav aria-label="Ruta clínica" className="mb-4 text-xs text-[#678096]"><ol className="flex flex-wrap items-center gap-2">{items.map((item, i) => <li key={`${item.label}-${i}`} className="flex items-center gap-2">{i > 0 && <span aria-hidden="true">/</span>}{item.to ? <NavLink className="font-bold text-[#147d7e] hover:underline" to={item.to}>{item.label}</NavLink> : <span aria-current="page" className="font-semibold text-[#31516a]">{item.label}</span>}</li>)}</ol></nav>;
}

export function PatientContextHeader({ patient, physician = false, triageLabel }: { patient: ClinicalPatient; physician?: boolean; triageLabel?: string }) {
  const location = useLocation(); const navigate = useNavigate();
  const links = [['resumen', 'Resumen'], ['perfil', 'Perfil clínico'], ['historial', 'Historial'], ...(physician ? [['nuevo-triaje', 'Nuevo triaje']] : [])];
  return <section className="mb-6 rounded-[14px] border border-[#cbdfe5] bg-[#f7fbfc] p-4 shadow-[0_5px_18px_#20425d0b]" aria-label="Paciente seleccionado"><div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div><p className="text-[11px] font-extrabold uppercase tracking-[.1em] text-[#147d7e]">Paciente seleccionado</p><h2 className="mt-1 text-lg font-bold text-[#17324d]">{patient.fullName}</h2><p className="mt-1 text-sm text-[#526d82]">CI: {patient.nationalId} · Nacimiento: {patient.dateOfBirth.slice(0, 10)} · Sexo: {patient.sex}</p>{triageLabel && <p className="mt-1 text-xs font-semibold text-[#678096]">{triageLabel}</p>}</div><NavLink className="text-sm font-bold text-[#147d7e] hover:underline" to="/pacientes">Volver a pacientes</NavLink></div><nav aria-label="Secciones del paciente" className="mt-4 flex max-w-full gap-1 overflow-x-auto pb-1">{links.map(([path, label]) => { const to = `/pacientes/${patient.id}/${path}`; const active = location.pathname === to; return <button key={path} type="button" aria-current={active ? 'page' : undefined} onClick={() => navigate(to)} className={`min-h-11 shrink-0 rounded-lg px-3 text-sm font-bold focus-visible:outline-3 focus-visible:outline-[#147d7e55] ${active ? 'bg-[#147d7e] text-white' : 'text-[#31516a] hover:bg-white'}`}>{label}</button>; })}</nav></section>;
}

export function ClinicalStepper({ step }: { step: 1 | 2 | 3 | 4 | 5 }) { return <ol aria-label="Pasos del triaje" className="mb-6 grid gap-2 sm:grid-cols-5">{['Información inicial', 'Preguntas y respuestas', 'Clasificación', 'Recomendaciones', 'Revisión final'].map((label, i) => { const stepNumber = i + 1; const upcoming = stepNumber > step; return <li key={label} aria-current={stepNumber === step ? 'step' : undefined} aria-disabled={upcoming || undefined} className={`rounded-lg border px-2 py-2 text-center text-xs font-bold ${stepNumber === step ? 'border-[#147d7e] bg-[#effaf8] text-[#147d7e]' : stepNumber < step ? 'border-[#b9e0dd] text-[#176765]' : 'border-[#dce7ee] text-[#7890a1]'} ${upcoming ? 'cursor-not-allowed opacity-60' : ''}`}><span className="mr-1">{stepNumber}.</span>{label}{upcoming && <span className="block text-[10px] font-normal">Próximamente</span>}</li>; })}</ol>; }

export function PatientCard({ children }: { children: React.ReactNode }) { return <section className="rounded-[14px] border border-[#dce7ee] bg-white p-5 shadow-[0_8px_24px_#20425d0b]">{children}</section>; }
