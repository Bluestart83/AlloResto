// ============================================================
// Planning Engine — capacity-based scheduling
// ============================================================

import { getDb } from "@/lib/db";
import type { Order } from "@/db/entities/Order";
import type { ExternalLoad } from "@/db/entities/ExternalLoad";
import type { Restaurant } from "@/db/entities/Restaurant";
import { In, Not, LessThanOrEqual, MoreThanOrEqual } from "typeorm";
import {
  type Resource,
  type PlanningConfig,
  type ResourceCapacity,
  type OrderSize,
  type OrderSizeProfile,
  type TimelineSlot,
  type TimelineBlock,
  type TimelineSnapshot,
  type TimelineOrderInfo,
  type TimelineExternalLoadInfo,
  type AvailableSlot,
  DEFAULT_PLANNING_CONFIG,
  classifyOrderSize,
} from "@/types/planning";

// ---------- Helpers ----------

function roundDownToSlot(date: Date, slotMin: number): Date {
  const d = new Date(date);
  const mins = d.getMinutes();
  d.setMinutes(mins - (mins % slotMin), 0, 0);
  return d;
}

function addMinutes(date: Date, min: number): Date {
  return new Date(date.getTime() + min * 60_000);
}

function diffMinutes(a: Date, b: Date): number {
  return (a.getTime() - b.getTime()) / 60_000;
}

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function emptyCapacity(): ResourceCapacity {
  return { cuisine: 0, preparation: 0, comptoir: 0, livraison: 0 };
}

/** Get capacity for a given time from config time bands */
function getCapacityForTime(time: Date, config: PlanningConfig): ResourceCapacity {
  const dayMinutes = time.getHours() * 60 + time.getMinutes();
  for (const band of config.timeBands) {
    const start = timeToMinutes(band.startTime);
    const end = timeToMinutes(band.endTime);
    if (dayMinutes >= start && dayMinutes < end) {
      return { ...band.capacity };
    }
  }
  return { ...config.defaultCapacity };
}

function getConfig(restaurant: Restaurant): PlanningConfig {
  const raw = restaurant.planningConfig as any;
  if (!raw || !raw.enabled) return { ...DEFAULT_PLANNING_CONFIG };
  return { ...DEFAULT_PLANNING_CONFIG, ...raw };
}

// ---------- Resource consumption for an order ----------

interface SlotConsumption {
  resource: Resource;
  slotIndex: number; // relative to cook start
  points: number;
}

/**
 * Compute the resource consumption pattern for an order.
 * Returns consumption relative to the cook start slot.
 */
function computeOrderConsumption(
  profile: OrderSizeProfile,
  orderType: string,
  transitSlots: number,
): SlotConsumption[] {
  const result: SlotConsumption[] = [];
  let offset = 0;

  // CUISINE: cuisineSlots slots
  for (let i = 0; i < profile.cuisineSlots; i++) {
    result.push({ resource: "cuisine", slotIndex: offset + i, points: profile.cuisinePts });
  }
  offset += profile.cuisineSlots;

  // PREPARATION: 1 slot (emballage/mise en sac)
  result.push({ resource: "preparation", slotIndex: offset, points: profile.preparationPts });
  offset += 1;

  // COMPTOIR: 1 slot (remise client)
  result.push({ resource: "comptoir", slotIndex: offset, points: profile.comptoirPts });
  offset += 1;

  // LIVRAISON: for delivery, transitSlots slots starting at offset
  if (orderType === "delivery" && transitSlots > 0) {
    for (let i = 0; i < transitSlots; i++) {
      result.push({ resource: "livraison", slotIndex: offset + i, points: 1 });
    }
  }

  return result;
}

/** Total slots needed from cook start to handoff (excl. livraison) */
function totalPrepSlots(profile: OrderSizeProfile): number {
  return profile.cuisineSlots + 1 /* preparation */ + 1 /* comptoir */;
}

// ---------- Build timeline ----------

interface InternalSlot {
  index: number;
  time: Date;
  capacity: ResourceCapacity;
  used: ResourceCapacity;
}

async function loadActiveOrders(restaurantId: string): Promise<Order[]> {
  const ds = await getDb();
  return ds.getRepository<Order>("orders").find({
    where: {
      restaurantId,
      status: Not(In(["completed", "cancelled"])),
    },
    relations: ["items"],
  });
}

