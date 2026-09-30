# Pruebas no funcionales

Este documento define las comprobaciones no funcionales mínimas que complementan las pruebas automatizadas. La compatibilidad de navegadores y la usabilidad son protocolos ejecutables, no resultados obtenidos: todos sus registros actuales permanecen `Pendiente`.

## Compatibilidad

Ejecutar los flujos críticos con datos sintéticos, sesión de prueba y la versión desplegada que se vaya a evaluar.

| Navegador | Escritorio | Móvil | Flujos críticos | Estado |
|---|---|---|---|---|
| Chrome | Inicio de sesión, triage, publicación | Inicio de sesión, orientación publicada | Autenticación, captura, publicación/consulta | Pendiente |
| Firefox | Inicio de sesión, triage, publicación | Inicio de sesión, orientación publicada | Autenticación, captura, publicación/consulta | Pendiente |
| Edge | Inicio de sesión, triage, publicación | Inicio de sesión, orientación publicada | Autenticación, captura, publicación/consulta | Pendiente |

Registrar versión del navegador, sistema operativo, dispositivo/viewport, fecha de ejecución, resultado, errores y evidencia. Esta matriz no afirma compatibilidad ejecutada.

## Protocolo de usabilidad

### Participantes y ética

Evaluar con representación de médico, asistente y paciente; no usar historiales reales. Obtener consentimiento institucional, explicar que la evaluación es del sistema y no del desempeño clínico, y permitir abandonar la sesión. No registrar credenciales ni datos identificables.

### Cinco tareas esenciales

1. Iniciar sesión y llegar al espacio correspondiente al rol.
2. Buscar un paciente sintético y revisar su identidad clínica.
3. Crear un triage y completar preguntas/clasificación.
4. Revisar, editar y aprobar recomendaciones seguras.
5. Publicar o consultar orientación publicada y corregirla cuando corresponda.

### Criterios y métricas

Para cada tarea registrar éxito sin ayuda, tiempo hasta completar, errores, solicitudes de ayuda y satisfacción de 1 a 5. Considerar éxito cuando la persona completa el objetivo sin violar permisos, privacidad ni reglas de seguridad. El SUS es opcional y solo debe resumirse si se aplica el cuestionario completo con participantes y procedimiento documentado.

### Plantilla de resultado

| Rol | Tarea | Éxito | Tiempo | Errores | Ayuda | Satisfacción (1–5) | Observaciones |
|---|---|---|---|---|---|---|---|
| Médico/asistente/paciente | T1–T5 | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente |

**Estado global:** Pendiente. **Evidencia manual prevista:** registro anonimizado, incidencias y observaciones; no confundir con las pruebas automatizadas de `jsdom`.
