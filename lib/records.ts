import {
  Prisma,
  type Establishment as DbEstablishment,
  type VaccinationRecord as DbRecord,
} from "@prisma/client";

import { CATEGORIES, createDefaultValues } from "@/lib/categories";
import { getPrisma } from "@/lib/prisma";
import type {
  AnimalType,
  Establishment,
  InformationAnimal,
  InformationSectionKey,
  MovementType,
  RecordDetail,
  VaccinationRecord,
} from "@/lib/types";

function sanitizeDetail(detail: unknown): RecordDetail {
  const defaults = createDefaultValues();
  const source =
    detail && typeof detail === "object" && !Array.isArray(detail)
      ? (detail as Record<string, unknown>)
      : null;

  for (const category of CATEGORIES) {
    const raw = Number(source?.[category.key] ?? 0);
    defaults[category.key] = Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0;
  }

  return defaults;
}

function mapEstablishment(
  row: DbEstablishment,
  override?: { individualCount: number; detail: RecordDetail },
): Establishment {
  const useOverride = override !== undefined && override.individualCount > 0;
  return {
    id: row.id.toString(),
    name: row.name,
    herdTotal: useOverride ? override.individualCount : row.herdTotal,
    herdDetail: useOverride ? sanitizeDetail(override.detail) : sanitizeDetail(row.herdDetail),
    individualAnimalCount: override?.individualCount,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapRecord(row: DbRecord, establishmentName: string): VaccinationRecord {
  return {
    id: row.id.toString(),
    establishmentId: row.establishmentId?.toString() ?? "",
    establishmentName,
    total: row.total,
    detail: sanitizeDetail(row.detail),
    recordType: row.recordType as "snapshot" | "movement",
    movementType: row.movementType as MovementType | null,
    movementCategory: row.movementCategory,
    movementToCategory: row.movementToCategory,
    movementQuantity: row.movementQuantity,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function getDashboardData(): Promise<{
  establishments: Establishment[];
  records: VaccinationRecord[];
}> {
  const prisma = getPrisma();
  const [establishments, records, animalCounts] = await Promise.all([
    prisma.establishment.findMany({ orderBy: { name: "asc" } }),
    prisma.vaccinationRecord.findMany({
      include: { establishment: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.animal.groupBy({
      by: ["establishmentId", "categoryKey"],
      where: { isSold: false },
      _count: { _all: true },
    }),
  ]);

  const animalCountsByEstablishment = new Map<string, RecordDetail>();
  const animalTotalsByEstablishment = new Map<string, number>();

  for (const row of animalCounts) {
    const estId = row.establishmentId.toString();
    const current = animalCountsByEstablishment.get(estId) ?? createDefaultValues();
    current[row.categoryKey] = row._count._all;
    animalCountsByEstablishment.set(estId, current);
    animalTotalsByEstablishment.set(
      estId,
      (animalTotalsByEstablishment.get(estId) ?? 0) + row._count._all,
    );
  }

  return {
    establishments: establishments.map((row) =>
      mapEstablishment(row, {
        individualCount: animalTotalsByEstablishment.get(row.id.toString()) ?? 0,
        detail: animalCountsByEstablishment.get(row.id.toString()) ?? createDefaultValues(),
      }),
    ),
    records: records.map((row) => mapRecord(row, row.establishment?.name ?? "")),
  };
}

export async function getInformationAnimals(): Promise<InformationAnimal[]> {
  const prisma = getPrisma();
  const rows = await prisma.informationAnimal.findMany({
    include: { animal: { select: { identifier: true } } },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((row) => ({
    id: row.id.toString(),
    establishmentId: row.establishmentId.toString(),
    animalId: row.animalId?.toString() ?? null,
    animalIdentifier: row.animal?.identifier ?? null,
    sectionKey: row.sectionKey as InformationSectionKey,
    year: String(row.year),
    animalType: row.animalType as AnimalType,
    description: row.description,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function createEstablishment(name: string): Promise<Establishment> {
  const prisma = getPrisma();
  const row = await prisma.establishment.create({
    data: { name, herdTotal: 0, herdDetail: {} },
  });
  return mapEstablishment(row);
}

export async function createVaccinationRecord(input: {
  establishmentId: string;
  total: number;
  detail: RecordDetail;
  herdDetail: RecordDetail;
}): Promise<{ establishment: Establishment; record: VaccinationRecord }> {
  const prisma = getPrisma();

  return prisma.$transaction(async (tx) => {
    let establishment: DbEstablishment;
    try {
      establishment = await tx.establishment.update({
        where: { id: BigInt(input.establishmentId) },
        data: {
          herdTotal: input.total,
          herdDetail: input.herdDetail as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        throw new Error("Establecimiento no encontrado.");
      }
      throw error;
    }

    const record = await tx.vaccinationRecord.create({
      data: {
        location: establishment.name,
        establishmentId: establishment.id,
        total: input.total,
        detail: input.detail as Prisma.InputJsonValue,
      },
    });

    return {
      establishment: mapEstablishment(establishment),
      record: mapRecord(record, establishment.name),
    };
  });
}

export async function createMovementRecord(input: {
  establishmentId: string;
  movementType: MovementType;
  movementCategory: string;
  movementToCategory?: string;
  movementQuantity: number;
  herdDetail: RecordDetail;
  total: number;
  skipEstablishmentUpdate?: boolean;
  extraDetail?: Record<string, unknown>;
}): Promise<{ establishment: Establishment; record: VaccinationRecord }> {
  const prisma = getPrisma();

  return prisma.$transaction(async (tx) => {
    let establishment: DbEstablishment | null;

    if (input.skipEstablishmentUpdate) {
      establishment = await tx.establishment.findUnique({
        where: { id: BigInt(input.establishmentId) },
      });
    } else {
      try {
        establishment = await tx.establishment.update({
          where: { id: BigInt(input.establishmentId) },
          data: {
            herdTotal: input.total,
            herdDetail: input.herdDetail as Prisma.InputJsonValue,
          },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
          throw new Error("Establecimiento no encontrado.");
        }
        throw error;
      }
    }

    if (!establishment) {
      throw new Error("Establecimiento no encontrado.");
    }

    const detail: Record<string, unknown> = {
      [input.movementCategory]: input.movementQuantity,
      ...input.extraDetail,
    };

    const record = await tx.vaccinationRecord.create({
      data: {
        location: establishment.name,
        establishmentId: establishment.id,
        total: input.total,
        detail: detail as Prisma.InputJsonValue,
        recordType: "movement",
        movementType: input.movementType,
        movementCategory: input.movementCategory,
        movementToCategory: input.movementToCategory ?? null,
        movementQuantity: input.movementQuantity,
      },
    });

    return {
      establishment: mapEstablishment(establishment),
      record: mapRecord(record, establishment.name),
    };
  });
}

export async function createInformationAnimal(input: {
  establishmentId: string;
  animalId?: string;
  sectionKey: InformationSectionKey;
  year: string;
  animalType: AnimalType;
  description: string;
}): Promise<InformationAnimal> {
  const prisma = getPrisma();
  const row = await prisma.informationAnimal.create({
    data: {
      establishmentId: BigInt(input.establishmentId),
      animalId: input.animalId ? BigInt(input.animalId) : null,
      sectionKey: input.sectionKey,
      year: Number(input.year),
      animalType: input.animalType,
      description: input.description,
    },
  });
  return {
    id: row.id.toString(),
    establishmentId: row.establishmentId.toString(),
    animalId: row.animalId?.toString() ?? null,
    animalIdentifier: null,
    sectionKey: row.sectionKey as InformationSectionKey,
    year: String(row.year),
    animalType: row.animalType as AnimalType,
    description: row.description,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function deleteInformationAnimal(input: {
  id: string;
  establishmentId: string;
}): Promise<boolean> {
  const prisma = getPrisma();
  const result = await prisma.informationAnimal.deleteMany({
    where: {
      id: BigInt(input.id),
      establishmentId: BigInt(input.establishmentId),
    },
  });
  return result.count > 0;
}
