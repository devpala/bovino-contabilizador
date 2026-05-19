# Contabilizador Bovino

Aplicación web para administrar rodeos bovinos por establecimiento. Caso de uso real: el establecimiento **"El Modelo"** (ganadería bovina). La UI permite registrar el stock por categoría, eventos (venta, muerte, nacimiento, compra, conversión), fichas individuales con fotos, conteo asistido por video, e historial filtrable; exporta estado e historial a PDF.

## Stack

- **Runtime**: Node 20+ / pnpm 10.28
- **Framework**: Next.js 16.2.1 (App Router, Turbopack, server actions)
- **UI**: React 19, CSS plano en `app/globals.css` (sin Tailwind/CSS-in-JS)
- **TypeScript**: 5.9
- **DB**: PostgreSQL 18 local (`localhost:5432/bovino_contabilizador`)
- **ORM**: Prisma 7.8 con `@prisma/adapter-pg` (driver `pg` por debajo, sin Rust query engine en runtime)
- **PDF**: `jspdf` + `jspdf-autotable`
- **Env**: variables en `.env.local`, leídas por Next automáticamente y por Prisma CLI via `dotenv-cli`

## Setup

```bash
pnpm install        # postinstall corre prisma generate
createdb bovino_contabilizador
pnpm exec dotenv -e .env.local -- prisma migrate deploy
pnpm dev
```

## Estructura

```
app/                rutas Next (App Router)
  actions.ts        TODAS las server actions
  api/storage/      sirve archivos de storage/ (imágenes + videos)
  page.tsx          dashboard (/)
  animales/         /animales/[categoria]/[animalId]
  informacion/      /informacion/[seccion]
  ventas/           /ventas
  conteo/           /conteo
components/         interfaz (mayormente client components)
lib/
  prisma.ts         singleton de PrismaClient con PrismaPg adapter
  animals.ts        CRUD de animales + imágenes (Prisma)
  records.ts        dashboard, establecimientos, vacunación, movimientos, información (Prisma)
  counting.ts       CRUD de sesiones de conteo (Prisma)
  storage.ts        helpers de filesystem para uploads
  categories.ts     CATEGORIES (vacas, toros, novillitos, vaquillonas, terneras, terneros)
  information.ts    constantes para `information_animals`
  types.ts          tipos PÚBLICOS (los que devuelven los mappers de lib/*)
prisma/
  schema.prisma     fuente de verdad del esquema
  migrations/       historial Prisma
prisma.config.ts    config de Prisma CLI (datasource via env)
storage/            archivos locales (gitignored salvo subcarpetas)
  animals/<id>/     fotos de cada animal
  conteos/<id>/     videos de conteo por establecimiento
```

## Base de datos (Prisma)

- **6 modelos** en `prisma/schema.prisma`: `Animal`, `AnimalImage`, `Establishment`, `InformationAnimal`, `VaccinationRecord`, `CountingSession`.
- **Naming**: modelos PascalCase, campos camelCase. Las tablas y columnas físicas en Postgres siguen snake_case via `@@map(...)` y `@map("...")`. Acceso desde código: `prisma.animal`, `prisma.countingSession`, etc.
- **IDs**: `BigInt` en Prisma. Convertir a/desde `string` en los mappers (`row.id.toString()`, `BigInt(input.id)`).
- **Updates con WHERE compuesto** (no PK): usar `updateMany` + chequear `result.count > 0`, después `findUnique` si necesitás la fila. Patrón usado en `updateAnimal`, `deleteAnimal`, `deleteInformationAnimal`.
- **Transacciones interactivas**: `prisma.$transaction(async (tx) => { ... })`. Rollback automático si throwea.
- **`@updatedAt`** está en `Animal.updatedAt` y `CountingSession.updatedAt` — Prisma lo gestiona, no hace falta `updatedAt: new Date()` en los updates.
- **Errores not-found**: `Prisma.PrismaClientKnownRequestError` con `code === "P2025"`. Helper `isNotFound(error)` en cada lib.
- **JSON fields** (`herd_detail`, `detail`): cast `as Prisma.InputJsonValue` para INPUT; para OUTPUT, tratar como `unknown` y pasar por `sanitizeDetail`.
- **CHECK constraints** (rangos no negativos, enums informales): viven en la DB de las 5 tablas viejas (heredados del SQL original que ya se borró). Prisma NO los gestiona — si se agregan/quitan, hay que hacer una migración con SQL raw.

