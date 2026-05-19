import { promises as fs } from "fs";
import path from "path";

import { Prisma, type CountingSession as DbCountingSession } from "@prisma/client";

import { getPrisma } from "@/lib/prisma";
import type { CountingSession } from "@/lib/types";

function mapRow(row: DbCountingSession): CountingSession {
  return {
    id: row.id.toString(),
    establishmentId: row.establishmentId.toString(),
    fileName: row.fileName,
    filePath: row.filePath,
    fileSizeBytes: Number(row.fileSizeBytes),
    manualCount: row.manualCount,
    autoCount: row.autoCount,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function isNotFound(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}

export async function getCountingSessions(establishmentId?: string): Promise<CountingSession[]> {
  const prisma = getPrisma();
  const rows = await prisma.countingSession.findMany({
    where: establishmentId ? { establishmentId: BigInt(establishmentId) } : undefined,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(mapRow);
}

export async function createCountingSession(input: {
  establishmentId: string;
  fileName: string;
  filePath: string;
  fileSizeBytes: number;
}): Promise<CountingSession> {
  const prisma = getPrisma();
  const row = await prisma.countingSession.create({
    data: {
      establishmentId: BigInt(input.establishmentId),
      fileName: input.fileName,
      filePath: input.filePath,
      fileSizeBytes: BigInt(input.fileSizeBytes),
    },
  });
  return mapRow(row);
}

export async function updateCountingSession(input: {
  id: string;
  manualCount?: number | null;
  autoCount?: number | null;
  notes?: string;
}): Promise<CountingSession | null> {
  const prisma = getPrisma();

  const data: Prisma.CountingSessionUpdateInput = {};
  if (input.manualCount !== undefined) data.manualCount = input.manualCount;
  if (input.autoCount !== undefined) data.autoCount = input.autoCount;
  if (input.notes !== undefined) data.notes = input.notes;

  try {
    const row = await prisma.countingSession.update({
      where: { id: BigInt(input.id) },
      data,
    });
    return mapRow(row);
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

export async function deleteCountingSession(id: string): Promise<{ deleted: boolean; filePath: string | null }> {
  const prisma = getPrisma();

  try {
    const row = await prisma.countingSession.delete({
      where: { id: BigInt(id) },
      select: { filePath: true, establishmentId: true, fileName: true },
    });

    const fileOnDisk = path.join(
      process.cwd(),
      "storage",
      "conteos",
      row.establishmentId.toString(),
      row.fileName,
    );
    await fs.rm(fileOnDisk, { force: true });

    return { deleted: true, filePath: row.filePath };
  } catch (error) {
    if (isNotFound(error)) return { deleted: false, filePath: null };
    throw error;
  }
}
