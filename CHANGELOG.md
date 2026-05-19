# Changelog

Cambios notables del Contabilizador Bovino.

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y versionado [SemVer](https://semver.org/lang/es/).

## [Unreleased]

### Added

- **Feature de conteo** (`/conteo`): subida de videos del rodeo por establecimiento, reproductor inline, contador manual `+/−` por video y campo de notas. Persistencia en la tabla `counting_sessions` (Postgres), con columnas `manualCount` y `autoCount` (esta última reservada para integraciones futuras de visión por computadora). Botón "Conteo" agregado al toolbar principal, al lado de "Historial de ventas". Archivos en `storage/conteos/<establishmentId>/<timestamp>-<safeName>.<ext>`.
- **Servicio de almacenamiento de videos**: `lib/storage.ts` ahora expone `saveCountingVideoFile` con sanitización de nombre, validación de extensión y guardado idempotente. La ruta `app/api/storage/[...path]/route.ts` reconoce MIME types de video (`mp4`, `mov`, `webm`, `m4v`, `avi`, `mkv`) además de imágenes.
- **`lib/prisma.ts`**: singleton de `PrismaClient` construido con `@prisma/adapter-pg`. Reemplaza el `getPool()` previo y es la única vía de acceso a la base.
- **`CLAUDE.md`**: guía técnica del proyecto para sesiones de Claude Code (stack, scripts, convenciones, gotchas).
- **OpenSpec**: workspace inicializado en `openspec/` con la primera change `bovino-reid` (re-identificación de bovinos por imagen) lista con proposal, design, specs y tasks. Los slash commands y skills correspondientes viven en `.claude/`.
- **`bovino-reid-spec.md`**: brief original del feature de re-identificación, reflejado en la change de OpenSpec.

### Changed

- **Capa de datos migrada de `pg` raw a Prisma 7.8** con `@prisma/adapter-pg`:
  - `lib/animals.ts`, `lib/records.ts` y `lib/counting.ts` reescritos manteniendo sus signatures públicas (cero cambios en `app/actions.ts` ni en las rutas).
  - `lib/types.ts` mantiene los tipos públicos; las queries devuelven tipos generados de `@prisma/client` que se mapean a los públicos en cada lib.
  - Transacciones manuales (`pool.connect()` + `begin/commit/release`) reemplazadas por `prisma.$transaction(async (tx) => ...)`.
  - Queries de agregación pasan a `groupBy`; correlated subqueries pasan a `include`.
- **Schema con convención PascalCase + camelCase**: los 6 modelos en `prisma/schema.prisma` usan PascalCase (`Animal`, `AnimalImage`, `Establishment`, `InformationAnimal`, `VaccinationRecord`, `CountingSession`) con `@@map` a las tablas snake_case en Postgres. Los campos usan camelCase con `@map` a las columnas snake_case. Sin migración de datos: solo cambia cómo Prisma se refiere a la base.
- **`@updatedAt`** aplicado a `Animal.updatedAt` y `CountingSession.updatedAt` (Prisma gestiona el timestamp).
- **`next.config.ts`**: `experimental.serverActions.bodySizeLimit` aumentado de `25mb` a `500mb` para soportar uploads de videos del feature de conteo. (Si crece más, conviene presigned URLs en lugar de seguir subiendo el límite.)
- **`README.md`**: actualizado al workflow Prisma (`pnpm db:migrate`, `pnpm db:studio`, etc.) y a `pnpm` como gestor canónico.
- **`.gitignore`**: agregadas reglas para `backup-*.dump` (dumps de Postgres) y `models/` (pesos `.onnx` futuros del feature de re-identificación).
- **`package.json`**: scripts de DB (`db:pull`, `db:generate`, `db:migrate`, `db:studio`) wrapeados con `dotenv -e .env.local --` (Prisma CLI no lee `.env.local` por defecto). `postinstall` regenera el cliente. Agregado `pnpm.onlyBuiltDependencies` para permitir los postinstall scripts de Prisma bajo pnpm 10.

### Removed

- **`lib/db.ts`**: el `getPool()` basado en `pg` raw quedó sin clientes tras la migración a Prisma.
- **`db/schema.sql`**: dejó de ser canónico. La fuente de verdad del esquema es `prisma/schema.prisma` + el historial en `prisma/migrations/`.
- **Deps directas `pg` y `@types/pg`**: vienen como transitivas vía `@prisma/adapter-pg`, no hace falta declararlas a nivel de proyecto.

### Database

- Nueva tabla `counting_sessions` (id, establishmentId FK, fileName, filePath, fileSizeBytes, manualCount, autoCount, notes, createdAt, updatedAt).
- Migraciones aplicadas:
  - `0_init`: baseline de las 5 tablas pre-existentes (`animals`, `animal_images`, `establishments`, `information_animals`, `vaccination_records`). Marcada como aplicada con `prisma migrate resolve --applied 0_init` para no re-ejecutar SQL sobre tablas con datos.
  - `20260518225156_add_counting_sessions`: tabla nueva del feature de conteo.

### Tooling

- **Prisma 7.8** con `@prisma/adapter-pg` (sin Rust query engine en runtime).
- **`dotenv-cli`** para inyectar `.env.local` en invocaciones del CLI de Prisma.
- **OpenSpec 1.3.1** para spec-driven development de features futuras.

### Notes

- El feature de re-identificación (`bovino-reid`) está **especificado pero no implementado**. Bloqueador conocido: la extensión `pgvector` no está disponible en el Postgres 18 local del entorno de desarrollo del mantenedor. La implementación se retoma cuando se resuelva la instalación de pgvector (build desde fuente para Windows, o Postgres en Docker con pgvector pre-instalado).
- No hay cambios en el contrato público de `app/actions.ts` ni en las rutas existentes — la migración a Prisma es completamente interna a `lib/`.
