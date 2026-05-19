"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";

import { createAnimalAction, type AnimalState } from "@/app/actions";
import { CATEGORIES } from "@/lib/categories";
import { PageShell } from "./page-shell";
import { getProfileImage, type Animal, type Establishment, type HerdCategoryKey } from "@/lib/types";

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

const MONTH_ABBR = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
const ROMAN: Array<[number, string]> = [
  [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"],
  [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
];

function createDraft(): AnimalDraft {
  return {
    description: "",
    ageMonths: "",
    status: "",
    observations: "",
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

function toRoman(num: number): string {
  let result = "";
  let n = num;
  for (const [value, symbol] of ROMAN) {
    while (n >= value) {
      result += symbol;
      n -= value;
    }
  }
  return result;
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
  const categoryLabel = category?.label ?? categoryKey;
  const establishment = establishments.find((e) => e.id === selectedEstablishmentId);

  const filteredAnimals = useMemo(
    () =>
      animals.filter(
        (animal) =>
          animal.establishmentId === selectedEstablishmentId && animal.categoryKey === categoryKey,
      ),
    [animals, categoryKey, selectedEstablishmentId],
  );

  // Stable lote number by registration order (oldest = Nº 001)
  const loteNumberById = useMemo(() => {
    const sorted = [...filteredAnimals].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    return new Map(sorted.map((animal, idx) => [animal.id, idx + 1]));
  }, [filteredAnimals]);

  const withPhotoCount = useMemo(
    () => filteredAnimals.filter((a) => a.images.length > 0).length,
    [filteredAnimals],
  );
  const oldCowsCount = useMemo(
    () =>
      categoryKey === "vacas"
        ? filteredAnimals.filter((a) => markedOldCowIds.includes(a.id)).length
        : 0,
    [filteredAnimals, markedOldCowIds, categoryKey],
  );

  const currentYear = new Date().getFullYear();

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

      <article className="catalogo">
        <header className="ficha-rail">
          <Link className="ficha-rail-back" href="/">
            <span className="ficha-rail-arrow" aria-hidden="true">←</span>
            <span>Volver al inicio</span>
          </Link>
          <button
            className="ficha-rail-edit"
            type="button"
            onClick={() => setIsCreateFormOpen((current) => !current)}
            disabled={!selectedEstablishmentId}
          >
            <span className="ficha-rail-edit-label">
              {isCreateFormOpen ? "Cerrar registro" : "Registrar ejemplar"}
            </span>
            <span className="ficha-rail-edit-icon" aria-hidden="true">
              {isCreateFormOpen ? "×" : "+"}
            </span>
          </button>
        </header>

        <section className="catalogo-banner">
          <div>
            <span className="catalogo-banner-eyebrow">Catálogo de ganado</span>
            <h1 className="catalogo-banner-title">{categoryLabel.toLowerCase()}</h1>
          </div>
          <div className="catalogo-banner-aside">
            <span className="catalogo-banner-count">
              {String(filteredAnimals.length).padStart(3, "0")}
            </span>
            <span className="catalogo-banner-count-label">Ejemplares</span>
            <span className="catalogo-banner-roman">Edición {toRoman(currentYear)}</span>
          </div>
        </section>

        <nav className="catalogo-nav" aria-label="Categorías de hacienda">
          {CATEGORIES.map((cat) => (
            <Link
              key={cat.key}
              className={`catalogo-nav-item ${cat.key === categoryKey ? "catalogo-nav-item-active" : ""}`}
              href={`/animales/${cat.key}?establishmentId=${selectedEstablishmentId}`}
            >
              {cat.label}
            </Link>
          ))}
        </nav>

        <div className="catalogo-stats">
          <div className="catalogo-stat">
            <span className="catalogo-stat-value">
              {String(filteredAnimals.length).padStart(2, "0")}
            </span>
            <span className="catalogo-stat-label">Total registrados</span>
          </div>
          <div className="catalogo-stat">
            <span className="catalogo-stat-value">
              {String(withPhotoCount).padStart(2, "0")}
            </span>
            <span className="catalogo-stat-label">Con foto</span>
          </div>
          {categoryKey === "vacas" ? (
            <div className="catalogo-stat">
              <span className="catalogo-stat-value">{String(oldCowsCount).padStart(2, "0")}</span>
              <span className="catalogo-stat-label">Vacas viejas {currentYear}</span>
            </div>
          ) : null}
          <div className="catalogo-stat">
            <span className="catalogo-stat-value">
              {establishment ? establishment.name.slice(0, 2).toUpperCase() : "—"}
            </span>
            <span className="catalogo-stat-label">
              {establishment?.name ?? "Sin establecimiento"}
            </span>
          </div>
        </div>

        {state.message ? (
          <div className={`ficha-toast ${state.success ? "" : "ficha-toast-err"}`}>
            <span className="ficha-toast-dot" aria-hidden="true" />
            <span>{state.message}</span>
          </div>
        ) : null}

        {isCreateFormOpen ? (
          <section className="catalogo-form">
            <header className="ficha-section-head">
              <h2 className="ficha-section-head-title ficha-display">Nuevo ejemplar</h2>
              <span className="ficha-section-head-rule" aria-hidden="true" />
              <span className="ficha-section-head-count">
                {categoryLabel.toLowerCase()}
              </span>
            </header>

            <div className="catalogo-form-grid">
              <label className="ficha-field">
                <span className="ficha-field-label">
                  Edad <span className="ficha-field-unit">(meses)</span>
                </span>
                <input
                  className="ficha-field-input ficha-mono"
                  type="number"
                  min="0"
                  value={newAnimal.ageMonths}
                  onChange={(event) =>
                    setNewAnimal((current) => ({ ...current, ageMonths: event.target.value }))
                  }
                  placeholder="96"
                />
              </label>

              <label className="ficha-field">
                <span className="ficha-field-label">Estado</span>
                <input
                  className="ficha-field-input"
                  type="text"
                  value={newAnimal.status}
                  onChange={(event) =>
                    setNewAnimal((current) => ({ ...current, status: event.target.value }))
                  }
                  placeholder="En observación"
                />
              </label>

              <label className="ficha-field">
                <span className="ficha-field-label">Descripción</span>
                <input
                  className="ficha-field-input"
                  type="text"
                  value={newAnimal.description}
                  onChange={(event) =>
                    setNewAnimal((current) => ({ ...current, description: event.target.value }))
                  }
                  placeholder="Vaca de descarte con desgaste dental"
                />
              </label>

              <label className="ficha-field ficha-field-wide">
                <span className="ficha-field-label">Observaciones</span>
                <textarea
                  className="ficha-field-input ficha-field-textarea"
                  value={newAnimal.observations}
                  onChange={(event) =>
                    setNewAnimal((current) => ({ ...current, observations: event.target.value }))
                  }
                  placeholder="Notas sanitarias, comportamiento, apartes, etc."
                />
              </label>
            </div>

            <div className="catalogo-form-actions">
              <button
                className="ficha-btn"
                type="button"
                onClick={() => setIsCreateFormOpen(false)}
                disabled={isPending}
              >
                Cancelar
              </button>
              <button
                className="ficha-btn ficha-btn-primary"
                type="button"
                onClick={handleCreateAnimal}
                disabled={!selectedEstablishmentId || isPending}
              >
                {isPending ? "Registrando…" : "Registrar ejemplar"}
              </button>
            </div>
          </section>
        ) : null}

        <section className="catalogo-section">
          <header className="catalogo-section-head">
            <h2 className="catalogo-section-head-title">Ejemplares registrados</h2>
            <span className="catalogo-section-head-rule" aria-hidden="true" />
            <span className="catalogo-section-head-aside">
              {String(filteredAnimals.length).padStart(2, "0")}{" "}
              {filteredAnimals.length === 1 ? "lote" : "lotes"}
            </span>
          </header>

          {filteredAnimals.length === 0 ? (
            <div className="catalogo-empty">
              <span className="catalogo-empty-mark" aria-hidden="true">§</span>
              <h3 className="catalogo-empty-title">Página en blanco</h3>
              <p>
                Aún no hay {categoryLabel.toLowerCase()} registrados para este establecimiento.
                Empezá la lista cuando quieras.
              </p>
              <button
                className="ficha-btn ficha-btn-primary"
                type="button"
                onClick={() => setIsCreateFormOpen(true)}
                disabled={!selectedEstablishmentId}
                style={{ marginTop: 8 }}
              >
                Registrar el primero
              </button>
            </div>
          ) : (
            <ul className="catalogo-grid">
              {filteredAnimals.map((animal, index) => {
                const profile = getProfileImage(animal);
                const isOldCow =
                  animal.categoryKey === "vacas" && markedOldCowIds.includes(animal.id);
                const lote = loteNumberById.get(animal.id) ?? index + 1;
                const shortId = shortIdentifier(animal.identifier);
                const photoCount = animal.images.length;

                const metaParts: React.ReactNode[] = [];
                if (animal.ageMonths != null) {
                  metaParts.push(
                    <span key="age" className="catalogo-card-meta-mono">
                      {animal.ageMonths} m
                    </span>,
                  );
                }
                if (animal.status) {
                  metaParts.push(<span key="status">{animal.status}</span>);
                }

                return (
                  <li
                    key={animal.id}
                    style={{ ["--catalogo-i" as string]: index } as React.CSSProperties}
                  >
                    <Link
                      className="catalogo-card"
                      href={`/animales/${animal.categoryKey}/${animal.id}?establishmentId=${animal.establishmentId}`}
                    >
                      <div className="catalogo-card-media">
                        <span className="catalogo-card-lote">
                          Nº {String(lote).padStart(3, "0")}
                        </span>
                        {isOldCow ? <span className="catalogo-card-flag">Vaca vieja</span> : null}
                        {profile?.filePath ? (
                          <img
                            className="catalogo-card-img"
                            src={profile.filePath}
                            alt={animal.identifier}
                            loading="lazy"
                          />
                        ) : (
                          <div className="catalogo-card-media-empty">
                            <span className="catalogo-card-media-empty-mark" aria-hidden="true">
                              ◯
                            </span>
                            <span className="catalogo-card-media-empty-label">Sin foto</span>
                          </div>
                        )}
                        {photoCount > 1 ? (
                          <span className="catalogo-card-photos">
                            {String(photoCount).padStart(2, "0")} fotos
                          </span>
                        ) : null}
                      </div>

                      <div className="catalogo-card-body">
                        <h3 className="catalogo-card-id">{shortId}</h3>
                        <div className="catalogo-card-meta">
                          {metaParts.length === 0 ? (
                            <span className="catalogo-card-meta-empty">Sin datos cargados</span>
                          ) : (
                            metaParts.flatMap((node, i) =>
                              i === 0
                                ? [node]
                                : [
                                    <span
                                      key={`sep-${i}`}
                                      className="catalogo-card-meta-sep"
                                      aria-hidden="true"
                                    />,
                                    node,
                                  ],
                            )
                          )}
                        </div>
                        <time
                          className="catalogo-card-date"
                          suppressHydrationWarning
                        >
                          {formatStampDate(animal.createdAt)}
                        </time>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <footer className="catalogo-footer">
          <span className="catalogo-footer-mark" aria-hidden="true">◇</span>
          <span>
            {categoryLabel} · {establishment?.name ?? "Sin establecimiento"} · Edición{" "}
            {toRoman(currentYear)}
          </span>
          <span className="catalogo-footer-page">
            Pág. 01 / {String(Math.max(1, Math.ceil(filteredAnimals.length / 12))).padStart(2, "0")}
          </span>
        </footer>
      </article>
    </PageShell>
  );
}