async function loadActiveExternalLoads(restaurantId: string, from: Date, to: Date): Promise<ExternalLoad[]> {
  const ds = await getDb();
  return ds.getRepository<ExternalLoad>("external_loads").find({
    where: {
      restaurantId,
      startTime: LessThanOrEqual(to),
      endTime: MoreThanOrEqual(from),
    },
  });
}

function buildEmptyTimeline(anchor: Date, config: PlanningConfig): InternalSlot[] {
  const slots: InternalSlot[] = [];
  for (let i = 0; i < config.horizonSlots; i++) {
    const time = addMinutes(anchor, i * config.slotMinutes);
    slots.push({
      index: i,
      time,
      capacity: getCapacityForTime(time, config),
      used: emptyCapacity(),
    });
  }
  return slots;
}

function slotIndexForTime(anchor: Date, time: Date, slotMin: number): number {
  const diff = diffMinutes(time, anchor);
  return Math.floor(diff / slotMin);
}

/** Fill timeline slots with an order's consumption */
function fillOrderOnTimeline(
  slots: InternalSlot[],
  order: Order,
  config: PlanningConfig,
  blocks: TimelineBlock[],
): void {
  if (!order.cookStartAt) return;

  const cookStart = new Date(order.cookStartAt);
  const anchor = slots[0].time;
  const baseSlotIdx = slotIndexForTime(anchor, cookStart, config.slotMinutes);

  const size = order.orderSize || classifyOrderSize(order.items?.length || 1);
  const profile = config.sizeProfiles[size];
  const transitSlots = order.orderType === "delivery" && order.deliveryDurationMin
    ? Math.ceil(order.deliveryDurationMin / config.slotMinutes)
    : 0;

  const consumption = computeOrderConsumption(profile, order.orderType, transitSlots);

  for (const c of consumption) {
    const idx = baseSlotIdx + c.slotIndex;
    if (idx >= 0 && idx < slots.length) {
      slots[idx].used[c.resource] += c.points;
    }

    blocks.push({
      id: `${order.id}-${c.resource}-${c.slotIndex}`,
      type: "order",
      label: order.customerName || order.customerPhone || `#${order.orderNumber}`,
      startSlot: Math.max(0, baseSlotIdx + c.slotIndex),
      endSlot: Math.max(0, baseSlotIdx + c.slotIndex),
      resource: c.resource,
      points: c.points,
      meta: {
        orderId: order.id,
        orderType: order.orderType,
        status: order.status,
        orderSize: size,
      },
    });
  }
}

/** Fill timeline slots with an external load */
function fillExternalLoadOnTimeline(
  slots: InternalSlot[],
  load: ExternalLoad,
  config: PlanningConfig,
  blocks: TimelineBlock[],
): void {
  const anchor = slots[0].time;
  const startIdx = slotIndexForTime(anchor, new Date(load.startTime), config.slotMinutes);
  const endIdx = slotIndexForTime(anchor, new Date(load.endTime), config.slotMinutes);

  const resources = (load.resources as string[]) || [load.resource];

  for (let i = startIdx; i <= endIdx; i++) {
    if (i < 0 || i >= slots.length) continue;
    for (const res of resources) {
      const r = res as Resource;
      slots[i].used[r] += load.pointsPerSlot;
    }
  }

  for (const res of resources) {
    blocks.push({
      id: `${load.id}-${res}`,
      type: "external_load",
      label: load.label || load.type,
      startSlot: Math.max(0, startIdx),
      endSlot: Math.min(slots.length - 1, Math.max(0, endIdx)),
      resource: res as Resource,
      points: load.pointsPerSlot,
      meta: {
        loadId: load.id,
        loadType: load.type,
        intensity: load.intensity,
      },
    });
  }
}

// ---------- Public API ----------

