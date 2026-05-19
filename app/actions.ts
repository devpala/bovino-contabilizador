"use server";

import { revalidatePath } from "next/cache";
import {
  createAnimal,
  createAnimalImage,
  deleteAnimal,
  deleteAnimalImage,
  establishmentHasAnimals,
  markAnimalAsSold,
  saveAnimalImageFile,
  setAnimalProfileImage,
  updateAnimal,
} from "@/lib/animals";
import { CATEGORIES, createDefaultValues } from "@/lib/categories";
import { saveCountingVideoFile } from "@/lib/storage";
import {
  createCountingSession,
  deleteCountingSession,
  updateCountingSession,
} from "@/lib/counting";
import { ANIMAL_TYPES, INFORMATION_SECTIONS, INFORMATION_YEARS } from "@/lib/information";
import {
  createInformationAnimal,
  createEstablishment,
  createMovementRecord,
  deleteInformationAnimal,
  createVaccinationRecord,
  getDashboardData,
} from "@/lib/records";
import type {
  Animal,
  AnimalImage,
  AnimalType,
  CountingSession,
  Establishment,
  InformationAnimal,
  InformationSectionKey,
  HerdCategoryKey,
  MovementType,
  VaccinationRecord,
} from "@/lib/types";

export type SaveState = {
  success: boolean;
  message: string;
  establishment?: Establishment;
  record?: VaccinationRecord;
};

export type InformationAnimalState = {
  success: boolean;
  message: string;
  item?: InformationAnimal;
  id?: string;
};

export type AnimalState = {
  success: boolean;
  message: string;
  animal?: Animal;
  image?: AnimalImage;
  images?: AnimalImage[];
};

export async function saveVaccinationRecord(formData: FormData): Promise<SaveState> {
  const establishmentId = String(formData.get("establishmentId") ?? "").trim();

  if (!establishmentId) {
    return {
      success: false,
      message: "Selecciona un establecimiento antes de guardar.",
    };
  }

  const herdDetail = createDefaultValues();

  for (const category of CATEGORIES) {
    const raw = Number(formData.get(category.key) ?? 0);
    const value = Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0;
    herdDetail[category.key] = value;
  }

  const filteredDetail = Object.fromEntries(
    Object.entries(herdDetail).filter(([, value]) => value > 0),
  );

  const total = Object.values(herdDetail).reduce((sum, value) => sum + value, 0);

  if (await establishmentHasAnimals(establishmentId)) {
    return {
      success: false,
      message:
        "Este establecimiento ya usa fichas individuales. Edita las cantidades desde Animales para mantener el conteo sincronizado.",
    };
  }

  try {
    const result = await createVaccinationRecord({
      establishmentId,
      total,
      detail: filteredDetail,
      herdDetail,
    });
    revalidatePath("/");

    return {
      success: true,
      message: `Registro guardado para ${result.establishment.name}: ${total} animales.`,
      establishment: result.establishment,
      record: result.record,
    };
  } catch (error) {
    console.error(error);
    return {
      success: false,
      message:
        "No se pudo guardar en PostgreSQL. Revisa DATABASE_URL y ejecuta db/schema.sql en tu base local.",
    };
  }
}

export async function createEstablishmentAction(formData: FormData): Promise<{
  success: boolean;
  message: string;
  establishment?: Establishment;
}> {
  const name = String(formData.get("name") ?? "").trim();

  if (!name) {
    return {
      success: false,
      message: "Ingresa un nombre para el establecimiento.",
    };
  }

  try {
    const establishment = await createEstablishment(name);
    revalidatePath("/");

    return {
      success: true,
      message: `Establecimiento creado: ${name}.`,
      establishment,
    };
  } catch (error) {
    console.error(error);
    return {
      success: false,
      message: "No se pudo crear el establecimiento. Verifica que el nombre no este repetido.",
    };
  }
}

