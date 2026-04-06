export const INFORMATION_YEARS = ["2026", "2027", "2028"] as const;

export const INFORMATION_SECTIONS = [
  {
    title: "Vacas prenadas",
    key: "prenadas",
    slug: "vacas-prenadas",
    description: "Registra el total de vacas prenadas para el ano seleccionado.",
  },
  {
    title: "Vacas viejas",
    key: "vacasViejas",
    slug: "vacas-viejas",
    description: "Registra el total de vacas viejas para el ano seleccionado.",
  },
  {
    title: "Nacimientos",
    key: "nacimientos",
    slug: "nacimientos",
    description: "Registra el total de nacimientos para el ano seleccionado.",
  },
] as const;

export const ANIMAL_TYPES = [
  { key: "vaca", label: "Vaca" },
  { key: "ternero", label: "Ternero" },
  { key: "toro", label: "Toro" },
] as const;

export type InformationYear = (typeof INFORMATION_YEARS)[number];
export type InformationSectionKey = (typeof INFORMATION_SECTIONS)[number]["key"];
export type AnimalTypeKey = (typeof ANIMAL_TYPES)[number]["key"];

export function getInformationSectionBySlug(slug: string) {
  return INFORMATION_SECTIONS.find((section) => section.slug === slug);
}

export function getInformationSectionByKey(key: InformationSectionKey) {
  return INFORMATION_SECTIONS.find((section) => section.key === key);
}
