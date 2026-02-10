// ============================================================
// Types Planning / Service Board
// ============================================================

export type Resource = "cuisine" | "preparation" | "comptoir" | "livraison";

export type ExternalLoadType = "dine_in" | "phone" | "incident" | "prep_batch" | "other";
export type LoadIntensity = "low" | "medium" | "high";
export type OrderSize = "S" | "M" | "L";

// ---------- Config (stored as JSON on Restaurant) ----------

export interface ResourceCapacity {
  cuisine: number;
  preparation: number;
  comptoir: number;
  livraison: number;
}

export interface TimeBand {
  label: string;
  startTime: string; // "HH:MM"
  endTime: string;
  capacity: ResourceCapacity;
}

export interface OrderSizeProfile {
  cuisineSlots: number;      // nb slots pour la cuisson
  cuisinePts: number;        // points cuisine par slot
  preparationPts: number;    // points préparation/emballage
  comptoirPts: number;       // points comptoir/remise
}

export interface PlanningConfig {
  enabled: boolean;
  slotMinutes: number;
  horizonSlots: number;
  timeBands: TimeBand[];
  sizeProfiles: Record<OrderSize, OrderSizeProfile>;
  bufferPickupMin: number;
  bufferDeliveryMin: number;
  maxShiftMin: number;
  defaultCapacity: ResourceCapacity;
  reservationSessionMin: number;  // durée d'une session de service (réservation)
}

export const DEFAULT_PLANNING_CONFIG: PlanningConfig = {
  enabled: true,
  slotMinutes: 5,
  horizonSlots: 48,
  timeBands: [
    {
      label: "Midi",
      startTime: "11:00",
      endTime: "14:30",
      capacity: { cuisine: 10, preparation: 5, comptoir: 5, livraison: 2 },
    },
    {
      label: "Soir",
      startTime: "18:00",
      endTime: "22:30",
      capacity: { cuisine: 10, preparation: 5, comptoir: 5, livraison: 2 },
    },
  ],
  sizeProfiles: {
    S: { cuisineSlots: 2, cuisinePts: 2, preparationPts: 1, comptoirPts: 1 },
    M: { cuisineSlots: 3, cuisinePts: 3, preparationPts: 2, comptoirPts: 1 },
    L: { cuisineSlots: 4, cuisinePts: 5, preparationPts: 2, comptoirPts: 2 },
  },
  bufferPickupMin: 5,
  bufferDeliveryMin: 10,
  maxShiftMin: 120,
  defaultCapacity: { cuisine: 8, preparation: 4, comptoir: 4, livraison: 2 },
  reservationSessionMin: 90,
};

export const RESOURCE_LABELS: Record<Resource, string> = {
  cuisine: "Cuisine",
  preparation: "Préparation",
  comptoir: "Comptoir",
  livraison: "Livraison",
};

export const INTENSITY_POINTS: Record<LoadIntensity, number> = {
  low: 2,
  medium: 4,
  high: 7,
};

export const EXTERNAL_LOAD_PRESETS: Record<ExternalLoadType, { label: string; resources: Resource[] }> = {
  dine_in: { label: "Sur place", resources: ["cuisine", "comptoir"] },
  phone: { label: "Téléphone", resources: ["comptoir"] },
  incident: { label: "Incident", resources: ["cuisine"] },
  prep_batch: { label: "Prep batch", resources: ["cuisine", "preparation"] },
  other: { label: "Autre", resources: [] },
};

// ---------- Timeline (computed, not persisted) ----------

export interface TimelineSlot {
  index: number;
  time: string; // ISO string
  capacity: ResourceCapacity;
  used: ResourceCapacity;
  remaining: ResourceCapacity;
}

export interface TimelineBlock {
  id: string;
  type: "order" | "external_load";
  label: string;
  startSlot: number;
  endSlot: number;
  resource: Resource;
  points: number;
  meta: Record<string, any>;
}

export interface TimelineSnapshot {
  anchorTime: string; // ISO
  slots: TimelineSlot[];
  blocks: TimelineBlock[];
  orders: TimelineOrderInfo[];
  externalLoads: TimelineExternalLoadInfo[];
}

export interface TimelineOrderInfo {
  id: string;
  orderNumber: number | null;
  customerName: string | null;
  customerPhone: string;
  orderType: string;
  orderSize: OrderSize | null;
  status: string;
  total: number;
  itemCount: number;
  cookStartAt: string | null;
  handoffAt: string | null;
  estimatedReadyAt: string | null;
  deliveryAddress: string | null;
  createdAt: string;
}

export interface TimelineExternalLoadInfo {
  id: string;
  type: ExternalLoadType;
  resources: Resource[];
  intensity: LoadIntensity;
  pointsPerSlot: number;
  startTime: string;
  endTime: string;
  durationMin: number;
  label: string | null;
}

export interface AvailableSlot {
  time: string; // ISO
  feasible: boolean;
}

// ---------- Helper: classify order size ----------

export function classifyOrderSize(itemCount: number): OrderSize {
  if (itemCount <= 2) return "S";
  if (itemCount <= 5) return "M";
  return "L";
}
