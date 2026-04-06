"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  createInformationAnimalAction,
  deleteInformationAnimalAction,
  markAnimalAsOldCowAction,
} from "@/app/actions";
import {
  ANIMAL_TYPES,
  INFORMATION_YEARS,
  getInformationSectionByKey,
} from "@/lib/information";
import { PageShell } from "./page-shell";
import type {
  Establishment,
  Animal,
  InformationAnimal,
  InformationSectionKey,
} from "@/lib/types";
import type { StoredImage } from "@/lib/storage";

type InformationDetailPageProps = {
  establishments: Establishment[];
  items: InformationAnimal[];
  animals: Animal[];
  dbError: string;
  initialEstablishmentId: string;
  initialYear: string;
  sectionKey: InformationSectionKey;
  images?: StoredImage[];
};

export function InformationDetailPage({
  establishments: initialEstablishments,
  items: initialItems,
  animals,
  dbError,
  initialEstablishmentId,
  initialYear,
  sectionKey,
  images = [],
}: InformationDetailPageProps) {
  const router = useRouter();
  const [establishments, setEstablishments] = useState(initialEstablishments);
  const [selectedEstablishmentId, setSelectedEstablishmentId] = useState(
    initialEstablishmentId || initialEstablishments[0]?.id || "",
  );
  const [selectedYear, setSelectedYear] = useState<(typeof INFORMATION_YEARS)[number]>(
    INFORMATION_YEARS.includes(initialYear as (typeof INFORMATION_YEARS)[number])
      ? (initialYear as (typeof INFORMATION_YEARS)[number])
      : "2026",
  );
  const [items, setItems] = useState(initialItems);
  const [isAddPanelOpen, setIsAddPanelOpen] = useState(false);
  const [selectedAnimalId, setSelectedAnimalId] = useState("");
  const [animalType, setAnimalType] = useState<(typeof ANIMAL_TYPES)[number]["key"]>("vaca");
  const [description, setDescription] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("success");
  const [isPending, startTransition] = useTransition();

  const section = getInformationSectionByKey(sectionKey);

  const visibleItems = useMemo(
    () =>
      items.filter(
        (item) =>
          item.establishmentId === selectedEstablishmentId &&
          item.year === selectedYear &&
          item.sectionKey === sectionKey,
      ),
    [items, sectionKey, selectedEstablishmentId, selectedYear],
  );

  const availableOldCowOptions = useMemo(() => {
    if (sectionKey !== "vacasViejas") {
      return [];
    }

    const markedIds = new Set(
      visibleItems.map((item) => item.animalId).filter(Boolean),
    );

    return animals.filter(
      (animal) =>
        animal.establishmentId === selectedEstablishmentId &&
        animal.categoryKey === "vacas" &&
        !markedIds.has(animal.id),
    );
  }, [animals, sectionKey, selectedEstablishmentId, visibleItems]);

  const animalsById = useMemo(
    () => new Map(animals.map((animal) => [animal.id, animal])),
    [animals],
  );

  function handleEstablishmentCreated(establishment: Establishment) {
    setEstablishments((current) =>
      [...current, establishment].sort((a, b) => a.name.localeCompare(b.name, "es")),
    );
    setSelectedEstablishmentId(establishment.id);
  }

  function goToSection(path: string) {
    const search = new URLSearchParams();
    if (selectedEstablishmentId) {
      search.set("establishmentId", selectedEstablishmentId);
    }
    search.set("year", selectedYear);
    router.push(`${path}?${search.toString()}`);
  }

  function handleCreateItem() {
    if (sectionKey === "vacasViejas") {
      startTransition(async () => {
        const animal = availableOldCowOptions.find((item) => item.id === selectedAnimalId);

        if (!animal) {
          setMessage("Selecciona una vaca para marcar.");
          setMessageType("error");
          return;
        }

        const result = await markAnimalAsOldCowAction({
          animalId: animal.id,
          establishmentId: selectedEstablishmentId,
          year: selectedYear,
          description: animal.description || `Vaca ${animal.identifier} marcada como vaca vieja.`,
        });

        setMessage(result.message);
        setMessageType(result.success ? "success" : "error");

        if (!result.success || !result.item) {
          return;
        }

        const createdItem = result.item;
        setItems((current) => [createdItem, ...current]);
        setSelectedAnimalId("");
      });

      return;
    }

    startTransition(async () => {
      const result = await createInformationAnimalAction({
        establishmentId: selectedEstablishmentId,
        sectionKey,
        year: selectedYear,
        animalType,
        description,
      });

      setMessage(result.message);
      setMessageType(result.success ? "success" : "error");

      if (!result.success || !result.item) {
        return;
      }

      const createdItem = result.item;
      setItems((current) => [createdItem, ...current]);
      setDescription("");
    });
  }

  function handleDeleteItem(id: string) {
    startTransition(async () => {
      const result = await deleteInformationAnimalAction({
        id,
        establishmentId: selectedEstablishmentId,
      });

      setMessage(result.message);
      setMessageType(result.success ? "success" : "error");

      if (!result.success || !result.id) {
        return;
      }

      setItems((current) => current.filter((item) => item.id !== result.id));
    });
  }

  if (!section) {
    return null;
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
            <div className="section-title">Informacion</div>
            <p className="info-page-copy">Gestiona el detalle de la seccion seleccionada.</p>
          </div>
          <div className="info-header-actions">
            <button
              className={`action-button ${isAddPanelOpen ? "" : "primary"}`}
              type="button"
              onClick={() => setIsAddPanelOpen((current) => !current)}
            >
              {isAddPanelOpen ? "Ocultar" : "Agregar"}
            </button>
            <button className="action-button secondary" type="button" onClick={() => goToSection("/")}>
              Volver
            </button>
          </div>
        </div>

        <div className="info-year-bar">
          <label htmlFor="info-year">Ano</label>
          <select
            id="info-year"
            value={selectedYear}
            onChange={(event) =>
              setSelectedYear(event.target.value as (typeof INFORMATION_YEARS)[number])
            }
          >
            {INFORMATION_YEARS.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>

        <section className="info-detail-panel">
          <div className="info-detail-header">
            <div>
              <div className="info-card-label">Ano {selectedYear}</div>
              <h2>{section.title}</h2>
              <p>{section.description}</p>
            </div>
          </div>

          {isAddPanelOpen ? (
            sectionKey === "vacasViejas" ? (
              <div className="info-detail-form">
                <div className="modal-field info-description-field">
                  <label htmlFor="old-cow-selector">Selecciona una vaca</label>
                  <select
                    id="old-cow-selector"
                    value={selectedAnimalId}
                    onChange={(event) => setSelectedAnimalId(event.target.value)}
                    disabled={!selectedEstablishmentId || isPending}
                  >
                    <option value="">Seleccionar vaca</option>
                    {availableOldCowOptions.map((animal) => (
                      <option key={animal.id} value={animal.id}>
                        {animal.identifier}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  className="action-button primary"
                  type="button"
                  onClick={handleCreateItem}
                  disabled={!selectedEstablishmentId || isPending || !selectedAnimalId}
                >
                  {isPending ? "Guardando..." : "Agregar"}
                </button>
              </div>
            ) : (
              <div className="info-detail-form">
                <div className="modal-field">
                  <label htmlFor="animal-type">Tipo de animal</label>
                  <select
                    id="animal-type"
                    value={animalType}
                    onChange={(event) => setAnimalType(event.target.value as (typeof ANIMAL_TYPES)[number]["key"])}
                    disabled={!selectedEstablishmentId || isPending}
                  >
                    {ANIMAL_TYPES.map((item) => (
                      <option key={item.key} value={item.key}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="modal-field info-description-field">
                  <label htmlFor="animal-description">Descripcion</label>
                  <textarea
                    id="animal-description"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="Ej: Vaca vieja con desgaste dental, separar del lote principal."
                    disabled={!selectedEstablishmentId || isPending}
                  />
                </div>

                <button
                  className="action-button primary"
                  type="button"
                  onClick={handleCreateItem}
                  disabled={!selectedEstablishmentId || isPending}
                >
                  {isPending ? "Guardando..." : "Agregar a la lista"}
                </button>
              </div>
            )
          ) : null}

          {message ? <div className={`inline-message ${messageType}`}>{message}</div> : null}

          {sectionKey === "vacasViejas" ? (
            <div className="info-table-wrap">
              {visibleItems.length === 0 ? (
                <div className="history-empty">
                  No hay vacas marcadas como vacas viejas para el establecimiento y ano seleccionados.
                </div>
              ) : (
                <table className="info-table">
                  <thead>
                    <tr>
                      <th>Foto</th>
                      <th>Codigo</th>
                      <th>Descripcion</th>
                      <th>Fecha</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {visibleItems.map((item) => (
                      <tr key={item.id}>
                        <td>
                          {item.animalId && animalsById.get(item.animalId)?.images[0]?.filePath ? (
                            <img
                              className="info-table-avatar"
                              src={animalsById.get(item.animalId)?.images[0]?.filePath}
                              alt={item.animalIdentifier ?? item.animalId ?? "Vaca vieja"}
                              loading="lazy"
                            />
                          ) : (
                            <div className="info-table-avatar info-table-avatar-empty" aria-hidden="true" />
                          )}
                        </td>
                        <td>{item.animalIdentifier ?? item.animalId ?? "-"}</td>
                        <td>{item.description}</td>
                        <td>{new Date(item.createdAt).toLocaleString("es-AR")}</td>
                        <td>
                          {item.animalId ? (
                            <button
                              className="action-button secondary"
                              type="button"
                              onClick={() =>
                                router.push(
                                  `/animales/vacas/${item.animalId}?establishmentId=${encodeURIComponent(selectedEstablishmentId)}`,
                                )
                              }
                            >
                              Ver
                            </button>
                          ) : (
                            <button
                              className="action-button danger"
                              type="button"
                              onClick={() => handleDeleteItem(item.id)}
                              disabled={isPending}
                            >
                              Quitar
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ) : (
            <div className="info-list">
              {visibleItems.length === 0 ? (
                <div className="history-empty">
                  No hay registros en esta seccion para el establecimiento y ano seleccionados.
                </div>
              ) : (
                visibleItems.map((item) => (
                  <article className="info-list-item" key={item.id}>
                    <div>
                      <strong>
                        {ANIMAL_TYPES.find((animal) => animal.key === item.animalType)?.label ?? item.animalType}
                      </strong>
                      <p>{item.description}</p>
                      <div className="history-date">
                        {new Date(item.createdAt).toLocaleString("es-AR")}
                      </div>
                    </div>
                    <button
                      className="action-button danger"
                      type="button"
                      onClick={() => handleDeleteItem(item.id)}
                      disabled={isPending}
                    >
                      Eliminar
                    </button>
                  </article>
                ))
              )}
            </div>
          )}

          {sectionKey !== "vacasViejas" && images.length > 0 ? (
            <section className="info-gallery">
              <div className="info-detail-header">
                <div>
                  <div className="info-card-label">Fotos</div>
                  <h2>Galeria de imagenes</h2>
                  <p>Se cargan desde la carpeta local asociada a esta seccion.</p>
                </div>
              </div>

              <div className="info-gallery-grid">
                {images.map((image) => (
                  <a
                    className="info-gallery-card"
                    key={image.url}
                    href={image.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <img
                      className="info-gallery-image"
                      src={image.url}
                      alt={image.fileName}
                      loading="lazy"
                    />
                    <span>{image.fileName}</span>
                  </a>
                ))}
              </div>
            </section>
          ) : null}
        </section>
      </section>
    </PageShell>
  );
}
