## Context

El proyecto es una app Next.js 16 / React 19 / TS 5.9 con Postgres 18 + Prisma 7.8 (`@prisma/adapter-pg`). Hay fichas individuales de animales (`Animal`) con fotos (`AnimalImage`) que viven en `storage/animals/<id>/` y se sirven via `/api/storage/[...path]`. Las server actions están centralizadas en `app/actions.ts`, y la capa de datos sigue el patrón `lib/<dominio>.ts` con mappers + tipos públicos en `lib/types.ts`.

El usuario trabaja en campo y tiene rodeos de cientos de cabezas: necesita un asistente que, dada una foto, sugiera "estas N fichas se parecen, confirmá vos". El producto NO debe presentar identificación automática — es asistencia visual con confirmación humana obligatoria.

## Goals / Non-Goals

**Goals:**
- Generar embedding visual por foto de ficha existente y nueva
- Persistir embeddings en Postgres (única fuente de verdad)
- Búsqueda coseno top-K con agregación best-match por animal
- Backfill idempotente y reanudable para fichas pre-existentes
- Hook en upload que no rompe la subida si el embedding falla
- UI honesta: score visible, "requiere confirmación humana", nunca "identificado: ficha #X"

**Non-Goals:**
- Conteo / detección de cuántos animales (eso es otro feature, YOLO)
- Fine-tuning de CLIP — con CLIP genérico la precisión va a ser limitada y eso es aceptable como v1
- Bounding boxes / recorte automático
- Búsqueda por texto ("vaca blanca") — requeriría text encoder + tokenizer, no pedido
- Microservicios Python / dependencia PyTorch
- FAISS, archivos de índice, `metadata.json`, modelos paralelos

## Decisions

### CLIP via `onnxruntime-node`, no PyTorch

Embeddings con CLIP image encoder ViT-B/32 exportado a ONNX, corriendo en CPU dentro del proceso Node. Pesos cacheados localmente, sin red en runtime.

**Por qué**: el proyecto es Next.js puro. Meter Python implicaría un microservicio aparte, otra deploy unit, latencia de red, complejidad operativa. ONNX Runtime corre dentro del mismo proceso, sin red, con buen rendimiento en CPU para una imagen a la vez (~200-300ms post-warmup).

**Alternativas consideradas**:
- _PyTorch_: requiere Python, otra deploy unit. Descartado.
- _OpenAI embeddings API_: tiene red en runtime, costo por request, dependencia externa. Descartado.
- _Transformers.js_: WebGPU/WASM, peor performance en CPU server-side que ONNX nativo. Descartado.

### Vectores en Postgres con pgvector, NO FAISS / NO archivo

Una sola fuente de verdad: la DB. El embedding cuelga del `AnimalImage` que ya existe, mismo lifecycle (cascade delete, backup, replicación si la hubiera).

**Por qué**: FAISS o índice en disco implica sync manual con la DB, riesgo de drift, otro lugar para perder datos. pgvector es maduro y para este tamaño (cientos a miles de fotos) sobra.

**Alternativas**: FAISS en disco (descartado por drift), Qdrant/Pinecone externos (overkill, costo).

### Vectores L2-normalizados; similitud coseno

Embedding se normaliza dentro de `lib/embedding.ts` antes de devolverlo. Búsqueda usa `vector_cosine_ops` de pgvector.

**Por qué**: con vectores normalizados, coseno y producto interno son equivalentes; el código queda explícito sobre la métrica. Comentario en el código documenta esto.

### Índice ANN — decisión diferida

**No decidir hasta el paso de reconocimiento** (ver tasks.md). Regla:
- < 1k fotos → scan secuencial sin índice (exacto, sin pérdida, mantenimiento cero)
- 1k–100k → HNSW si pgvector ≥ 0.5, si no IVFFlat
- > 100k → HNSW obligatorio

**Por qué**: ANN sobre datasets chicos no mejora latencia notablemente y agrega complejidad (parámetros, tiempos de build). En cientos de fotos el scan es <50ms.

### Best-match aggregation por animal

Una ficha puede tener varias fotos. La búsqueda devuelve el **mejor score por animal**, no un promedio.

**Por qué**: best-match maximiza recall — basta una foto que matchee para que la ficha aparezca. Promediar penaliza fichas con alguna foto mala (mal ángulo, mala luz). Trade-off documentado en comentario del código.

