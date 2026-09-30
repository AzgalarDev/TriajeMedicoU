# Pruebas funcionales representativas

Este documento resume casos representativos respaldados por los archivos de prueba actuales. Las pruebas unitarias/componentes verifican reglas aisladas o pantallas con API simulada; las de límite verifican la interacción entre capas sin afirmar una base de datos real; las de transición verifican estados y respuestas a eventos.

## Unidad y componente

| ID | Objetivo | Precondiciones/entrada | Resultado esperado | Evidencia automatizada | Estado |
|---|---|---|---|---|---|
| UT-01 | Validar credenciales y sesión | Credenciales válidas/no válidas | Sesión válida o error controlado | `backend/src/auth/auth.service.spec.ts` | Aprobado |
| UT-02 | Recuperar contraseña | Solicitud válida y error de servicio | Éxito o mensaje seguro | `backend/src/auth/password-recovery.spec.ts` | Aprobado |
| UT-03 | Aplicar roles | Usuario con/sin rol requerido | Acceso permitido o denegado | `backend/src/auth/guards/roles.guard.spec.ts` | Aprobado |
| UT-04 | Aplicar sesión | Solicitud con sesión válida/ausente | Identidad disponible o rechazo | `backend/src/auth/guards/session-auth.guard.spec.ts` | Aprobado |
| UT-05 | Rechazar recomendaciones inseguras | Texto prescriptivo o de vigilancia | Prescriptivo rechazado; vigilancia aceptada | `backend/src/clinical/recommendation-safety.spec.ts` | Aprobado |
| UT-06 | Proyectar orientación vigente | Publicación simulada y rol autorizado | Solo revisión vigente | `backend/src/clinical/publication.projection.spec.ts` | Aprobado |
| UT-07 | Proteger respuesta del modelo | Proveedor simulado, error y respuesta | Resultado normalizado o error controlado | `backend/src/clinical/ollama.provider.spec.ts` | Aprobado |
| UT-08 | Proteger publicación y migración | Revisiones/versiones sintéticas | Reglas de revisión preservadas | `backend/src/clinical/publication.migration.spec.ts` | Aprobado |
| UT-09 | Gestionar perfil de paciente | Formulario y respuesta de guardado simulada | Formulario sincronizado | `frontend/src/features/patient/PatientProfile.test.tsx` | Aprobado |
| UT-10 | Mostrar autenticación y recuperación | API simulada con éxito/error | Feedback visible y controlado | `frontend/src/app/App.test.tsx` | Aprobado |

## Integración en límites de componente

| ID | Objetivo | Precondiciones/entrada | Resultado esperado | Evidencia automatizada | Estado |
|---|---|---|---|---|---|
| IT-01 | Controller-servicio clínico | Solicitud autenticada y datos simulados | Contrato y permisos correctos | `backend/src/clinical/clinical.controller.spec.ts` | Aprobado |
| IT-02 | Servicio clínico y persistencia simulada | Repositorio Prisma simulado | Consultas y proyecciones esperadas | `backend/src/clinical/clinical.service.spec.ts` | Aprobado |
| IT-03 | Flujo de preguntas/clasificación frontend-API | Respuestas API simuladas | Preguntas, respuestas y estados renderizados | `frontend/src/features/clinical/StaffClinicalWorkspace.test.tsx` | Aprobado |
| IT-04 | Flujo de recomendaciones frontend-API | Colección y revisiones simuladas | Generar, agregar, editar, ordenar, aprobar y eliminar | `frontend/src/features/clinical/RecommendationsScreen.test.tsx` | Aprobado |
| IT-05 | Revisión y publicación frontend-API | Versión pendiente y respuesta de publicación | Confirmación separada de publicación | `frontend/src/features/clinical/FinalReviewScreen.test.tsx` | Aprobado |
| IT-06 | Cliente de publicación | Respuestas de API simuladas | Contrato de publicación interpretado correctamente | `frontend/src/lib/api.publication.test.ts` | Aprobado |

## Transiciones representativas

| ID | Transición | Precondiciones/entrada | Resultado esperado | Evidencia automatizada | Estado |
|---|---|---|---|---|---|
| TR-01 | Inicio de sesión: pendiente → autenticado/error | Login exitoso o rechazado | Se limpia marcador o se muestra error | `frontend/src/app/App.test.tsx` | Aprobado |
| TR-02 | Triage: creación → historial actualizado | POST exitoso, respuesta perdida o refresh fallido | Idempotencia conservada y no duplicación | `frontend/src/features/auth/AuthenticatedLanding.test.tsx` | Aprobado |
| TR-03 | Triage: búsqueda nueva → respuesta vigente | Respuestas fuera de orden | Se ignora respuesta obsoleta | `frontend/src/features/clinical/StaffClinicalWorkspace.test.tsx` | Aprobado |
| TR-04 | Recomendación: borrador → aprobada → retirada | Colección editable y acciones secuenciales | Revisiones y estado visibles coherentes | `frontend/src/features/clinical/RecommendationsScreen.test.tsx` | Aprobado |
| TR-05 | Revisión → publicación | Versión pendiente y revisiones esperadas | Publicación confirmada solo tras validación | `frontend/src/features/clinical/FinalReviewScreen.test.tsx` | Aprobado |
| TR-06 | Publicación vigente → corrección/conflicto | Motivo ausente, revisión obsoleta o corrección válida | Se exige motivo; conflicto no se marca como éxito; revisión se refresca | `frontend/src/features/clinical/FinalReviewScreen.test.tsx` | Aprobado |

## Matriz de estados clínicos

La matriz usa únicamente estados observados en los fixtures y expectativas actuales; no agrega transiciones no demostradas.

| Dominio | Estado inicial | Evento/condición | Estado o efecto verificado | Evidencia |
|---|---|---|---|---|
| Triage | `IN_PROGRESS` | Severidad final no confirmada | Recomendaciones no elegibles; se muestra acción clínica | `frontend/src/features/clinical/RecommendationsScreen.test.tsx` |
| Triage | `PENDING_REVIEW` | Revisión clínica | Disponible para recomendaciones/revisión | `frontend/src/features/clinical/RecommendationsScreen.test.tsx` |
| Triage | `APPROVED` | Versión bloqueada | No admite cambios; puede indicar revisión final | `frontend/src/features/clinical/RecommendationsScreen.test.tsx` |
| Recomendación | Borrador | Generar o agregar manualmente | Colección actualizada y fuente visible | `frontend/src/features/clinical/RecommendationsScreen.test.tsx` |
| Recomendación | No aprobada | Aprobar/quitar aprobación | Estado y revisión se actualizan | `frontend/src/features/clinical/RecommendationsScreen.test.tsx` |
| Publicación | Revisión final | Publicar con revisiones esperadas | Publicación completada | `frontend/src/features/clinical/FinalReviewScreen.test.tsx` |
| Publicación | Vigente | Corrección con conflicto `409` | No hay éxito falso; se solicita recarga | `frontend/src/features/clinical/FinalReviewScreen.test.tsx` |

Los casos anteriores son evidencia automatizada de comportamiento con dobles de prueba. No equivalen a una prueba de extremo a extremo con servidor, navegador y base de datos desplegados.
