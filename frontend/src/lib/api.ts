const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export type User = { id: string; username: string; role: string; status?: string };
export type PatientProfile = { medicalHistory: string | null; allergies: string | null; currentMedications: string | null; chronicConditions: string | null };
export type ManagedRole = 'PHYSICIAN' | 'ASSISTANT' | 'ADMINISTRATOR';
export type ProvisionUser = { fullName: string; dateOfBirth: string; sex: 'MALE' | 'FEMALE'; nationalId: string; address?: string; username: string; password: string; role: ManagedRole };
export type PatientSummary = { id: string; fullName: string; nationalId: string; dateOfBirth: string };
export type ClinicalPatient = PatientSummary & { sex: string; address?: string; patientProfile: PatientProfile | null; patientTriages: Array<{ id: string; status: string; createdAt: string; physician: { fullName: string }; versions: Array<{ status: string; symptoms: Array<{ name: string; description?: string | null }> }> }> };
export function searchPatients(query: string) {
  const trimmed = query.trim();
  const params = new URLSearchParams(/^\d+$/.test(trimmed) ? { nationalId: trimmed } : { query: trimmed });
  return request<PatientSummary[]>(`/clinical/patients?${params}`);
}
export function getClinicalPatient(id: string) { return request<ClinicalPatient>(`/clinical/patients/${id}`); }
export function updateClinicalProfile(id: string, profile: Partial<PatientProfile>) { return request<PatientProfile>(`/clinical/patients/${id}/profile`, { method: 'PATCH', body: JSON.stringify(profile) }); }
export function createTriage(id: string, input: { symptoms: Array<{ name: string; description?: string; severity?: string }>; description?: string; status?: 'DRAFT' | 'IN_PROGRESS' }, idempotencyKey: string) { return request(`/clinical/patients/${id}/triages`, { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey }, body: JSON.stringify(input) }); }

export function provisionUser(input: ProvisionUser) { return request<User & { fullName: string }>('/auth/users', { method: 'POST', body: JSON.stringify(input) }); }
export type ManagedUser = User & { fullName: string; nationalId: string };
export function listUsers(filters?: { role?: string; status?: string }) { const query = new URLSearchParams(filters as Record<string, string>); return request<ManagedUser[]>(`/auth/users${query.toString() ? `?${query}` : ''}`); }
export function updateUserStatus(id: string, status: 'ACTIVE' | 'INACTIVE' | 'BLOCKED') { return request<ManagedUser>(`/auth/users/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }); }
export function resetManagedPassword(id: string, newPassword: string) { return request<{ success: boolean }>(`/auth/users/${id}/reset-password`, { method: 'POST', body: JSON.stringify({ newPassword }) }); }
export function updateUserIdentity(id: string, nationalId: string) { return request<ManagedUser>(`/auth/users/${id}/identity`, { method: 'PATCH', body: JSON.stringify({ nationalId }) }); }

export async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { ...options, credentials: 'include', headers: { 'Content-Type': 'application/json', ...options?.headers } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(Array.isArray(data.message) ? data.message.join(' ') : data.message ?? 'No se pudo completar la solicitud.');
  return data;
}
