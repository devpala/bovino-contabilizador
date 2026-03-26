import { getPool } from "@/lib/db";
import { CATEGORIES, createDefaultValues } from "@/lib/categories";
import type {
  Establishment,
  MovementType,
  RecordDetail,
  VaccinationRecord,
} from "@/lib/types";

type DbRecordRow = {
  id: string;
  establishment_id: string;
  establishment_name: string;
  total: number;
  detail: RecordDetail;
  record_type: "snapshot" | "movement";
  movement_type: MovementType | null;
  movement_category: string | null;
  movement_to_category: string | null;
  movement_quantity: number | null;
  created_at: Date;
};

type DbEstablishmentRow = {
  id: string;
  name: string;
  herd_total: number;
  herd_detail: RecordDetail;
  created_at: Date;
};

function sanitizeDetail(detail: RecordDetail | null | undefined) {
  const defaults = createDefaultValues();

  for (const category of CATEGORIES) {
    const raw = Number(detail?.[category.key] ?? 0);
    defaults[category.key] = Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0;
  }

  return defaults;
}

export async function getDashboardData(): Promise<{
  establishments: Establishment[];
  records: VaccinationRecord[];
}> {
  const pool = getPool();
  const [establishmentsResult, recordsResult] = await Promise.all([
    pool.query<DbEstablishmentRow>(
      `
        select id::text, name, herd_total, herd_detail, created_at
        from establishments
        order by name asc
      `,
    ),
    pool.query<DbRecordRow>(
      `
        select
          vr.id::text,
          vr.establishment_id::text,
          e.name as establishment_name,
          vr.total,
          vr.detail,
          vr.record_type,
          vr.movement_type,
          vr.movement_category,
          vr.movement_to_category,
          vr.movement_quantity,
          vr.created_at
        from vaccination_records vr
        join establishments e on e.id = vr.establishment_id
        order by vr.created_at desc
        limit 200
      `,
    ),
  ]);

  const establishments = establishmentsResult.rows.map((row) => ({
    id: row.id,
    name: row.name,
    herdTotal: row.herd_total,
    herdDetail: sanitizeDetail(row.herd_detail),
    createdAt: row.created_at.toISOString(),
  }));

  const records = recordsResult.rows.map((row) => ({
    id: row.id,
    establishmentId: row.establishment_id,
    establishmentName: row.establishment_name,
    total: row.total,
    detail: row.detail,
    recordType: row.record_type,
    movementType: row.movement_type,
    movementCategory: row.movement_category,
    movementToCategory: row.movement_to_category,
    movementQuantity: row.movement_quantity,
    createdAt: row.created_at.toISOString(),
  }));

  return { establishments, records };
}

export async function createEstablishment(name: string): Promise<Establishment> {
  const pool = getPool();
  const result = await pool.query<DbEstablishmentRow>(
    `
      insert into establishments (name, herd_total, herd_detail)
      values ($1, 0, '{}'::jsonb)
      returning id::text, name, herd_total, herd_detail, created_at
    `,
    [name],
  );

  const row = result.rows[0];

  return {
    id: row.id,
    name: row.name,
    herdTotal: row.herd_total,
    herdDetail: sanitizeDetail(row.herd_detail),
    createdAt: row.created_at.toISOString(),
  };
}

