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

function sipHeaders(extra?: Record<string, string>) {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (SIP_ACCOUNT_API_KEY) h["X-API-Key"] = SIP_ACCOUNT_API_KEY;
  return { ...h, ...extra };
}

async function checkAuth(restaurantId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return { error: "Non authentifié", status: 401 };
  const user = session.user as Record<string, unknown>;
  if (user.role !== ROLE_ADMIN && user.restaurantId !== restaurantId) {
    return { error: "Accès refusé", status: 403 };
  }
  return null;
}

/**
 * POST /api/agent/[restaurantId]/tts — generate TTS audio
 * Body: { type, text, voice, model?, instructions? }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ restaurantId: string }> },
) {
  const { restaurantId } = await params;
  const authErr = await checkAuth(restaurantId);
  if (authErr) return NextResponse.json({ error: authErr.error }, { status: authErr.status });

  const agentId = await resolveAgent(restaurantId);
  if (!agentId) return NextResponse.json({ error: "Aucun agent" }, { status: 404 });

  const body = await req.text();
  const resp = await fetch(`${SIP_AGENT_INTERNAL_URL}/api/agents/${agentId}/tts-generate`, {
    method: "POST",
    headers: sipHeaders(),
    body,
    signal: AbortSignal.timeout(30_000),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: "Erreur TTS" }));
    return NextResponse.json(err, { status: resp.status });
  }
  return NextResponse.json(await resp.json());
}

/**
 * GET /api/agent/[restaurantId]/tts?type=intro&action=preview|info
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ restaurantId: string }> },
) {
  const { restaurantId } = await params;
  const authErr = await checkAuth(restaurantId);
  if (authErr) return NextResponse.json({ error: authErr.error }, { status: authErr.status });

  const agentId = await resolveAgent(restaurantId);
  if (!agentId) return NextResponse.json({ error: "Aucun agent" }, { status: 404 });

  const type = req.nextUrl.searchParams.get("type") || "intro";
  const action = req.nextUrl.searchParams.get("action") || "info";

  if (action === "preview") {
    const resp = await fetch(
      `${SIP_AGENT_INTERNAL_URL}/api/agents/${agentId}/tts/${type}?format=wav`,
      { headers: sipHeaders(), signal: AbortSignal.timeout(10_000) },
    );
    if (!resp.ok) {
      return NextResponse.json({ error: "Audio introuvable" }, { status: resp.status });
    }
    const buffer = await resp.arrayBuffer();
    return new NextResponse(buffer, {
      status: 200,
      headers: { "Content-Type": "audio/wav" },
    });
  }

  // action === "info"
  const resp = await fetch(
    `${SIP_AGENT_INTERNAL_URL}/api/agents/${agentId}/tts/${type}`,
    { headers: sipHeaders(), signal: AbortSignal.timeout(10_000) },
  );
  if (!resp.ok) {
    return NextResponse.json({ exists: false });
  }
  return NextResponse.json(await resp.json());
}

/**
 * DELETE /api/agent/[restaurantId]/tts?type=intro
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ restaurantId: string }> },
) {
  const { restaurantId } = await params;
  const authErr = await checkAuth(restaurantId);
  if (authErr) return NextResponse.json({ error: authErr.error }, { status: authErr.status });

  const agentId = await resolveAgent(restaurantId);
  if (!agentId) return NextResponse.json({ error: "Aucun agent" }, { status: 404 });

  const type = req.nextUrl.searchParams.get("type") || "intro";

  const resp = await fetch(
    `${SIP_AGENT_INTERNAL_URL}/api/agents/${agentId}/tts/${type}`,
    { method: "DELETE", headers: sipHeaders(), signal: AbortSignal.timeout(10_000) },
  );

  if (!resp.ok && resp.status !== 404) {
    return NextResponse.json({ error: "Erreur suppression" }, { status: resp.status });
  }
  return NextResponse.json({ ok: true });
}
