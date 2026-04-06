"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import {
  deleteAnimalAction,
  deleteAnimalImageAction,
  markAnimalAsOldCowAction,
  updateAnimalAction,
  uploadAnimalImageAction,
  type AnimalState,
} from "@/app/actions";
import { CATEGORIES } from "@/lib/categories";
import { PageShell } from "./page-shell";
import type { Animal, Establishment, HerdCategoryKey } from "@/lib/types";

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

function createDraft(animal: Animal): AnimalDraft {
  return {
    description: animal.description,
    ageMonths: animal.ageMonths == null ? "" : String(animal.ageMonths),
    status: animal.status,
    observations: animal.observations,
  };
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
  const [state, setState] = useState<AnimalState>(initialState);
  const [isPending, startTransition] = useTransition();

  const category = CATEGORIES.find((item) => item.key === animal.categoryKey);

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

      if (!result.success || !result.image) {
        return;
      }

      setAnimal((current) => ({
        ...current,
        images: [result.image!, ...current.images],
      }));
    });
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
      }));
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

  return (
    <PageShell
      establishments={establishments}
      selectedEstablishmentId={selectedEstablishmentId}
      onEstablishmentChange={setSelectedEstablishmentId}
      onEstablishmentCreated={handleEstablishmentCreated}
    >
      {dbError ? <div className="status-banner">{dbError}</div> : null}

      <section className="info-page">
        <div className="info-page-header">
          <div>
            <div className="section-title">Ficha</div>
            <p className="info-page-copy">Detalle completo del animal seleccionado.</p>
          </div>
          <div className="info-header-actions">
            <Link
              className="action-button secondary"
              href={`/animales/${animal.categoryKey}?establishmentId=${animal.establishmentId}`}
            >
              Volver
            </Link>
          </div>
        </div>

        {state.message ? (
          <div className={`inline-message ${state.success ? "success" : "error"}`}>{state.message}</div>
        ) : null}

        <section className="info-detail-panel">
          <div className="animal-card-header">
            <div>
              <strong>{animal.identifier}</strong>
              <div className="history-date">
                Creado{" "}
                {new Intl.DateTimeFormat("es-AR", {
                  dateStyle: "short",
                  timeStyle: "short",
                }).format(new Date(animal.createdAt))}
              </div>
            </div>
            <span className="animal-badge">{category?.label ?? animal.categoryKey}</span>
          </div>

          <div className="animal-profile-layout">
            <div className="animal-profile-media">
              {animal.images[0]?.filePath ? (
                <img
                  className="animal-profile-image"
                  src={animal.images[0].filePath}
                  alt={animal.identifier}
                  loading="lazy"
                />
              ) : (
                <div className="animal-profile-image animal-profile-image-empty" aria-hidden="true" />
              )}
            </div>

            <div className="animal-profile-content">
              <div className="animal-meta-grid">
                <div><span>Codigo:</span> {animal.identifier}</div>
                <div><span>Descripcion:</span> {animal.description || "Sin descripcion."}</div>
                <div><span>Edad:</span> {animal.ageMonths == null ? "Sin dato" : `${animal.ageMonths} meses`}</div>
                <div><span>Estado:</span> {animal.status || "Sin dato"}</div>
                <div><span>Observaciones:</span> {animal.observations || "Sin observaciones."}</div>
              </div>
            </div>
          </div>

          {isEditing ? (
            <div className="animals-form-grid">
              <div className="modal-field animals-form-span-2">
                <label htmlFor="detail-description">Descripcion</label>
                <input
                  id="detail-description"
                  type="text"
                  value={draft.description}
                  onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                />
              </div>

              <div className="modal-field">
                <label htmlFor="detail-age">Edad en meses</label>
                <input
                  id="detail-age"
                  type="number"
                  min="0"
                  value={draft.ageMonths}
                  onChange={(event) => setDraft((current) => ({ ...current, ageMonths: event.target.value }))}
                />
              </div>

              <div className="modal-field">
                <label htmlFor="detail-status">Estado</label>
                <input
                  id="detail-status"
                  type="text"
                  value={draft.status}
                  onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value }))}
                />
              </div>

              <div className="modal-field animals-form-span-3">
                <label htmlFor="detail-observations">Observaciones</label>
                <textarea
                  id="detail-observations"
                  value={draft.observations}
                  onChange={(event) => setDraft((current) => ({ ...current, observations: event.target.value }))}
                />
              </div>
            </div>
          ) : null}

          <div className="animal-actions-row">
            {isEditing ? (
              <>
                <button className="action-button primary" type="button" onClick={handleUpdateAnimal} disabled={isPending}>
                  Guardar cambios
                </button>
                <button className="action-button" type="button" onClick={() => setIsEditing(false)} disabled={isPending}>
                  Cancelar
                </button>
              </>
            ) : (
              <>
                <button className="action-button" type="button" onClick={() => setIsEditing(true)} disabled={isPending}>
                  Editar ficha
                </button>
                {animal.categoryKey === "vacas" ? (
                  <button
                    className="action-button secondary"
                    type="button"
                    onClick={handleMarkAsOldCow}
                    disabled={isPending || isMarkedAsOldCow}
                  >
                    {isMarkedAsOldCow ? "Vaca vieja marcada" : "Marcar como vaca vieja"}
                  </button>
                ) : null}
                <button className="action-button danger" type="button" onClick={handleDeleteAnimal} disabled={isPending}>
                  Eliminar animal
                </button>
              </>
            )}
          </div>

          {isEditing ? (
            <form action={handleImageUpload} className="animal-upload-row">
              <input type="hidden" name="animalId" value={animal.id} />
              <input type="hidden" name="categoryKey" value={animal.categoryKey} />
              <input type="file" name="image" accept="image/*" />
              <button className="action-button" type="submit" disabled={isPending}>
                Subir imagen
              </button>
            </form>
          ) : null}

          {animal.images.length > 0 ? (
            <div className="animal-images-grid">
              {animal.images.map((image) => (
                <div className="animal-image-card" key={image.id}>
                  <a className="info-gallery-card" href={image.filePath} target="_blank" rel="noreferrer">
                    <img className="info-gallery-image" src={image.filePath} alt={image.fileName} loading="lazy" />
                    <span>{image.fileName}</span>
                  </a>
                  {isEditing ? (
                    <button
                      className="action-button danger"
                      type="button"
                      onClick={() => handleDeleteImage(image.id)}
                      disabled={isPending}
                    >
                      Eliminar imagen
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="history-empty">Sin imagenes cargadas.</div>
          )}
        </section>
      </section>
    </PageShell>
  );
}
