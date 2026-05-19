# Brief para Claude Code — Re-identificación de bovinos por imagen

> **Proyecto:** Contabilizador Bovino (app web existente).
> **Esto NO es un proyecto nuevo, ni Python, ni FAISS, ni standalone.**
> Es un feature dentro de la app Next.js que ya existe. Respetá el
> stack, las convenciones y los gotchas documentados en `CLAUDE.md`.

---

## Stack del proyecto (contexto, no reabrir)

- Node 20+ / pnpm 10
- Next.js 16 (App Router, Turbopack, server actions)
- React 19, CSS plano en `app/globals.css` (sin Tailwind / sin CSS-in-JS)
- TypeScript 5.9
- Postgres 18 + Prisma 7.8 con `@prisma/adapter-pg`
- Convención de schema: modelos PascalCase / campos camelCase con
  `@map`, `@@map`; BigInt en IDs; server actions centralizadas en
  `app/actions.ts`; desacople vía `lib/types.ts` + mappers; storage
  servido por `/api/storage/[...path]`.

---

## Objetivo del feature

Dada una foto nueva de un bovino, devolver las **fichas individuales
más parecidas** con un score, para responder: *"¿esta vaca es la de la
ficha #123?"*.

Es **re-identificación de individuos**, NO conteo, NO detección, NO
bounding boxes. Se asume que la foto subida es del animal.

