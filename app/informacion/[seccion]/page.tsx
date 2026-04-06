import { notFound } from "next/navigation";

import { InformationDetailPage } from "@/components/information-detail-page";
import { getAnimals } from "@/lib/animals";
import { getInformationSectionBySlug } from "@/lib/information";
import { getDashboardData, getInformationAnimals } from "@/lib/records";
import { getStoredImages, type StoredImage } from "@/lib/storage";
import type { Animal, Establishment, InformationAnimal } from "@/lib/types";

export const dynamic = "force-dynamic";

type InformationSectionPageProps = {
  params: Promise<{ seccion: string }>;
  searchParams: Promise<{ establishmentId?: string; year?: string }>;
};

export default async function InformationSectionPage({
  params,
  searchParams,
}: InformationSectionPageProps) {
  const { seccion } = await params;
  const query = await searchParams;
  const section = getInformationSectionBySlug(seccion);

  if (!section) {
    notFound();
  }

  let establishments: Establishment[] = [];
  let items: InformationAnimal[] = [];
  let animals: Animal[] = [];
  let images: StoredImage[] = [];
  let dbError = "";

  try {
    const [data, informationAnimals, storedAnimals] = await Promise.all([
      getDashboardData(),
      getInformationAnimals(),
      getAnimals(),
    ]);
    establishments = data.establishments;
    items = informationAnimals;
    animals = storedAnimals;
    images = await getStoredImages(seccion);
  } catch (error) {
    console.error(error);
    dbError =
      "No se pudieron leer los datos de informacion desde PostgreSQL. Configura DATABASE_URL y ejecuta db/schema.sql.";
  }

  return (
    <main className="page-shell">
      <InformationDetailPage
        establishments={establishments}
        items={items}
        animals={animals}
        dbError={dbError}
        initialEstablishmentId={query.establishmentId ?? establishments[0]?.id ?? ""}
        initialYear={query.year ?? "2026"}
        sectionKey={section.key}
        images={images}
      />
    </main>
  );
}
