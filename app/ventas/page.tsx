import { SalesHistoryPage } from "@/components/sales-history-page";
import { getDashboardData } from "@/lib/records";
import { getAnimals } from "@/lib/animals";

export const dynamic = "force-dynamic";

export default async function SalesHistoryRoute() {
  const [data, animals] = await Promise.all([
    getDashboardData(),
    getAnimals(true), // include sold animals
  ]);

  const salesRecords = data.records.filter((r) => r.movementType === "venta");

  return (
    <main className="page-shell">
      <SalesHistoryPage records={salesRecords} animals={animals} establishments={data.establishments} />
    </main>
  );
}
