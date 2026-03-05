import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { ROLE_ADMIN } from "@/lib/roles";
import { getDb } from "@/lib/db";
import type { Restaurant } from "@/db/entities/Restaurant";

const SIP_AGENT_INTERNAL_URL =
  process.env.SIP_AGENT_INTERNAL_URL || "http://localhost:4000";
const SIP_ACCOUNT_API_KEY = process.env.SIP_ACCOUNT_API_KEY || "";

async function resolveAgent(restaurantId: string) {
  const ds = await getDb();
  const restaurant = await ds
    .getRepository<Restaurant>("restaurants")
    .findOneBy({ id: restaurantId });
  return restaurant?.agentId || null;
}

function sipHeaders() {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (SIP_ACCOUNT_API_KEY) h["X-API-Key"] = SIP_ACCOUNT_API_KEY;
  return h;
}

/**
 * GET /api/agent/[restaurantId] — fetch full agent data from sip-agent-server
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ restaurantId: string }> },
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

  const agentId = await resolveAgent(restaurantId);
  if (!agentId) {
    return NextResponse.json({ error: "Aucun agent configuré" }, { status: 404 });
  }

  const resp = await fetch(`${SIP_AGENT_INTERNAL_URL}/api/agents/${agentId}`, {
    headers: sipHeaders(),
    signal: AbortSignal.timeout(10_000),
  });
  if (!resp.ok) {
    return NextResponse.json({ error: "Agent introuvable" }, { status: resp.status });
  }

  return NextResponse.json(await resp.json());
}

/**
 * PUT /api/agent/[restaurantId] — update agent config
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ restaurantId: string }> },
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

  const agentId = await resolveAgent(restaurantId);
  if (!agentId) {
    return NextResponse.json({ error: "Aucun agent configuré" }, { status: 404 });
  }

  const body = await req.text();
  const resp = await fetch(`${SIP_AGENT_INTERNAL_URL}/api/agents/${agentId}`, {
    method: "PUT",
    headers: sipHeaders(),
    body,
    signal: AbortSignal.timeout(10_000),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: "Erreur serveur" }));
    return NextResponse.json(err, { status: resp.status });
  }

  return NextResponse.json(await resp.json());
}
