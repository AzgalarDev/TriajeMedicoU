const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export type User = { id: string; username: string; role: string; status?: string };
export type PatientProfile = { medicalHistory: string | null; allergies: string | null; currentMedications: string | null; chronicConditions: string | null };
export type ManagedRole = 'PHYSICIAN' | 'ASSISTANT' | 'ADMINISTRATOR';
export type ProvisionUser = { fullName: string; dateOfBirth: string; sex: 'MALE' | 'FEMALE'; nationalId: string; address?: string; username: string; password: string; role: ManagedRole };
export type PatientSummary = { id: string; fullName: string; nationalId: string; dateOfBirth: string };
export type ClinicalQuestion = { id: string; questionText: string; priority: number; answer?: { status: string; answerText?: string | null; observations?: string | null; updatedAt?: string } | null };
export type ClinicalPatient = PatientSummary & { sex: string; address?: string; patientProfile: PatientProfile | null; patientTriages: Array<{ id: string; status: string; createdAt: string; physician: { fullName: string }; versions: Array<{ id?: string; status: string; updatedAt?: string; description?: string | null; preliminarySeverity?: string | null; finalSeverity?: string | null; classificationRationale?: string | null; classificationConfirmedAt?: string | null; recommendationRevision?: number; recommendationCollectionRevision?: number; symptoms: Array<{ name: string; description?: string | null }>; questions?: ClinicalQuestion[]; recommendations?: Recommendation[] }> }> };
export function searchPatients(query: string) {
  const trimmed = query.trim();
  const params = new URLSearchParams(/^\d+$/.test(trimmed) ? { nationalId: trimmed } : { query: trimmed });
  return request<PatientSummary[]>(`/clinical/patients?${params}`);
}
export function getClinicalPatient(id: string) { return request<ClinicalPatient>(`/clinical/patients/${id}`); }
export function updateClinicalProfile(id: string, profile: Partial<PatientProfile>) { return request<PatientProfile>(`/clinical/patients/${id}/profile`, { method: 'PATCH', body: JSON.stringify(profile) }); }
export function createTriage(id: string, input: { symptoms: Array<{ name: string; description?: string; severity?: string }>; description?: string; status?: 'DRAFT' | 'IN_PROGRESS' }, idempotencyKey: string) { return request(`/clinical/patients/${id}/triages`, { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey }, body: JSON.stringify(input) }); }
export function generateQuestions(triageId: string, versionId: string) { return request<{ questions: ClinicalQuestion[] }>(`/clinical/triages/${triageId}/versions/${versionId}/questions/generate`, { method: 'POST' }); }
export function answerQuestion(questionId: string, input: { status: string; answerText?: string; observations?: string; expectedUpdatedAt: string }) { return request<NonNullable<ClinicalQuestion['answer']>>(`/clinical/questions/${questionId}/answer`, { method: 'PUT', body: JSON.stringify(input) }); }
export type ClassificationResult = { versionId: string; triageId: string; status: string; preliminarySeverity?: string | null; rationale?: string | null; generatedAt?: string | null; updatedAt?: string; finalSeverity?: string | null };
export function generateClassification(triageId: string, versionId: string) { return request<ClassificationResult>(`/clinical/triages/${triageId}/versions/${versionId}/classification/generate`, { method: 'POST' }); }
export function confirmClassification(triageId: string, versionId: string, input: { severity: string; justification?: string; expectedUpdatedAt: string }) { return request<ClassificationResult>(`/clinical/triages/${triageId}/versions/${versionId}/classification/confirm`, { method: 'PUT', body: JSON.stringify(input) }); }
export type Recommendation = { id: string; content: string; sortOrder: number; isApproved: boolean; source: 'MODEL' | 'MANUAL'; createdAt?: string; updatedAt: string; approvedAt?: string | null; revision: number; createdBy?: { fullName: string } | null; updatedBy?: { fullName: string } | null; approvedBy?: { fullName: string } | null };
export type RecommendationCollection = { triageId: string; versionId: string; status: string; finalSeverity: string; updatedAt: string; recommendationRevision: number; recommendationCollectionRevision: number; recommendations: Recommendation[] };
export function getRecommendations(triageId: string, versionId: string) { return request<RecommendationCollection>(`/clinical/triages/${triageId}/versions/${versionId}/recommendations`); }
export function generateRecommendations(triageId: string, versionId: string, collectionRevision = 0) { return request<RecommendationCollection>(`/clinical/triages/${triageId}/versions/${versionId}/recommendations/generate`, { method: 'POST', body: JSON.stringify({ collectionRevision }) }); }
export function addRecommendation(triageId: string, versionId: string, content: string, collectionRevision = 0) { return request<Recommendation>(`/clinical/triages/${triageId}/versions/${versionId}/recommendations`, { method: 'POST', body: JSON.stringify({ content, collectionRevision }) }); }
export function editRecommendation(triageId: string, versionId: string, id: string, content: string, revision: number, updatedAt = new Date(0).toISOString(), collectionRevision = 0) { return request<Recommendation>(`/clinical/triages/${triageId}/versions/${versionId}/recommendations/${id}`, { method: 'PATCH', body: JSON.stringify({ content, revision, updatedAt, collectionRevision }) }); }
export function deleteRecommendation(triageId: string, versionId: string, id: string, revision: number, updatedAt = new Date(0).toISOString(), collectionRevision = 0) { return request<{ deleted: boolean }>(`/clinical/triages/${triageId}/versions/${versionId}/recommendations/${id}`, { method: 'DELETE', body: JSON.stringify({ revision, updatedAt, collectionRevision }) }); }
export function reorderRecommendations(triageId: string, versionId: string, ids: string[], collectionRevision = 0) { return request<{ recommendations: Recommendation[] }>(`/clinical/triages/${triageId}/versions/${versionId}/recommendations/order`, { method: 'PUT', body: JSON.stringify({ ids, collectionRevision }) }); }
export function approveRecommendation(triageId: string, versionId: string, id: string, approved: boolean, revision: number, updatedAt = new Date(0).toISOString(), collectionRevision = 0) { return request<Recommendation>(`/clinical/triages/${triageId}/versions/${versionId}/recommendations/${id}/approval`, { method: 'PUT', body: JSON.stringify({ approved, revision, updatedAt, collectionRevision }) }); }

export function provisionUser(input: ProvisionUser) { return request<User & { fullName: string }>('/auth/users', { method: 'POST', body: JSON.stringify(input) }); }
export type ManagedUser = User & { fullName: string; nationalId: string };
export function listUsers(filters?: { role?: string; status?: string }) { const query = new URLSearchParams(filters as Record<string, string>); return request<ManagedUser[]>(`/auth/users${query.toString() ? `?${query}` : ''}`); }
export function updateUserStatus(id: string, status: 'ACTIVE' | 'INACTIVE' | 'BLOCKED') { return request<ManagedUser>(`/auth/users/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }); }
export function resetManagedPassword(id: string, newPassword: string) { return request<{ success: boolean }>(`/auth/users/${id}/reset-password`, { method: 'POST', body: JSON.stringify({ newPassword }) }); }
export function updateUserIdentity(id: string, nationalId: string) { return request<ManagedUser>(`/auth/users/${id}/identity`, { method: 'PATCH', body: JSON.stringify({ nationalId }) }); }

export async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { ...options, credentials: 'include', headers: { 'Content-Type': 'application/json', ...options?.headers } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(Array.isArray(data.message) ? data.message.join(' ') : data.message ?? 'No se pudo completar la solicitud.') as Error & { status?: number }; error.status = response.status; throw error; }
  return data;
}