export async function registerMovementAction(input: {
  establishmentId: string;
  movementType: MovementType;
  movementCategory: string;
  movementToCategory?: string;
  movementQuantity: number;
  herdDetail: Record<string, number>;
}): Promise<SaveState> {
  if (!input.establishmentId) {
    return {
      success: false,
      message: "Selecciona un establecimiento antes de registrar movimientos.",
    };
  }

  if (await establishmentHasAnimals(input.establishmentId)) {
    return {
      success: false,
      message:
        "Este establecimiento ya usa fichas individuales. Registra cambios desde las fichas para no desincronizar el rodeo.",
    };
  }

  try {
    const total = Object.values(input.herdDetail).reduce((sum, value) => sum + value, 0);
    const result = await createMovementRecord({
      establishmentId: input.establishmentId,
      movementType: input.movementType,
      movementCategory: input.movementCategory,
      movementToCategory: input.movementToCategory,
      movementQuantity: input.movementQuantity,
      herdDetail: input.herdDetail,
      total,
    });

    revalidatePath("/");

    return {
      success: true,
      message: `${input.movementType} registrada en ${result.establishment.name}.`,
      establishment: result.establishment,
      record: result.record,
    };
  } catch (error) {
    console.error(error);
    return {
      success: false,
      message: "No se pudo registrar el movimiento en PostgreSQL.",
    };
  }
}

export async function createInformationAnimalAction(input: {
  establishmentId: string;
  animalId?: string;
  sectionKey: string;
  year: string;
  animalType: string;
  description: string;
}): Promise<InformationAnimalState> {
  const establishmentId = input.establishmentId.trim();
  const description = input.description.trim();

  if (!establishmentId) {
    return {
      success: false,
      message: "Selecciona un establecimiento antes de guardar.",
    };
  }

  if (!INFORMATION_SECTIONS.some((section) => section.key === input.sectionKey)) {
    return {
      success: false,
      message: "La seccion seleccionada no es valida.",
    };
  }

  if (!INFORMATION_YEARS.includes(input.year as (typeof INFORMATION_YEARS)[number])) {
    return {
      success: false,
      message: "El ano seleccionado no es valido.",
    };
  }

  if (!ANIMAL_TYPES.some((animal) => animal.key === input.animalType)) {
    return {
      success: false,
      message: "El tipo de animal no es valido.",
    };
  }

  if (!description) {
    return {
      success: false,
      message: "Escribe una descripcion para el animal.",
    };
  }

  try {
    const item = await createInformationAnimal({
      establishmentId,
      animalId: input.animalId?.trim() || undefined,
      sectionKey: input.sectionKey as InformationSectionKey,
      year: input.year,
      animalType: input.animalType as AnimalType,
      description,
    });
    revalidatePath("/informacion");

    return {
      success: true,
      message: "Animal agregado.",
      item,
    };
  } catch (error) {
    console.error(error);
    return {
      success: false,
      message: "No se pudo guardar el animal en PostgreSQL.",
    };
  }
}

export async function markAnimalAsOldCowAction(input: {
  animalId: string;
  establishmentId: string;
  year: string;
  description?: string;
}): Promise<InformationAnimalState> {
  if (!input.animalId.trim() || !input.establishmentId.trim()) {
    return {
      success: false,
      message: "Faltan datos para marcar la vaca.",
    };
  }

  try {
    const item = await createInformationAnimal({
      establishmentId: input.establishmentId.trim(),
      animalId: input.animalId.trim(),
      sectionKey: "vacasViejas",
      year: input.year.trim(),
      animalType: "vaca",
      description: input.description?.trim() || "Marcada como vaca vieja.",
    });
    revalidatePath("/informacion/vacas-viejas");
    revalidatePath("/informacion");
    revalidatePath(`/animales/vacas/${input.animalId.trim()}`);

    return {
      success: true,
      message: "Vaca marcada como vieja.",
      item,
    };
  } catch (error) {
    console.error(error);
    return {
      success: false,
      message: "No se pudo marcar la vaca vieja. Es posible que ya este marcada para ese ano.",
    };
  }
}

export async function deleteInformationAnimalAction(input: {
  id: string;
  establishmentId: string;
}): Promise<InformationAnimalState> {
  if (!input.id.trim() || !input.establishmentId.trim()) {
    return {
      success: false,
      message: "Faltan datos para eliminar el registro.",
    };
  }

  try {
    const deleted = await deleteInformationAnimal({
      id: input.id.trim(),
      establishmentId: input.establishmentId.trim(),
    });
    revalidatePath("/informacion");

    return deleted
      ? {
          success: true,
          message: "Registro eliminado.",
          id: input.id.trim(),
        }
      : {
          success: false,
          message: "No se encontro el registro a eliminar.",
        };
  } catch (error) {
    console.error(error);
    return {
      success: false,
      message: "No se pudo eliminar el registro en PostgreSQL.",
    };
  }
}