**Limitación conocida, explícita en la UI:** CLIP genérico no está
fine-tuneado para distinguir bovinos individuales (muchas Holando se
ven casi idénticas para un modelo no entrenado en ganado). El sistema
es un **asistente de sugerencias** ("estas N fichas se parecen,
confirmá vos"), nunca un identificador automático. La UI debe mostrar
el score y exigir confirmación humana; prohibido mostrar "identificado:
ficha #123" sin confirmación del usuario.

---

## Patrón de trabajo (obligatorio, en este orden)

1. **Reconocimiento ANTES de tocar nada.** No modifiques nada en este
   paso. Reportá:
   - Modelo Prisma de las fichas individuales y de sus fotos: nombre
     exacto, campos, relación entre ficha y foto.
   - Cómo y dónde se guardan hoy las imágenes (ruta de storage, cómo
     las sirve `/api/storage/[...path]`).
   - Versión de Postgres y si la extensión `pgvector` ya está
     instalada o es instalable en este entorno.
   - Dónde viven las server actions (`app/actions.ts`) y el patrón de
     mappers + `lib/types.ts`.
2. **Plan + diff preview ANTES de aplicar.** Listá migración, archivos
   nuevos y cambios a actions con un diff de preview. Lo reviso yo
   antes de que escribas a disco.
3. **Validá ANTES de declarar hecho.** Migración aplicada,
   `npx tsc --noEmit` y `eslint` limpios, y el flujo real ejecutado
   (generar embedding de una ficha existente → subir foto query → ver
   resultados). Pegá la salida.
4. **Commits ordenados, uno por feature**, en este orden:
   `migración pgvector + columna embedding` →
   `servicio de embeddings (CLIP ONNX)` →
   `backfill de fichas existentes` →
   `server action de búsqueda` →
   `UI de búsqueda` →
   `docs/CLAUDE.md`.

Si discrepás de alguna decisión técnica de abajo, argumentá antes de
implementar; la decisión final la tomo yo.

---

## Decisiones de stack ya tomadas (no reabrir salvo bloqueo real)

- **Embeddings con CLIP vía ONNX Runtime** (`onnxruntime-node`), **NO
  PyTorch**. Image encoder de CLIP exportado a ONNX, ViT-B/32, corre en
  CPU dentro de Node. Pesos cacheados localmente, **sin llamadas de red
  en runtime**. Documentar de dónde sale el `.onnx` y cómo se versiona
  (NO commitear el binario grande; script o instrucción de descarga +
  verificación de hash).
- **Vectores en Postgres con pgvector**, **NO FAISS**, **NO archivo en
  disco**. Una sola fuente de verdad: la base de datos.
- **Embeddings L2-normalizados**; similitud vía distancia coseno de
  pgvector (`vector_cosine_ops`). Comentar en el código dónde se
  normaliza y por qué (con vectores normalizados, coseno y producto
  interno son equivalentes).
- Respetar la convención del schema existente: PascalCase modelo /
  camelCase campo con `@map` a snake_case, BigInt como en el resto,
  server actions en `app/actions.ts`, mappers y `lib/types.ts`.

---

## Modelo de datos

- Agregar la extensión pgvector vía **migración Prisma explícita**
  (`CREATE EXTENSION IF NOT EXISTS vector`).
  ⚠️ Gotcha conocido (CLAUDE.md): Prisma 7 + `db pull` arruina los
  renames `@map`. Usar migración explícita, **nunca `db pull`** para
  esto.
- Sobre el modelo de **fotos de ficha existente** (el que reportes en
  el paso 1), agregar columna de embedding:
  - tipo `vector(N)` donde N = dimensión real del modelo CLIP usado
    (512 para ViT-B/32; confirmar contra el ONNX real).
  - nullable.
  - `@map` a snake_case, consistente con el resto del schema.
- Índice para búsqueda coseno: **decisión según el conteo real de
  fotos** (reportarlo). Pocos cientos → scan secuencial exacto, sin
  índice ANN (más simple, sin pérdida de exactitud). Miles+ → HNSW si
  la versión de pgvector lo soporta, si no IVFFlat. Justificá la
  elección con el número real.
- **Prohibido**: crear modelos paralelos, `metadata.json`, carpeta
  `data/`, o cualquier índice en disco. El embedding cuelga de la foto
  de la ficha que ya existe.

---

## Lógica

### `lib/embedding.ts` (o donde corresponda a la estructura real)

- Función que recibe path o buffer de imagen, aplica el preprocess de
  CLIP (resize 224, center crop, normalización del modelo), corre el
  encoder ONNX, devuelve `Float32Array` **L2-normalizado** de dimensión
  fija.
- Modelo ONNX cargado **una sola vez** (sesión cacheada a nivel módulo,
  no por invocación).
- Error claro si la imagen no existe, está corrupta, o el formato no es
  soportado. Formatos soportados: `.jpg .jpeg .png .webp`.

### Server action `generarEmbeddingsPendientes()` — backfill

- Recorre fotos de fichas **sin embedding**, las procesa en lotes,
  persiste el vector.
- **Idempotente y reanudable**: no reprocesar fotos que ya tienen
  embedding. Se puede cortar y volver a correr.
- Reporta cuántas procesó / cuántas fallaron / cuántas quedan.

### Server action `buscarSimilares(imagenQuery, topK = 5)`

- Genera embedding de la query.
- Búsqueda coseno con pgvector, ordenando por distancia.
- **Agrega por ficha individual**: una ficha puede tener varias fotos
  → devolver el **mejor score por ficha** (best-match). Documentar esta
  decisión en un comentario (best-match maximiza recall vs promediar,
  que penaliza fichas con alguna foto mala).
- Salida por resultado: `{ fichaId, score, fotoMatch }`, `score` en
  rango coseno redondeado a 4 decimales.
- Si no hay embeddings generados todavía → estado claro
  `"sin datos indexados"`, **no** error críptico ni excepción cruda.

### Hook en upload de foto

- Cuando se sube una foto nueva a una ficha, encolar/generar su
  embedding.
- **No romper el flujo de subida si el embedding falla**: la foto se
  guarda igual, se registra el error, y queda sin embedding para que el
  backfill la tome después. Un fallo de inferencia NO debe bloquear a
  alguien cargando fichas en el campo.

---

## UI

- Sección/pantalla para subir una foto y ver fichas candidatas: lista
  con thumbnail de la foto match, ID/nombre de la ficha, score, y link
  a la ficha.
- **CSS plano en `globals.css`** como el resto del proyecto. Sin
  Tailwind, sin CSS-in-JS.
- Texto visible obligatorio: el score es una sugerencia de similitud
  visual que **requiere confirmación humana**. No presentar como
  identificación automática.
- Botón para disparar `generarEmbeddingsPendientes()` con feedback de
  progreso/conteo.

---

## Manejo de errores (mínimo exigido)

- Imagen inexistente / corrupta / formato no soportado → mensaje claro
  con contexto.
- Búsqueda sin embeddings indexados → estado vacío explicado, no
  excepción.
- Fallo de embedding en upload → no romper la subida; log + foto
  pendiente para backfill.
- Respetar el manejo de `P2025` y las conversiones BigInt como en el
  resto del código (ver CLAUDE.md).
- Migración sin tocar columnas existentes ni romper los `@map` ya
  definidos.

---

## Criterio de aceptación (cómo sé que está terminado)

- [ ] Migración pgvector aplicada; `npx tsc --noEmit` y `eslint`
      limpios.
- [ ] Flujo ejecutado y pegado: backfill de fichas existentes → subir
      foto query → resultados con score → abrir la ficha sugerida.
- [ ] Foto nueva subida a una ficha genera su embedding **sin romper**
      el flujo de subida (probar también el caso de fallo de embedding:
      la foto se guarda igual).
- [ ] Búsqueda sin datos indexados muestra estado vacío correcto.
- [ ] Una sola fuente de verdad (Postgres). Sin archivos de índice en
      disco, sin modelos paralelos, sin `metadata.json`.
- [ ] `CLAUDE.md` actualizado: el feature, la dependencia
      `onnxruntime-node`, de dónde sale el `.onnx`, y los nuevos
      gotchas encontrados.
- [ ] Commits separados por feature, en el orden indicado.

---

## Fuera de alcance (no hacer ahora)

- Conteo / detección de cuántos animales hay (eso sería YOLO u
  object detection, otra feature distinta).
- Fine-tuning del modelo CLIP.
- Bounding boxes / recorte automático del animal.
- Búsqueda por texto ("vaca blanca"). Con el image encoder ONNX
  requeriría además text encoder + tokenizer en Node; complejidad no
  pedida. Posible add-on futuro, no ahora.
- Cualquier microservicio Python externo o dependencia de PyTorch.

---

## Nota técnica honesta (leer)

CLIP genérico para distinguir bovinos individuales tendrá **precisión
limitada**. Va a funcionar como asistente de sugerencias, no como
identificador confiable. Si más adelante se necesita precisión real, el
camino correcto NO es más ingeniería sobre CLIP base, sino fine-tuning
con fotos propias del rodeo o un modelo específico de re-ID animal.
Este brief construye el asistente; el salto a precisión es un proyecto
aparte.
