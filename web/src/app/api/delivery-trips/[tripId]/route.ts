import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import type { DeliveryTrip } from "@/db/entities/DeliveryTrip";
import type { Order } from "@/db/entities/Order";
import type { TripStop } from "@/db/entities/DeliveryTrip";

// GET /api/delivery-trips/[tripId]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ tripId: string }> },
) {
  const { tripId } = await params;
  const ds = await getDb();

  const trip = await ds.getRepository<DeliveryTrip>("delivery_trips").findOneBy({ id: tripId });
  if (!trip) {
    return NextResponse.json({ error: "Trip not found" }, { status: 404 });
  }

  return NextResponse.json(trip);
}

// PATCH /api/delivery-trips/[tripId]
// Actions: start, deliver_stop, complete, cancel
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ tripId: string }> },
) {
  const { tripId } = await params;
  const ds = await getDb();
  const body = await req.json();
  const { action, orderId } = body;

  const trip = await ds.getRepository<DeliveryTrip>("delivery_trips").findOneBy({ id: tripId });
  if (!trip) {
    return NextResponse.json({ error: "Trip not found" }, { status: 404 });
  }

  switch (action) {
    case "start": {
      if (trip.status !== "planning") {
        return NextResponse.json({ error: "Trip is not in planning status" }, { status: 400 });
      }
      trip.status = "in_progress";
      trip.startedAt = new Date();
      await ds.getRepository<DeliveryTrip>("delivery_trips").save(trip);
      break;
    }

    case "deliver_stop": {
      if (!orderId) {
        return NextResponse.json({ error: "orderId required for deliver_stop" }, { status: 400 });
      }

      // Marquer le stop comme livré
      const stops: TripStop[] = trip.stops;
      const stop = stops.find((s) => s.orderId === orderId);
      if (!stop) {
        return NextResponse.json({ error: "Stop not found in trip" }, { status: 404 });
      }

      if (stop.deliveredAt) {
        return NextResponse.json({ error: "Stop already delivered" }, { status: 400 });
      }

      stop.deliveredAt = new Date().toISOString();
      trip.stops = stops;

      // Passer la commande en completed
      await ds.getRepository<Order>("orders").update(orderId, { status: "completed" });

      // Si tous les stops sont livrés → auto-complete le trip
      const allDelivered = stops.every((s) => s.deliveredAt !== null);
      if (allDelivered) {
        trip.status = "completed";
        trip.completedAt = new Date();
      }

      await ds.getRepository<DeliveryTrip>("delivery_trips").save(trip);
      break;
    }

    case "complete": {
      trip.status = "completed";
      trip.completedAt = new Date();
      await ds.getRepository<DeliveryTrip>("delivery_trips").save(trip);

      // Marquer toutes les commandes restantes comme completed
      for (const stop of trip.stops) {
        if (!stop.deliveredAt) {
          stop.deliveredAt = new Date().toISOString();
          await ds.getRepository<Order>("orders").update(stop.orderId, { status: "completed" });
        }
      }
      trip.stops = [...trip.stops]; // force update
      await ds.getRepository<DeliveryTrip>("delivery_trips").save(trip);
      break;
    }

    case "cancel": {
      trip.status = "cancelled";
      await ds.getRepository<DeliveryTrip>("delivery_trips").save(trip);

      // Remettre toutes les commandes en "ready" et détacher du trip
      for (const stop of trip.stops) {
        if (!stop.deliveredAt) {
          await ds.getRepository<Order>("orders").update(stop.orderId, {
            tripId: null as any,
            status: "ready",
          });
        }
      }
      break;
    }

    default:
      return NextResponse.json(
        { error: `Unknown action: ${action}. Valid: start, deliver_stop, complete, cancel` },
        { status: 400 },
      );
  }

  // Recharger le trip à jour
  const updated = await ds.getRepository<DeliveryTrip>("delivery_trips").findOneBy({ id: tripId });
  return NextResponse.json(updated);
}
