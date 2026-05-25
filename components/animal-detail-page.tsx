"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";

import {
  deleteAnimalAction,
  deleteAnimalImageAction,
  markAnimalAsOldCowAction,
  sellAnimalAction,
  setAnimalProfileImageAction,
  updateAnimalAction,
  uploadAnimalImageAction,
  type AnimalState,
} from "@/app/actions";
import { CATEGORIES } from "@/lib/categories";
import { PageShell } from "./page-shell";
import { getProfileImage, type Animal, type Establishment } from "@/lib/types";

type AnimalDraft = {
  description: string;
  ageMonths: string;
  status: string;
  observations: string;
};

type AnimalDetailPageProps = {
  establishments: Establishment[];
  animal: Animal;
  dbError: string;
  isMarkedAsOldCow: boolean;
};

const initialState: AnimalState = {
  success: false,
  message: "",
};

const MONTH_ABBR = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];

const ZOOM_MIN = 1;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.5;

function clampZoom(value: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(value * 100) / 100));
}

function createDraft(animal: Animal): AnimalDraft {
  return {
    description: animal.description,
    ageMonths: animal.ageMonths == null ? "" : String(animal.ageMonths),
    status: animal.status,
    observations: animal.observations,
  };
}

function shortIdentifier(value: string): string {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    return value.slice(0, 8).toUpperCase();
  }
  return value;
}

function formatStampDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")} ${MONTH_ABBR[d.getMonth()]} ${d.getFullYear()}`;
}

