"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { INFORMATION_SECTIONS, INFORMATION_YEARS } from "@/lib/information";
import { PageShell } from "./page-shell";
import type { Establishment, InformationAnimal, InformationSectionKey } from "@/lib/types";

type InformationPageProps = {
  establishments: Establishment[];
  items: InformationAnimal[];
  dbError: string;
};

export function InformationPage({
  establishments: initialEstablishments,
  items,
  dbError,
}: InformationPageProps) {
  const router = useRouter();
  const [establishments, setEstablishments] = useState(initialEstablishments);
  const [selectedEstablishmentId, setSelectedEstablishmentId] = useState(
    initialEstablishments[0]?.id ?? "",
  );
  const [selectedYear, setSelectedYear] = useState<(typeof INFORMATION_YEARS)[number]>("2026");

  function handleEstablishmentCreated(establishment: Establishment) {
    setEstablishments((current) =>
      [...current, establishment].sort((a, b) => a.name.localeCompare(b.name, "es")),
    );
  }

  function countItems(sectionKey: InformationSectionKey) {
    return items.filter(
      (item) =>
        item.establishmentId === selectedEstablishmentId &&
        item.year === selectedYear &&
        item.sectionKey === sectionKey,
    ).length;
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
            <p className="info-page-copy">
              Haz clic en una seccion para abrir su ruta y ver la lista de animales.
            </p>
          </div>
          <div className="info-header-actions">
            <button className="action-button secondary" type="button" onClick={() => router.push("/")}>
              Volver
            </button>
          </div>
        </div>

        <div className="info-year-bar">
          <label htmlFor="info-year">Ano</label>
          <select
            id="info-year"
            value={selectedYear}
            onChange={(event) => setSelectedYear(event.target.value as (typeof INFORMATION_YEARS)[number])}
          >
            {INFORMATION_YEARS.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>

        <div className="info-grid">
          {INFORMATION_SECTIONS.map((item) => (
            <Link
              className="info-card info-card-button"
              key={item.title}
              href={{
                pathname: `/informacion/${item.slug}`,
                query: selectedEstablishmentId
                  ? { establishmentId: selectedEstablishmentId, year: selectedYear }
                  : { year: selectedYear },
              }}
            >
              <div className="info-card-header">
                <div>
                  <div className="info-card-label">Ano {selectedYear}</div>
                  <h3>{item.title}</h3>
                </div>
              </div>
              <p>{item.description}</p>
              <div className="info-card-total">Total: {countItems(item.key)}</div>
            </Link>
          ))}
        </div>
      </section>
    </PageShell>
  );
}