export async function createAnimalAction(input: {
  establishmentId: string;
  categoryKey: string;
  description: string;
  ageMonths?: number | null;
  status: string;
  observations: string;
}): Promise<AnimalState> {
  const establishmentId = input.establishmentId.trim();

  if (!establishmentId) {
    return {
      success: false,
      message: "Selecciona un establecimiento antes de guardar.",
    };
  }

  if (!CATEGORIES.some((category) => category.key === input.categoryKey)) {
    return {
      success: false,
      message: "La categoria seleccionada no es valida.",
    };
  }

  try {
    const animal = await createAnimal({
      establishmentId,
      categoryKey: input.categoryKey as HerdCategoryKey,
      identifier: crypto.randomUUID(),
      description: input.description.trim(),
      ageMonths:
        input.ageMonths == null || Number.isNaN(Number(input.ageMonths))
          ? null
          : Math.max(0, Math.floor(Number(input.ageMonths))),
      status: input.status.trim(),
      observations: input.observations.trim(),
    });
    revalidatePath("/");
    revalidatePath(`/animales/${animal.categoryKey}`);

    return {
      success: true,
      message: "Animal creado.",
      animal,
    };
  } catch (error) {
    console.error(error);
    return {
      success: false,
      message: "No se pudo crear el animal.",
    };
  }
}

export type CountingSessionState = {
  success: boolean;
  message: string;
  sessions?: CountingSession[];
  session?: CountingSession;
};

export async function uploadCountingVideoAction(formData: FormData): Promise<CountingSessionState> {
  const establishmentId = String(formData.get("establishmentId") ?? "").trim();
  const rawFiles = formData.getAll("video");
  const files = rawFiles.filter((entry): entry is File => entry instanceof File && entry.size > 0);

  if (!establishmentId) {
    return { success: false, message: "Selecciona un establecimiento antes de subir el video." };
  }

  if (files.length === 0) {
    return { success: false, message: "Selecciona al menos un video valido." };
  }

  try {
    const saved: CountingSession[] = [];
    for (const file of files) {
      const stored = await saveCountingVideoFile({ establishmentId, file });
      const session = await createCountingSession({
        establishmentId,
        fileName: stored.fileName,
        filePath: stored.filePath,
        fileSizeBytes: stored.sizeBytes,
      });
      saved.push(session);
    }

    revalidatePath("/conteo");

    return {
      success: true,
      message: saved.length === 1 ? "Video subido." : `${saved.length} videos subidos.`,
      sessions: saved,
    };
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "No se pudo guardar el video.";
    return { success: false, message };
  }
}

export async function deleteCountingSessionAction(input: { id: string }): Promise<CountingSessionState> {
  if (!input.id) {
    return { success: false, message: "Falta el id de la sesion de conteo." };
  }

  try {
    const { deleted } = await deleteCountingSession(input.id);
    if (!deleted) {
      return { success: false, message: "No se encontro la sesion a borrar." };
    }
    revalidatePath("/conteo");
    return { success: true, message: "Video borrado." };
  } catch (error) {
    console.error(error);
    return { success: false, message: "No se pudo borrar el video." };
  }
}