export function AnimalDetailPage({
  establishments: initialEstablishments,
  animal: initialAnimal,
  dbError,
  isMarkedAsOldCow: initialIsMarkedAsOldCow,
}: AnimalDetailPageProps) {
  const [establishments, setEstablishments] = useState(initialEstablishments);
  const [selectedEstablishmentId, setSelectedEstablishmentId] = useState(initialAnimal.establishmentId);
  const [animal, setAnimal] = useState(initialAnimal);
  const [isMarkedAsOldCow, setIsMarkedAsOldCow] = useState(initialIsMarkedAsOldCow);
  const [draft, setDraft] = useState<AnimalDraft>(createDraft(initialAnimal));
  const [isEditing, setIsEditing] = useState(false);
  const [isSellModalOpen, setIsSellModalOpen] = useState(false);
  const [sellWeight, setSellWeight] = useState("");
  const [sellPrice, setSellPrice] = useState("");
  const [state, setState] = useState<AnimalState>(initialState);
  const [isPending, startTransition] = useTransition();
  const [isDragActive, setIsDragActive] = useState(false);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(() => {
    if (initialAnimal.profileImageId) {
      const idx = initialAnimal.images.findIndex((img) => img.id === initialAnimal.profileImageId);
      if (idx >= 0) return idx;
    }
    return 0;
  });
  const uploadFormRef = useRef<HTMLFormElement>(null);
  const lightboxRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panOriginRef = useRef({ startX: 0, startY: 0, panX: 0, panY: 0, moved: false });

  const category = CATEGORIES.find((item) => item.key === animal.categoryKey);
  const categoryLabel = category?.label ?? animal.categoryKey;
  const profile = getProfileImage(animal);
  const shortId = shortIdentifier(animal.identifier);
  const showFullIdentifier = shortId !== animal.identifier;
  const imageCount = animal.images.length;
  const safeImageIndex = imageCount === 0 ? 0 : Math.min(currentImageIndex, imageCount - 1);
  const currentImage = imageCount === 0 ? null : animal.images[safeImageIndex];
  const hasMultipleImages = imageCount > 1;

  function showPrevImage() {
    if (imageCount < 2) return;
    setCurrentImageIndex((idx) => (idx - 1 + imageCount) % imageCount);
    resetZoom();
  }
  function showNextImage() {
    if (imageCount < 2) return;
    setCurrentImageIndex((idx) => (idx + 1) % imageCount);
    resetZoom();
  }
  function resetZoom() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }
  function zoomIn() {
    setZoom((z) => clampZoom(z + ZOOM_STEP));
  }
  function zoomOut() {
    setZoom((z) => {
      const next = clampZoom(z - ZOOM_STEP);
      if (next <= ZOOM_MIN) setPan({ x: 0, y: 0 });
      return next;
    });
  }
  // Un clic sobre la foto acerca un paso; al llegar al máximo vuelve a 100%.
  function stepZoom() {
    setZoom((z) => {
      if (z >= ZOOM_MAX) {
        setPan({ x: 0, y: 0 });
        return ZOOM_MIN;
      }
      return clampZoom(z + ZOOM_STEP);
    });
  }
  function openLightbox(index?: number) {
    if (imageCount === 0) return;
    if (typeof index === "number") {
      setCurrentImageIndex(index);
    } else if (profile) {
      const profileIdx = animal.images.findIndex((img) => img.id === profile.id);
      setCurrentImageIndex(profileIdx >= 0 ? profileIdx : 0);
    }
    resetZoom();
    setIsLightboxOpen(true);
  }
  function closeLightbox() {
    setIsLightboxOpen(false);
    resetZoom();
  }

  function handlePanStart(event: React.PointerEvent<HTMLImageElement>) {
    panOriginRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      panX: pan.x,
      panY: pan.y,
      moved: false,
    };
    if (zoom <= ZOOM_MIN) return;
    event.preventDefault();
    setIsPanning(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function handlePanMove(event: React.PointerEvent<HTMLImageElement>) {
    if (!isPanning) return;
    const { startX, startY, panX, panY } = panOriginRef.current;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (!panOriginRef.current.moved && Math.hypot(dx, dy) > 6) {
      panOriginRef.current.moved = true;
    }
    setPan({ x: panX + dx, y: panY + dy });
  }
  function handlePanEnd(event: React.PointerEvent<HTMLImageElement>) {
    if (isPanning) {
      setIsPanning(false);
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // pointer ya liberado
      }
    }
    // Si fue un clic (sin arrastre real), acercá; el cancel no cuenta como clic.
    if (event.type === "pointerup" && !panOriginRef.current.moved) {
      stepZoom();
    }
  }

  useEffect(() => {
    if (!isLightboxOpen) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsLightboxOpen(false);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        setCurrentImageIndex((idx) => (idx - 1 + imageCount) % imageCount);
        setZoom(1);
        setPan({ x: 0, y: 0 });
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setCurrentImageIndex((idx) => (idx + 1) % imageCount);
        setZoom(1);
        setPan({ x: 0, y: 0 });
      }
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", handleKey);
    };
  }, [isLightboxOpen, imageCount]);

  // Zoom con la rueda del mouse (listener nativo para poder preventDefault).
  useEffect(() => {
    if (!isLightboxOpen) return;
    const el = lightboxRef.current;
    if (!el) return;
    function handleWheel(event: WheelEvent) {
      event.preventDefault();
      const delta = event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
      setZoom((z) => {
        const next = clampZoom(z + delta);
        if (next <= ZOOM_MIN) setPan({ x: 0, y: 0 });
        return next;
      });
    }
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [isLightboxOpen]);

  function handleEstablishmentCreated(establishment: Establishment) {
    setEstablishments((current) =>
      [...current, establishment].sort((a, b) => a.name.localeCompare(b.name, "es")),
    );
    setSelectedEstablishmentId(establishment.id);
  }

  function handleUpdateAnimal() {
    startTransition(async () => {
      const result = await updateAnimalAction({
        id: animal.id,
        establishmentId: animal.establishmentId,
        categoryKey: animal.categoryKey,
        description: draft.description,
        ageMonths: draft.ageMonths ? Number(draft.ageMonths) : null,
        status: draft.status,
        observations: draft.observations,
      });

      setState(result);
      if (!result.success || !result.animal) {
        return;
      }

      setAnimal((current) => ({ ...result.animal!, images: current.images }));
      setIsEditing(false);
    });
  }

  function handleDeleteAnimal() {
    startTransition(async () => {
      const result = await deleteAnimalAction({
        id: animal.id,
        establishmentId: animal.establishmentId,
        categoryKey: animal.categoryKey,
      });
      setState(result);

      if (result.success) {
        window.location.href = `/animales/${animal.categoryKey}?establishmentId=${animal.establishmentId}`;
      }
    });
  }

  function handleImageUpload(formData: FormData) {
    startTransition(async () => {
      formData.set("animalId", animal.id);
      formData.set("categoryKey", animal.categoryKey);
      const result = await uploadAnimalImageAction(formData);
      setState(result);
      uploadFormRef.current?.reset();

      const uploaded = result.images ?? (result.image ? [result.image] : []);
      if (!result.success || uploaded.length === 0) {
        return;
      }

      setAnimal((current) => ({
        ...current,
        images: [...uploaded, ...current.images],
      }));
    });
  }

  function uploadFiles(files: FileList | File[] | null | undefined) {
    if (!files || isPending) return;
    const list = Array.from(files).filter((file) => file.size > 0);
    if (list.length === 0) return;
    const formData = new FormData();
    for (const file of list) {
      formData.append("image", file);
    }
    handleImageUpload(formData);
  }

  function handleDragOver(event: React.DragEvent) {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    event.stopPropagation();
    setIsDragActive(true);
  }

  function handleDragLeave(event: React.DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    setIsDragActive(false);
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    setIsDragActive(false);
    uploadFiles(event.dataTransfer.files);
  }

  function handleDeleteImage(imageId: string) {
    startTransition(async () => {
      const result = await deleteAnimalImageAction({
        id: imageId,
        animalId: animal.id,
        categoryKey: animal.categoryKey,
      });
      setState(result);

      if (!result.success) {
        return;
      }

      setAnimal((current) => ({
        ...current,
        images: current.images.filter((image) => image.id !== imageId),
        profileImageId: current.profileImageId === imageId ? null : current.profileImageId,
      }));
    });
  }

  function handleSetProfileImage(imageId: string) {
    startTransition(async () => {
      const result = await setAnimalProfileImageAction({
        animalId: animal.id,
        imageId,
        categoryKey: animal.categoryKey,
      });
      setState(result);

      if (!result.success || !result.animal) {
        return;
      }

      setAnimal((current) => ({ ...current, profileImageId: result.animal!.profileImageId ?? null }));
    });
  }

  function handleMarkAsOldCow() {
    startTransition(async () => {
      const result = await markAnimalAsOldCowAction({
        animalId: animal.id,
        establishmentId: animal.establishmentId,
        year: String(new Date().getFullYear()),
        description: animal.description || `Vaca ${animal.identifier} marcada como vaca vieja.`,
      });

      setState({
        success: result.success,
        message: result.message,
      });

      if (result.success) {
        setIsMarkedAsOldCow(true);
      }
    });
  }

  function handleSellAnimal() {
    startTransition(async () => {
      const weight = Number(sellWeight) || 0;
      const price = Number(sellPrice) || 0;

      const result = await sellAnimalAction({
        id: animal.id,
        establishmentId: animal.establishmentId,
        categoryKey: animal.categoryKey,
        weight,
        price,
      });

      setState(result);

      if (result.success) {
        setIsSellModalOpen(false);
        window.location.href = `/animales/${animal.categoryKey}?establishmentId=${animal.establishmentId}`;
      }
    });
  }

  const calculatedFinalWeight = (Number(sellWeight) || 0) * 0.95;
  const calculatedTotal = calculatedFinalWeight * (Number(sellPrice) || 0);

  return (
    <PageShell
      establishments={establishments}
      selectedEstablishmentId={selectedEstablishmentId}
      onEstablishmentChange={setSelectedEstablishmentId}
      onEstablishmentCreated={handleEstablishmentCreated}
    >
      {dbError ? <div className="status-banner">{dbError}</div> : null}

      <article className="ficha">
        <header className="ficha-rail">
          <Link
            className="ficha-rail-back"
            href={`/animales/${animal.categoryKey}?establishmentId=${animal.establishmentId}`}
          >
            <span className="ficha-rail-arrow" aria-hidden="true">←</span>
            <span>Volver al listado</span>
          </Link>
          {!isEditing ? (
            <button
              className="ficha-rail-edit"
              type="button"
              onClick={() => setIsEditing(true)}
              disabled={isPending}
            >
              <span className="ficha-rail-edit-label">Editar ficha</span>
              <span className="ficha-rail-edit-icon" aria-hidden="true">✎</span>
            </button>
          ) : null}
        </header>

        {state.message ? (
          <div className={`ficha-toast ${state.success ? "" : "ficha-toast-err"}`}>
            <span className="ficha-toast-dot" aria-hidden="true" />
            <span>{state.message}</span>
          </div>
        ) : null}

        <div className="ficha-meta-strip">
          <span className="ficha-meta-strip-tag">Registro Nº {String(animal.id).padStart(4, "0")}</span>
          <span className="ficha-meta-strip-sep" aria-hidden="true" />
          <span>{categoryLabel}</span>
          <span className="ficha-meta-strip-sep" aria-hidden="true" />
          <time className="ficha-mono" suppressHydrationWarning>{formatStampDate(animal.createdAt)}</time>
        </div>

        <section className="ficha-hero">
          <figure className="ficha-hero-media">
            <div className="ficha-hero-media-frame">
              {profile?.filePath ? (
                <button
                  type="button"
                  className="ficha-hero-media-button"
                  onClick={() => openLightbox()}
                  aria-label="Ver foto en grande"
                >
                  <img
                    className="ficha-hero-media-img"
                    src={profile.filePath}
                    alt={animal.identifier}
                    loading="eager"
                  />
                </button>
              ) : (
                <div className="ficha-hero-media-empty">
                  <span className="ficha-hero-media-empty-mark" aria-hidden="true">◯</span>
                  <span>Sin foto de perfil</span>
                </div>
              )}

              <span className="ficha-hero-corner ficha-hero-corner-tl" aria-hidden="true" />
              <span className="ficha-hero-corner ficha-hero-corner-tr" aria-hidden="true" />
              <span className="ficha-hero-corner ficha-hero-corner-bl" aria-hidden="true" />
              <span className="ficha-hero-corner ficha-hero-corner-br" aria-hidden="true" />
              {isMarkedAsOldCow ? (
                <figcaption className="ficha-hero-stamp">Vaca vieja</figcaption>
              ) : null}
            </div>
          </figure>

          <div className="ficha-hero-body">
            <span className="ficha-hero-eyebrow">Identificación</span>
            <h1 className="ficha-hero-identifier ficha-mono">{shortId}</h1>
            {showFullIdentifier ? (
              <p className="ficha-hero-identifier-full ficha-mono" title={animal.identifier}>
                {animal.identifier}
              </p>
            ) : null}

            <p className={`ficha-hero-lede ficha-display ${animal.description ? "" : "ficha-hero-lede-empty"}`}>
              {animal.description || "Sin descripción registrada."}
            </p>

            <dl className="ficha-spec">
              <div className="ficha-spec-row">
                <dt>Edad</dt>
                <span className="ficha-spec-dots" aria-hidden="true" />
                <dd>
                  {animal.ageMonths == null ? (
                    <span className="ficha-spec-empty">Sin dato</span>
                  ) : (
                    <>
                      <span className="ficha-mono">{animal.ageMonths}</span> meses
                    </>
                  )}
                </dd>
              </div>
              <div className="ficha-spec-row">
                <dt>Estado</dt>
                <span className="ficha-spec-dots" aria-hidden="true" />
                <dd>
                  {animal.status || <span className="ficha-spec-empty">Sin definir</span>}
                </dd>
              </div>
              <div className="ficha-spec-row">
                <dt>Categoría</dt>
                <span className="ficha-spec-dots" aria-hidden="true" />
                <dd>{categoryLabel}</dd>
              </div>
              <div className="ficha-spec-row">
                <dt>Imágenes</dt>
                <span className="ficha-spec-dots" aria-hidden="true" />
                <dd>
                  <span className="ficha-mono">{String(imageCount).padStart(2, "0")}</span>
                </dd>
              </div>
            </dl>

            {animal.observations ? (
              <blockquote className="ficha-quote">
                <span className="ficha-quote-mark ficha-display" aria-hidden="true">&ldquo;</span>
                <p className="ficha-display">{animal.observations}</p>
              </blockquote>
            ) : null}
          </div>
        </section>

        {isEditing ? (
          <section className="ficha-edit">
            <header className="ficha-section-head">
              <h2 className="ficha-section-head-title ficha-display">Editar campos</h2>
              <span className="ficha-section-head-rule" aria-hidden="true" />
            </header>
            <div className="ficha-edit-grid">
              <label className="ficha-field ficha-field-wide">
                <span className="ficha-field-label">Descripción</span>
                <input
                  className="ficha-field-input"
                  type="text"
                  value={draft.description}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, description: event.target.value }))
                  }
                />
              </label>

              <label className="ficha-field">
                <span className="ficha-field-label">
                  Edad <span className="ficha-field-unit">(meses)</span>
                </span>
                <input
                  className="ficha-field-input ficha-mono"
                  type="number"
                  min="0"
                  value={draft.ageMonths}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, ageMonths: event.target.value }))
                  }
                />
              </label>

              <label className="ficha-field">
                <span className="ficha-field-label">Estado</span>
                <input
                  className="ficha-field-input"
                  type="text"
                  value={draft.status}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, status: event.target.value }))
                  }
                />
              </label>

              <label className="ficha-field ficha-field-wide">
                <span className="ficha-field-label">Observaciones</span>
                <textarea
                  className="ficha-field-input ficha-field-textarea"
                  value={draft.observations}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, observations: event.target.value }))
                  }
                />
              </label>
            </div>
          </section>
        ) : null}

        <section className="ficha-actions">
          {isEditing ? (
            <>
              <div className="ficha-actions-primary">
                <button
                  className="ficha-btn ficha-btn-primary"
                  type="button"
                  onClick={handleUpdateAnimal}
                  disabled={isPending}
                >
                  Guardar cambios
                </button>
                <button
                  className="ficha-btn"
                  type="button"
                  onClick={() => setIsEditing(false)}
                  disabled={isPending}
                >
                  Cancelar
                </button>
              </div>
              <div className="ficha-actions-divider" aria-hidden="true" />
              <div className="ficha-actions-secondary">
                <button
                  className="ficha-btn ficha-btn-accent"
                  type="button"
                  onClick={() => setIsSellModalOpen(true)}
                  disabled={isPending}
                >
                  Registrar venta
                </button>
                <button
                  className="ficha-btn ficha-btn-danger"
                  type="button"
                  onClick={handleDeleteAnimal}
                  disabled={isPending}
                >
                  Eliminar animal
                </button>
              </div>
            </>
          ) : animal.categoryKey === "vacas" ? (
            <div className="ficha-actions-primary">
              <button
                className="ficha-btn ficha-btn-ghost"
                type="button"
                onClick={handleMarkAsOldCow}
                disabled={isPending || isMarkedAsOldCow}
              >
                {isMarkedAsOldCow ? "✓ Vaca vieja marcada" : "Marcar como vaca vieja"}
              </button>
            </div>
          ) : (
            <div className="ficha-actions-primary">
              <span className="ficha-meta-strip-tag">Sin acciones pendientes</span>
            </div>
          )}
        </section>

        <section className="ficha-gallery">
          <header className="ficha-section-head">
            <h2 className="ficha-section-head-title ficha-display">Galería</h2>
            <span className="ficha-section-head-rule" aria-hidden="true" />
            <span className="ficha-section-head-count ficha-mono">
              {String(imageCount).padStart(2, "0")} {imageCount === 1 ? "imagen" : "imágenes"}
            </span>
          </header>

          {isEditing || imageCount === 0 ? (
            <form
              ref={uploadFormRef}
              action={handleImageUpload}
              className={`ficha-upload ${imageCount === 0 ? "ficha-upload-empty" : ""} ${isPending ? "ficha-upload-pending" : ""} ${isDragActive ? "ficha-upload-drag" : ""}`}
            >
              <input type="hidden" name="animalId" value={animal.id} />
              <input type="hidden" name="categoryKey" value={animal.categoryKey} />
              <label
                className="ficha-upload-drop"
                onDragEnter={handleDragOver}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <input
                  type="file"
                  name="image"
                  accept="image/*"
                  multiple
                  className="ficha-upload-input"
                  disabled={isPending}
                  onChange={(event) => {
                    if (event.currentTarget.files && event.currentTarget.files.length > 0) {
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                />
                <span className="ficha-upload-icon" aria-hidden="true">
                  {isPending ? "…" : isDragActive ? "↓" : "+"}
                </span>
                <span className="ficha-upload-copy">
                  <strong className="ficha-display">
                    {isPending
                      ? "Subiendo imágenes…"
                      : isDragActive
                        ? "Soltá para subir"
                        : imageCount === 0
                          ? "Sumá la primera foto"
                          : "Sumar imágenes"}
                  </strong>
                  <span>
                    {isPending
                      ? "Esperá unos segundos."
                      : "Arrastrá fotos acá o clickeá para seleccionar."}
                  </span>
                </span>
              </label>
            </form>
          ) : null}

          {imageCount === 0 ? null : (
            <ul className="ficha-gallery-grid">
              {animal.images.map((image, index) => {
                const isProfile =
                  (animal.profileImageId && image.id === animal.profileImageId) ||
                  (!animal.profileImageId && image.id === animal.images[0]?.id);
                return (
                  <li className="ficha-gallery-card" key={image.id}>
                    <button
                      type="button"
                      className="ficha-gallery-link"
                      onClick={() => openLightbox(index)}
                      aria-label={`Ver foto ${index + 1} en grande`}
                    >
                      <div className="ficha-gallery-frame">
                        {isProfile ? (
                          <span className="ficha-gallery-seal">Foto de perfil</span>
                        ) : null}
                        <img
                          className="ficha-gallery-img"
                          src={image.filePath}
                          alt={image.fileName}
                          loading="lazy"
                        />
                      </div>
                    </button>
                    {isEditing ? (
                      <div className="ficha-gallery-actions">
                        {!isProfile ? (
                          <button
                            className="ficha-chip"
                            type="button"
                            onClick={() => handleSetProfileImage(image.id)}
                            disabled={isPending}
                          >
                            Usar como perfil
                          </button>
                        ) : null}
                        <button
                          className="ficha-chip ficha-chip-danger"
                          type="button"
                          onClick={() => handleDeleteImage(image.id)}
                          disabled={isPending}
                        >
                          Eliminar
                        </button>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <footer className="ficha-footer">
          <span className="ficha-footer-mark ficha-display" aria-hidden="true">◇</span>
          <span>Ficha · {categoryLabel} · Sistema de registro</span>
        </footer>
      </article>

      {isSellModalOpen ? (
        <div
          className="ficha-modal-backdrop"
          role="presentation"
          onClick={() => setIsSellModalOpen(false)}
        >
          <div
            className="ficha-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sell-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="ficha-modal-head">
              <div>
                <span className="ficha-modal-eyebrow">Movimiento</span>
                <h2 id="sell-modal-title" className="ficha-modal-title ficha-display">
                  Registrar venta
                </h2>
              </div>
              <button
                className="ficha-modal-close"
                type="button"
                onClick={() => setIsSellModalOpen(false)}
                aria-label="Cerrar"
              >
                <span aria-hidden="true">×</span>
              </button>
            </header>

            <div className="ficha-modal-body">
              <label className="ficha-field">
                <span className="ficha-field-label">
                  Peso bruto <span className="ficha-field-unit">(kg)</span>
                </span>
                <input
                  className="ficha-field-input ficha-mono"
                  type="number"
                  min="0"
                  value={sellWeight}
                  onChange={(event) => setSellWeight(event.target.value)}
                  placeholder="450"
                  autoFocus
                />
              </label>

              <label className="ficha-field">
                <span className="ficha-field-label">
                  Precio por kg <span className="ficha-field-unit">($)</span>
                </span>
                <input
                  className="ficha-field-input ficha-mono"
                  type="number"
                  min="0"
                  value={sellPrice}
                  onChange={(event) => setSellPrice(event.target.value)}
                  placeholder="2100"
                />
              </label>

              <div className="ficha-modal-receipt">
                <div className="ficha-modal-receipt-row">
                  <span>Desbaste</span>
                  <span className="ficha-spec-dots" aria-hidden="true" />
                  <strong className="ficha-mono">−5%</strong>
                </div>
                <div className="ficha-modal-receipt-row">
                  <span>Peso neto</span>
                  <span className="ficha-spec-dots" aria-hidden="true" />
                  <strong className="ficha-mono">{calculatedFinalWeight.toFixed(2)} kg</strong>
                </div>
                <div className="ficha-modal-receipt-total">
                  <span>Total a cobrar</span>
                  <strong className="ficha-mono">
                    ${calculatedTotal.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                  </strong>
                </div>
              </div>
            </div>

            <footer className="ficha-modal-foot">
              <button
                className="ficha-btn"
                type="button"
                onClick={() => setIsSellModalOpen(false)}
              >
                Cancelar
              </button>
              <button
                className="ficha-btn ficha-btn-primary"
                type="button"
                onClick={handleSellAnimal}
                disabled={isPending || !sellWeight || !sellPrice}
              >
                {isPending ? "Procesando…" : "Confirmar venta"}
              </button>
            </footer>
          </div>
        </div>
      ) : null}

      {isLightboxOpen && currentImage ? (
        <div
          ref={lightboxRef}
          className="ficha-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Visor de fotos"
          onClick={closeLightbox}
        >
          <button
            type="button"
            className="ficha-lightbox-close"
            onClick={closeLightbox}
            aria-label="Cerrar visor"
          >
            <span aria-hidden="true">×</span>
          </button>

          <div
            className="ficha-lightbox-zoom"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="ficha-lightbox-zoom-btn"
              onClick={zoomOut}
              disabled={zoom <= ZOOM_MIN}
              aria-label="Alejar"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
                <circle cx="10.5" cy="10.5" r="6.5" />
                <line x1="15.5" y1="15.5" x2="21" y2="21" />
                <line x1="7.5" y1="10.5" x2="13.5" y2="10.5" />
              </svg>
            </button>
            <span className="ficha-lightbox-zoom-level ficha-mono">{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              className="ficha-lightbox-zoom-btn"
              onClick={zoomIn}
              disabled={zoom >= ZOOM_MAX}
              aria-label="Acercar"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
                <circle cx="10.5" cy="10.5" r="6.5" />
                <line x1="15.5" y1="15.5" x2="21" y2="21" />
                <line x1="10.5" y1="7.5" x2="10.5" y2="13.5" />
                <line x1="7.5" y1="10.5" x2="13.5" y2="10.5" />
              </svg>
            </button>
          </div>

          <figure
            className="ficha-lightbox-stage"
            onClick={(event) => event.stopPropagation()}
          >
            <img
              className={`ficha-lightbox-img ${zoom > 1 ? "is-zoomed" : ""}`}
              src={currentImage.filePath}
              alt={currentImage.fileName}
              draggable={false}
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transition: isPanning ? "none" : "transform 0.18s ease",
                cursor: isPanning ? "grabbing" : zoom >= ZOOM_MAX ? "zoom-out" : "zoom-in",
              }}
              onPointerDown={handlePanStart}
              onPointerMove={handlePanMove}
              onPointerUp={handlePanEnd}
              onPointerCancel={handlePanEnd}
            />
            <figcaption className="ficha-lightbox-caption">
              <span className="ficha-mono">
                {String(safeImageIndex + 1).padStart(2, "0")} / {String(imageCount).padStart(2, "0")}
              </span>
              <span className="ficha-lightbox-caption-sep" aria-hidden="true" />
              <span className="ficha-lightbox-caption-name">{currentImage.fileName}</span>
            </figcaption>
          </figure>

          {hasMultipleImages ? (
            <>
              <button
                type="button"
                className="ficha-lightbox-nav ficha-lightbox-nav-prev"
                onClick={(event) => { event.stopPropagation(); showPrevImage(); }}
                aria-label="Foto anterior"
              >
                <span aria-hidden="true">‹</span>
              </button>
              <button
                type="button"
                className="ficha-lightbox-nav ficha-lightbox-nav-next"
                onClick={(event) => { event.stopPropagation(); showNextImage(); }}
                aria-label="Foto siguiente"
              >
                <span aria-hidden="true">›</span>
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </PageShell>
  );
}
