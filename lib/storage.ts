import { promises as fs } from "fs";
import path from "path";

const STORAGE_ROOT = path.join(process.cwd(), "storage");
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

export type StoredImage = {
  fileName: string;
  url: string;
};

export function getStorageRoot() {
  return STORAGE_ROOT;
}

export function resolveStoragePath(parts: string[]) {
  const safeParts = parts.filter(Boolean);
  const resolvedPath = path.resolve(STORAGE_ROOT, ...safeParts);

  if (!resolvedPath.startsWith(STORAGE_ROOT)) {
    throw new Error("Ruta de storage invalida.");
  }

  return resolvedPath;
}

export async function getStoredImages(folder: string): Promise<StoredImage[]> {
  const directoryPath = resolveStoragePath([folder]);

  try {
    const entries = await fs.readdir(directoryPath, { withFileTypes: true });

    return entries
      .filter((entry) => entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name, "es"))
      .map((entry) => ({
        fileName: entry.name,
        url: `/api/storage/${folder}/${encodeURIComponent(entry.name)}`,
      }));
  } catch {
    return [];
  }
}
