import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { Order } from "@/db/entities/Order";
import { MoreThan } from "typeorm";

/**
 * GET /api/orders/status?restaurantId=xxx&phone=xxx
 *
 * Recherche les commandes récentes (dernières 24h) par numéro de téléphone.
 * Utilisé par l'IA pour informer un client du statut de sa commande.
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

  // Chercher les commandes des dernières 24h pour ce téléphone
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const orders = await ds.getRepository(Order).find({
    where: {
      restaurantId,
      customerPhone: phone,
      createdAt: MoreThan(since),
    },
    relations: ["items"],
    order: { createdAt: "DESC" },
    take: 5,
  });

  if (orders.length === 0) {
    return NextResponse.json({ found: false, orders: [] });
  }

  // Mapper en résumé lisible pour l'IA
  const summary = orders.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    status: o.status,
    orderType: o.orderType,
    total: Number(o.total),
    estimatedReadyAt: o.estimatedReadyAt,
    createdAt: o.createdAt,
    itemCount: o.items?.length || 0,
    itemsSummary: (o.items || [])
      .map((i) => `${i.quantity}x ${i.name}`)
      .join(", "),
  }));

  return NextResponse.json({ found: true, orders: summary });
}
