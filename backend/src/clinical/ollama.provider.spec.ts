import { BadRequestException, RequestTimeoutException, ServiceUnavailableException } from '@nestjs/common';
import { OllamaProvider } from './ollama.provider';

const input = { medicalHistory: 'Asma', allergies: 'Penicilina', currentMedications: 'Salbutamol', chronicConditions: 'Asma', description: 'Dos días', symptoms: [{ name: 'Tos', description: 'seca', severity: 'MODERATE' }] };
const response = (content: string, ok = true) => ({ ok, json: jest.fn().mockResolvedValue({ message: { content } }) });

describe('OllamaProvider', () => {
  beforeEach(() => { jest.restoreAllMocks(); process.env.OLLAMA_BASE_URL = 'http://ollama.test/'; process.env.OLLAMA_MODEL = 'qwen-test'; process.env.OLLAMA_TIMEOUT_MS = '25'; });
  it('posts the privacy-safe structured request and orders valid questions', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(response(JSON.stringify({ questions: [{ question: '¿Desde cuándo?', priority: 1 }, { question: '¿Tiene dificultad respiratoria?', priority: 2 }] })) as never);
    await expect(new OllamaProvider().generateQuestions(input)).resolves.toEqual({ questions: [{ question: '¿Desde cuándo?', priority: 1 }, { question: '¿Tiene dificultad respiratoria?', priority: 2 }], raw: expect.any(String) });
    expect(fetchMock).toHaveBeenCalledWith('http://ollama.test/api/chat', expect.objectContaining({ method: 'POST', signal: expect.any(AbortSignal), body: expect.any(String) }));
    const body = JSON.parse(fetchMock.mock.calls[0][1]!.body as string);
    expect(body).toMatchObject({ model: 'qwen-test', stream: false, options: { temperature: 0 }, format: { type: 'object' } });
    expect(body.messages[0].content).toContain('prioridades enteras únicas y secuenciales desde 1');
    expect(body.messages[1].content).toContain('Asma');
    for (const secret of ['fullName', 'nationalId', 'username', 'address', 'patientId', 'physicianId', 'internalId']) expect(body.messages[1].content).not.toContain(secret);
  });
  it.each([
    ['JSON malformado', '{'], ['schema inválido', JSON.stringify({ questions: [{ question: 'ok' }] })], ['prioridad no entera', JSON.stringify({ questions: [{ question: '¿Algo?', priority: 1.5 }] })],
  ])('rejects %s safely without retrying', async (_, content) => { const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(response(content) as never); await expect(new OllamaProvider().generateQuestions(input)).rejects.toBeInstanceOf(BadRequestException); expect(fetchMock).toHaveBeenCalledTimes(1); });
  it.each([
    '¿Recomienda reposo?',
    '¿Debería tomar paracetamol?',
    'Take acetaminophen now?',
    'Use inhaler every 4 hours?',
    'Start antibiotics today?',
    'Stop salbutamol?',
    '¿Cuál es el diagnóstico más probable?',
    'What treatment should be started?',
  ])('rejects unsafe prescriptive question output: %s', async (question) => {
    jest.spyOn(global, 'fetch').mockResolvedValue(response(JSON.stringify({ questions: [{ question, priority: 1 }] })) as never);
    await expect(new OllamaProvider().generateQuestions(input)).rejects.toThrow('preguntas no permitidas');
  });
  it.each([
    '¿Algún médico le recomendó reposo anteriormente?',
    '¿Qué tratamientos recibió antes?',
    'Did a doctor recommend rest previously?',
    'What treatments did you receive before?',
  ])('accepts clear past-history question output: %s', async (question) => {
    jest.spyOn(global, 'fetch').mockResolvedValue(response(JSON.stringify({ questions: [{ question, priority: 1 }] })) as never);
    await expect(new OllamaProvider().generateQuestions(input)).resolves.toEqual({ questions: [{ question, priority: 1 }], raw: expect.any(String) });
  });
  it('retries once when the first valid structured response has duplicate priorities and returns the corrected result', async () => {
    const duplicate = JSON.stringify({ questions: [{ question: '¿Desde cuándo inició la tos?', priority: 1 }, { question: '¿Ha tenido fiebre medida?', priority: 1 }] });
    const corrected = JSON.stringify({ questions: [{ question: '¿Desde cuándo inició la tos?', priority: 1 }, { question: '¿Ha tenido fiebre medida?', priority: 2 }] });
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValueOnce(response(duplicate) as never).mockResolvedValueOnce(response(corrected) as never);
    await expect(new OllamaProvider().generateQuestions(input)).resolves.toEqual({ questions: [{ question: '¿Desde cuándo inició la tos?', priority: 1 }, { question: '¿Ha tenido fiebre medida?', priority: 2 }], raw: corrected });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('rejects with a clear Spanish safe error after one corrective retry still returns duplicate priorities', async () => {
    const duplicate = JSON.stringify({ questions: [{ question: '¿Desde cuándo inició la tos?', priority: 1 }, { question: '¿Ha tenido fiebre medida?', priority: 1 }] });
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(response(duplicate) as never);
    await expect(new OllamaProvider().generateQuestions(input)).rejects.toThrow('prioridades duplicadas. No se guardaron preguntas');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('does not loop beyond the single corrective duplicate-priority retry', async () => {
    const duplicate = JSON.stringify({ questions: [{ question: '¿Desde cuándo inició la tos?', priority: 1 }, { question: '¿Ha tenido fiebre medida?', priority: 1 }] });
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(response(duplicate) as never);
    await expect(new OllamaProvider().generateQuestions(input)).rejects.toBeInstanceOf(BadRequestException);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('sends a privacy-safe corrective request that includes the invalid duplicate output', async () => {
    const duplicate = JSON.stringify({ questions: [{ question: '¿Desde cuándo inició la tos?', priority: 1 }, { question: '¿Ha tenido fiebre medida?', priority: 1 }] });
    const corrected = JSON.stringify({ questions: [{ question: '¿Desde cuándo inició la tos?', priority: 1 }, { question: '¿Ha tenido fiebre medida?', priority: 2 }] });
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValueOnce(response(duplicate) as never).mockResolvedValueOnce(response(corrected) as never);
    await new OllamaProvider().generateQuestions(input);
    const correctiveBody = JSON.parse(fetchMock.mock.calls[1][1]!.body as string);
    expect(JSON.stringify(correctiveBody.messages)).toContain('prioridades duplicadas');
    expect(JSON.stringify(correctiveBody.messages)).toContain('¿Ha tenido fiebre medida?');
    expect(JSON.stringify(correctiveBody.messages)).toContain('prioridades únicas y secuenciales empezando en 1');
    for (const secret of ['fullName', 'nationalId', 'username', 'address', 'patientId', 'physicianId', 'internalId']) expect(JSON.stringify(correctiveBody.messages)).not.toContain(secret);
  });
  it('does not retry timeout, network and non-2xx failures', async () => {
    const timeoutMock = jest.spyOn(global, 'fetch').mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' })); await expect(new OllamaProvider().generateQuestions(input)).rejects.toBeInstanceOf(RequestTimeoutException); expect(timeoutMock).toHaveBeenCalledTimes(1);
    timeoutMock.mockClear().mockRejectedValue(new Error('offline')); await expect(new OllamaProvider().generateQuestions(input)).rejects.toBeInstanceOf(ServiceUnavailableException); expect(timeoutMock).toHaveBeenCalledTimes(1);
    timeoutMock.mockClear().mockResolvedValue(response('', false) as never); await expect(new OllamaProvider().generateQuestions(input)).rejects.toBeInstanceOf(ServiceUnavailableException); expect(timeoutMock).toHaveBeenCalledTimes(1);
  });
  it('posts privacy-safe classification requests with schema, model, timeout and deterministic options', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(response(JSON.stringify({ severity: 'SEVERE', rationale: 'Disnea progresiva y fiebre persistente requieren priorización clínica.' })) as never);
    await expect(new OllamaProvider().classify({ ...input, answers: [{ question: '¿Fiebre?', status: 'ANSWERED', answerText: 'Sí', observations: '38.5' }] })).resolves.toMatchObject({ severity: 'SEVERE', model: 'qwen-test' });
    const body = JSON.parse(fetchMock.mock.calls[0][1]!.body as string);
    expect(body).toMatchObject({ model: 'qwen-test', stream: false, options: { temperature: 0 }, format: { properties: { severity: { enum: ['MILD', 'MODERATE', 'SEVERE', 'CRITICAL'] } } } });
    expect(fetchMock.mock.calls[0][1]!.signal).toBeInstanceOf(AbortSignal);
    for (const secret of ['fullName', 'nationalId', 'username', 'address', 'patientId', 'physicianId', 'internalId']) expect(body.messages[1].content).not.toContain(secret);
  });
  it.each(['MILD', 'MODERATE', 'SEVERE', 'CRITICAL'])('accepts %s classification severity', async (severity) => {
    jest.spyOn(global, 'fetch').mockResolvedValue(response(JSON.stringify({ severity, rationale: 'Razonamiento clínico suficiente basado en respuestas y síntomas.' })) as never);
    await expect(new OllamaProvider().classify({ ...input, answers: [] })).resolves.toMatchObject({ severity });
  });
  it.each([
    ['JSON malformado', '{'],
    ['schema inválido', JSON.stringify({ severity: 'HIGH', rationale: 'Razonamiento clínico suficiente basado en respuestas y síntomas.' })],
    ['diagnóstico', JSON.stringify({ severity: 'MILD', rationale: 'Este diagnóstico confirma una enfermedad y debe rechazarse por seguridad.' })],
    ['tratamiento', JSON.stringify({ severity: 'MILD', rationale: 'Recomendar tratamiento farmacológico específico no corresponde aquí.' })],
    ['recomendación', JSON.stringify({ severity: 'MILD', rationale: 'Recomendar reposo y seguimiento específico convierte la salida en recomendación.' })],
    ['certeza', JSON.stringify({ severity: 'MILD', rationale: 'Existe certeza clínica absoluta sobre la condición indicada por el modelo.' })],
    ['campo prohibido', JSON.stringify({ severity: 'MILD', rationale: 'Razonamiento clínico suficiente basado en respuestas y síntomas.', diagnosis: 'asma' })],
  ])('rejects unsafe classification output: %s', async (_, content) => {
    jest.spyOn(global, 'fetch').mockResolvedValue(response(content) as never);
    await expect(new OllamaProvider().classify({ ...input, answers: [] })).rejects.toBeInstanceOf(BadRequestException);
  });
  it('maps classification timeout, network and non-2xx failures to safe errors', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' })); await expect(new OllamaProvider().classify({ ...input, answers: [] })).rejects.toBeInstanceOf(RequestTimeoutException);
    fetchMock.mockRejectedValue(new Error('offline')); await expect(new OllamaProvider().classify({ ...input, answers: [] })).rejects.toBeInstanceOf(ServiceUnavailableException);
    fetchMock.mockResolvedValue(response('', false) as never); await expect(new OllamaProvider().classify({ ...input, answers: [] })).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('posts privacy-safe recommendation requests with schema, model, timeout and deterministic options', async () => {
    const content = JSON.stringify({ recommendations: [{ content: 'Control clínico y reevaluación según evolución documentada.', order: 1 }] });
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(response(content) as never);
    await expect(new OllamaProvider().recommend({ ...input, answers: [{ question: '¿Fiebre?', status: 'ANSWERED', answerText: 'Sí', observations: null }], finalSeverity: 'MODERATE', justification: 'Riesgo moderado' })).resolves.toEqual({ recommendations: [{ content: 'Control clínico y reevaluación según evolución documentada.', order: 1 }], raw: content, model: 'qwen-test' });
    const body = JSON.parse(fetchMock.mock.calls[0][1]!.body as string);
    expect(fetchMock).toHaveBeenCalledWith('http://ollama.test/api/chat', expect.objectContaining({ method: 'POST', signal: expect.any(AbortSignal), body: expect.any(String) }));
    expect(body).toMatchObject({ model: 'qwen-test', stream: false, options: { temperature: 0 }, format: { properties: { recommendations: { type: 'array', minItems: 1, maxItems: 10 } } } });
    expect(body.messages[0].content).toContain('no prescribas medicamentos ni dosis');
    for (const secret of ['fullName', 'nationalId', 'username', 'address', 'patientId', 'physicianId', 'internalId']) expect(body.messages[1].content).not.toContain(secret);
  });

  it.each([
    ['JSON malformado', '{'],
    ['schema inválido', JSON.stringify({ recommendations: [{ content: 'Control clínico suficiente.' }] })],
    ['orden no consecutivo', JSON.stringify({ recommendations: [{ content: 'Control clínico y reevaluación según evolución documentada.', order: 2 }] })],
    ['campo prohibido', JSON.stringify({ recommendations: [{ content: 'Control clínico y reevaluación según evolución documentada.', order: 1, id: 'patient-1' }] })],
    ['medicación y dosis inseguras exactas', JSON.stringify({ recommendations: [{ content: 'Tome paracetamol 500 mg cada 8 horas.', order: 1 }] })],
    ['orden directa exacta', JSON.stringify({ recommendations: [{ content: 'Administre amoxicilina 500 mg cada 8 horas.', order: 1 }] })],
  ])('rejects unsafe recommendation output: %s', async (_, content) => {
    jest.spyOn(global, 'fetch').mockResolvedValue(response(content) as never);
    await expect(new OllamaProvider().recommend({ ...input, answers: [], finalSeverity: 'MILD' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('does not retry recommendation malformed, order, network, timeout or non-2xx failures', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(response('{') as never);
    await expect(new OllamaProvider().recommend({ ...input, answers: [], finalSeverity: 'MILD' })).rejects.toBeInstanceOf(BadRequestException);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockClear().mockResolvedValue(response(JSON.stringify({ recommendations: [{ content: 'Control clínico y reevaluación según evolución documentada.', order: 2 }] })) as never);
    await expect(new OllamaProvider().recommend({ ...input, answers: [], finalSeverity: 'MILD' })).rejects.toBeInstanceOf(BadRequestException);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockClear().mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    await expect(new OllamaProvider().recommend({ ...input, answers: [], finalSeverity: 'MILD' })).rejects.toBeInstanceOf(RequestTimeoutException);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockClear().mockRejectedValue(new Error('offline'));
    await expect(new OllamaProvider().recommend({ ...input, answers: [], finalSeverity: 'MILD' })).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockClear().mockResolvedValue(response('', false) as never);
    await expect(new OllamaProvider().recommend({ ...input, answers: [], finalSeverity: 'MILD' })).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
