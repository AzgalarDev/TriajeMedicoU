export const CLINICAL_LLM_PROVIDER = Symbol('CLINICAL_LLM_PROVIDER');

export type ClinicalQuestionInput = { medicalHistory?: string | null; allergies?: string | null; currentMedications?: string | null; chronicConditions?: string | null; description?: string | null; symptoms: Array<{ name: string; description?: string | null; severity?: string | null }> };
export type GeneratedQuestion = { question: string; priority: number };
export type ClinicalClassificationInput = ClinicalQuestionInput & { answers: Array<{ question: string; status: string; answerText?: string | null; observations?: string | null }> };
export type PreliminaryClassification = { severity: 'MILD' | 'MODERATE' | 'SEVERE' | 'CRITICAL'; rationale: string; raw: string; model: string };
export type ClinicalRecommendationInput = ClinicalClassificationInput & { finalSeverity: string; justification?: string | null };
export type GeneratedRecommendation = { content: string; order: number };
export interface ClinicalLlmProvider { generateQuestions(input: ClinicalQuestionInput): Promise<{ questions: GeneratedQuestion[]; raw: string }>; classify?(input: ClinicalClassificationInput): Promise<PreliminaryClassification>; recommend?(input: ClinicalRecommendationInput): Promise<{ recommendations: GeneratedRecommendation[]; raw: string; model: string }>; }
