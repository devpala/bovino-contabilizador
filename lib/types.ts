export type RecordDetail = Record<string, number>;
export type RecordType = "snapshot" | "movement";
export type MovementType = "venta" | "muerte" | "nacimiento" | "compra" | "conversion";
export type InformationSectionKey = "prenadas" | "vacasViejas" | "nacimientos";
export type AnimalType = "vaca" | "ternero" | "toro";
export type HerdCategoryKey =
  | "vacas"
  | "toros"
  | "novillitos"
  | "vaquillonas"
  | "terneras"
  | "terneros";

export type Establishment = {
  id: string;
  name: string;
  herdDetail: RecordDetail;
  herdTotal: number;
  individualAnimalCount?: number;
  createdAt: string;
};

export type VaccinationRecord = {
  id: string;
  establishmentId: string;
  establishmentName: string;
  total: number;
  detail: RecordDetail;
  recordType: RecordType;
  movementType?: MovementType | null;
  movementCategory?: string | null;
  movementToCategory?: string | null;
  movementQuantity?: number | null;
  createdAt: string;
};

export type InformationAnimal = {
  id: string;
  establishmentId: string;
  animalId?: string | null;
  animalIdentifier?: string | null;
  sectionKey: InformationSectionKey;
  year: string;
  animalType: AnimalType;
  description: string;
  createdAt: string;
};

export type AnimalImage = {
  id: string;
  animalId: string;
  fileName: string;
  filePath: string;
  createdAt: string;
};

export type Animal = {
  id: string;
  establishmentId: string;
  categoryKey: HerdCategoryKey;
  identifier: string;
  description: string;
  ageMonths: number | null;
  status: string;
  observations: string;
  createdAt: string;
  updatedAt: string;
  images: AnimalImage[];
};
