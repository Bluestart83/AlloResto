/**
 * POST /api/faq/import — Bulk import FAQ via proxy
 * Body : { restaurantId, items: [{ question, answer?, category? }] }
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import type { Restaurant } from "@/db/entities/Restaurant";

const SIP_AGENT_SERVER_URL =
  process.env.SIP_AGENT_SERVER_URL || "http://localhost:4000";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { restaurantId, items } = body;

  if (!restaurantId || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "restaurantId and items[] required" }, { status: 400 });
  }

  const ds = await getDb();
  const restaurant = await ds.getRepository<Restaurant>("restaurants").findOneBy({ id: restaurantId });
  const agentId = restaurant?.agentId;

  if (!agentId) {
    return NextResponse.json({ error: "Restaurant non provisionné" }, { status: 404 });
  }

  const resp = await fetch(`${SIP_AGENT_SERVER_URL}/api/faqs/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agentId, items }),
    signal: AbortSignal.timeout(30_000),
  });

  const data = await resp.json();
  return NextResponse.json(data, { status: resp.status });
}
