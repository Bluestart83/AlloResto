import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { ROLE_ADMIN } from "@/lib/roles";
import { getDb } from "@/lib/db";
import type { Restaurant } from "@/db/entities/Restaurant";

const SIP_AGENT_SERVER_URL =
  process.env.SIP_AGENT_SERVER_URL || "http://localhost:4000";

/**
 * Subscriptions proxy: /api/subscriptions/:restaurantId → sip-agent-server
 *
 * GET  → liste les souscriptions du restaurant
 * POST → souscrire a un plan { planId }
 */

async function getRestaurantWithAuth(
  req: NextRequest,
  restaurantId: string
): Promise<{ restaurant: Restaurant } | NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const user = session.user as Record<string, unknown>;
  if (user.role !== ROLE_ADMIN && user.restaurantId !== restaurantId) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  const ds = await getDb();
  const restaurant = await ds
    .getRepository<Restaurant>("restaurants")
    .findOneBy({ id: restaurantId });
  if (!restaurant) {
    return NextResponse.json({ error: "Restaurant introuvable" }, { status: 404 });
  }
  if (!restaurant.finalCustomerId) {
    return NextResponse.json(
      { error: "Facturation non configurée pour ce restaurant" },
      { status: 404 }
    );
  }

  return { restaurant };
}

// GET /api/subscriptions/:restaurantId — liste les souscriptions
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ restaurantId: string }> }
) {
  const { restaurantId } = await params;
  const result = await getRestaurantWithAuth(req, restaurantId);
  if (result instanceof NextResponse) return result;
  const { restaurant } = result;

  try {
    const resp = await fetch(
      `${SIP_AGENT_SERVER_URL}/api/final-customers/${restaurant.finalCustomerId}/subscriptions`,
      { signal: AbortSignal.timeout(10_000) }
    );
    const data = await resp.json();
    return NextResponse.json(data, { status: resp.status });
  } catch (err) {
    console.error("[subscriptions-proxy]", err);
    return NextResponse.json({ error: "Service indisponible" }, { status: 502 });
  }
}

// POST /api/subscriptions/:restaurantId — souscrire { planId }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ restaurantId: string }> }
) {
  const { restaurantId } = await params;
  const result = await getRestaurantWithAuth(req, restaurantId);
  if (result instanceof NextResponse) return result;
  const { restaurant } = result;

  const body = await req.text();

  try {
    const resp = await fetch(
      `${SIP_AGENT_SERVER_URL}/api/final-customers/${restaurant.finalCustomerId}/subscriptions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(10_000),
      }
    );
    const data = await resp.json();
    return NextResponse.json(data, { status: resp.status });
  } catch (err) {
    console.error("[subscriptions-proxy]", err);
    return NextResponse.json({ error: "Service indisponible" }, { status: 502 });
  }
}
