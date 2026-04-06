import { promises as fs } from "fs";
import path from "path";

import { getPool } from "@/lib/db";
import type { Animal, AnimalImage, HerdCategoryKey } from "@/lib/types";

type DbAnimalRow = {
  id: string;
  establishment_id: string;
  category_key: HerdCategoryKey;
  identifier: string;
  description: string;
  age_months: number | null;
  status: string;
  observations: string;
  created_at: Date;
  updated_at: Date;
};

type DbAnimalImageRow = {
  id: string;
  animal_id: string;
  file_name: string;
  file_path: string;
  created_at: Date;
};

function mapImageRow(row: DbAnimalImageRow): AnimalImage {
  return {
    id: row.id,
    animalId: row.animal_id,
    fileName: row.file_name,
    filePath: row.file_path,
    createdAt: row.created_at.toISOString(),
  };
}

function mapAnimalRow(row: DbAnimalRow, images: AnimalImage[]): Animal {
  return {
    id: row.id,
    establishmentId: row.establishment_id,
    categoryKey: row.category_key,
    identifier: row.identifier,
    description: row.description,
    ageMonths: row.age_months,
    status: row.status,
    observations: row.observations,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
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

export async function getAnimals(): Promise<Animal[]> {
  const pool = getPool();
  const [animalsResult, imagesResult] = await Promise.all([
    pool.query<DbAnimalRow>(
      `
        select
          id::text,
          establishment_id::text,
          category_key,
          identifier,
          description,
          age_months,
          status,
          observations,
          created_at,
          updated_at
        from animals
        order by created_at desc
      `,
    ),
    pool.query<DbAnimalImageRow>(
      `
        select
          id::text,
          animal_id::text,
          file_name,
          file_path,
          created_at
        from animal_images
        order by created_at desc
      `,
    ),
  ]);

  const imagesByAnimalId = new Map<string, AnimalImage[]>();

  for (const row of imagesResult.rows) {
    const image = mapImageRow(row);
    const current = imagesByAnimalId.get(image.animalId) ?? [];
    current.push(image);
    imagesByAnimalId.set(image.animalId, current);
  }

  return animalsResult.rows.map((row) => mapAnimalRow(row, imagesByAnimalId.get(row.id) ?? []));
}

export async function getAnimalById(id: string): Promise<Animal | null> {
  const animals = await getAnimals();
  return animals.find((animal) => animal.id === id) ?? null;
}

export async function establishmentHasAnimals(establishmentId: string): Promise<boolean> {
  const pool = getPool();
  const result = await pool.query<{ animal_count: number }>(
    `
      select count(*)::int as animal_count
      from animals
      where establishment_id = $1::bigint
    `,
    [establishmentId],
  );

  return (result.rows[0]?.animal_count ?? 0) > 0;
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
  const pool = getPool();
  const result = await pool.query<DbAnimalRow>(
    `
      insert into animals (
        establishment_id,
        category_key,
        identifier,
        description,
        age_months,
        status,
        observations
      )
      values ($1::bigint, $2, $3, $4, $5, $6, $7)
      returning
        id::text,
        establishment_id::text,
        category_key,
        identifier,
        description,
        age_months,
        status,
        observations,
        created_at,
        updated_at
    `,
    [
      input.establishmentId,
      input.categoryKey,
      input.identifier,
      input.description,
      input.ageMonths,
      input.status,
      input.observations,
    ],
  );

  return mapAnimalRow(result.rows[0], []);
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
  const pool = getPool();
  const result = await pool.query<DbAnimalRow>(
    `
      update animals
      set
        description = $3,
        age_months = $4,
        status = $5,
        observations = $6,
        updated_at = now()
      where id = $1::bigint
        and establishment_id = $2::bigint
        and category_key = $7
      returning
        id::text,
        establishment_id::text,
        category_key,
        identifier,
        description,
        age_months,
        status,
        observations,
        created_at,
        updated_at
    `,
    [
      input.id,
      input.establishmentId,
      input.description,
      input.ageMonths,
      input.status,
      input.observations,
      input.categoryKey,
    ],
  );

  const row = result.rows[0];
  return row ? mapAnimalRow(row, []) : null;
}

export async function deleteAnimal(input: {
  id: string;
  establishmentId: string;
  categoryKey: HerdCategoryKey;
}): Promise<boolean> {
  const pool = getPool();
  const result = await pool.query(
    `
      delete from animals
      where id = $1::bigint
        and establishment_id = $2::bigint
        and category_key = $3
    `,
    [input.id, input.establishmentId, input.categoryKey],
  );

  const animalDir = path.join(process.cwd(), "storage", "animals", input.id);
  await fs.rm(animalDir, { recursive: true, force: true });

  return (result.rowCount ?? 0) > 0;
}

export async function createAnimalImage(input: {
  animalId: string;
  fileName: string;
  filePath: string;
}): Promise<AnimalImage> {
  const pool = getPool();
  const result = await pool.query<DbAnimalImageRow>(
    `
      insert into animal_images (
        animal_id,
        file_name,
        file_path
      )
      values ($1::bigint, $2, $3)
      returning
        id::text,
        animal_id::text,
        file_name,
        file_path,
        created_at
    `,
    [input.animalId, input.fileName, input.filePath],
  );

  return mapImageRow(result.rows[0]);
}

export async function deleteAnimalImage(input: {
  id: string;
  animalId: string;
}): Promise<{ deleted: boolean; filePath: string | null }> {
  const pool = getPool();
  const result = await pool.query<DbAnimalImageRow>(
    `
      delete from animal_images
      where id = $1::bigint
        and animal_id = $2::bigint
      returning
        id::text,
        animal_id::text,
        file_name,
        file_path,
        created_at
    `,
    [input.id, input.animalId],
  );

  const row = result.rows[0];

  if (!row) {
    return { deleted: false, filePath: null };
  }

  const fileOnDisk = path.join(process.cwd(), "storage", "animals", input.animalId, row.file_name);
  await fs.rm(fileOnDisk, { force: true });

  return {
    deleted: true,
    filePath: row.file_path,
  };
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