## Scripts

| Comando | Para qué |
| --- | --- |
| `pnpm dev` | Next dev server (Turbopack) |
| `pnpm build` / `pnpm start` | producción |
| `pnpm lint` | ESLint |
| `pnpm db:migrate` | crear + aplicar migración en dev (después de editar `schema.prisma`) |
| `pnpm db:generate` | regenerar cliente Prisma sin tocar la DB |
| `pnpm db:pull` | re-importar schema desde la DB (solo si se cambió fuera de Prisma) |
| `pnpm db:studio` | GUI de Prisma en `http://localhost:5555` |

**Importante**: TODOS los scripts de Prisma están wrapeados con `dotenv -e .env.local --` porque Prisma CLI no lee `.env.local` por defecto. Si invocás `prisma` a mano, hacelo via `pnpm exec dotenv -e .env.local -- prisma <cmd>`.

## Convenciones de código

- **API pública de `lib/*`**: las funciones devuelven tipos de `lib/types.ts` (no tipos de Prisma directos). Esto desacopla la capa de presentación del ORM.
- **Mappers** (`mapAnimalRow`, `mapRow`, `mapEstablishment`, etc.) hacen `BigInt → string`, `Date → ISO string`, y convierten relaciones incluidas en `establishmentName`/`animalIdentifier`/etc.
- **Server actions** (toda la mutación) viven en `app/actions.ts`. Los components llaman desde el cliente; las rutas server pasan datos via props.
- **Archivos en storage** se referencian via `/api/storage/<path>` (servido por `app/api/storage/[...path]/route.ts`). MIME types soportados incluyen imágenes y videos (mp4, mov, webm, m4v, avi, mkv).
- **Uploads de video**: `next.config.ts` tiene `serverActions.bodySizeLimit: "500mb"` por los videos del feature de conteo. Si crece más, conviene migrar a presigned URLs.

## Gotchas

- **Turbopack cachea el cliente Prisma**: tras `pnpm db:generate` o cambio de schema, si la app tira `prisma.X is undefined`, REINICIAR `pnpm dev`. No alcanza con hot-reload.
- **`pnpm 10` bloquea postinstall scripts**: por eso `package.json` tiene `pnpm.onlyBuiltDependencies` con `prisma`, `@prisma/client`, `@prisma/engines`. Si se agrega una dep que necesita postinstall, sumarla acá.
- **Prisma 7 ya no acepta `url` en el bloque `datasource`** del schema. El URL vive en `prisma.config.ts` via `env("DATABASE_URL")`.
- **`new PrismaClient()` sin args throwea** en Prisma 7. `lib/prisma.ts` lo construye con el adapter pg explícito.
- **`db pull` rompe el rename a PascalCase + `@@map`** — re-introspectar la DB sobrescribe el `schema.prisma` con nombres auto-generados (snake_case modelos, relaciones con IDs feos). Solo usarlo en proyectos nuevos o aceptando que hay que re-aplicar los renames a mano.
- **No hay tests**: la única validación es typecheck (`npx tsc --noEmit`) y ESLint. Verificación funcional siempre es manual en el navegador.

## Notas operativas externas (opcional, maintainer-specific)

El mantenedor del proyecto lleva las notas operativas del establecimiento (fichas individuales en detalle, plan sanitario, ADRs internas) en un vault Obsidian local, fuera del repositorio. No es requerido para contribuir ni para correr el proyecto. Si trabajás como contribuidor externo, ignorá esta sección.
