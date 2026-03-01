/**
 * /api/faq/route.ts
 *
 * Proxy vers sip-agent-server /api/faqs
 * Traduit restaurantId → agentApiToken (via la table restaurants)
 * Le token Bearer scope automatiquement l'agentId côté serveur.
 *
 * GET    /api/faq?restaurantId=xxx                 → GET  /api/faqs
 * GET    /api/faq?restaurantId=xxx&status=pending   → GET  /api/faqs?status=pending
 * GET    /api/faq?restaurantId=xxx&for_prompt=true  → GET  /api/faqs?for_prompt=true
 * POST   /api/faq                                   → POST /api/faqs
 * PATCH  /api/faq                                   → PUT  /api/faqs/:id
 * DELETE /api/faq?id=xxx                            → DELETE /api/faqs/:id
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import type { Restaurant } from "@/db/entities/Restaurant";

const SIP_AGENT_SERVER_URL =
  process.env.SIP_AGENT_SERVER_URL || "http://localhost:4000";

/** Résout restaurantId → agentApiToken */
async function resolveAgentToken(restaurantId: string): Promise<string | null> {
  const ds = await getDb();
  const restaurant = await ds.getRepository<Restaurant>("restaurants").findOneBy({ id: restaurantId });
  return restaurant?.agentApiToken || null;
}

async function sipFetch(path: string, agentToken: string, init?: RequestInit): Promise<Response> {
  return fetch(`${SIP_AGENT_SERVER_URL}/api${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${agentToken}`,
      ...(init?.headers as Record<string, string>),
    },
    signal: AbortSignal.timeout(10_000),
  });
}

// ============================================================
// GET
// ============================================================

export async function GET(req: NextRequest) {
  const restaurantId = req.nextUrl.searchParams.get("restaurantId");
  const status = req.nextUrl.searchParams.get("status");
  const forPrompt = req.nextUrl.searchParams.get("for_prompt");

  if (!restaurantId) {
    return NextResponse.json({ error: "restaurantId required" }, { status: 400 });
  }

  const token = await resolveAgentToken(restaurantId);
  if (!token) {
    return NextResponse.json({ error: "Restaurant non provisionné" }, { status: 404 });
  }

  // agentId auto-résolu par le Bearer token côté serveur
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (forPrompt) params.set("for_prompt", forPrompt);
  const qs = params.toString() ? `?${params}` : "";

  const resp = await sipFetch(`/faqs${qs}`, token);
  const data = await resp.json();
  return NextResponse.json(data, { status: resp.status });
}

// ============================================================
// POST — Nouvelle question (depuis l'IA ou manuellement)
// ============================================================

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { restaurantId, question, category, callerPhone } = body;

  if (!restaurantId || !question) {
    return NextResponse.json({ error: "restaurantId and question required" }, { status: 400 });
  }

  const token = await resolveAgentToken(restaurantId);
  if (!token) {
    return NextResponse.json({ error: "Restaurant non provisionné" }, { status: 404 });
  }

  // agentId auto-résolu par le Bearer token côté serveur
  const resp = await sipFetch("/faqs", token, {
    method: "POST",
    body: JSON.stringify({ question, category, callerPhone }),
  });

  const data = await resp.json();
  return NextResponse.json(data, { status: resp.status });
}

// ============================================================
// PATCH — Le restaurateur répond ou ignore
// ============================================================

export async function PATCH(req: NextRequest) {
  const { id, restaurantId, answer, status } = await req.json();

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  // Pour PATCH/DELETE on a besoin du token mais pas de restaurantId dans le body côté serveur
  // Si restaurantId fourni, on l'utilise ; sinon on tente sans token (erreur 401)
  const token = restaurantId ? await resolveAgentToken(restaurantId) : null;
  if (!token) {
    return NextResponse.json({ error: "restaurantId required for auth" }, { status: 400 });
  }

  const updateBody: Record<string, any> = {};
  if (answer !== undefined) updateBody.answer = answer;
  if (status) updateBody.status = status;

  const resp = await sipFetch(`/faqs/${id}`, token, {
    method: "PUT",
    body: JSON.stringify(updateBody),
  });

  const data = await resp.json();
  return NextResponse.json(data, { status: resp.status });
}

// ============================================================
// DELETE
// ============================================================

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  const restaurantId = req.nextUrl.searchParams.get("restaurantId");

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const token = restaurantId ? await resolveAgentToken(restaurantId) : null;
  if (!token) {
    return NextResponse.json({ error: "restaurantId required for auth" }, { status: 400 });
  }

  const resp = await sipFetch(`/faqs/${id}`, token, { method: "DELETE" });
  const data = await resp.json();
  return NextResponse.json(data, { status: resp.status });
}
