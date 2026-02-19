import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { ROLE_ADMIN } from "@/lib/roles";
import { getDb } from "@/lib/db";
import type { Restaurant } from "@/db/entities/Restaurant";

const SIP_AGENT_SERVER_URL =
  process.env.SIP_AGENT_SERVER_URL || "http://localhost:4000";

// DELETE /api/subscriptions/:restaurantId/:subId — annuler une souscription
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ restaurantId: string; subId: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { restaurantId, subId } = await params;

  const user = session.user as Record<string, unknown>;
  if (user.role !== ROLE_ADMIN && user.restaurantId !== restaurantId) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  // Vérifier que le restaurant existe et a un finalCustomerId
  const ds = await getDb();
  const restaurant = await ds
    .getRepository<Restaurant>("restaurants")
    .findOneBy({ id: restaurantId });
  if (!restaurant?.finalCustomerId) {
    return NextResponse.json({ error: "Restaurant introuvable" }, { status: 404 });
  }

  try {
    const resp = await fetch(
      `${SIP_AGENT_SERVER_URL}/api/subscriptions/${subId}`,
      {
        method: "DELETE",
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