export async function getTimelineSnapshot(restaurantId: string): Promise<TimelineSnapshot> {
  const ds = await getDb();
  const restaurant = await ds.getRepository<Restaurant>("restaurants").findOneByOrFail({ id: restaurantId });
  const config = getConfig(restaurant);

  const now = new Date();
  const anchor = roundDownToSlot(now, config.slotMinutes);
  const horizonEnd = addMinutes(anchor, config.horizonSlots * config.slotMinutes);

  const slots = buildEmptyTimeline(anchor, config);
  const blocks: TimelineBlock[] = [];

  // Load and place orders
  const orders = await loadActiveOrders(restaurantId);
  for (const order of orders) {
    fillOrderOnTimeline(slots, order, config, blocks);
  }

  // Load and place external loads
  const loads = await loadActiveExternalLoads(restaurantId, anchor, horizonEnd);
  for (const load of loads) {
    fillExternalLoadOnTimeline(slots, load, config, blocks);
  }

  // Format output
  const timelineSlots: TimelineSlot[] = slots.map((s) => ({
    index: s.index,
    time: s.time.toISOString(),
    capacity: s.capacity,
    used: s.used,
    remaining: {
      cuisine: s.capacity.cuisine - s.used.cuisine,
      preparation: s.capacity.preparation - s.used.preparation,
      comptoir: s.capacity.comptoir - s.used.comptoir,
      livraison: s.capacity.livraison - s.used.livraison,
    },
  }));

  const orderInfos: TimelineOrderInfo[] = orders.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    orderType: o.orderType,
    orderSize: o.orderSize,
    status: o.status,
    total: o.total,
    itemCount: o.items?.length || 0,
    cookStartAt: o.cookStartAt?.toISOString() || null,
    handoffAt: o.handoffAt?.toISOString() || null,
    estimatedReadyAt: o.estimatedReadyAt?.toISOString() || null,
    deliveryAddress: o.deliveryAddress,
    createdAt: o.createdAt.toISOString(),
  }));

  const loadInfos: TimelineExternalLoadInfo[] = loads.map((l) => ({
    id: l.id,
    type: l.type as any,
    resources: l.resources as any[],
    intensity: l.intensity as any,
    pointsPerSlot: l.pointsPerSlot,
    startTime: l.startTime.toISOString(),
    endTime: l.endTime.toISOString(),
    durationMin: l.durationMin,
    label: l.label,
  }));

  return {
    anchorTime: anchor.toISOString(),
    slots: timelineSlots,
    blocks,
    orders: orderInfos,
    externalLoads: loadInfos,
  };
}

/**
 * Schedule an order: find the best cook start time given capacity.
 * Returns { cookStartAt, handoffAt, estimatedReadyAt } or null if no slot found.
 */
export async function scheduleOrder(
  restaurantId: string,
  itemCount: number,
  orderType: string,
  requestedTime: Date | null,
  transitMin: number = 0,
): Promise<{
  orderSize: OrderSize;
  cookStartAt: Date;
  handoffAt: Date;
  estimatedReadyAt: Date;
} | null> {
  const ds = await getDb();
  const restaurant = await ds.getRepository<Restaurant>("restaurants").findOneByOrFail({ id: restaurantId });
  const config = getConfig(restaurant);

  const now = new Date();
  const anchor = roundDownToSlot(now, config.slotMinutes);
  const horizonEnd = addMinutes(anchor, config.horizonSlots * config.slotMinutes);

  const slots = buildEmptyTimeline(anchor, config);
  const blocks: TimelineBlock[] = [];

  // Fill existing load
  const orders = await loadActiveOrders(restaurantId);
  for (const o of orders) fillOrderOnTimeline(slots, o, config, blocks);

  const loads = await loadActiveExternalLoads(restaurantId, anchor, horizonEnd);
  for (const l of loads) fillExternalLoadOnTimeline(slots, l, config, blocks);

  // Determine order profile
  const size = classifyOrderSize(itemCount);
  const profile = config.sizeProfiles[size];
  const transitSlots = orderType === "delivery" ? Math.ceil(transitMin / config.slotMinutes) : 0;
  const consumption = computeOrderConsumption(profile, orderType, transitSlots);

  const buffer = orderType === "delivery" ? config.bufferDeliveryMin : config.bufferPickupMin;
  const prepSlots = totalPrepSlots(profile);
  const prepMin = prepSlots * config.slotMinutes;

  // Determine the earliest possible requested time
  const minReadyTime = addMinutes(now, prepMin + buffer);
  let targetTime = requestedTime && requestedTime > minReadyTime ? requestedTime : minReadyTime;

  // Search for a feasible slot
  const maxAttempts = Math.ceil(config.maxShiftMin / config.slotMinutes);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Compute cook start from target time
    let cookStart: Date;
    if (orderType === "delivery") {
      const departure = addMinutes(targetTime, -transitMin);
      cookStart = addMinutes(departure, -buffer - prepMin);
    } else {
      cookStart = addMinutes(targetTime, -buffer - prepMin);
    }

    // Ensure cook start is not in the past
    if (cookStart < anchor) {
      targetTime = addMinutes(targetTime, config.slotMinutes);
      continue;
    }

    const baseSlotIdx = slotIndexForTime(anchor, cookStart, config.slotMinutes);

    // Check if all consumption fits
    let feasible = true;
    for (const c of consumption) {
      const idx = baseSlotIdx + c.slotIndex;
      if (idx < 0 || idx >= slots.length) {
        feasible = false;
        break;
      }
      const remaining = slots[idx].capacity[c.resource] - slots[idx].used[c.resource];
      if (remaining < c.points) {
        feasible = false;
        break;
      }
    }

    if (feasible) {
      const handoff = addMinutes(cookStart, prepMin);
      const estimatedReady = orderType === "delivery"
        ? addMinutes(handoff, transitMin)
        : handoff;

      return {
        orderSize: size,
        cookStartAt: cookStart,
        handoffAt: handoff,
        estimatedReadyAt: estimatedReady,
      };
    }

    targetTime = addMinutes(targetTime, config.slotMinutes);
  }

  return null; // No feasible slot found within maxShift
}

