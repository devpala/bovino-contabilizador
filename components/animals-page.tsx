"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";

import { createAnimalAction, type AnimalState } from "@/app/actions";
import { CATEGORIES } from "@/lib/categories";
import { PageShell } from "./page-shell";
import type { Animal, Establishment, HerdCategoryKey } from "@/lib/types";

type AnimalsPageProps = {
  establishments: Establishment[];
  animals: Animal[];
  dbError: string;
  categoryKey: HerdCategoryKey;
  initialEstablishmentId: string;
  markedOldCowIds: string[];
};

type AnimalDraft = {
  description: string;
  ageMonths: string;
  status: string;
  observations: string;
};

const initialState: AnimalState = {
  success: false,
  message: "",
};

function createDraft(): AnimalDraft {
  return {
    description: "",
    ageMonths: "",
    status: "",
    observations: "",
  };
}

export function AnimalsPage({
  establishments: initialEstablishments,
  animals: initialAnimals,
  dbError,
  categoryKey,
  initialEstablishmentId,
  markedOldCowIds,
}: AnimalsPageProps) {
  const [establishments, setEstablishments] = useState(initialEstablishments);
  const [selectedEstablishmentId, setSelectedEstablishmentId] = useState(
    initialEstablishmentId || initialEstablishments[0]?.id || "",
  );
  const [animals, setAnimals] = useState(initialAnimals);
  const [newAnimal, setNewAnimal] = useState<AnimalDraft>(createDraft());
  const [isCreateFormOpen, setIsCreateFormOpen] = useState(false);
  const [state, setState] = useState<AnimalState>(initialState);
  const [isPending, startTransition] = useTransition();

  const category = CATEGORIES.find((item) => item.key === categoryKey);

  const filteredAnimals = useMemo(
    () =>
      animals.filter(
        (animal) =>
          animal.establishmentId === selectedEstablishmentId && animal.categoryKey === categoryKey,
      ),
    [animals, categoryKey, selectedEstablishmentId],
  );

  function handleEstablishmentCreated(establishment: Establishment) {
    setEstablishments((current) =>
      [...current, establishment].sort((a, b) => a.name.localeCompare(b.name, "es")),
    );
    setSelectedEstablishmentId(establishment.id);
  }

  function handleCreateAnimal() {
    startTransition(async () => {
      const result = await createAnimalAction({
        establishmentId: selectedEstablishmentId,
        categoryKey,
        description: newAnimal.description,
        ageMonths: newAnimal.ageMonths ? Number(newAnimal.ageMonths) : null,
        status: newAnimal.status,
        observations: newAnimal.observations,
      });

      setState(result);

      if (!result.success || !result.animal) {
        return;
      }

      setAnimals((current) => [result.animal!, ...current]);
      setNewAnimal(createDraft());
      setIsCreateFormOpen(false);
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
            <div className="section-title">Animales</div>
            <p className="info-page-copy">
              Selecciona una fila para abrir la ficha completa de {category?.label?.toLowerCase() ?? categoryKey}.
            </p>
          </div>
          <div className="info-header-actions">
            <button
              className={`action-button ${isCreateFormOpen ? "" : "primary"}`}
              type="button"
              onClick={() => setIsCreateFormOpen((current) => !current)}
            >
              {isCreateFormOpen ? "Ocultar" : "Agregar"}
            </button>
            <Link className="action-button secondary" href="/">
              Volver
            </Link>
          </div>
        </div>

        {isCreateFormOpen ? (
          <section className="info-detail-panel">
            <div className="info-detail-header">
              <div>
                <div className="info-card-label">Nueva ficha</div>
                <h2>{category?.label ?? categoryKey}</h2>
              </div>
            </div>

            <div className="animals-form-grid">
              <div className="modal-field">
                <label htmlFor="animal-age">Edad en meses</label>
                <input
                  id="animal-age"
                  type="number"
                  min="0"
                  value={newAnimal.ageMonths}
                  onChange={(event) => setNewAnimal((current) => ({ ...current, ageMonths: event.target.value }))}
                  placeholder="Ej: 96"
                />
              </div>

              <div className="modal-field">
                <label htmlFor="animal-status">Estado</label>
                <input
                  id="animal-status"
                  type="text"
                  value={newAnimal.status}
                  onChange={(event) => setNewAnimal((current) => ({ ...current, status: event.target.value }))}
                  placeholder="Ej: En observacion"
                />
              </div>

              <div className="modal-field animals-form-span-2">
                <label htmlFor="animal-description">Descripcion</label>
                <input
                  id="animal-description"
                  type="text"
                  value={newAnimal.description}
                  onChange={(event) => setNewAnimal((current) => ({ ...current, description: event.target.value }))}
                  placeholder="Ej: Vaca de descarte con desgaste dental"
                />
              </div>

              <div className="modal-field animals-form-span-3">
                <label htmlFor="animal-observations">Observaciones</label>
                <textarea
                  id="animal-observations"
                  value={newAnimal.observations}
                  onChange={(event) => setNewAnimal((current) => ({ ...current, observations: event.target.value }))}
                  placeholder="Notas sanitarias, comportamiento, apartes, etc."
                />
              </div>
            </div>

            <div className="actions">
              <button
                className="action-button primary"
                type="button"
                onClick={handleCreateAnimal}
                disabled={!selectedEstablishmentId || isPending}
              >
                {isPending ? "Guardando..." : "Crear animal"}
              </button>
            </div>
          </section>
        ) : null}

        {state.message ? (
          <div className={`inline-message ${state.success ? "success" : "error"}`}>
            {state.message}
          </div>
        ) : null}

        <section className="history">
          <div className="history-header">
            <span>Fichas de {category?.label ?? categoryKey}</span>
            <span className="history-count">{filteredAnimals.length} animales</span>
          </div>

          <div className="animals-list">
            {filteredAnimals.length === 0 ? (
              <div className="history-empty">Todavia no hay animales individuales en esta categoria.</div>
            ) : (
              filteredAnimals.map((animal) => (
                <Link
                  className="animal-row-link"
                  key={animal.id}
                  href={`/animales/${animal.categoryKey}/${animal.id}?establishmentId=${animal.establishmentId}`}
                >
                  {animal.images[0]?.filePath ? (
                    <img
                      className="animal-row-avatar"
                      src={animal.images[0].filePath}
                      alt={animal.identifier}
                      loading="lazy"
                    />
                  ) : (
                    <div className="animal-row-avatar animal-row-avatar-empty" aria-hidden="true" />
                  )}

                  <div className="animal-row-content">
                    <div className="animal-row-title">
                      <strong>{animal.identifier}</strong>
                      {animal.categoryKey === "vacas" && markedOldCowIds.includes(animal.id) ? (
                        <span className="animal-row-flag">Vaca vieja</span>
                      ) : null}
                    </div>
                    <div className="history-date">
                      Creado{" "}
                      {new Intl.DateTimeFormat("es-AR", {
                        dateStyle: "short",
                        timeStyle: "short",
                      }).format(new Date(animal.createdAt))}
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </section>
      </section>
    </PageShell>
  );
}
