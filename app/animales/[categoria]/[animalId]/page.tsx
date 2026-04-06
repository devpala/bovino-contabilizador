import { notFound } from "next/navigation";

import { AnimalDetailPage } from "@/components/animal-detail-page";
import { CATEGORIES } from "@/lib/categories";
import { getAnimalById } from "@/lib/animals";
import { getDashboardData, getInformationAnimals } from "@/lib/records";
import type { Establishment } from "@/lib/types";

export const dynamic = "force-dynamic";

type AnimalDetailRouteProps = {
  params: Promise<{ categoria: string; animalId: string }>;
};

export default async function AnimalDetailRoute({ params }: AnimalDetailRouteProps) {
  const { categoria, animalId } = await params;
  const category = CATEGORIES.find((item) => item.key === categoria);

  if (!category) {
    notFound();
  }

  let establishments: Establishment[] = [];
  let dbError = "";
  const animal = await getAnimalById(animalId);
  let isMarkedAsOldCow = false;

  if (!animal || animal.categoryKey !== categoria) {
    notFound();
  }

  try {
    const [data, informationAnimals] = await Promise.all([
      getDashboardData(),
      getInformationAnimals(),
    ]);
    establishments = data.establishments;
    isMarkedAsOldCow = informationAnimals.some(
      (item) =>
        item.animalId === animal.id &&
        item.sectionKey === "vacasViejas" &&
        item.year === String(new Date().getFullYear()),
    );
  } catch (error) {
    console.error(error);
    dbError =
      "No se pudieron leer los datos del establecimiento desde PostgreSQL. Configura DATABASE_URL y ejecuta db/schema.sql.";
  }

  return (
    <main className="page-shell">
      <AnimalDetailPage
        establishments={establishments}
        animal={animal}
        dbError={dbError}
        isMarkedAsOldCow={isMarkedAsOldCow}
      />
    </main>
  );
}
