## ADDED Requirements

### Requirement: Persistencia de embeddings en pgvector

El sistema SHALL almacenar embeddings visuales como `vector(N)` en la columna `embedding` del modelo `AnimalImage`, donde N coincide con la dimensión del modelo CLIP en uso (512 para ViT-B/32). La columna SHALL ser nullable. Los embeddings SHALL persistirse en la base PostgreSQL existente vía la extensión `pgvector`, sin archivos de índice en disco, sin modelos paralelos, y sin `metadata.json`. Toda la información de re-identificación SHALL tener una única fuente de verdad: la base de datos.

#### Scenario: Migración instala la extensión y crea la columna

- **WHEN** se aplica la migración Prisma de pgvector
- **THEN** la extensión `vector` queda creada en la base, la columna `animal_images.embedding` de tipo `vector(512)` existe nullable, y `prisma migrate status` reporta "up to date"

#### Scenario: Foto existente puede tener embedding nulo

- **WHEN** una foto fue subida antes de habilitar el feature y aún no fue procesada por el backfill
- **THEN** su `embedding` SHALL ser `NULL` y el resto de la app (queries existentes, UI, server actions) sigue funcionando sin alteración

### Requirement: Generación de embeddings con CLIP ONNX

El servicio de embeddings SHALL recibir una imagen (path o buffer), aplicar el preprocess de CLIP (resize 224, center crop, normalización del modelo), correr el image encoder de CLIP ViT-B/32 via `onnxruntime-node` en CPU, y devolver un `Float32Array` L2-normalizado de dimensión fija. La sesión ONNX SHALL cargarse una sola vez por proceso (cacheada a nivel módulo). El servicio SHALL operar sin llamadas de red en runtime; los pesos del modelo SHALL estar cacheados localmente. Los formatos soportados SHALL ser `.jpg`, `.jpeg`, `.png`, `.webp`.

#### Scenario: Primera llamada carga el modelo y embebe

- **WHEN** se invoca el servicio por primera vez tras iniciar el proceso
- **THEN** el modelo ONNX se carga (warmup), el embedding se calcula, y el resultado es un `Float32Array` de 512 elementos con norma L2 = 1 (±1e-5)

#### Scenario: Segunda llamada reutiliza la sesión

- **WHEN** se invoca el servicio una segunda vez en el mismo proceso
- **THEN** NO se vuelve a cargar el modelo, la sesión cacheada se reutiliza, y la latencia es menor a 500ms en CPU moderna

#### Scenario: Imagen inexistente

- **WHEN** se invoca el servicio con un path a un archivo que no existe
- **THEN** se lanza un error claro indicando el path faltante, sin stack trace críptico

#### Scenario: Formato no soportado

- **WHEN** se invoca el servicio con una imagen `.bmp` o `.tiff`
- **THEN** se lanza un error claro listando los formatos soportados (`.jpg .jpeg .png .webp`)

### Requirement: Backfill idempotente de embeddings

La server action `generarEmbeddingsPendientes()` SHALL recorrer todas las fotos de `AnimalImage` con `embedding IS NULL`, procesarlas en lotes, y persistir el vector resultante. La operación SHALL ser idempotente y reanudable: fotos que ya tienen embedding NO SHALL ser reprocesadas, y la operación SHALL poder cortarse y volver a invocarse sin pérdida de progreso. La acción SHALL reportar al cliente cuántas fotos procesó, cuántas fallaron, y cuántas quedan pendientes.

#### Scenario: Backfill inicial sobre fotos pre-existentes

- **WHEN** hay N fotos sin embedding y se invoca `generarEmbeddingsPendientes()`
- **THEN** todas las N fotos quedan con embedding persistido y la respuesta indica `{ procesadas: N, fallidas: 0, pendientes: 0 }`

#### Scenario: Re-ejecución sin trabajo pendiente

- **WHEN** todas las fotos ya tienen embedding y se invoca `generarEmbeddingsPendientes()` nuevamente
- **THEN** la acción retorna `{ procesadas: 0, fallidas: 0, pendientes: 0 }` sin reprocesar nada y sin error

#### Scenario: Reanudación tras interrupción

- **WHEN** el backfill se corta a mitad (N/2 procesadas) y se invoca nuevamente
- **THEN** las N/2 ya procesadas NO se vuelven a procesar; solo se procesan las restantes

#### Scenario: Foto con archivo faltante en disco

- **WHEN** una foto tiene fila en `AnimalImage` pero el archivo físico no existe
- **THEN** se cuenta como fallida, se loggea, y el backfill continúa con las siguientes sin abortar

### Requirement: Búsqueda de similares por imagen

La server action `buscarSimilares(imagenQuery, topK = 5)` SHALL generar el embedding de la imagen query, buscar en pgvector los embeddings más cercanos por distancia coseno (`vector_cosine_ops`), agregar resultados por animal (best-match: mejor score por animal entre todas sus fotos), y devolver hasta `topK` resultados ordenados por score descendente. Cada resultado SHALL contener `{ animalId: string, score: number, fotoMatch: { id, filePath, fileName } }`, con `score` redondeado a 4 decimales en rango coseno [-1, 1].

