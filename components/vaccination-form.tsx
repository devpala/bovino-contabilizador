"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useRouter } from "next/navigation";
import { PageShell } from "./page-shell";
import {
  registerMovementAction,
  saveVaccinationRecord,
  type SaveState,
} from "@/app/actions";
import { CATEGORIES, createDefaultValues } from "@/lib/categories";
import { INFORMATION_SECTIONS, INFORMATION_YEARS } from "@/lib/information";
import type { Establishment, InformationAnimal, MovementType, VaccinationRecord } from "@/lib/types";

const initialState: SaveState = {
  success: false,
  message: "",
};

type VaccinationFormProps = {
  establishments: Establishment[];
  records: VaccinationRecord[];
  informationItems: InformationAnimal[];
  dbError?: string;
};

function hydrateValues(detail?: Record<string, number>) {
  const values = createDefaultValues();

  for (const category of CATEGORIES) {
    const value = Number(detail?.[category.key] ?? 0);
    values[category.key] = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  }

  return values;
}

function formatMovementLabel(type: MovementType) {
  if (type === "venta") return "Venta";
  if (type === "muerte") return "Muerte";
  if (type === "nacimiento") return "Nacimiento";
  if (type === "conversion") return "Conversion";
  return "Compra";
}

function getMovementSummary(record: VaccinationRecord) {
  if (record.recordType !== "movement" || !record.movementType || !record.movementQuantity) {
    return null;
  }

  if (record.movementType === "compra" || record.movementType === "nacimiento") {
    const previousTotal = record.total - record.movementQuantity;
    return {
      change: `Se sumo ${record.movementQuantity}.`,
      balance: `Saldo anterior: ${previousTotal}.`,
    };
  }

  if (record.movementType === "venta" || record.movementType === "muerte") {
    const previousTotal = record.total + record.movementQuantity;
    return {
      change: `Se resto ${record.movementQuantity}.`,
      balance: `Saldo anterior: ${previousTotal}.`,
    };
  }

  return {
    change: `Se convirtieron ${record.movementQuantity}.`,
    balance: `Saldo anterior: ${record.total}.`,
  };
}

function formatHistoryTitle(record: VaccinationRecord) {
  if (record.recordType !== "movement") {
    return "Guardado de rodeo";
  }

  if (record.movementType === "conversion") {
    return `Conversion - ${CATEGORIES.find((item) => item.key === record.movementCategory)?.label ?? record.movementCategory ?? ""} a ${CATEGORIES.find((item) => item.key === record.movementToCategory)?.label ?? record.movementToCategory ?? ""}`;
  }

  return `${formatMovementLabel(record.movementType ?? "venta")} - ${CATEGORIES.find((item) => item.key === record.movementCategory)?.label ?? record.movementCategory ?? ""}`;
}

const BIRTH_CATEGORY_KEYS = ["terneras", "terneros"] as const;

function getFirstCategoryWithStock(values: Record<string, number>) {
  return CATEGORIES.find((category) => (values[category.key] ?? 0) > 0)?.key;
}

function getDefaultMovementCategory(type: MovementType, values: Record<string, number>) {
  if (type === "nacimiento") {
    return "terneras";
  }

  return getFirstCategoryWithStock(values) ?? CATEGORIES[0]?.key ?? "";
}

function getDefaultMovementToCategory(fromCategory: string) {
  return CATEGORIES.find((category) => category.key !== fromCategory)?.key ?? fromCategory;
}

