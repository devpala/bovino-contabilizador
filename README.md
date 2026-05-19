# Contabilizador Bovino

Aplicacion web en Next.js 16.2.1 para administrar rodeos bovinos por establecimiento, registrar movimientos y exportar el estado e historial en PDF.

## Stack

- Next.js 16.2.1
- React 19
- PostgreSQL via Prisma 7
- `pg` (driver) + `@prisma/client`
- `jspdf` + `jspdf-autotable`

## Funcionalidades

- Gestion de rodeo por establecimiento
- Alta de establecimientos
- Registro de movimientos:
  - venta
  - muerte
  - nacimiento
  - compra
  - conversion
- Historial filtrado por establecimiento
- Exportacion a PDF del estado actual y del historial

## Requisitos

- Node.js 20+
- PostgreSQL local o remoto

## Variables de entorno

Crea `.env.local` a partir de `.env.example`.

```env
DATABASE_URL=postgresql://postgres:your_password@localhost:5432/bovino_contabilizador
```

## Instalacion

```bash
pnpm install
```

El `postinstall` corre `prisma generate`, asi que el cliente queda listo despues del install.

## Base de datos

Crear la base vacia y dejar que Prisma aplique todas las migraciones:

```bash
createdb bovino_contabilizador
pnpm exec dotenv -e .env.local -- prisma migrate deploy
```

En Windows con PostgreSQL 18:

```powershell
& 'C:\Program Files\PostgreSQL\18\bin\createdb.exe' -U postgres -h localhost -p 5432 bovino_contabilizador
pnpm exec dotenv -e .env.local -- prisma migrate deploy
```

Scripts utiles:

- `pnpm db:migrate` — crear una nueva migracion en dev (edita `prisma/schema.prisma` y corre este comando)
- `pnpm db:generate` — regenerar el cliente Prisma sin tocar la DB
- `pnpm db:pull` — re-importar el esquema desde la DB (solo si se cambio algo fuera de Prisma)
- `pnpm db:studio` — GUI para inspeccionar datos

## Desarrollo

```bash
pnpm dev
```

## Build

```bash
pnpm build
pnpm start
```

## Estructura

- `app/`: rutas y server actions
- `components/`: interfaz principal
- `lib/`: acceso a datos y tipos
- `prisma/schema.prisma`: fuente de verdad del esquema
- `prisma/migrations/`: historial de migraciones aplicadas
- `prisma.config.ts`: config del CLI de Prisma (lee `DATABASE_URL` desde `.env.local` via `dotenv-cli`)

## Publicacion

- No subir `.env.local`
- No subir `.next/`
- No subir `node_modules/`
- No subir `planes/`
