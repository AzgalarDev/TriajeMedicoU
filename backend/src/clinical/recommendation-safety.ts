const imperativeMedicationOrAction = /\b(?:administre|administrar|tome|tomar|toma|use|usar|utilice|utilizar|aplique|aplicar|inicie|iniciar|suspenda|suspender|aumente|aumentar|reduzca|reducir|prescriba|prescribir|recete|recetar|cambie|cambiar|administer|take|use|apply|start|begin|initiate|stop|discontinue|suspend|increase|decrease|reduce|prescribe|change)\b/iu;
const dosageUnit = /\b\d+(?:[\s,.]\d+)?\s*(?:mg|mcg|µg|g|ml|mL|ui|iu|u\.i\.|tabletas?|tablets?|comprimidos?|cápsulas?|capsules?)\b/iu;
const dosingFrequency = /\b(?:cada\s+\d+\s*(?:horas?|hrs?|h|días?|dias?)|\d+\s+veces\s+al\s+d[ií]a|every\s+\d+\s*(?:hours?|hrs?|h|days?)|\d+\s+times\s+(?:a|per)\s+day|twice\s+daily|once\s+daily|three\s+times\s+daily)\b/iu;
const medicationChange = /\b(?:medicaci[oó]n|medicamento|f[áa]rmaco|medicine|medication|drug|antibi[oó]tico|antibiotic|amoxicilina|amoxicillin|paracetamol|acetaminophen|ibuprofeno|ibuprofen|salbutamol|inhalador|inhaler)\b/iu;
const diagnosisOrCertainty = /\b(?:diagn[oó]stic[oa]|diagnosis|diagnose|certeza|certidumbre|certain(?:ty)?|definitiv[oa]|confirmed|confirmado|you have|tiene\s+(?:un|una)?\s*(?:diagn[oó]stico|infecci[oó]n|neumon[ií]a|asma)|es\s+(?:un|una)?\s*diagn[oó]stico)\b/iu;

export function isSafeRecommendation(content: string): boolean {
  if (typeof content !== 'string') return false;
  const value = content.trim();
  if (value.length < 10 || value.length > 500) return false;
  return !imperativeMedicationOrAction.test(value) && !dosageUnit.test(value) && !dosingFrequency.test(value) && !medicationChange.test(value) && !diagnosisOrCertainty.test(value);
}