#### Scenario: Búsqueda con datos indexados

- **WHEN** hay embeddings indexados y se invoca `buscarSimilares(query, 5)`
- **THEN** se devuelven hasta 5 resultados, cada uno con un animal distinto, ordenados por `score` descendente

#### Scenario: Best-match por animal

- **WHEN** un animal tiene 3 fotos indexadas con scores 0.82, 0.71 y 0.65 para la query
- **THEN** ese animal aparece UNA sola vez en los resultados con `score: 0.82` y `fotoMatch` apuntando a la foto del 0.82

#### Scenario: Sin embeddings indexados (estado vacío)

- **WHEN** no hay ningún `AnimalImage` con embedding y se invoca `buscarSimilares(query)`
- **THEN** la acción retorna `{ status: "sin datos indexados", results: [] }` sin throwear excepción

#### Scenario: Imagen query inválida

- **WHEN** se invoca `buscarSimilares` con un buffer corrupto
- **THEN** se retorna un error explícito describiendo el problema (formato no soportado / imagen corrupta), no un stack trace de ONNX

### Requirement: Hook en upload sin bloqueo

La server action existente `uploadAnimalImageAction` SHALL, tras persistir cada foto, intentar generar y guardar su embedding. Si la generación falla por cualquier razón (modelo no cargado, imagen corrupta, ONNX error), la foto SHALL persistirse exitosamente igual y el error SHALL loggearse para que el backfill posterior recupere esa foto. La respuesta de upload al cliente NO SHALL fallar por un error de embedding.

#### Scenario: Upload exitoso con embedding exitoso

- **WHEN** se sube una foto válida y el embedding se genera correctamente
- **THEN** la foto queda guardada en disco, la fila en `AnimalImage` tiene `embedding` no nulo, y el usuario ve éxito

#### Scenario: Upload exitoso con embedding fallido

- **WHEN** se sube una foto válida pero el modelo CLIP no está disponible (archivo `.onnx` no descargado)
- **THEN** la foto queda guardada, su `embedding` queda `NULL`, el error se loggea en consola, y el usuario ve éxito en la subida sin mensaje de error

#### Scenario: Upload de imagen corrupta

- **WHEN** se sube un archivo con extensión `.jpg` pero contenido no válido
- **THEN** la subida del archivo a disco falla con el error existente (no se llega al embedding); el contrato de upload no cambia

### Requirement: UI de re-identificación con confirmación humana obligatoria

El sistema SHALL exponer una pantalla (ruta a definir, ej. `/buscar`) que permite subir una foto y ver hasta N fichas candidatas. Cada resultado SHALL mostrar: thumbnail de la `fotoMatch`, identificador del animal, score numérico visible, y link a la ficha individual. La UI SHALL incluir texto visible explicando que el score es una sugerencia de similitud visual que requiere confirmación humana. El sistema SHALL PROHIBIR cualquier copia tipo "identificado: ficha #X" o "este es el animal #X". La UI SHALL exponer un botón para disparar `generarEmbeddingsPendientes()` con feedback de progreso/conteo.

#### Scenario: Render del estado vacío

- **WHEN** el usuario entra a `/buscar` y no hay embeddings indexados
- **THEN** se muestra mensaje "Sin datos indexados — generá embeddings primero" y el botón de backfill es prominente

#### Scenario: Render de resultados

- **WHEN** el usuario sube una foto y la búsqueda devuelve 3 resultados
- **THEN** se renderiza un grid con 3 tarjetas, cada una con thumbnail, ID del animal, score visible, link a la ficha, y el mensaje persistente "sugerencia visual, requiere confirmación humana"

#### Scenario: Copy prohibida ausente

- **WHEN** se renderiza la página de resultados
- **THEN** NO aparece en ningún lado el texto "identificado", "este es el animal", "coincide con", ni equivalentes que sugieran identificación automática

#### Scenario: Botón de backfill con feedback

- **WHEN** el usuario clickea el botón de generar embeddings pendientes
- **THEN** la UI muestra estado "Procesando…", al terminar muestra `{ procesadas, fallidas, pendientes }`, y el botón vuelve a estar disponible

### Requirement: CSS plano y consistencia con la app

Todos los estilos del feature SHALL agregarse a `app/globals.css`. El feature NO SHALL introducir Tailwind, CSS-in-JS, ni librerías de styling adicionales. La estética SHALL ser coherente con el resto de la app.

#### Scenario: Sin dependencias nuevas de styling

- **WHEN** se inspecciona el `package.json` después de implementar el feature
- **THEN** NO aparecen dependencias nuevas de `tailwindcss`, `styled-components`, `emotion`, `vanilla-extract` ni equivalentes