**Alternativas**: promedio (penaliza ruido), top-3 promediado (más complejo, marginal). Descartadas.

### Hook en upload: best-effort, no bloqueante

Cuando se sube una foto, se genera el embedding en el mismo server action. Si falla, se loggea y la foto queda sin embedding — el backfill la levanta después. La subida nunca falla por embedding.

**Por qué**: el usuario en campo no debe ver errores raros por algo que es asistencia. La integridad de la foto es prioritaria; el embedding es derivable.

**Alternativa**: cola async (BullMQ, etc.) → overkill para una operación de 300ms. Si más adelante hay batch grande, se introduce cola.

### Tamaño del vector

`vector(512)` para CLIP ViT-B/32. Confirmar contra el ONNX real en el paso de implementación (algunos exports producen 768 si usan ViT-L). Si difiere, ajustar la migración antes de aplicar.

### Modelo CLIP: descarga y verificación

El `.onnx` NO se commitea (es ~150mb). Convención:
- Script `scripts/download-clip-model.ts` o instrucción en CLAUDE.md
- Modelo cacheado en `models/clip-vit-b-32.onnx` (gitignored)
- SHA256 verificado tras descarga
- Fuente: huggingface (`Xenova/clip-vit-base-patch32`) o conversión propia documentada
- `lib/embedding.ts` falla con mensaje claro si el modelo no está

## Risks / Trade-offs

- **CLIP genérico tiene precisión limitada para distinguir bovinos individuales** — muchas Holando se ven idénticas para un modelo no entrenado en ganado. → **Mitigación**: UI explícita ("sugerencia, requiere confirmación"), mostrar score, no presentar como identificación automática. Si más adelante se necesita precisión real, el camino es fine-tuning con fotos del rodeo, no más ingeniería sobre CLIP base.

- **Warmup de ONNX en cold start** ~1-3s la primera vez que se carga el modelo. → **Mitigación**: cachear la sesión a nivel módulo, primer request espera, los siguientes son ms. En Next.js dev/prod la sesión persiste mientras el server esté arriba.

- **Embedding falla silenciosamente en upload** sin que el usuario sepa que esa foto no es buscable. → **Mitigación**: `generarEmbeddingsPendientes()` lista cuántas quedan; UI tiene botón visible para correrlo.

- **`pgvector` puede no estar instalado** en el Postgres del usuario (Postgres 18 lo soporta pero la extensión es separada). → **Mitigación**: la migración usa `CREATE EXTENSION IF NOT EXISTS vector` y falla loud con mensaje claro si la extensión no está disponible. README documenta el `apt-get install postgresql-18-pgvector` o equivalente Windows.

- **Migración Prisma con tipos custom (`vector`)** — Prisma no entiende el tipo `vector` nativamente. → **Mitigación**: usar `Unsupported("vector(512)")` en el schema y queries con SQL raw (`prisma.$queryRaw`) para insertar y buscar. Los mappers normales siguen para los campos conocidos.

- **`prisma db pull` arruinaría el `Unsupported("vector(512)")`** y los `@map` (gotcha conocido del CLAUDE.md). → **Mitigación**: prohibido `db pull` después de esta migración; documentado en CLAUDE.md.

## Migration Plan

1. **Reconocimiento (sin tocar nada)** — reportar al usuario:
   - Modelo Prisma de fichas y fotos (esperado: `Animal` y `AnimalImage` según CLAUDE.md)
   - Conteo actual de fotos en `animal_images` (decide índice ANN)
   - Versión exacta de Postgres y disponibilidad de `pgvector`
2. **Migración pgvector + columna embedding** (commit 1)
3. **Servicio de embeddings** `lib/embedding.ts` con ONNX (commit 2)
4. **Backfill action + script de descarga del modelo** (commit 3)
5. **Server action de búsqueda + `lib/reid.ts`** (commit 4)
6. **UI `/buscar` + hook en `uploadAnimalImageAction`** (commit 5)
7. **CLAUDE.md actualizado + verificación end-to-end** (commit 6)

**Rollback**: borrar la columna `embedding` (no rompe lecturas existentes), opcionalmente `DROP EXTENSION vector`. Sin pérdida de datos del dominio.