export function VaccinationForm({
  establishments: initialEstablishments,
  records: initialRecords,
  informationItems,
  dbError,
}: VaccinationFormProps) {
  const router = useRouter();
  const [establishments, setEstablishments] = useState(initialEstablishments);
  const [records, setRecords] = useState(initialRecords);
  const [selectedEstablishmentId, setSelectedEstablishmentId] = useState(
    initialEstablishments[0]?.id ?? "",
  );
  const [values, setValues] = useState<Record<string, number>>(
    hydrateValues(initialEstablishments[0]?.herdDetail),
  );
  const [state, setState] = useState<SaveState>(initialState);
  const [isPending, startTransition] = useTransition();
  const [isEditing, setIsEditing] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [movementType, setMovementType] = useState<MovementType>("venta");
  const [movementCategory, setMovementCategory] = useState(CATEGORIES[0]?.key ?? "");
  const [movementToCategory, setMovementToCategory] = useState(CATEGORIES[1]?.key ?? CATEGORIES[0]?.key ?? "");
  const [movementQuantity, setMovementQuantity] = useState(1);
  const [selectedInformationYear, setSelectedInformationYear] = useState<(typeof INFORMATION_YEARS)[number]>("2026");

  const selectedEstablishment = useMemo(
    () => establishments.find((item) => item.id === selectedEstablishmentId) ?? null,
    [establishments, selectedEstablishmentId],
  );
  const usesIndividualAnimals = (selectedEstablishment?.individualAnimalCount ?? 0) > 0;

  const total = useMemo(
    () => Object.values(values).reduce((sum, value) => sum + value, 0),
    [values],
  );

  const breakdown = useMemo(
    () =>
      CATEGORIES.map((category) => ({
        label: category.label,
        value: values[category.key] ?? 0,
      })).filter((item) => item.value > 0),
    [values],
  );

  const filteredRecords = useMemo(
    () => records.filter((record) => record.establishmentId === selectedEstablishmentId),
    [records, selectedEstablishmentId],
  );

  const informationCounts = useMemo(
    () =>
      INFORMATION_SECTIONS.map((section) => ({
        ...section,
        total: informationItems.filter(
          (item) =>
            item.establishmentId === selectedEstablishmentId &&
            item.year === selectedInformationYear &&
            item.sectionKey === section.key,
        ).length,
      })),
    [informationItems, selectedEstablishmentId, selectedInformationYear],
  );

  const movementCategoryOptions = useMemo(() => {
    if (movementType !== "nacimiento") {
      return CATEGORIES;
    }

    return CATEGORIES.filter((category) =>
      BIRTH_CATEGORY_KEYS.includes(category.key as (typeof BIRTH_CATEGORY_KEYS)[number]),
    );
  }, [movementType]);

  function updateValue(key: string, nextValue: number) {
    setValues((current) => ({
      ...current,
      [key]: Math.max(0, nextValue),
    }));
  }

  function copySummary() {
    if (!selectedEstablishment) {
      setState({
        success: false,
        message: "Selecciona un establecimiento antes de descargar el PDF.",
      });
      return;
    }

    const doc = new jsPDF();
    const generatedAt = new Intl.DateTimeFormat("es-AR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date());

    doc.setFontSize(18);
    doc.text("Contabilizador Bovino", 14, 18);
    doc.setFontSize(11);
    doc.text(`Establecimiento: ${selectedEstablishment.name}`, 14, 28);
    doc.text(`Fecha de emision: ${generatedAt}`, 14, 35);
    doc.text(`Total actual: ${total} animales`, 14, 42);

    autoTable(doc, {
      startY: 48,
      head: [["Categoria", "Cantidad"]],
      body: CATEGORIES.map((category) => [category.label, String(values[category.key] ?? 0)]),
      styles: {
        fontSize: 10,
      },
      headStyles: {
        fillColor: [90, 122, 58],
      },
    });

    autoTable(doc, {
      startY: (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY
        ? ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 0) + 10
        : 110,
      head: [["Tipo", "Detalle", "Fecha", "Total", "Cambio", "Saldo anterior"]],
      body:
        filteredRecords.length === 0
          ? [["Sin historial", "-", "-", "-", "-", "-"]]
          : filteredRecords.map((record) => {
              const detail = Object.entries(record.detail)
                .map(([key, value]) => {
                  const category = CATEGORIES.find((item) => item.key === key);
                  return `${category?.label ?? key}: ${value}`;
                })
                .join(" | ");
              const movementSummary = getMovementSummary(record);

              return [
                formatHistoryTitle(record),
                detail || "-",
                new Intl.DateTimeFormat("es-AR", {
                  dateStyle: "short",
                  timeStyle: "short",
                }).format(new Date(record.createdAt)),
                `${record.total} animales`,
                movementSummary?.change ?? "-",
                movementSummary?.balance ?? "-",
              ];
            }),
      styles: {
        fontSize: 8,
        cellWidth: "wrap",
      },
      headStyles: {
        fillColor: [61, 43, 31],
      },
      columnStyles: {
        0: { cellWidth: 28 },
        1: { cellWidth: 48 },
        2: { cellWidth: 24 },
        3: { cellWidth: 22 },
        4: { cellWidth: 28 },
        5: { cellWidth: 28 },
      },
    });

    doc.save(`resumen-${selectedEstablishment.name.toLowerCase().replace(/\s+/g, "-")}.pdf`);
  }

  function handleEstablishmentChange(nextId: string) {
    setSelectedEstablishmentId(nextId);
    const establishment = establishments.find((item) => item.id === nextId);
    setValues(hydrateValues(establishment?.herdDetail));
    setIsEditing(false);
    setState(initialState);
  }

  function openMovementModal(type: MovementType) {
    const defaultCategory = getDefaultMovementCategory(type, values);
    setMovementType(type);
    setMovementCategory(defaultCategory);
    setMovementToCategory(getDefaultMovementToCategory(defaultCategory));
    setMovementQuantity(1);
    setIsModalOpen(true);
  }

  function handleMovementTypeChange(nextType: MovementType) {
    const defaultCategory = getDefaultMovementCategory(nextType, values);
    setMovementType(nextType);
    setMovementCategory(defaultCategory);
    setMovementToCategory(getDefaultMovementToCategory(defaultCategory));
  }

  function closeMovementModal() {
    setIsModalOpen(false);
  }

  function applyMovement() {
    const currentValue = values[movementCategory] ?? 0;
    const quantity = Math.max(1, Math.floor(movementQuantity));
    const category = CATEGORIES.find((item) => item.key === movementCategory);
    const toCategory = CATEGORIES.find((item) => item.key === movementToCategory);
    const addsAnimals = movementType === "nacimiento" || movementType === "compra";
    const isConversion = movementType === "conversion";

    if (!category) {
      setState({
        success: false,
        message: "Selecciona una categoria valida.",
      });
      return;
    }

    if (movementType === "nacimiento" && !BIRTH_CATEGORY_KEYS.includes(movementCategory as (typeof BIRTH_CATEGORY_KEYS)[number])) {
      setState({
        success: false,
        message: "Nacimiento solo puede registrarse en Terneras o Terneros.",
      });
      return;
    }

    if (isConversion && (!toCategory || movementCategory === movementToCategory)) {
      setState({
        success: false,
        message: "Selecciona categorias distintas para la conversion.",
      });
      return;
    }

    if ((!addsAnimals || isConversion) && quantity > currentValue) {
      setState({
        success: false,
        message: `No puedes registrar ${movementType} por ${quantity} en ${category.label} porque solo hay ${currentValue}.`,
      });
      return;
    }

    const nextValues = { ...values };

    if (isConversion) {
      nextValues[movementCategory] = currentValue - quantity;
      nextValues[movementToCategory] = (nextValues[movementToCategory] ?? 0) + quantity;
    } else {
      nextValues[movementCategory] = addsAnimals ? currentValue + quantity : currentValue - quantity;
    }

    startTransition(async () => {
      const result = await registerMovementAction({
        establishmentId: selectedEstablishmentId,
        movementType,
        movementCategory,
        movementToCategory: isConversion ? movementToCategory : undefined,
        movementQuantity: quantity,
        herdDetail: nextValues,
      });

      setState(result);

      if (result.success && result.establishment && result.record) {
        setEstablishments((current) =>
          current.map((item) =>
            item.id === result.establishment?.id ? result.establishment : item,
          ),
        );
        setRecords((current) => [result.record!, ...current]);
        setValues(hydrateValues(result.establishment.herdDetail));
        closeMovementModal();
        router.refresh();
      }
    });
  }

  function handleEstablishmentCreated(establishment: Establishment) {
    setEstablishments((current) =>
      [...current, establishment].sort((a, b) => a.name.localeCompare(b.name, "es")),
    );
  }

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await saveVaccinationRecord(formData);
      setState(result);

      if (result.success && result.establishment && result.record) {
        setEstablishments((current) =>
          current.map((item) =>
            item.id === result.establishment?.id ? result.establishment : item,
          ),
        );
        setRecords((current) => [result.record!, ...current]);
        setValues(hydrateValues(result.establishment.herdDetail));
        setIsEditing(false);
        router.refresh();
      }
    });
  }

  return (
    <PageShell
      establishments={establishments}
      selectedEstablishmentId={selectedEstablishmentId}
      onEstablishmentChange={handleEstablishmentChange}
      onEstablishmentCreated={handleEstablishmentCreated}
    >
      <form action={handleSubmit}>
        <input type="hidden" name="establishmentId" value={selectedEstablishmentId} />

        {dbError ? <div className="status-banner">{dbError}</div> : null}
        <div className="section-toolbar">
          <button
            className="action-button secondary"
            type="button"
            onClick={() => openMovementModal("venta")}
            disabled={!selectedEstablishment || usesIndividualAnimals}
          >
            Registrar
          </button>
        </div>

      <div className="section-title">Bovinos</div>

      <div className="categories-grid">
        {CATEGORIES.map((category) => {
          const value = values[category.key] ?? 0;

          return (
            <div
              className="category-card category-card-link"
              key={category.key}
              role="button"
              tabIndex={selectedEstablishment ? 0 : -1}
              onClick={() =>
                selectedEstablishment
                  ? router.push(
                      `/animales/${category.key}?establishmentId=${encodeURIComponent(selectedEstablishmentId)}`,
                    )
                  : undefined
              }
              onKeyDown={(event) => {
                if (!selectedEstablishment) {
                  return;
                }

                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  router.push(
                    `/animales/${category.key}?establishmentId=${encodeURIComponent(selectedEstablishmentId)}`,
                  );
                }
              }}
              aria-disabled={!selectedEstablishment}
            >
              <div className="card-header">
                <span className="card-emoji" aria-hidden="true">
                  {category.emoji}
                </span>
                <span className="card-title">{category.label}</span>
              </div>

              <div className="counter-row">
                <button
                  className="counter-button"
                  type="button"
                  hidden={!isEditing}
                  disabled={usesIndividualAnimals}
                  onClick={() => updateValue(category.key, value - 1)}
                >
                  -
                </button>

                <input
                  className="counter-input"
                  type="number"
                  min="0"
                  name={category.key}
                  value={value}
                  readOnly={!isEditing || usesIndividualAnimals}
                  aria-readonly={!isEditing || usesIndividualAnimals}
                  data-editing={isEditing && !usesIndividualAnimals ? "true" : "false"}
                  onChange={(event) =>
                    updateValue(category.key, Number.parseInt(event.target.value || "0", 10) || 0)
                  }
                />

                <button
                  className="counter-button plus"
                  type="button"
                  hidden={!isEditing}
                  disabled={usesIndividualAnimals}
                  onClick={() => updateValue(category.key, value + 1)}
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <section className="total-bar">
        <div>
          <div className="total-label">Total animales vacunados</div>
          <div className="total-number">{total}</div>
        </div>

        <div className="total-breakdown">
          {breakdown.length === 0
            ? "Todavia no hay categorias cargadas."
            : breakdown.map((item) => <span key={item.label}>{`${item.label}: ${item.value}`}</span>)}
        </div>
      </section>

      <div className="actions">
        <button
          className="action-button secondary"
          type="button"
          onClick={() =>
            router.push(
              `/animales/vacas?establishmentId=${encodeURIComponent(selectedEstablishmentId)}`,
            )
          }
          disabled={!selectedEstablishment}
        >
          Agregar
        </button>
        <button className="action-button" type="button" onClick={copySummary}>
          Descargar PDF
        </button>
        {!usesIndividualAnimals ? (
          <button
            className="action-button"
            type="button"
            onClick={() => setIsEditing((current) => !current)}
            disabled={!selectedEstablishment}
          >
            {isEditing ? "Cerrar edicion" : "Editar"}
          </button>
        ) : null}
      </div>

      {state.message ? (
        <div className={`inline-message ${state.success ? "success" : "error"}`}>
          {state.message}
        </div>
      ) : null}

      <section className="info-panel">
        <div className="info-page-header">
          <div>
            <div className="section-title">Informacion</div>
            <p className="info-page-copy">
              Haz clic en una seccion para abrir su ruta y ver la lista de animales.
            </p>
          </div>
          <div className="info-header-actions">
            <label htmlFor="home-info-year">Ano</label>
            <select
              id="home-info-year"
              value={selectedInformationYear}
              onChange={(event) =>
                setSelectedInformationYear(event.target.value as (typeof INFORMATION_YEARS)[number])
              }
            >
              {INFORMATION_YEARS.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="info-grid">
          {informationCounts.map((item) => (
            <Link
              className="info-card info-card-button"
              key={item.key}
              href={{
                pathname: `/informacion/${item.slug}`,
                query: selectedEstablishmentId
                  ? { establishmentId: selectedEstablishmentId, year: selectedInformationYear }
                  : { year: selectedInformationYear },
              }}
            >
              <div className="info-card-header">
                <div>
                  <div className="info-card-label">Ano {selectedInformationYear}</div>
                  <h3>{item.title}</h3>
                </div>
              </div>
              <p>{item.description}</p>
              <div className="info-card-total">Total: {item.total}</div>
            </Link>
          ))}
        </div>
      </section>

      {isModalOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={closeMovementModal}>
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="movement-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <h2 id="movement-modal-title">Registrar movimiento</h2>
              <button className="modal-close" type="button" onClick={closeMovementModal}>
                x
              </button>
            </div>

            <div className="modal-field">
              <label htmlFor="movement-type">Tipo</label>
              <select
                id="movement-type"
                value={movementType}
                onChange={(event) => handleMovementTypeChange(event.target.value as MovementType)}
              >
                <option value="venta">Venta</option>
                <option value="muerte">Muerte</option>
                <option value="nacimiento">Nacimiento</option>
                <option value="compra">Compra</option>
                <option value="conversion">Conversion</option>
              </select>
            </div>

            <div className="modal-field">
              <label htmlFor="movement-category">
                {movementType === "conversion" ? "Desde" : "Categoria"}
              </label>
              <select
                id="movement-category"
                value={movementCategory}
                onChange={(event) => setMovementCategory(event.target.value)}
              >
                {movementCategoryOptions.map((category) => (
                  <option key={category.key} value={category.key}>
                    {category.label}
                  </option>
                ))}
              </select>
            </div>

            {movementType === "conversion" ? (
              <div className="modal-field">
                <label htmlFor="movement-to-category">Hacia</label>
                <select
                  id="movement-to-category"
                  value={movementToCategory}
                  onChange={(event) => setMovementToCategory(event.target.value)}
                >
                  {CATEGORIES.map((category) => (
                    <option key={category.key} value={category.key}>
                      {category.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className="modal-field">
              <label htmlFor="movement-quantity">Cantidad</label>
              <input
                id="movement-quantity"
                type="number"
                min="1"
                value={movementQuantity}
                onChange={(event) =>
                  setMovementQuantity(Number.parseInt(event.target.value || "1", 10) || 1)
                }
              />
            </div>

            <div className="modal-actions">
              <button className="action-button" type="button" onClick={closeMovementModal}>
                Cancelar
              </button>
              <button className="action-button primary" type="button" onClick={applyMovement}>
                Registrar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <section className="history">
        <div className="history-header">
          <span>
            {selectedEstablishment
              ? `Historial de ${selectedEstablishment.name}`
              : "Historial del establecimiento"}
          </span>
          <span className="history-count">{filteredRecords.length} registros</span>
        </div>

        <div className="history-list">
          {filteredRecords.length === 0 ? (
            <div className="history-empty">
              {selectedEstablishment
                ? `No hay registros guardados aun para ${selectedEstablishment.name}.`
                : "Crea un establecimiento para empezar."}
            </div>
          ) : (
            filteredRecords.map((record) => {
              const detail = Object.entries(record.detail)
                .map(([key, value]) => {
                  const category = CATEGORIES.find((item) => item.key === key);
                  return `${category?.label ?? key}: ${value}`;
                })
                .join(" · ");

              const title = formatHistoryTitle(record);
              const movementSummary = getMovementSummary(record);

              return (
                <article className="history-item" key={record.id}>
                  <div>
                    <strong>{title}</strong>
                    <div className="history-detail">{detail || "Sin cambios de detalle."}</div>
                    <div className="history-date">
                      {new Intl.DateTimeFormat("es-AR", {
                        dateStyle: "short",
                        timeStyle: "short",
                      }).format(new Date(record.createdAt))}
                    </div>
                  </div>
                  <div>
                    <div className="history-total">{record.total} animales</div>
                    {movementSummary ? (
                      <div className="history-balance">
                        <div>{movementSummary.change}</div>
                        <div>{movementSummary.balance}</div>
                      </div>
                    ) : null}
                  </div>
                </article>
              );
            })
          )}
        </div>
      </section>
      </form>
    </PageShell>
  );
}
