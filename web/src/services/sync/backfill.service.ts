/**
 * Backfill service — Phase 4
 *
 * Scripts idempotents à exécuter APRÈS la migration (synchronize: true en SQLite).
 * Ils mettent à jour les données existantes pour les nouvelles colonnes.
 *
 * Usage :
 *   import { runBackfill } from "@/services/sync/backfill.service";
 *   await runBackfill();
 */
import { getDb } from "@/lib/db";
import { Reservation } from "@/db/entities/Reservation";
import { Order } from "@/db/entities/Order";
import { DiningTable } from "@/db/entities/DiningTable";
import { Restaurant } from "@/db/entities/Restaurant";
import { DiningService } from "@/db/entities/DiningService";

// ---------------------------------------------------------------------------
// 4.1 + 4.2  Reservations & Orders : source field
// ---------------------------------------------------------------------------

async function backfillReservationSources(): Promise<number> {
  const db = await getDb();

  // Réservations créées via un appel → phone_ai
  const r1 = await db
    .createQueryBuilder()
    .update(Reservation)
    .set({ source: "phone_ai" })
    .where("callId IS NOT NULL AND source = :src", { src: "phone_ai" })
    .execute();

  // Réservations sans appel (saisie manuelle / walk-in)
  const r2 = await db
    .createQueryBuilder()
    .update(Reservation)
    .set({ source: "walkin" })
    .where("callId IS NULL AND source = :src", { src: "phone_ai" })
    .execute();

  return (r1.affected ?? 0) + (r2.affected ?? 0);
}

async function backfillOrderSources(): Promise<number> {
  const db = await getDb();

  const r1 = await db
    .createQueryBuilder()
    .update(Order)
    .set({ source: "phone_ai" })
    .where("callId IS NOT NULL AND source = :src", { src: "phone_ai" })
    .execute();

  const r2 = await db
    .createQueryBuilder()
    .update(Order)
    .set({ source: "walkin" })
    .where("callId IS NULL AND source = :src", { src: "phone_ai" })
    .execute();

  return (r1.affected ?? 0) + (r2.affected ?? 0);
}

// ---------------------------------------------------------------------------
// 4.3  DiningTable : maxSeats = seats par défaut
// ---------------------------------------------------------------------------

async function backfillTableMaxSeats(): Promise<number> {
  const db = await getDb();

  const r = await db
    .createQueryBuilder()
    .update(DiningTable)
    .set({ maxSeats: () => "seats" })
    .where("maxSeats IS NULL")
    .execute();

  return r.affected ?? 0;
}

// ---------------------------------------------------------------------------
// 4.4  Génération des Services depuis openingHours
// ---------------------------------------------------------------------------

function subtractMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m - minutes;
  const nh = Math.floor(total / 60);
  const nm = total % 60;
  return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`;
}

async function backfillServicesFromOpeningHours(): Promise<number> {
  const db = await getDb();
  const restaurantRepo = db.getRepository(Restaurant);
  const serviceRepo = db.getRepository(DiningService);

  const restaurants = await restaurantRepo.find();
  let created = 0;

  const dayMap: Record<string, number> = {
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
    sunday: 7,
  };

  for (const restaurant of restaurants) {
    // Skip si des services existent déjà pour ce restaurant
    const existing = await serviceRepo.count({ where: { restaurantId: restaurant.id } });
    if (existing > 0) continue;

    const hours = restaurant.openingHours;
    if (!hours || typeof hours !== "object") continue;

    // Regrouper les jours par slot identique
    const slots: Record<string, { name: string; start: string; end: string; days: number[] }> = {};

    for (const [day, daySlots] of Object.entries(hours)) {
      if (!daySlots || typeof daySlots !== "object") continue;
      for (const [slotName, timeRange] of Object.entries(daySlots as Record<string, string>)) {
        if (typeof timeRange !== "string" || !timeRange.includes("-")) continue;
        const key = `${slotName}_${timeRange}`;
        if (!slots[key]) {
          const [start, end] = timeRange.split("-");
          const name =
            slotName === "lunch"
              ? "Déjeuner"
              : slotName === "dinner"
                ? "Dîner"
                : slotName.charAt(0).toUpperCase() + slotName.slice(1);
          slots[key] = { name, start: start.trim(), end: end.trim(), days: [] };
        }
        if (dayMap[day]) {
          slots[key].days.push(dayMap[day]);
        }
      }
    }

    for (const slot of Object.values(slots)) {
      if (slot.days.length === 0) continue;
      await serviceRepo.save({
        restaurantId: restaurant.id,
        name: slot.name,
        type: "standard",
        dayOfWeek: slot.days.sort((a, b) => a - b),
        startTime: slot.start,
        endTime: slot.end,
        lastSeatingTime: subtractMinutes(slot.end, 30),
        maxCovers: restaurant.totalSeats || 40,
        defaultDurationMin: restaurant.avgMealDurationMin || 90,
        slotIntervalMin: 30,
        autoConfirm: true,
      });
      created++;
    }
  }

  return created;
}

// ---------------------------------------------------------------------------
// Runner principal
// ---------------------------------------------------------------------------

export async function runBackfill(): Promise<{
  reservations: number;
  orders: number;
  tables: number;
  services: number;
}> {
  const [reservations, orders, tables, services] = await Promise.all([
    backfillReservationSources(),
    backfillOrderSources(),
    backfillTableMaxSeats(),
    backfillServicesFromOpeningHours(),
  ]);

  console.log(
    `[Backfill] Done — reservations: ${reservations}, orders: ${orders}, tables: ${tables}, services: ${services}`,
  );

  return { reservations, orders, tables, services };
}
