# Contabilizador Bovino

Aplicacion web en Next.js 16.2.1 para administrar rodeos bovinos por establecimiento, registrar movimientos y exportar el estado e historial en PDF.

## Stack

- Next.js 16.2.1
- React 19
- PostgreSQL
- `pg`
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
npm install
```

## Base de datos

Crear la base y aplicar el esquema:

```bash
createdb bovino_contabilizador
psql -d bovino_contabilizador -f db/schema.sql
```

En Windows con PostgreSQL instalado:

```powershell
& 'C:\Program Files\PostgreSQL\18\bin\createdb.exe' -U postgres -h localhost -p 5432 bovino_contabilizador
& 'C:\Program Files\PostgreSQL\18\bin\psql.exe' -U postgres -h localhost -p 5432 -d bovino_contabilizador -f '.\db\schema.sql'
```

## Desarrollo

```bash
npm run dev
```

## Build

```bash
npm run build
npm run start
```

## Estructura

- `app/`: rutas y server actions
- `components/`: interfaz principal
- `lib/`: acceso a datos y tipos
- `db/schema.sql`: esquema PostgreSQL

## Publicacion

- No subir `.env.local`
- No subir `.next/`
- No subir `node_modules/`
- No subir `planes/`