export async function updateCountingSessionAction(input: {
  id: string;
  manualCount?: number | null;
  notes?: string;
}): Promise<CountingSessionState> {
  if (!input.id) {
    return { success: false, message: "Falta el id de la sesion de conteo." };
  }

  const manualCount =
    input.manualCount === undefined
      ? undefined
      : input.manualCount === null
        ? null
        : Math.max(0, Math.floor(Number(input.manualCount)));

  try {
    const session = await updateCountingSession({
      id: input.id,
      ...(manualCount !== undefined ? { manualCount } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    });

    if (!session) {
      return { success: false, message: "No se encontro la sesion a actualizar." };
    }

    return { success: true, message: "Guardado.", session };
  } catch (error) {
    console.error(error);
    return { success: false, message: "No se pudo guardar el conteo." };
  }
}

export async function uploadAnimalImageAction(formData: FormData): Promise<AnimalState> {
  const animalId = String(formData.get("animalId") ?? "").trim();
  const categoryKey = String(formData.get("categoryKey") ?? "").trim();
  const rawFiles = formData.getAll("image");
  const files = rawFiles.filter((entry): entry is File => entry instanceof File && entry.size > 0);

  if (!animalId) {
    return {
      success: false,
      message: "Falta el animal al que quieres asociar la imagen.",
    };
  }

  if (files.length === 0) {
    return {
      success: false,
      message: "Selecciona al menos una imagen valida.",
    };
  }

  try {
    const savedImages: AnimalImage[] = [];
    for (const file of files) {
      const stored = await saveAnimalImageFile({ animalId, file });
      const savedImage = await createAnimalImage({
        animalId,
        fileName: stored.fileName,
        filePath: stored.filePath,
      });
      savedImages.push(savedImage);
    }

    revalidatePath("/");
    if (categoryKey) {
      revalidatePath(`/animales/${categoryKey}`);
    }

    return {
      success: true,
      message:
        savedImages.length === 1
          ? "Imagen agregada."
          : `${savedImages.length} imagenes agregadas.`,
      image: savedImages[0],
      images: savedImages,
    };
  } catch (error) {
    console.error(error);
    return {
      success: false,
      message: "No se pudo guardar la imagen del animal.",
    };
  }
}

export async function setAnimalProfileImageAction(input: {
  animalId: string;
  imageId: string | null;
  categoryKey: string;
}): Promise<AnimalState> {
  const animalId = input.animalId.trim();

  if (!animalId) {
    return {
      success: false,
      message: "Falta el animal al que quieres marcar la foto de perfil.",
    };
  }

  try {
    const animal = await setAnimalProfileImage({
      animalId,
      imageId: input.imageId ? input.imageId.trim() : null,
    });

    if (!animal) {
      return {
        success: false,
        message: "No se pudo actualizar la foto de perfil.",
      };
    }

    revalidatePath("/");
    if (input.categoryKey.trim()) {
      revalidatePath(`/animales/${input.categoryKey.trim()}`);
    }

    return {
      success: true,
      message: input.imageId ? "Foto de perfil actualizada." : "Foto de perfil eliminada.",
      animal,
    };
  } catch (error) {
    console.error(error);
    return {
      success: false,
      message: "No se pudo actualizar la foto de perfil.",
    };
  }
}

export async function updateAnimalAction(input: {
  id: string;
  establishmentId: string;
  categoryKey: string;
  description: string;
  ageMonths?: number | null;
  status: string;
  observations: string;
}): Promise<AnimalState> {
  const id = input.id.trim();
  const establishmentId = input.establishmentId.trim();

  if (!id || !establishmentId) {
    return {
      success: false,
      message: "Faltan datos para actualizar el animal.",
    };
  }

  if (!CATEGORIES.some((category) => category.key === input.categoryKey)) {
    return {
      success: false,
      message: "La categoria seleccionada no es valida.",
    };
  }

  try {
    const animal = await updateAnimal({
      id,
      establishmentId,
      categoryKey: input.categoryKey as HerdCategoryKey,
      description: input.description.trim(),
      ageMonths:
        input.ageMonths == null || Number.isNaN(Number(input.ageMonths))
          ? null
          : Math.max(0, Math.floor(Number(input.ageMonths))),
      status: input.status.trim(),
      observations: input.observations.trim(),
    });

    if (!animal) {
      return {
        success: false,
        message: "No se encontro el animal a actualizar.",
      };
    }

    revalidatePath("/");
    revalidatePath(`/animales/${animal.categoryKey}`);

    return {
      success: true,
      message: "Animal actualizado.",
      animal,
    };
  } catch (error) {
    console.error(error);
    return {
      success: false,
      message: "No se pudo actualizar el animal.",
    };
  }
}

export async function deleteAnimalAction(input: {
  id: string;
  establishmentId: string;
  categoryKey: string;
}): Promise<AnimalState> {
  const id = input.id.trim();
  const establishmentId = input.establishmentId.trim();

  if (!id || !establishmentId) {
    return {
      success: false,
      message: "Faltan datos para eliminar el animal.",
    };
  }

  if (!CATEGORIES.some((category) => category.key === input.categoryKey)) {
    return {
      success: false,
      message: "La categoria seleccionada no es valida.",
    };
  }

  try {
    const deleted = await deleteAnimal({
      id,
      establishmentId,
      categoryKey: input.categoryKey as HerdCategoryKey,
    });

    revalidatePath("/");
    revalidatePath(`/animales/${input.categoryKey}`);

    return deleted
      ? {
          success: true,
          message: "Animal eliminado.",
          animal: {
            id,
            establishmentId,
            categoryKey: input.categoryKey as HerdCategoryKey,
            identifier: "",
            description: "",
            ageMonths: null,
            status: "",
            observations: "",
            createdAt: "",
            updatedAt: "",
            images: [],
          },
        }
      : {
          success: false,
          message: "No se encontro el animal a eliminar.",
        };
  } catch (error) {
    console.error(error);
    return {
      success: false,
      message: "No se pudo eliminar el animal.",
    };
  }
}

export async function sellAnimalAction(input: {
  id: string;
  establishmentId: string;
  categoryKey: string;
  weight?: number;
  price?: number;
}): Promise<AnimalState> {
  const id = input.id.trim();
  const establishmentId = input.establishmentId.trim();

  if (!id || !establishmentId) {
    return {
      success: false,
      message: "Faltan datos para registrar la venta.",
    };
  }

  try {
    const success = await markAnimalAsSold(id);

    if (!success) {
      return {
        success: false,
        message: "No se encontro el animal a vender.",
      };
    }

    // Obtenemos los datos actuales para el historial
    const { establishments } = await getDashboardData();
    const est = establishments.find((e) => e.id === establishmentId);

    if (est) {
      const weight = input.weight || 0;
      const price = input.price || 0;
      const shrinkage = 0.05; // 5% desbaste
      const finalWeight = weight * (1 - shrinkage);
      const totalPay = finalWeight * price;

      await createMovementRecord({
        establishmentId,
        movementType: "venta",
        movementCategory: input.categoryKey,
        movementQuantity: 1,
        herdDetail: est.herdDetail,
        total: est.herdTotal,
        skipEstablishmentUpdate: true,
        extraDetail: {
          animalId: id,
          weight_initial: weight > 0 ? weight : undefined,
          weight_final: weight > 0 ? finalWeight : undefined,
          price_per_kg: price > 0 ? price : undefined,
          total_payment: totalPay > 0 ? totalPay : undefined,
          shrinkage_applied: weight > 0 ? "5%" : undefined
        }
      });
    }

    revalidatePath("/");
    revalidatePath(`/animales/${input.categoryKey}`);

    return {
      success: true,
      message: "Venta registrada con exito.",
    };
  } catch (error) {
    console.error(error);
    return {
      success: false,
      message: "No se pudo registrar la venta del animal.",
    };
  }
}

export async function deleteAnimalImageAction(input: {
  id: string;
  animalId: string;
  categoryKey: string;
}): Promise<AnimalState> {
  const id = input.id.trim();
  const animalId = input.animalId.trim();

  if (!id || !animalId) {
    return {
      success: false,
      message: "Faltan datos para eliminar la imagen.",
    };
  }

  try {
    const result = await deleteAnimalImage({
      id,
      animalId,
    });

    if (!result.deleted) {
      return {
        success: false,
        message: "No se encontro la imagen a eliminar.",
      };
    }

    revalidatePath("/");
    if (input.categoryKey.trim()) {
      revalidatePath(`/animales/${input.categoryKey.trim()}`);
    }

    return {
      success: true,
      message: "Imagen eliminada.",
      image: {
        id,
        animalId,
        fileName: "",
        filePath: result.filePath ?? "",
        createdAt: "",
      },
    };
  } catch (error) {
    console.error(error);
    return {
      success: false,
      message: "No se pudo eliminar la imagen.",
    };
  }
}
