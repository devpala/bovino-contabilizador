"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  deleteCountingSessionAction,
  updateCountingSessionAction,
  uploadCountingVideoAction,
} from "@/app/actions";
import { PageShell } from "./page-shell";
import type { CountingSession, Establishment } from "@/lib/types";

type CountingPageProps = {
  establishments: Establishment[];
  sessionsByEstablishment: Record<string, CountingSession[]>;
};

export function CountingPage({
  establishments: initialEstablishments,
  sessionsByEstablishment,
}: CountingPageProps) {
  const [establishments, setEstablishments] = useState(initialEstablishments);
  const [selectedEstablishmentId, setSelectedEstablishmentId] = useState(
    initialEstablishments[0]?.id ?? "",
  );
  const [sessionsByEst, setSessionsByEst] = useState(sessionsByEstablishment);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [isUploading, startUpload] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const currentSessions = useMemo(
    () => (selectedEstablishmentId ? sessionsByEst[selectedEstablishmentId] ?? [] : []),
    [sessionsByEst, selectedEstablishmentId],
  );

  const selectedEstablishment = establishments.find((e) => e.id === selectedEstablishmentId);

  function handleEstablishmentCreated(establishment: Establishment) {
    setEstablishments((current) =>
      [...current, establishment].sort((a, b) => a.name.localeCompare(b.name, "es")),
    );
    setSessionsByEst((prev) => ({ ...prev, [establishment.id]: [] }));
  }

  function handleUpload(formData: FormData) {
    if (!selectedEstablishmentId) {
      setMessage({ kind: "error", text: "Seleccioná un establecimiento primero." });
      return;
    }

    formData.set("establishmentId", selectedEstablishmentId);

    startUpload(async () => {
      const result = await uploadCountingVideoAction(formData);
      setMessage({ kind: result.success ? "ok" : "error", text: result.message });

      if (result.success && result.sessions) {
        setSessionsByEst((prev) => ({
          ...prev,
          [selectedEstablishmentId]: [
            ...result.sessions!,
            ...(prev[selectedEstablishmentId] ?? []),
          ],
        }));
        if (fileRef.current) fileRef.current.value = "";
      }
    });
  }

  function handleDelete(session: CountingSession) {
    if (!window.confirm(`¿Borrar "${session.fileName}"? No se puede deshacer.`)) return;

    startUpload(async () => {
      const result = await deleteCountingSessionAction({ id: session.id });
      setMessage({ kind: result.success ? "ok" : "error", text: result.message });

      if (result.success) {
        setSessionsByEst((prev) => ({
          ...prev,
          [session.establishmentId]: (prev[session.establishmentId] ?? []).filter(
            (s) => s.id !== session.id,
          ),
        }));
      }
    });
  }

  function patchSession(updated: CountingSession) {
    setSessionsByEst((prev) => ({
      ...prev,
      [updated.establishmentId]: (prev[updated.establishmentId] ?? []).map((s) =>
        s.id === updated.id ? updated : s,
      ),
    }));
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
            <div className="section-title">Conteo</div>
            <p className="info-page-copy">
              Subí videos del rodeo y contá manualmente. El conteo se guarda en la base de datos —
              más adelante integramos herramientas automáticas que llenen <code>auto_count</code>.
            </p>
          </div>
          <div className="info-header-actions">
            <Link className="action-button secondary" href="/">
              Volver al inicio
            </Link>
          </div>
        </div>

        <form
          action={handleUpload}
          style={{
            background: "var(--paja, #fff8e7)",
            border: "1px solid var(--borde, #d8d2bf)",
            borderRadius: 12,
            padding: 16,
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            alignItems: "center",
            marginBottom: 24,
          }}
        >
          <div style={{ flex: "1 1 240px" }}>
            <label
              htmlFor="counting-video-input"
              style={{ display: "block", fontWeight: 600, fontSize: ".9rem", marginBottom: 6 }}
            >
              {selectedEstablishment
                ? `Subir video a ${selectedEstablishment.name}`
                : "Seleccioná un establecimiento"}
            </label>
            <input
              ref={fileRef}
              id="counting-video-input"
              type="file"
              name="video"
              accept="video/*"
              multiple
              required
              disabled={!selectedEstablishmentId || isUploading}
            />
          </div>
          <button
            className="action-button primary"
            type="submit"
            disabled={!selectedEstablishmentId || isUploading}
          >
            {isUploading ? "Subiendo..." : "Subir"}
          </button>
        </form>

        {message ? (
          <div
            className="status-banner"
            style={{
              marginBottom: 16,
              background:
                message.kind === "ok" ? "var(--campo-claro, #e6f0d4)" : "var(--error-bg, #f9d6d5)",
              color: message.kind === "ok" ? "var(--campo, #4a6b1f)" : "var(--error, #8a1f1c)",
            }}
          >
            {message.text}
          </div>
        ) : null}

        {!selectedEstablishmentId ? (
          <p className="info-page-copy">Elegí un establecimiento desde el encabezado.</p>
        ) : currentSessions.length === 0 ? (
          <p className="info-page-copy">No hay videos subidos para este establecimiento.</p>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
              gap: 16,
            }}
          >
            {currentSessions.map((session) => (
              <CountingCard
                key={session.id}
                session={session}
                onPatch={patchSession}
                onDelete={() => handleDelete(session)}
                isBusy={isUploading}
              />
            ))}
          </div>
        )}
      </section>
    </PageShell>
  );
}

