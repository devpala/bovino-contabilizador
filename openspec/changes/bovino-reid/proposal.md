## Why

Hoy las fichas individuales del [[Contabilizador Bovino]] son una base de datos plana: para responder "¿esta vaca que estoy mirando es la de la ficha #123?" hay que recordar identificadores, abrir fichas a mano y comparar fotos visualmente. En un rodeo de cientos de cabezas eso no escala. Queremos un **asistente de re-identificación visual**: subo una foto, me sugiere las N fichas más parecidas con un score, y yo confirmo cuál es.

## What Changes

- Agregar extensión `pgvector` a la base existente (`CREATE EXTENSION IF NOT EXISTS vector`) vía migración Prisma explícita.
- Agregar columna `embedding vector(512)` (nullable) al modelo `AnimalImage` para guardar el embedding L2-normalizado de cada foto.
- Crear servicio `lib/embedding.ts` que carga CLIP ViT-B/32 image encoder via `onnxruntime-node` (CPU, sesión cacheada a nivel módulo) y devuelve `Float32Array` normalizado.
- Crear server action `generarEmbeddingsPendientes()` — backfill idempotente de fotos sin embedding.
- Crear server action `buscarSimilares(imagenQuery, topK = 5)` — recibe foto, devuelve `[{ animalId, score, fotoMatch }]` agregado best-match por animal.
- Hookear el upload de fotos (`uploadAnimalImageAction`): tras guardar la foto, generar embedding en background; si falla, foto se guarda igual.
- Nueva pantalla `/buscar` (kebab a definir) con form de upload + grid de resultados; CSS plano en `globals.css`. Mensaje explícito: "sugerencia visual, requiere confirmación humana".
- Dependencias nuevas: `onnxruntime-node`. Pesos `.onnx` NO commiteados (script de descarga con verificación de hash).

No hay BREAKING — el feature es aditivo. Las queries existentes sobre `animal_images` siguen igual; el embedding es opcional.

## Capabilities

### New Capabilities

- `bovino-reid`: re-identificación de animales individuales por foto. Cubre generación de embeddings CLIP, persistencia en pgvector, búsqueda coseno best-match por animal, backfill idempotente, hook en upload, y la UI de sugerencia con confirmación humana obligatoria.

### Modified Capabilities

_Ninguna — no hay specs previos en `openspec/specs/` y el feature no cambia el comportamiento de capacidades existentes._

## Impact

- **Schema/DB**: extensión `pgvector` + columna `AnimalImage.embedding`. Decisión de índice (HNSW vs IVFFlat vs sin índice) según conteo real de fotos en el paso de reconocimiento.
- **Código**:
  - `prisma/schema.prisma` + nueva migración
  - `lib/embedding.ts` (nuevo)
  - `lib/reid.ts` (nuevo — query y agregación best-match)
  - `lib/types.ts` (nuevo tipo `ReidMatch`)
  - `app/actions.ts` (3 actions nuevas: backfill, búsqueda, hook implícito en upload existente)
  - `app/buscar/page.tsx` + `components/reid-search-page.tsx` (nuevos)
  - `app/globals.css` (estilos del grid de resultados)
- **Deps**: `onnxruntime-node` (~50mb), modelo CLIP `.onnx` descargable (~150mb, fuera del repo, en `models/` ignorado por git).
- **Runtime**: CPU inference por foto; primer warmup del modelo ~1-3s; inferencia subsiguiente <300ms en CPU moderna.
- **Sin red en runtime**: pesos cacheados localmente, sin llamadas externas durante uso normal.
- **CLAUDE.md**: actualizar con el feature, la dep `onnxruntime-node`, dónde sale el `.onnx`, y los gotchas que aparezcan.
