import { VaccinationForm } from "@/components/vaccination-form";
import { getDashboardData } from "@/lib/records";
import type { Establishment, VaccinationRecord } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let establishments: Establishment[] = [];
  let records: VaccinationRecord[] = [];
  let dbError = "";

  try {
    const data = await getDashboardData();
    establishments = data.establishments;
    records = data.records;
  } catch (error) {
    console.error(error);
    dbError =
      "No se pudieron leer los registros desde PostgreSQL. Configura DATABASE_URL y crea la tabla con db/schema.sql.";
  }

  return (
    <main className="page-shell">
      <header className="page-header">
        <span className="header-icon" aria-hidden="true">
          🐄
        </span>
        <div className="header-copy">
          <h1>Contabilizador Bovino</h1>
          <p>Bovinos - formulario con persistencia local</p>
        </div>
      </header>

      <div className="container">
        {dbError ? <div className="status-banner">{dbError}</div> : null}
        <VaccinationForm establishments={establishments} records={records} />
      </div>
    </main>
  );
}
