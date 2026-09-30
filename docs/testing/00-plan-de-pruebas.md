# Plan de pruebas

Este documento define una estrategia de pruebas reproducible y proporcional al riesgo para TriajeMedicoU. Prioriza autenticación, privacidad clínica, clasificación, seguridad de recomendaciones, publicación y concurrencia; distingue evidencia automatizada disponible de comprobaciones manuales aún pendientes.

## Propósito y alcance

El plan cubre el backend NestJS/Prisma y el frontend React/Vite en sus límites de comportamiento más críticos. Incluye pruebas unitarias, de componente, de integración en el límite entre componentes, de transición de estado, compatibilidad y usabilidad. No pretende enumerar cada caso automatizado ni demostrar integración con una base de datos viva.

## Selección basada en riesgo

Se seleccionan casos que pueden causar daño clínico, exposición de datos, pérdida de cambios o publicación incorrecta: controles de rol y propiedad, recomendaciones potencialmente prescriptivas, revisiones/versiones, conflictos `409`, respuestas asíncronas obsoletas e idempotencia.

## Niveles y tipos

| Nivel/tipo | Evidencia | Uso en este proyecto |
|---|---|---|
| Unidad | Jest con dependencias simuladas | Servicios, guards, reglas de seguridad y proyecciones. |
| Componente | Vitest, Testing Library y `jsdom` | Pantallas y flujos frontend con API simulada. |
| Integración de límite | Controller-servicio o frontend-API simulada | Contratos, argumentos, permisos, errores y revisiones; no es integración con BD real. |
| Transición de estado | Jest/Vitest | Cambios de triage, recomendaciones, revisión y publicación. |
| Compatibilidad | Protocolo manual | Chrome, Firefox y Edge en escritorio/móvil; estado pendiente. |
| Usabilidad | Protocolo con participantes o evaluación controlada | Roles clínicos y paciente; estado pendiente. |

## Entorno y herramientas verificados

| Área | Evidencia |
|---|---|
| Orquestación | `package.json`, script raíz `check`. |
| Backend | Jest `^29.7.0`, NestJS, `supertest`, Prisma `^6.16.1`. |
| Frontend | Vitest `^3.2.4`, React Testing Library, `user-event`, `jsdom`, Vite. |
| Validación y compilación | `prisma validate`, `nest build`, `tsc -b` y `vite build`. |
| Comando reproducible | `npm --prefix "D:\TriajeMedicoU" run check`. |

## Datos, privacidad y seguridad

Usar únicamente datos sintéticos, identificadores ficticios y textos clínicos no atribuibles. No copiar historiales, credenciales, tokens, archivos `.env` ni datos personales reales en evidencias. Las capturas, si se generan en una fase posterior, deben anonimizarse y almacenarse fuera del repositorio o en un espacio institucional autorizado.

## Criterios de entrada y salida

**Entrada:** dependencias instaladas, variables de entorno de prueba disponibles cuando sean necesarias, esquema Prisma válido y datos sintéticos preparados. **Salida:** comando automatizado reproducible sin fallos, resultados trazables a archivos, y protocolos manuales ejecutados o marcados `Pendiente`. Un resultado sin evidencia no se considera `Aprobado`.

## Convención de evidencia y limitaciones

Las rutas se expresan relativas a la raíz del repositorio. `Aprobado` significa respaldado por la ejecución automatizada indicada; `Pendiente` significa planificado pero no ejecutado; `No ejecutado` se reserva para una actividad explícitamente no realizada. Las pruebas con mocks no prueban una base de datos real, migración aplicada, red real ni navegador real.

## Exportación a Word con Pandoc

Desde la raíz del repositorio:

```bash
pandoc docs/testing/00-plan-de-pruebas.md docs/testing/01-pruebas-funcionales.md docs/testing/02-pruebas-no-funcionales.md docs/testing/03-trazabilidad-y-resultados.md -o docs/testing/informe-pruebas.docx --toc
pandoc docs/testing/00-plan-de-pruebas.md docs/testing/01-pruebas-funcionales.md docs/testing/02-pruebas-no-funcionales.md docs/testing/03-trazabilidad-y-resultados.md --reference-doc=reference.docx -o docs/testing/informe-pruebas.docx --toc
```

El segundo comando requiere que `reference.docx` exista en la raíz; sustituir la ruta si la plantilla institucional está en otra ubicación.
