import { promises as fs } from "fs";
import path from "path";

const STORAGE_ROOT = path.join(process.cwd(), "storage");
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".webm", ".m4v", ".avi", ".mkv"]);

export type StoredImage = {
  fileName: string;
  url: string;
};

export type StoredVideo = {
  fileName: string;
  filePath: string;
  sizeBytes: number;
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

function sanitizeStorageName(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

export async function saveCountingVideoFile(input: {
  establishmentId: string;
  file: File;
}): Promise<StoredVideo> {
  const safeId = sanitizeStorageName(input.establishmentId);
  if (!safeId) {
    throw new Error("Establecimiento invalido para guardar el video.");
  }

  const originalName = input.file.name || "video";
  const extension = path.extname(originalName).toLowerCase() || ".mp4";
  if (!VIDEO_EXTENSIONS.has(extension)) {
    throw new Error("Formato de video no soportado.");
  }

  const baseName = path.basename(originalName, extension);
  const safeBase = sanitizeStorageName(baseName) || "video";
  const finalFileName = `${Date.now()}-${safeBase}${extension}`;
  const directoryPath = resolveStoragePath(["conteos", safeId]);
  const fullPath = path.join(directoryPath, finalFileName);
  const buffer = Buffer.from(await input.file.arrayBuffer());

  await fs.mkdir(directoryPath, { recursive: true });
  await fs.writeFile(fullPath, buffer);

  const stats = await fs.stat(fullPath);

  return {
    fileName: finalFileName,
    filePath: `/api/storage/conteos/${safeId}/${encodeURIComponent(finalFileName)}`,
    sizeBytes: stats.size,
  };
}