export async function createVaccinationRecord(input: {
  establishmentId: string;
  total: number;
  detail: RecordDetail;
  herdDetail: RecordDetail;
}): Promise<{ establishment: Establishment; record: VaccinationRecord }> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("begin");

    const updateResult = await client.query<DbEstablishmentRow>(
      `
        update establishments
        set herd_total = $2, herd_detail = $3::jsonb
        where id = $1::bigint
        returning id::text, name, herd_total, herd_detail, created_at
      `,
      [input.establishmentId, input.total, JSON.stringify(input.herdDetail)],
    );

    const establishmentRow = updateResult.rows[0];

    if (!establishmentRow) {
      throw new Error("Establecimiento no encontrado.");
    }

    const insertResult = await client.query<DbRecordRow>(
      `
        insert into vaccination_records (location, establishment_id, total, detail)
        values ($1, $2::bigint, $3, $4::jsonb)
        returning
          id::text,
          establishment_id::text,
          $1 as establishment_name,
          total,
          detail,
          record_type,
          movement_type,
          movement_category,
          movement_to_category,
          movement_quantity,
          created_at
      `,
      [
        establishmentRow.name,
        input.establishmentId,
        input.total,
        JSON.stringify(input.detail),
      ],
    );

    await client.query("commit");

    const recordRow = insertResult.rows[0];

    return {
      establishment: {
        id: establishmentRow.id,
        name: establishmentRow.name,
        herdTotal: establishmentRow.herd_total,
        herdDetail: sanitizeDetail(establishmentRow.herd_detail),
        createdAt: establishmentRow.created_at.toISOString(),
      },
      record: {
        id: recordRow.id,
        establishmentId: recordRow.establishment_id,
        establishmentName: recordRow.establishment_name,
        total: recordRow.total,
        detail: recordRow.detail,
        recordType: recordRow.record_type,
        movementType: recordRow.movement_type,
        movementCategory: recordRow.movement_category,
        movementToCategory: recordRow.movement_to_category,
        movementQuantity: recordRow.movement_quantity,
        createdAt: recordRow.created_at.toISOString(),
      },
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function createMovementRecord(input: {
  establishmentId: string;
  movementType: MovementType;
  movementCategory: string;
  movementToCategory?: string;
  movementQuantity: number;
  herdDetail: RecordDetail;
  total: number;
}): Promise<{ establishment: Establishment; record: VaccinationRecord }> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("begin");

    const updateResult = await client.query<DbEstablishmentRow>(
      `
        update establishments
        set herd_total = $2, herd_detail = $3::jsonb
        where id = $1::bigint
        returning id::text, name, herd_total, herd_detail, created_at
      `,
      [input.establishmentId, input.total, JSON.stringify(input.herdDetail)],
    );

    const establishmentRow = updateResult.rows[0];

    if (!establishmentRow) {
      throw new Error("Establecimiento no encontrado.");
    }

    const detail = {
      [input.movementCategory]: input.movementQuantity,
    };

    const insertResult = await client.query<DbRecordRow>(
      `
        insert into vaccination_records (
          location,
          establishment_id,
          total,
          detail,
          record_type,
          movement_type,
          movement_category,
          movement_to_category,
          movement_quantity
        )
        values ($1, $2::bigint, $3, $4::jsonb, 'movement', $5, $6, $7, $8)
        returning
          id::text,
          establishment_id::text,
          $1 as establishment_name,
          total,
          detail,
          record_type,
          movement_type,
          movement_category,
          movement_to_category,
          movement_quantity,
          created_at
      `,
      [
        establishmentRow.name,
        input.establishmentId,
        input.total,
        JSON.stringify(detail),
        input.movementType,
        input.movementCategory,
        input.movementToCategory ?? null,
        input.movementQuantity,
      ],
    );

    await client.query("commit");

    const recordRow = insertResult.rows[0];

    return {
      establishment: {
        id: establishmentRow.id,
        name: establishmentRow.name,
        herdTotal: establishmentRow.herd_total,
        herdDetail: sanitizeDetail(establishmentRow.herd_detail),
        createdAt: establishmentRow.created_at.toISOString(),
      },
      record: {
        id: recordRow.id,
        establishmentId: recordRow.establishment_id,
        establishmentName: recordRow.establishment_name,
        total: recordRow.total,
        detail: recordRow.detail,
        recordType: recordRow.record_type,
        movementType: recordRow.movement_type,
        movementCategory: recordRow.movement_category,
        movementToCategory: recordRow.movement_to_category,
        movementQuantity: recordRow.movement_quantity,
        createdAt: recordRow.created_at.toISOString(),
      },
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
