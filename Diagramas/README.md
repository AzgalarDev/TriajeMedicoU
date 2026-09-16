# Diagrama de componentes

El diagrama representa la arquitectura implementada actualmente en TriajeMedicoU.

## Archivos

- `diagrama-componentes.mmd`: fuente editable en Mermaid.
- `diagrama-componentes.png`: imagen lista para documentación.
- `diagrama-componentes.pen`: fuente visual editable en OpenPencil.
- `diagrama-despliegue.mmd`: diagrama editable del despliegue del sistema.
- `diagrama-clases-actual.mmd`: modelo de clases actual, con elementos futuros del esquema identificados.
- `diagrama-clases-actual.png`: imagen del modelo de clases actual.
- `diagrama-clases-actual.svg`: versión vectorial del modelo de clases actual.

## Alcance

Se incluyen el frontend React/Vite, la API NestJS, los módulos implementados, Prisma y PostgreSQL. La integración con un servicio LLM no aparece porque todavía no está implementada.

El diagrama de despliegue muestra el equipo del usuario, el servidor web, el servidor de aplicaciones Node.js/NestJS y PostgreSQL ejecutado dentro de Docker con almacenamiento persistente.

El diagrama de clases refleja el modelo persistido actual. `PreguntaTriaje`, `RespuestaTriaje` y `Recomendacion` aparecen como **solo esquema** porque todavía no están integradas en el flujo funcional.