/**
 * Get available slots for a given order type and size.
 */
export async function getAvailableSlots(
  restaurantId: string,
  orderType: string,
  itemCount: number,
  transitMin: number = 0,
): Promise<AvailableSlot[]> {
  const ds = await getDb();
  const restaurant = await ds.getRepository<Restaurant>("restaurants").findOneByOrFail({ id: restaurantId });
  const config = getConfig(restaurant);

  const now = new Date();
  const anchor = roundDownToSlot(now, config.slotMinutes);
  const horizonEnd = addMinutes(anchor, config.horizonSlots * config.slotMinutes);

  const slots = buildEmptyTimeline(anchor, config);
  const blocks: TimelineBlock[] = [];

  const orders = await loadActiveOrders(restaurantId);
  for (const o of orders) fillOrderOnTimeline(slots, o, config, blocks);

  const loads = await loadActiveExternalLoads(restaurantId, anchor, horizonEnd);
  for (const l of loads) fillExternalLoadOnTimeline(slots, l, config, blocks);

  const size = classifyOrderSize(itemCount);
  const profile = config.sizeProfiles[size];
  const transitSlots = orderType === "delivery" ? Math.ceil(transitMin / config.slotMinutes) : 0;
  const consumption = computeOrderConsumption(profile, orderType, transitSlots);

  const buffer = orderType === "delivery" ? config.bufferDeliveryMin : config.bufferPickupMin;
  const prepSlots = totalPrepSlots(profile);
  const prepMin = prepSlots * config.slotMinutes;
  const minReadyTime = addMinutes(now, prepMin + buffer);

  const result: AvailableSlot[] = [];

  // Check each future slot as a potential delivery/pickup time
  for (let i = 0; i < config.horizonSlots; i++) {
    const slotTime = addMinutes(anchor, i * config.slotMinutes);
    if (slotTime < minReadyTime) continue;

    // Compute cook start for this slot
    let cookStart: Date;
    if (orderType === "delivery") {
      const departure = addMinutes(slotTime, -transitMin);
      cookStart = addMinutes(departure, -buffer - prepMin);
    } else {
      cookStart = addMinutes(slotTime, -buffer - prepMin);
    }

    if (cookStart < anchor) continue;

    const baseSlotIdx = slotIndexForTime(anchor, cookStart, config.slotMinutes);

    let feasible = true;
    for (const c of consumption) {
      const idx = baseSlotIdx + c.slotIndex;
      if (idx < 0 || idx >= slots.length) {
        feasible = false;
        break;
      }
      const remaining = slots[idx].capacity[c.resource] - slots[idx].used[c.resource];
      if (remaining < c.points) {
        feasible = false;
        break;
      }
    }

    result.push({
      time: slotTime.toISOString(),
      feasible,
    });
  }

  return result;
}
