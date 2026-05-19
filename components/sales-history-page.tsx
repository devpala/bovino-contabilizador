"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CATEGORIES } from "@/lib/categories";
import { PageShell } from "./page-shell";
import { getProfileImage, type Animal, type Establishment, type VaccinationRecord } from "@/lib/types";

type SalesHistoryPageProps = {
  records: VaccinationRecord[];
  animals: Animal[];
  establishments: Establishment[];
};

export function SalesHistoryPage({
  records,
  animals,
  establishments: initialEstablishments,
}: SalesHistoryPageProps) {
  const [establishments, setEstablishments] = useState(initialEstablishments);
  const [selectedEstablishmentId, setSelectedEstablishmentId] = useState("");

  const animalsMap = useMemo(() => new Map(animals.map((a) => [a.id, a])), [animals]);

  const filteredRecords = useMemo(() => {
    if (!selectedEstablishmentId) return records;
    return records.filter((r) => r.establishmentId === selectedEstablishmentId);
  }, [records, selectedEstablishmentId]);

  const stats = useMemo(() => {
    return filteredRecords.reduce(
      (acc, record) => {
        const extra = record.detail as any;
        acc.totalAnimals += record.movementQuantity || 0;
        acc.totalRevenue += Number(extra.total_payment || 0);
        if (record.movementCategory === "vacas") {
          acc.totalVacas += record.movementQuantity || 0;
        }
        return acc;
      },
      { totalAnimals: 0, totalRevenue: 0, totalVacas: 0 },
    );
  }, [filteredRecords]);

  function handleEstablishmentCreated(establishment: Establishment) {
    setEstablishments((current) =>
      [...current, establishment].sort((a, b) => a.name.localeCompare(b.name, "es")),
    );
  }

  return (
    <PageShell
      establishments={establishments}
      selectedEstablishmentId={selectedEstablishmentId}
      onEstablishmentChange={setSelectedEstablishmentId}
      onEstablishmentCreated={handleEstablishmentCreated}
    >
      <section className="info-page">
        <div className="info-page-header">
          <div>
            <div className="section-title">Ventas</div>
            <p className="info-page-copy">Historial general de ventas realizadas en la hacienda.</p>
          </div>
          <div className="info-header-actions">
            <Link className="action-button secondary" href="/">
              Volver al inicio
            </Link>
          </div>
        </div>

        <div className="categories-grid" style={{ marginBottom: "24px" }}>
          <div className="category-card" style={{ background: "var(--campo)", color: "white" }}>
            <div className="card-header">
              <span className="card-emoji">🐄</span>
              <span className="card-title" style={{ color: "white" }}>Total de animales vendidos</span>
            </div>
            <div className="total-number" style={{ color: "white", marginTop: "10px" }}>
              {stats.totalAnimals}
            </div>
          </div>

          <div className="category-card" style={{ background: "var(--tierra)", color: "var(--paja)" }}>
            <div className="card-header">
              <span className="card-emoji">💰</span>
              <span className="card-title" style={{ color: "var(--paja)" }}>Total Cobrado</span>
            </div>
            <div className="total-number" style={{ color: "var(--campo-claro)", marginTop: "10px" }}>
              ${Math.round(stats.totalRevenue).toLocaleString("es-AR")}
            </div>
          </div>
        </div>

        <section className="history">
          <div className="history-header">
            <span>Listado de ventas</span>
            <span className="history-count">{filteredRecords.length} ventas</span>
          </div>

          <div className="info-table-wrap">
            <table className="info-table">
              <thead>
                <tr>
                  <th>Foto</th>
                  <th>Fecha</th>
                  <th>Establecimiento</th>
                  <th>Categoria</th>
                  <th>Cant.</th>
                  <th>Peso Bruto</th>
                  <th>Peso Neto</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="history-empty" style={{ textAlign: "center" }}>
                      No se encontraron ventas registradas.
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map((record) => {
                    const extra = record.detail as any;
                    const animal = extra.animalId ? animalsMap.get(extra.animalId) : null;
                    const profile = animal ? getProfileImage(animal) : null;
                    const category = CATEGORIES.find((c) => c.key === record.movementCategory);
                    const hasFinance = extra.weight_final && extra.total_payment;

                    return (
                      <tr key={record.id}>
                        <td>
                          {profile?.filePath ? (
                            <img
                              className="info-table-avatar"
                              src={profile.filePath}
                              alt="Animal vendido"
                              loading="lazy"
                            />
                          ) : (
                            <div className="info-table-avatar info-table-avatar-empty" aria-hidden="true" />
                          )}
                        </td>
                        <td>
                          {new Intl.DateTimeFormat("es-AR", {
                            dateStyle: "short",
                          }).format(new Date(record.createdAt))}
                        </td>
                        <td style={{ fontSize: "0.8rem" }}>{record.establishmentName}</td>
                        <td>{category?.label ?? record.movementCategory}</td>
                        <td style={{ textAlign: "center" }}>{record.movementQuantity}</td>
                        <td>{extra.weight_initial ? `${extra.weight_initial.toFixed(1)} kg` : "-"}</td>
                        <td>{extra.weight_final ? `${extra.weight_final.toFixed(1)} kg` : "-"}</td>
                        <td style={{ fontWeight: "bold", color: "var(--campo)" }}>
                          {hasFinance ? `$${Math.round(extra.total_payment).toLocaleString("es-AR")}` : "-"}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </PageShell>
  );
}
