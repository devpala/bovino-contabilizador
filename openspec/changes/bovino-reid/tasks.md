## 1. Reconocimiento (sin tocar nada)

- [ ] 1.1 Confirmar nombre exacto y campos del modelo Prisma de fichas individuales y fotos (esperado: `Animal` y `AnimalImage`; reportar la relación y `@map` de cada campo)
- [ ] 1.2 Reportar conteo actual de filas en `animal_images` (define si va índice ANN o scan secuencial)
- [ ] 1.3 Reportar versión exacta de Postgres (`select version()`) y si la extensión `pgvector` está disponible (`select * from pg_available_extensions where name = 'vector'`); si no está, documentar el paquete necesario para Postgres 18 en Windows
- [ ] 1.4 Reportar el shape exacto de retorno esperado por `uploadAnimalImageAction` para no romper el contrato cuando agreguemos el hook de embedding
- [ ] 1.5 Pegar al usuario el plan + diff preview ANTES de aplicar nada

## 2. Migración pgvector + columna embedding (commit 1)

- [ ] 2.1 Crear nueva migración Prisma `add_image_embedding` con SQL raw: `CREATE EXTENSION IF NOT EXISTS vector;` y `ALTER TABLE animal_images ADD COLUMN embedding vector(512);`
- [ ] 2.2 Agregar al modelo `AnimalImage` en `prisma/schema.prisma`: `embedding Unsupported("vector(512)")? @map("embedding")` (Unsupported porque Prisma no entiende `vector` nativamente)
- [ ] 2.3 Aplicar migración con `pnpm db:migrate --name add_image_embedding`
- [ ] 2.4 Verificar con `prisma migrate status` que reporta "up to date"
- [ ] 2.5 NO correr `prisma db pull` — arruina los `@map` y el `Unsupported` (gotcha de CLAUDE.md)

## 3. Servicio de embeddings con CLIP ONNX (commit 2)

- [ ] 3.1 Agregar dep `onnxruntime-node` con `pnpm add onnxruntime-node` y `pnpm add -D @types/sharp` (sharp para preprocess de imagen)
- [ ] 3.2 Agregar `pnpm add sharp` (preprocess: resize 224 + center crop + tensor)
- [ ] 3.3 Crear `scripts/download-clip-model.ts` que descarga ViT-B/32 ONNX desde HuggingFace (`Xenova/clip-vit-base-patch32`), verifica SHA256, y lo guarda en `models/clip-vit-b-32.onnx`
- [ ] 3.4 Agregar `models/` al `.gitignore`
- [ ] 3.5 Agregar script `pnpm models:download` que invoca el script anterior
- [ ] 3.6 Crear `lib/embedding.ts` con: `getEmbeddingSession()` (singleton cacheada a nivel módulo), `preprocessImage(buffer)` (resize 224, center crop, normalización CLIP), `embedImage(input: string | Buffer): Promise<Float32Array>` (L2-normalizado, dimensión 512)
- [ ] 3.7 Manejo de errores: imagen no existe → mensaje claro; formato no soportado → listar formatos válidos; modelo no descargado → mensaje pidiendo correr `pnpm models:download`
- [ ] 3.8 Comentario en `embedImage` explicando por qué se L2-normaliza (con vectores normalizados, coseno y producto interno son equivalentes)
- [ ] 3.9 Confirmar dimensión real del modelo descargado (debería ser 512 para ViT-B/32; si difiere, ajustar la migración antes de aplicar)

## 4. Backfill action (commit 3)

- [ ] 4.1 Agregar tipo `ReidBackfillResult` en `lib/types.ts`: `{ procesadas: number; fallidas: number; pendientes: number }`
- [ ] 4.2 Crear server action `generarEmbeddingsPendientes()` en `app/actions.ts`
- [ ] 4.3 Implementar con `prisma.$queryRaw` para seleccionar `id, file_path, animal_id` de `animal_images where embedding is null` en lotes de 16
- [ ] 4.4 Para cada lote, generar embeddings y actualizar con `prisma.$executeRaw\`update animal_images set embedding = ${vec}::vector where id = ${id}\``
- [ ] 4.5 Capturar errores por foto (archivo faltante, embedding fail) sin abortar el lote; incrementar `fallidas` y loggear
- [ ] 4.6 Idempotencia: la query `where embedding is null` garantiza que las ya procesadas no vuelven
- [ ] 4.7 Devolver el resumen `{ procesadas, fallidas, pendientes }` al cliente

## 5. Server action de búsqueda + lib/reid.ts (commit 4)