type CountingCardProps = {
  session: CountingSession;
  onPatch: (session: CountingSession) => void;
  onDelete: () => void;
  isBusy: boolean;
};

const SAVE_DELAY_MS = 600;

function CountingCard({ session, onPatch, onDelete, isBusy }: CountingCardProps) {
  const [count, setCount] = useState<number>(session.manualCount ?? 0);
  const [notes, setNotes] = useState<string>(session.notes ?? "");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const pendingCountRef = useRef<number | null>(null);
  const pendingNotesRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function scheduleSave() {
    if (timerRef.current) clearTimeout(timerRef.current);
    setSaveStatus("saving");
    timerRef.current = setTimeout(async () => {
      const manualCount = pendingCountRef.current;
      const nextNotes = pendingNotesRef.current;
      pendingCountRef.current = null;
      pendingNotesRef.current = null;

      const result = await updateCountingSessionAction({
        id: session.id,
        ...(manualCount !== null ? { manualCount } : {}),
        ...(nextNotes !== null ? { notes: nextNotes } : {}),
      });

      if (result.success && result.session) {
        onPatch(result.session);
        setSaveStatus("saved");
      } else {
        setSaveStatus("error");
      }
    }, SAVE_DELAY_MS);
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function updateCount(next: number) {
    const clamped = Math.max(0, Math.floor(Number.isFinite(next) ? next : 0));
    setCount(clamped);
    pendingCountRef.current = clamped;
    scheduleSave();
  }

  function updateNotes(next: string) {
    setNotes(next);
    pendingNotesRef.current = next;
    scheduleSave();
  }

  const sizeMb = (session.fileSizeBytes / (1024 * 1024)).toFixed(1);

  return (
    <div
      style={{
        background: "white",
        border: "1px solid var(--borde, #d8d2bf)",
        borderRadius: 12,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <video
        controls
        preload="metadata"
        src={session.filePath}
        style={{ width: "100%", aspectRatio: "16 / 9", background: "#000", objectFit: "contain" }}
      />
      <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: ".9rem", wordBreak: "break-all" }}>
            {session.fileName}
          </div>
          <div style={{ fontSize: ".75rem", color: "#666" }}>
            {sizeMb} MB · {new Date(session.createdAt).toLocaleString("es-AR")}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            className="action-button secondary"
            onClick={() => updateCount(count - 1)}
            aria-label="Restar uno"
            style={{ minWidth: 44 }}
          >
            −
          </button>
          <input
            type="number"
            min={0}
            value={count}
            onChange={(event) => updateCount(Number(event.target.value))}
            style={{
              flex: 1,
              textAlign: "center",
              fontSize: "1.5rem",
              fontWeight: 700,
              padding: "4px 8px",
              border: "1px solid var(--borde, #d8d2bf)",
              borderRadius: 8,
            }}
          />
          <button
            type="button"
            className="action-button primary"
            onClick={() => updateCount(count + 1)}
            aria-label="Sumar uno"
            style={{ minWidth: 44 }}
          >
            +
          </button>
        </div>

        <textarea
          value={notes}
          onChange={(event) => updateNotes(event.target.value)}
          placeholder="Notas (potrero, hora, condiciones, etc.)"
          rows={2}
          style={{
            width: "100%",
            padding: "6px 8px",
            border: "1px solid var(--borde, #d8d2bf)",
            borderRadius: 8,
            fontFamily: "inherit",
            fontSize: ".85rem",
            resize: "vertical",
          }}
        />

        <div style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: ".75rem", color: saveStatus === "error" ? "var(--error, #8a1f1c)" : "#666" }}>
            {saveStatus === "saving"
              ? "Guardando…"
              : saveStatus === "saved"
                ? "Guardado"
                : saveStatus === "error"
                  ? "Error al guardar"
                  : ""}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="action-button"
              onClick={() => updateCount(0)}
              disabled={count === 0}
            >
              Reset
            </button>
            <button
              type="button"
              className="action-button secondary"
              onClick={onDelete}
              disabled={isBusy}
              style={{ color: "var(--error, #8a1f1c)" }}
            >
              Borrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
