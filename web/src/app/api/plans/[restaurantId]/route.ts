import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { ROLE_ADMIN } from "@/lib/roles";
import { getDb } from "@/lib/db";
import type { Restaurant } from "@/db/entities/Restaurant";

const SIP_AGENT_SERVER_URL =
  process.env.SIP_AGENT_SERVER_URL || "http://localhost:4000";

const ALLORESTO_ACCOUNT_NAME = "AlloResto";

// GET /api/plans/:restaurantId — liste les plans disponibles pour le restaurant
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ restaurantId: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { restaurantId } = await params;

  const user = session.user as Record<string, unknown>;
  if (user.role !== ROLE_ADMIN && user.restaurantId !== restaurantId) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  // Vérifier que le restaurant existe
  const ds = await getDb();
  const restaurant = await ds
    .getRepository<Restaurant>("restaurants")
    .findOneBy({ id: restaurantId });
  if (!restaurant) {
    return NextResponse.json({ error: "Restaurant introuvable" }, { status: 404 });
  }

  try {
    // Récupérer l'accountId AlloResto
    const accountsResp = await fetch(
      `${SIP_AGENT_SERVER_URL}/api/accounts`,
      { signal: AbortSignal.timeout(10_000) }
    );
    if (!accountsResp.ok) {
      return NextResponse.json({ error: "Service indisponible" }, { status: 502 });
    }
    const accounts = (await accountsResp.json()) as { id: string; name: string }[];
    const account = accounts.find((a) => a.name === ALLORESTO_ACCOUNT_NAME);
    if (!account) {
      return NextResponse.json([], { status: 200 });
    }

    // Lister les plans actifs de cet account
    const plansResp = await fetch(
      `${SIP_AGENT_SERVER_URL}/api/plans?accountId=${account.id}`,
      { signal: AbortSignal.timeout(10_000) }
    );
    const plans = await plansResp.json();
    return NextResponse.json(plans, { status: plansResp.status });
  } catch (err) {
    console.error("[plans-proxy]", err);
    return NextResponse.json({ error: "Service indisponible" }, { status: 502 });
  }
}