- [ ] 5.1 Agregar tipo `ReidMatch` en `lib/types.ts`: `{ animalId: string; score: number; fotoMatch: { id: string; filePath: string; fileName: string } }`
- [ ] 5.2 Crear `lib/reid.ts` con `buscarSimilaresPorEmbedding(embedding: Float32Array, topK: number): Promise<ReidMatch[] | "sin datos indexados">`
- [ ] 5.3 Implementar con `prisma.$queryRaw`: `select ai.id, ai.animal_id, ai.file_path, ai.file_name, 1 - (ai.embedding <=> ${query}::vector) as score from animal_images ai where ai.embedding is not null order by ai.embedding <=> ${query}::vector limit ${topK * 5}` (buscamos topK*5 para tener margen al agregar)
- [ ] 5.4 Agregación best-match en TypeScript: agrupar por `animal_id`, quedarse con el `score` máximo por animal, ordenar descendente, slice topK
- [ ] 5.5 Comentario explicando: best-match maximiza recall vs promediar que penaliza fotos malas
- [ ] 5.6 Si no hay filas con embedding → devolver string literal `"sin datos indexados"` (caller decide qué mostrar)
- [ ] 5.7 Score redondeado a 4 decimales
- [ ] 5.8 Crear server action `buscarSimilares(formData)` en `app/actions.ts`: recibe foto del formData, llama a `embedImage`, llama a `buscarSimilaresPorEmbedding`, devuelve `{ status: "ok" | "sin datos indexados", results: ReidMatch[] }`
- [ ] 5.9 Manejo de imagen query inválida: error explícito (formato/corrupción), no stack de ONNX al cliente

## 6. Hook en upload (parte del commit 5)

- [ ] 6.1 En `uploadAnimalImageAction`, después del `await createAnimalImage(...)` exitoso, intentar `embedImage(stored.filePath)` dentro de try/catch
- [ ] 6.2 Si el embedding sale OK: `prisma.$executeRaw\`update animal_images set embedding = ${vec}::vector where id = ${savedImage.id}::bigint\``
- [ ] 6.3 Si falla: `console.error("embedding falló para imagen X:", err)` y continuar; la foto YA está guardada, no romper el upload
- [ ] 6.4 NO cambiar el shape del retorno de `uploadAnimalImageAction` (contrato preservado)

## 7. UI `/buscar` (commit 5)

- [ ] 7.1 Crear ruta `app/buscar/page.tsx` (server component que carga conteo de embeddings pendientes y total)
- [ ] 7.2 Crear `components/reid-search-page.tsx` (client component) con: `PageShell`, upload form (acepta `.jpg .jpeg .png .webp`), grid de resultados
- [ ] 7.3 Cada tarjeta de resultado: thumbnail (`<img src={r.fotoMatch.filePath} />`), ID animal, score visible (formato `0.8423`), link `/animales/<categoria>/<animalId>`
- [ ] 7.4 Mensaje persistente arriba del grid: "Estas son sugerencias por similitud visual. Requieren confirmación humana." (texto exacto, copy revisable por el usuario)
- [ ] 7.5 Botón "Generar embeddings pendientes" con feedback `{ procesadas, fallidas, pendientes }`
- [ ] 7.6 Estado vacío: si `total_indexados === 0` → mensaje "Sin datos indexados — generá embeddings primero" + botón prominente
- [ ] 7.7 Verificar copy: NO debe aparecer "identificado", "este es el animal", "coincide con" ni equivalentes
- [ ] 7.8 Estilos en `app/globals.css` (clases nuevas: `reid-grid`, `reid-card`, `reid-score`, `reid-disclaimer`)
- [ ] 7.9 Agregar link "Buscar por foto" en el toolbar principal (al lado de "Conteo")

## 8. Docs + verificación (commit 6)

- [ ] 8.1 Actualizar `CLAUDE.md` con: nueva sección del feature, dep `onnxruntime-node`, procedimiento para `pnpm models:download` y dónde sale el `.onnx`, prohibición renovada de `prisma db pull` (ahora también arruina `Unsupported("vector(512)")`)
- [ ] 8.2 Documentar en `CLAUDE.md` el patrón de queries con `$queryRaw`/`$executeRaw` para campos `vector` (Prisma typed client no los soporta)
- [ ] 8.3 `npx tsc --noEmit` limpio
- [ ] 8.4 `pnpm lint` limpio (warnings de `<img>` pre-existentes son aceptables, no agregar nuevos)
- [ ] 8.5 Verificación end-to-end manual (pegar salida al usuario):
  - [ ] 8.5.1 Modelo descargado: `models/clip-vit-b-32.onnx` existe y SHA256 verifica
  - [ ] 8.5.2 Backfill corre y reporta N procesadas sobre las fotos existentes
  - [ ] 8.5.3 Subo foto query → veo top 5 candidatos con scores
  - [ ] 8.5.4 Click en una tarjeta abre la ficha del animal
  - [ ] 8.5.5 Subir una foto nueva a una ficha → tras el upload, su embedding existe en DB
  - [ ] 8.5.6 Simular fallo de embedding (renombrar el `.onnx` temporalmente) y subir foto → la foto se guarda, el error se loggea, el upload responde OK al cliente
  - [ ] 8.5.7 Visitar `/buscar` con 0 embeddings → ver estado vacío correcto

## 9. Commits ordenados

- [ ] 9.1 Commit 1: "migración pgvector + columna embedding"
- [ ] 9.2 Commit 2: "servicio de embeddings (CLIP ONNX)"
- [ ] 9.3 Commit 3: "backfill de fichas existentes"
- [ ] 9.4 Commit 4: "server action de búsqueda"
- [ ] 9.5 Commit 5: "UI de búsqueda + hook en upload"
- [ ] 9.6 Commit 6: "docs/CLAUDE.md"
