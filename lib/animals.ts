import { promises as fs } from "fs";
import path from "path";

import {
  Prisma,
  type AnimalImage as DbAnimalImage,
  type Animal as DbAnimal,
} from "@prisma/client";

import { getPrisma } from "@/lib/prisma";
import type { Animal, AnimalImage, HerdCategoryKey } from "@/lib/types";

function mapImageRow(row: DbAnimalImage): AnimalImage {
  return {
    id: row.id.toString(),
    animalId: row.animalId.toString(),
    fileName: row.fileName,
    filePath: row.filePath,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapAnimalRow(row: DbAnimal, images: AnimalImage[]): Animal {
  return {
    id: row.id.toString(),
    establishmentId: row.establishmentId.toString(),
    categoryKey: row.categoryKey as HerdCategoryKey,
    identifier: row.identifier,
    description: row.description,
    ageMonths: row.ageMonths,
    status: row.status,
    observations: row.observations,
    isSold: row.isSold,
    profileImageId: row.profileImageId?.toString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    images,
  };
}

function sanitizeFileName(fileName: string) {
  return fileName
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function isNotFound(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}

export async function getAnimals(includeSold = false): Promise<Animal[]> {
  const prisma = getPrisma();
  const [animals, images] = await Promise.all([
    prisma.animal.findMany({
      where: includeSold ? undefined : { isSold: false },
      orderBy: { createdAt: "desc" },
    }),
    prisma.animalImage.findMany({
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const imagesByAnimalId = new Map<string, AnimalImage[]>();
  for (const row of images) {
    const image = mapImageRow(row);
    const current = imagesByAnimalId.get(image.animalId) ?? [];
    current.push(image);
    imagesByAnimalId.set(image.animalId, current);
  }

  return animals.map((row) => mapAnimalRow(row, imagesByAnimalId.get(row.id.toString()) ?? []));
}

export async function getAnimalById(id: string): Promise<Animal | null> {
  const animals = await getAnimals();
  return animals.find((animal) => animal.id === id) ?? null;
}

export async function establishmentHasAnimals(establishmentId: string): Promise<boolean> {
  const prisma = getPrisma();
  const count = await prisma.animal.count({
    where: { establishmentId: BigInt(establishmentId) },
  });
  return count > 0;
}

export async function createAnimal(input: {
  establishmentId: string;
  categoryKey: HerdCategoryKey;
  identifier: string;
  description: string;
  ageMonths: number | null;
  status: string;
  observations: string;
}): Promise<Animal> {
  const prisma = getPrisma();
  const row = await prisma.animal.create({
    data: {
      establishmentId: BigInt(input.establishmentId),
      categoryKey: input.categoryKey,
      identifier: input.identifier,
      description: input.description,
      ageMonths: input.ageMonths,
      status: input.status,
      observations: input.observations,
    },
  });
  return mapAnimalRow(row, []);
}

export async function updateAnimal(input: {
  id: string;
  establishmentId: string;
  categoryKey: HerdCategoryKey;
  description: string;
  ageMonths: number | null;
  status: string;
  observations: string;
}): Promise<Animal | null> {
  const prisma = getPrisma();
  return prisma.$transaction(async (tx) => {
    const result = await tx.animal.updateMany({
      where: {
        id: BigInt(input.id),
        establishmentId: BigInt(input.establishmentId),
        categoryKey: input.categoryKey,
      },
      data: {
        description: input.description,
        ageMonths: input.ageMonths,
        status: input.status,
        observations: input.observations,
      },
    });
    if (result.count === 0) return null;

    const row = await tx.animal.findUnique({ where: { id: BigInt(input.id) } });
    return row ? mapAnimalRow(row, []) : null;
  });
}

export async function setAnimalProfileImage(input: {
  animalId: string;
  imageId: string | null;
}): Promise<Animal | null> {
  const prisma = getPrisma();
  return prisma.$transaction(async (tx) => {
    if (input.imageId) {
      const image = await tx.animalImage.findFirst({
        where: {
          id: BigInt(input.imageId),
          animalId: BigInt(input.animalId),
        },
      });
      if (!image) return null;
    }

    try {
      const row = await tx.animal.update({
        where: { id: BigInt(input.animalId) },
        data: { profileImageId: input.imageId ? BigInt(input.imageId) : null },
      });
      return mapAnimalRow(row, []);
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  });
}

export async function deleteAnimal(input: {
  id: string;
  establishmentId: string;
  categoryKey: HerdCategoryKey;
}): Promise<boolean> {
  const prisma = getPrisma();
  const result = await prisma.animal.deleteMany({
    where: {
      id: BigInt(input.id),
      establishmentId: BigInt(input.establishmentId),
      categoryKey: input.categoryKey,
    },
  });

  const animalDir = path.join(process.cwd(), "storage", "animals", input.id);
  await fs.rm(animalDir, { recursive: true, force: true });

  return result.count > 0;
}

export async function markAnimalAsSold(id: string): Promise<boolean> {
  const prisma = getPrisma();
  try {
    await prisma.animal.update({
      where: { id: BigInt(id) },
      data: { isSold: true },
    });
    return true;
  } catch (error) {
    if (isNotFound(error)) return false;
    throw error;
  }
}

export async function createAnimalImage(input: {
  animalId: string;
  fileName: string;
  filePath: string;
}): Promise<AnimalImage> {
  const prisma = getPrisma();
  const row = await prisma.animalImage.create({
    data: {
      animalId: BigInt(input.animalId),
      fileName: input.fileName,
      filePath: input.filePath,
    },
  });
  return mapImageRow(row);
}

export async function deleteAnimalImage(input: {
  id: string;
  animalId: string;
}): Promise<{ deleted: boolean; filePath: string | null }> {
  const prisma = getPrisma();

  const deleted = await prisma.$transaction(async (tx) => {
    const row = await tx.animalImage.findFirst({
      where: {
        id: BigInt(input.id),
        animalId: BigInt(input.animalId),
      },
    });
    if (!row) return null;
    await tx.animalImage.delete({ where: { id: row.id } });
    return row;
  });

  if (!deleted) {
    return { deleted: false, filePath: null };
  }

  const fileOnDisk = path.join(process.cwd(), "storage", "animals", input.animalId, deleted.fileName);
  await fs.rm(fileOnDisk, { force: true });

  return { deleted: true, filePath: deleted.filePath };
}

export async function saveAnimalImageFile(input: {
  animalId: string;
  file: File;
}): Promise<{ fileName: string; filePath: string }> {
  const originalName = input.file.name || "imagen";
  const extension = path.extname(originalName) || ".jpg";
  const baseName = path.basename(originalName, extension);
  const safeName = sanitizeFileName(baseName) || "imagen";
  const finalFileName = `${Date.now()}-${safeName}${extension.toLowerCase()}`;
  const animalDir = path.join(process.cwd(), "storage", "animals", input.animalId);
  const fullPath = path.join(animalDir, finalFileName);
  const buffer = Buffer.from(await input.file.arrayBuffer());

  await fs.mkdir(animalDir, { recursive: true });
  await fs.writeFile(fullPath, buffer);

  return {
    fileName: finalFileName,
    filePath: `/api/storage/animals/${input.animalId}/${encodeURIComponent(finalFileName)}`,
  };
}
