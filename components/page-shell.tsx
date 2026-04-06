"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createEstablishmentAction } from "@/app/actions";
import type { Establishment } from "@/lib/types";

type PageShellProps = {
  children: React.ReactNode;
  establishments: Establishment[];
  selectedEstablishmentId: string;
  onEstablishmentChange: (id: string) => void;
  onEstablishmentCreated?: (establishment: Establishment) => void;
};

export function PageShell({
  children,
  establishments,
  selectedEstablishmentId,
  onEstablishmentChange,
  onEstablishmentCreated,
}: PageShellProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isEstablishmentModalOpen, setIsEstablishmentModalOpen] = useState(false);
  const [newEstablishmentName, setNewEstablishmentName] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  function openEstablishmentModal() {
    setNewEstablishmentName("");
    setErrorMessage("");
    setIsEstablishmentModalOpen(true);
  }

  function closeEstablishmentModal() {
    setIsEstablishmentModalOpen(false);
  }

  function handleCreateEstablishment() {
    const formData = new FormData();
    formData.set("name", newEstablishmentName);

    startTransition(async () => {
      const result = await createEstablishmentAction(formData);

      if (!result.success || !result.establishment) {
        setErrorMessage(result.message);
        return;
      }

      if (onEstablishmentCreated) {
        onEstablishmentCreated(result.establishment);
      }
      
      onEstablishmentChange(result.establishment.id);
      closeEstablishmentModal();
      router.refresh();
    });
  }

  return (
    <>
      <header className="page-header">
        <div className="header-top">
          <div className="header-main" onClick={() => router.push("/")} style={{ cursor: "pointer" }}>
            <span className="header-icon" aria-hidden="true">
              🐄
            </span>
            <div className="header-copy">
              <h1>Contabilizador Bovino</h1>
              <p>Bovinos - formulario con persistencia local</p>
            </div>
          </div>

          <div className="establishment-header-bar">
            <label htmlFor="establishmentId">Establecimiento:</label>
            <select
              id="establishmentId"
              name="establishmentSelector"
              value={selectedEstablishmentId}
              onChange={(event) => onEstablishmentChange(event.target.value)}
            >
              {establishments.length === 0 ? (
                <option value="">Sin establecimientos</option>
              ) : null}
              {establishments.map((establishment) => (
                <option key={establishment.id} value={establishment.id}>
                  {establishment.name}
                </option>
              ))}
            </select>
            <button className="action-button secondary" type="button" onClick={openEstablishmentModal}>
              Agregar establecimiento
            </button>
          </div>
        </div>
      </header>

      <div className="container">
        {children}
      </div>

      {isEstablishmentModalOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={closeEstablishmentModal}>
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="establishment-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <h2 id="establishment-modal-title">Agregar establecimiento</h2>
              <button className="modal-close" type="button" onClick={closeEstablishmentModal}>
                x
              </button>
            </div>

            <div className="modal-field">
              <label htmlFor="new-establishment-name">Nombre</label>
              <input
                id="new-establishment-name"
                type="text"
                value={newEstablishmentName}
                onChange={(event) => setNewEstablishmentName(event.target.value)}
                placeholder="Ej: El Modelo"
              />
              {errorMessage ? <div style={{ color: "var(--error)", fontSize: "0.8rem", marginTop: "4px" }}>{errorMessage}</div> : null}
            </div>

            <div className="modal-actions">
              <button className="action-button" type="button" onClick={closeEstablishmentModal}>
                Cancelar
              </button>
              <button 
                className="action-button primary" 
                type="button" 
                onClick={handleCreateEstablishment}
                disabled={isPending}
              >
                {isPending ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
