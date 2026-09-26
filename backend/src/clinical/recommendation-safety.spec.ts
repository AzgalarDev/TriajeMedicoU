import { isSafeRecommendation } from './recommendation-safety';

describe('isSafeRecommendation', () => {
  it.each([
    'Administre amoxicilina 500 mg cada 8 horas.',
    'Tome paracetamol 500 mg cada 8 horas.',
    'Use inhaler every 4 hours.',
    'Start antibiotics today.',
    'Suspenda salbutamol desde hoy.',
    'Aumente la medicación si presenta tos.',
    'Reduce ibuprofen dose to 200 mg twice daily.',
    'Prescriba dos cápsulas cada día.',
    'Tiene un diagnóstico definitivo de neumonía.',
  ])('rejects unsafe direct treatment wording: %s', (content) => {
    expect(isSafeRecommendation(content)).toBe(false);
  });

  it.each([
    'Vigilar signos de alarma y acudir a urgencias si aparece dificultad respiratoria.',
    'Mantener hidratación general y reposo relativo según tolerancia clínica.',
    'Reevaluación clínica si los síntomas empeoran o no hay mejoría documentada.',
    'Monitor warning signs and seek urgent care if breathing difficulty appears.',
  ])('accepts safe monitoring and care-seeking wording: %s', (content) => {
    expect(isSafeRecommendation(content)).toBe(true);
  });
});
