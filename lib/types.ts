export type RecordDetail = Record<string, number>;
export type RecordType = "snapshot" | "movement";
export type MovementType = "venta" | "muerte" | "nacimiento" | "compra" | "conversion";

export type Establishment = {
  id: string;
  name: string;
  herdDetail: RecordDetail;
  herdTotal: number;
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
