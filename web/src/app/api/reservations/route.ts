import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import type { Reservation } from "@/db/entities/Reservation";
import type { Restaurant } from "@/db/entities/Restaurant";
import type { DiningService } from "@/db/entities/DiningService";
import { syncReservationOutbound } from "@/services/sync/workers/outbound-sync.worker";

// GET /api/reservations?restaurantId=X&date=YYYY-MM-DD&status=pending,confirmed
export async function GET(req: NextRequest) {
  try {
    const ds = await getDb();
    const { searchParams } = new URL(req.url);
    const restaurantId = searchParams.get("restaurantId");

    if (!restaurantId) {
      return NextResponse.json(
        { error: "restaurantId required" },
        { status: 400 }
      );
    }

    const qb = ds
      .getRepository<Reservation>("reservations")
      .createQueryBuilder("r")
      .where("r.restaurant_id = :rid", { rid: restaurantId })
      .orderBy("r.reservation_time", "ASC");

    const date = searchParams.get("date");
    if (date) {
      // Filtrer par jour
      const dayStart = `${date}T00:00:00.000Z`;
      const dayEnd = `${date}T23:59:59.999Z`;
      qb.andWhere("r.reservation_time BETWEEN :start AND :end", {
        start: dayStart,
        end: dayEnd,
      });
    }

    const status = searchParams.get("status");
    if (status) {
      const statuses = status.split(",");
      qb.andWhere("r.status IN (:...statuses)", { statuses });
    }

    const reservations = await qb.getMany();
    return NextResponse.json(reservations);
  } catch (error: any) {
    console.error("GET /api/reservations error:", error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

// POST /api/reservations — créer une réservation
export async function POST(req: NextRequest) {
  try {
    const ds = await getDb();
    const body = await req.json();

    if (!body.restaurantId || !body.customerPhone || !body.partySize || !body.reservationTime) {
      return NextResponse.json(
        { error: "restaurantId, customerPhone, partySize, reservationTime required" },
        { status: 400 }
      );
    }

    // Charger le restaurant pour calculer endTime
    const restaurant = await ds
      .getRepository<Restaurant>("restaurants")
      .findOneBy({ id: body.restaurantId });

    if (!restaurant) {
      return NextResponse.json(
        { error: "Restaurant not found" },
        { status: 404 }
      );
    }

    const reservationTime = new Date(body.reservationTime);

    // Durée : service > body > restaurant fallback
    let durationMin = restaurant.avgMealDurationMin;
    if (body.serviceId) {
      const svc = await ds.getRepository<DiningService>("dining_services").findOneBy({ id: body.serviceId });
      if (svc) durationMin = svc.defaultDurationMin;
    }
    if (body.durationMin) durationMin = body.durationMin;
    const endTime = new Date(reservationTime.getTime() + durationMin * 60000);

    const repo = ds.getRepository<Reservation>("reservations");
    const reservation = repo.create({
      restaurantId: body.restaurantId,
      callId: body.callId || null,
      customerId: body.customerId || null,
      customerName: body.customerName || null,
      customerPhone: body.customerPhone,
      partySize: body.partySize,
      reservationTime,
      endTime,
      durationMin,
      status: body.status || "confirmed",
      seatingPreference: body.seatingPreference || null,
      notes: body.notes || null,
      serviceId: body.serviceId || null,
      offerId: body.offerId || null,
      diningRoomId: body.diningRoomId || null,
      tableIds: body.tableIds || null,
    } as Partial<Reservation>) as Reservation;

    const saved = await repo.save(reservation);

    // Sync outbound (fire-and-forget)
    syncReservationOutbound(saved, "create").catch((err) =>
      console.error("[POST /api/reservations] outbound sync error:", err)
    );

    return NextResponse.json(saved, { status: 201 });
  } catch (error: any) {
    console.error("POST /api/reservations error:", error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

// PATCH /api/reservations — changer le status
export async function PATCH(req: NextRequest) {
  try {
    const ds = await getDb();
    const body = await req.json();
    const { id, status, notes } = body;

    if (!id) {
      return NextResponse.json(
        { error: "id required" },
        { status: 400 }
      );
    }

    const updates: Record<string, any> = {};
    if (status) updates.status = status;
    if (notes !== undefined) updates.notes = notes;
    if (body.seatingPreference !== undefined) updates.seatingPreference = body.seatingPreference;
    if (body.serviceId !== undefined) updates.serviceId = body.serviceId || null;
    if (body.offerId !== undefined) updates.offerId = body.offerId || null;
    if (body.diningRoomId !== undefined) updates.diningRoomId = body.diningRoomId || null;
    if (body.tableIds !== undefined) updates.tableIds = body.tableIds || null;

    await ds.getRepository<Reservation>("reservations").update(id, updates);

    const updated = await ds
      .getRepository<Reservation>("reservations")
      .findOneBy({ id });

    // Sync outbound (fire-and-forget, le worker gère le mastering)
    if (updated) {
      syncReservationOutbound(updated, "update").catch((err) =>
        console.error("[PATCH /api/reservations] outbound sync error:", err)
      );
    }

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error("PATCH /api/reservations error:", error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
