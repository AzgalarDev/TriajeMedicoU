import { BadRequestException, Injectable, RequestTimeoutException, ServiceUnavailableException } from '@nestjs/common';
import { ClinicalLlmProvider, ClinicalQuestionInput, ClinicalClassificationInput, ClinicalRecommendationInput } from './llm.provider';
import { isSafeGeneratedQuestion } from './question-safety';
import { isSafeRecommendation } from './recommendation-safety';

type OllamaQuestion = { question: string; priority: number };

const duplicatePriorityMessage = 'La respuesta clínica local contiene prioridades duplicadas. No se guardaron preguntas; intente generar nuevamente.';

class DuplicatePriorityResponseError extends Error {
  constructor(readonly questions: OllamaQuestion[]) { super('duplicate-priorities'); }
}

@Injectable()
export class OllamaProvider implements ClinicalLlmProvider {
  private async chat(messages: Array<{ role: string; content: string }>, format: object) {
    const base = (process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434').replace(/\/$/, '');
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), Number(process.env.OLLAMA_TIMEOUT_MS ?? 30000));
    try {
      const response = await fetch(`${base}/api/chat`, { method: 'POST', signal: controller.signal, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: process.env.OLLAMA_MODEL ?? 'qwen3:8b', stream: false, format, options: { temperature: 0 }, messages }) });
      if (!response.ok) throw new ServiceUnavailableException('El servicio clínico local no está disponible.');
      const raw = (await response.json() as { message?: { content?: string }}).message?.content;
      if (!raw) throw new BadRequestException('La respuesta clínica local no tiene un formato válido.');
      return raw;
    } catch (error: unknown) { if (error instanceof BadRequestException || error instanceof ServiceUnavailableException) throw error; if ((error as Error).name === 'AbortError') throw new RequestTimeoutException('La generación clínica tardó demasiado.'); throw new ServiceUnavailableException('No se pudo contactar el servicio clínico local.'); }
    finally { clearTimeout(timeout); }
  }

  async classify(input: ClinicalClassificationInput) {
    const format = { type: 'object', properties: { severity: { type: 'string', enum: ['MILD', 'MODERATE', 'SEVERE', 'CRITICAL'] }, rationale: { type: 'string', minLength: 20, maxLength: 600 } }, required: ['severity', 'rationale'], additionalProperties: false };
    const safe = { clinicalProfile: { medicalHistory: input.medicalHistory ?? '', allergies: input.allergies ?? '', currentMedications: input.currentMedications ?? '', chronicConditions: input.chronicConditions ?? '' }, description: input.description ?? '', symptoms: input.symptoms, answers: input.answers };
    const raw = await this.chat([{ role: 'system', content: 'Clasifica preliminarmente en español. No diagnostiques, no recomiendes tratamientos, no inventes datos ni expreses certeza. Responde solo JSON. severity debe ser exactamente MILD, MODERATE, SEVERE o CRITICAL. La rationale debe ser concisa y basada únicamente en los datos.' }, { role: 'user', content: JSON.stringify(safe) }], format);
    let parsed: { severity?: unknown; rationale?: unknown }; try { parsed = JSON.parse(raw); } catch { throw new BadRequestException('La respuesta clínica local no tiene un formato válido.'); }
    const severities = ['MILD', 'MODERATE', 'SEVERE', 'CRITICAL'];
    const keys = Object.keys(parsed as Record<string, unknown>);
    if (keys.some((key) => !['severity', 'rationale'].includes(key)) || !severities.includes(String(parsed.severity)) || typeof parsed.rationale !== 'string' || parsed.rationale.trim().length < 20 || parsed.rationale.length > 600 || /diagnóstico|diagnostico|tratamiento|tratar|prescrib|recomend|certeza|certidumbre|certainty/i.test(parsed.rationale)) throw new BadRequestException('La respuesta clínica local no tiene un formato válido.');
    return { severity: parsed.severity as 'MILD' | 'MODERATE' | 'SEVERE' | 'CRITICAL', rationale: parsed.rationale.trim(), raw, model: process.env.OLLAMA_MODEL ?? 'qwen3:8b' };
  }
  async recommend(input: ClinicalRecommendationInput) {
    const format = { type: 'object', properties: { recommendations: { type: 'array', minItems: 1, maxItems: 10, items: { type: 'object', properties: { content: { type: 'string', minLength: 10, maxLength: 500 }, order: { type: 'integer' } }, required: ['content', 'order'], additionalProperties: false } } }, required: ['recommendations'], additionalProperties: false };
    const safe = { clinicalProfile: { medicalHistory: input.medicalHistory ?? '', allergies: input.allergies ?? '', currentMedications: input.currentMedications ?? '', chronicConditions: input.chronicConditions ?? '' }, description: input.description ?? '', symptoms: input.symptoms, answers: input.answers, finalSeverity: input.finalSeverity, justification: input.justification ?? '' };
    const raw = await this.chat([{ role: 'system', content: 'Genera únicamente recomendaciones preliminares en español. Son un borrador para revisión médica. No diagnostiques, no prescribas medicamentos ni dosis, no indiques cambios de medicación, no afirmes certeza ni inventes datos. Devuelve JSON con orden exacto y consecutivo desde 1.' }, { role: 'user', content: JSON.stringify(safe) }], format);
    let parsed: { recommendations?: unknown }; try { parsed = JSON.parse(raw); } catch { throw new BadRequestException('La respuesta clínica local no tiene un formato válido.'); }
    if (!Array.isArray(parsed.recommendations) || parsed.recommendations.length < 1 || parsed.recommendations.length > 10) throw new BadRequestException('La respuesta clínica local no tiene recomendaciones válidas.');
    const recommendations = parsed.recommendations.map((item, index) => { const r = item as { content?: unknown; order?: unknown }; if (Object.keys(item as Record<string, unknown>).some((key) => !['content', 'order'].includes(key)) || typeof r.content !== 'string' || r.order !== index + 1 || !isSafeRecommendation(r.content)) throw new BadRequestException('La respuesta clínica local contiene recomendaciones no permitidas. No se guardaron recomendaciones.'); return { content: r.content.trim(), order: r.order as number }; });
    return { recommendations, raw, model: process.env.OLLAMA_MODEL ?? 'qwen3:8b' };
  }
  async generateQuestions(input: ClinicalQuestionInput) {
    const base = (process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434').replace(/\/$/, '');
    const safe = { clinicalProfile: { medicalHistory: input.medicalHistory ?? '', allergies: input.allergies ?? '', currentMedications: input.currentMedications ?? '', chronicConditions: input.chronicConditions ?? '' }, description: input.description ?? '', symptoms: input.symptoms };
    const format = { type: 'object', properties: { questions: { type: 'array', maxItems: 20, items: { type: 'object', properties: { question: { type: 'string' }, priority: { type: 'integer' } }, required: ['question', 'priority'], additionalProperties: false } } }, required: ['questions'], additionalProperties: false };
    const baseMessages = [{ role: 'system', content: 'Responde únicamente preguntas clínicas adicionales priorizadas en español. Usa prioridades enteras únicas y secuenciales desde 1, sin duplicados. No diagnostiques, clasifiques, recomiendes ni indiques tratamiento.' }, { role: 'user', content: JSON.stringify(safe) }];
    const request = async (messages: Array<{ role: string; content: string }>) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), Number(process.env.OLLAMA_TIMEOUT_MS ?? 30000));
      try {
        const response = await fetch(`${base}/api/chat`, { method: 'POST', signal: controller.signal, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: process.env.OLLAMA_MODEL ?? 'qwen3:8b', stream: false, format, options: { temperature: 0 }, messages }) });
        if (!response.ok) throw new ServiceUnavailableException('El servicio clínico local no está disponible.');
        const envelope = await response.json() as { message?: { content?: string } };
        const raw = envelope.message?.content;
        if (!raw) throw new BadRequestException('La respuesta clínica local no tiene un formato válido.');
        return raw;
      } finally { clearTimeout(timeout); }
    };
    const parseQuestions = (raw: string) => {
      let parsed: { questions?: unknown };
      try { parsed = JSON.parse(raw) as { questions?: unknown }; } catch { throw new BadRequestException('La respuesta clínica local no tiene un formato válido.'); }
      if (!Array.isArray(parsed.questions) || parsed.questions.length > 20) throw new BadRequestException('La respuesta clínica local no tiene un formato válido.');
      const questions = parsed.questions.map((item) => { const q = item as { question?: unknown; priority?: unknown }; if (typeof q.question !== 'string' || q.question.trim().length < 3 || q.question.length > 500 || typeof q.priority !== 'number' || !Number.isInteger(q.priority)) throw new BadRequestException('La respuesta clínica local no tiene un formato válido.'); return { question: q.question.trim(), priority: q.priority }; });
       const priorities = questions.map((q) => q.priority);
      // Do not renumber provider output: priority is clinical ordering intent, so duplicates are unsafe to infer and must be regenerated once.
       if (new Set(priorities).size !== priorities.length || priorities.some((p, i) => p !== i + 1)) throw new DuplicatePriorityResponseError(questions);
        if (questions.some((q) => !isSafeGeneratedQuestion(q.question))) throw new BadRequestException('La respuesta clínica local contiene preguntas no permitidas. No se guardaron preguntas; intente generar nuevamente.');
       return questions.sort((a, b) => a.priority - b.priority);
    };
    try {
      const raw = await request(baseMessages);
      try { return { questions: parseQuestions(raw), raw }; }
      catch (error) {
        if (!(error instanceof DuplicatePriorityResponseError)) throw error;
        const correctionMessages = [...baseMessages, { role: 'assistant', content: JSON.stringify({ questions: error.questions }) }, { role: 'user', content: `La salida anterior es inválida porque contiene prioridades duplicadas: ${JSON.stringify({ questions: error.questions })}. Regenera exactamente las mismas preguntas, o un conjunto clínicamente equivalente en el mismo orden clínico, con prioridades únicas y secuenciales empezando en 1. No incluyas identificadores de paciente ni datos administrativos.` }];
        const correctedRaw = await request(correctionMessages);
        try { return { questions: parseQuestions(correctedRaw), raw: correctedRaw }; }
        catch (secondError) { if (secondError instanceof DuplicatePriorityResponseError) throw new BadRequestException(duplicatePriorityMessage); throw secondError; }
      }
    } catch (error: unknown) {
      if (error instanceof BadRequestException || error instanceof ServiceUnavailableException) throw error;
      if ((error as Error).name === 'AbortError') throw new RequestTimeoutException('La generación clínica tardó demasiado.');
      throw new ServiceUnavailableException('No se pudo contactar el servicio clínico local.');
    }
  }
}
