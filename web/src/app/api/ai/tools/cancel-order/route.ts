/**
 * POST /api/ai/tools/cancel-order
 *
 * Thin wrapper for sip-agent-server ToolExecutor.
 * Two-step operation: lookup order by number + cancel if eligible.
 *
 * Body:
 * - restaurantId, order_number (from AI args)
 * - caller_phone (from ContextStore)
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { Order } from "@/db/entities/Order";

const CANCELLABLE_STATUSES = ["pending", "confirmed"];

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { restaurantId, order_number, caller_phone } = body;

  if (!restaurantId || !order_number) {
    return NextResponse.json(
      { success: false, error: "restaurantId et order_number requis" },
      { status: 400 },
    );
  }

  const ds = await getDb();

  // Find order by number + restaurant + phone
  const phone = caller_phone || "";
  const orders = await ds.getRepository(Order).find({
    where: { restaurantId, customerPhone: phone },
    order: { createdAt: "DESC" },
    take: 20,
  });

  const target = orders.find((o) => o.orderNumber === order_number);

  if (!target) {
    return NextResponse.json({
      success: false,
      error: `Commande #${order_number} introuvable`,
    });
  }

  if (!CANCELLABLE_STATUSES.includes(target.status)) {
    return NextResponse.json({
      success: false,
      error: `Annulation impossible : la commande est deja en statut '${target.status}'`,
    });
  }

  await ds.getRepository(Order).update(target.id, { status: "cancelled" });

  return NextResponse.json({
    success: true,
    message: `Commande #${order_number} annulee`,
  });
}
