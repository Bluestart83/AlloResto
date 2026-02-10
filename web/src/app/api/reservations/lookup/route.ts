import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { Reservation } from "@/db/entities/Reservation";
import { MoreThan, In } from "typeorm";

/**
 * GET /api/reservations/lookup?restaurantId=xxx&phone=xxx
 *
 * Recherche les réservations à venir (non terminées) par numéro de téléphone.
 * Utilisé par l'IA pour permettre au client d'annuler une réservation.
 */
export async function GET(req: NextRequest) {
  const restaurantId = req.nextUrl.searchParams.get("restaurantId");
  const phone = req.nextUrl.searchParams.get("phone");

  if (!restaurantId || !phone) {
    return NextResponse.json(
      { error: "restaurantId and phone required" },
      { status: 400 }
    );
  }

  const ds = await getDb();

  // Réservations futures ou du jour, non terminées/annulées
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const reservations = await ds.getRepository(Reservation).find({
    where: {
      restaurantId,
      customerPhone: phone,
      reservationTime: MoreThan(todayStart),
      status: In(["pending", "confirmed"]),
    },
    order: { reservationTime: "ASC" },
    take: 5,
  });

  if (reservations.length === 0) {
    return NextResponse.json({ found: false, reservations: [] });
  }

  const summary = reservations.map((r) => ({
    id: r.id,
    customerName: r.customerName,
    partySize: r.partySize,
    reservationTime: r.reservationTime,
    status: r.status,
    seatingPreference: r.seatingPreference,
    notes: r.notes,
  }));

  return NextResponse.json({ found: true, reservations: summary });
}
