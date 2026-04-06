import { VaccinationForm } from "@/components/vaccination-form";
import { getDashboardData, getInformationAnimals } from "@/lib/records";
import type { Establishment, InformationAnimal, VaccinationRecord } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let establishments: Establishment[] = [];
  let records: VaccinationRecord[] = [];
  let informationItems: InformationAnimal[] = [];
  let dbError = "";

  try {
    const [data, items] = await Promise.all([getDashboardData(), getInformationAnimals()]);
    establishments = data.establishments;
    records = data.records;
    informationItems = items;
  } catch (error) {
    console.error(error);
    dbError =
      "No se pudieron leer los registros desde PostgreSQL. Configura DATABASE_URL y crea la tabla con db/schema.sql.";
  }

  return (
    <main className="page-shell">
      <VaccinationForm
        establishments={establishments}
        records={records}
        informationItems={informationItems}
        dbError={dbError}
      />
    </main>
  );
}
