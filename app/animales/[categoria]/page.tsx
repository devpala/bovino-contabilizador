import { notFound } from "next/navigation";

import { AnimalsPage } from "@/components/animals-page";
import { CATEGORIES } from "@/lib/categories";
import { getAnimals } from "@/lib/animals";
import { getDashboardData, getInformationAnimals } from "@/lib/records";
import type { Animal, Establishment, HerdCategoryKey } from "@/lib/types";

export const dynamic = "force-dynamic";

type AnimalsCategoryPageProps = {
  params: Promise<{ categoria: string }>;
  searchParams: Promise<{ establishmentId?: string }>;
};

export default async function AnimalsCategoryPage({
  params,
  searchParams,
}: AnimalsCategoryPageProps) {
  const { categoria } = await params;
  const query = await searchParams;
  const category = CATEGORIES.find((item) => item.key === categoria);

  if (!category) {
    notFound();
  }

  let establishments: Establishment[] = [];
  let animals: Animal[] = [];
  let markedOldCowIds: string[] = [];
  let dbError = "";

  try {
    const [data, storedAnimals, informationAnimals] = await Promise.all([
      getDashboardData(),
      getAnimals(),
      getInformationAnimals(),
    ]);
    establishments = data.establishments;
    animals = storedAnimals;
    markedOldCowIds = informationAnimals
      .filter((item) => item.sectionKey === "vacasViejas" && item.animalId)
      .map((item) => item.animalId!)
      .filter((value, index, array) => array.indexOf(value) === index);
  } catch (error) {
    console.error(error);
    dbError =
      "No se pudieron leer los animales desde PostgreSQL. Configura DATABASE_URL y ejecuta db/schema.sql.";
  }

  return (
    <main className="page-shell">
      <AnimalsPage
        establishments={establishments}
        animals={animals}
        dbError={dbError}
        categoryKey={category.key as HerdCategoryKey}
        initialEstablishmentId={query.establishmentId ?? establishments[0]?.id ?? ""}
        markedOldCowIds={markedOldCowIds}
      />
    </main>
  );
}
