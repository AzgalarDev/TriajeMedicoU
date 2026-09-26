const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

const clearPastHistory = /\b(anteriormente|antes|previo|previa|previos|previas|pasado|recibio|recibido|uso|usado|tomo|tomado|indicaron|indico|recomendo|previously|before|past|history|received|took|used|was prescribed|were prescribed|did .*doctor .*recommend|doctor .*recommended)\b/i;
const prescriptiveStem = /^(?:¿?\s*)?(?:recomienda\b|deberia\b|debe\b|indique\b|indicar\b|tome\b|tomar\b|use\b|usar\b|inicie\b|iniciar\b|suspenda\b|suspender\b|administre\b|administrar\b|take\b|use\b|start\b|stop\b|begin\b|continue\b|increase\b|decrease\b)/i;
const unsafeClinicalDirective = /\b(diagnostico|diagnosticar|diagnostica|tratamiento recomendado|recomienda|recomendar|recomendacion|deberia|debe tomar|debe usar|debe iniciar|debe suspender|prescrib|recete|indique|reposo\?|diagnosis|diagnose|treatment recommendation|recommend|should|must|prescribe|take|use|start|stop)\b/i;

export const questionHasInterrogative = (question: string) => /[?¿]/.test(question);

export function isSafeGeneratedQuestion(question: string) {
  const normalized = normalize(question);
  if (!questionHasInterrogative(question)) return false;
  if (clearPastHistory.test(normalized) && !/\b(should|must|deberia|debe|take|use|start|stop|tome|use|inicie|suspenda)\b/i.test(normalized)) return true;
  if (normalized === '¿recomienda reposo?' || normalized === 'recomienda reposo?') return false;
  if (/^¿?deberia tomar\b/i.test(normalized)) return false;
  return !prescriptiveStem.test(normalized) && !unsafeClinicalDirective.test(normalized);
}
