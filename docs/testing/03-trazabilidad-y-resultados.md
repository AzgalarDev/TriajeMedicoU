# Trazabilidad y resultados

Este documento conecta los flujos de mayor riesgo con evidencia concreta y separa lo que está aprobado por ejecución automatizada de lo que todavía requiere navegador, participantes o una base de datos viva. Los identificadores funcionales se refieren a los casos representativos de `01-pruebas-funcionales.md`.

## Matriz de trazabilidad

| Requisito/flujo | Evidencia representativa | Estado |
|---|---|---|
| Autenticación y roles | `UT-01`, `UT-02`, `UT-03`, `UT-04`, `UT-10` | Aprobado |
| Ingreso clínico y perfil | `UT-09`, `IT-03`, `TR-02`, `TR-03` | Aprobado |
| Preguntas y clasificación | `IT-03`, `TR-03` | Aprobado |
| Seguridad y revisión de recomendaciones | `UT-05`, `IT-04`, `TR-04` | Aprobado |
| Publicación y corrección final | `UT-06`, `UT-08`, `IT-05`, `IT-06`, `TR-05`, `TR-06` | Aprobado |
| Propiedad, privacidad y concurrencia | `UT-06`, `IT-02`, `TR-02`, `TR-03`, `TR-06` | Aprobado |

La etiqueta `Aprobado` aquí significa que existe evidencia automatizada con mocks o dobles de prueba. No significa aprobación clínica, legal ni de despliegue.

## Ejecución automatizada actual

El comando ejecutado desde la raíz fue:

```bash
npm --prefix "D:\TriajeMedicoU" run check
```

| Verificación | Resultado |
|---|---|
| Escaneo/autoverificación de pruebas enfocadas | Aprobado |
| `prisma validate` | Aprobado; mostró advertencia de configuración `package.json#prisma` deprecada para Prisma 7 |
| Backend Jest | 11 suites, 153 pruebas; todas pasaron |
| Frontend Vitest | 7 archivos, 67 pruebas; todas pasaron |
| Compilación backend | Aprobado |
| Compilación frontend | Aprobado |
| Total pruebas automatizadas | 18 archivos/suites, 220 pruebas; todas pasaron |

## Defectos importantes corregidos

La evidencia actual de código y pruebas demuestra correcciones para: evitar duplicación mediante claves de idempotencia en creación de triage; ignorar respuestas asíncronas obsoletas al cambiar de paciente; impedir éxito falso ante conflictos `409` de publicación o recomendaciones; exigir motivo de corrección; refrescar la revisión autoritativa después de corregir; separar aprobación de publicación; y excluir historial privado de la orientación pública. Estos puntos están cubiertos por `TR-02`, `TR-03`, `TR-04`, `TR-06` y sus archivos de evidencia asociados.

## Límites y pendientes

| Área | Situación | Estado |
|---|---|---|
| Base de datos viva y migración aplicada | No ejecutada como integración contra un servicio real en `check`; hay validación Prisma y pruebas simuladas | Pendiente |
| Compatibilidad Chrome/Firefox/Edge, escritorio/móvil | Protocolo definido en `02-pruebas-no-funcionales.md`; no hay ejecución documentada | Pendiente |
| Usabilidad con médico, asistente y paciente | Protocolo y plantilla definidos; no hay participantes ni métricas | Pendiente |
| Evidencia de red/despliegue | Fuera del comando raíz actual | No ejecutado |

## Conclusión y próximos pasos

La verificación automatizada actual respalda los límites de seguridad, permisos, publicación, estado y concurrencia seleccionados, con 220 pruebas aprobadas. Para completar la evidencia del proyecto, ejecutar la matriz de navegadores, aplicar el protocolo de usabilidad con datos sintéticos y documentar una prueba controlada contra una base de datos de prueba; conservar por separado sus registros y no convertirlos en resultados hasta su ejecución.
