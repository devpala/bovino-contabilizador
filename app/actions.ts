"use server";

import { revalidatePath } from "next/cache";
import { CATEGORIES, createDefaultValues } from "@/lib/categories";
import {
  createEstablishment,
  createMovementRecord,
  createVaccinationRecord,
} from "@/lib/records";
import type { Establishment, MovementType, VaccinationRecord } from "@/lib/types";

export type SaveState = {
  success: boolean;
  message: string;
  establishment?: Establishment;
  record?: VaccinationRecord;
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
