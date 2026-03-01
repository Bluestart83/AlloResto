/**
 * /api/faq/route.ts
 *
 * Proxy vers sip-agent-server /api/faqs
 * Traduit restaurantId → agentId (via la table restaurants)
 *
 * L'interface AlloResto continue d'utiliser restaurantId,
 * ce proxy fait la traduction transparente.
 *
 * GET    /api/faq?restaurantId=xxx                 → GET  /api/faqs?agentId=yyy
 * GET    /api/faq?restaurantId=xxx&status=pending   → GET  /api/faqs?agentId=yyy&status=pending
 * GET    /api/faq?restaurantId=xxx&for_prompt=true  → GET  /api/faqs?agentId=yyy&for_prompt=true
 * POST   /api/faq                                   → POST /api/faqs
 * PATCH  /api/faq                                   → PUT  /api/faqs/:id
 * DELETE /api/faq?id=xxx                            → DELETE /api/faqs/:id
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import type { Restaurant } from "@/db/entities/Restaurant";

const SIP_AGENT_SERVER_URL =
  process.env.SIP_AGENT_SERVER_URL || "http://localhost:4000";

async function sipFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${SIP_AGENT_SERVER_URL}/api${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
    signal: AbortSignal.timeout(10_000),
  });
}

/** Résout restaurantId → agentId */
async function resolveAgentId(restaurantId: string): Promise<string | null> {
  const ds = await getDb();
  const restaurant = await ds.getRepository<Restaurant>("restaurants").findOneBy({ id: restaurantId });
  return restaurant?.agentId || null;
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

  const agentId = await resolveAgentId(restaurantId);
  if (!agentId) {
    return NextResponse.json({ error: "Restaurant non provisionné" }, { status: 404 });
  }

  const params = new URLSearchParams({ agentId });
  if (status) params.set("status", status);
  if (forPrompt) params.set("for_prompt", forPrompt);

  const resp = await sipFetch(`/faqs?${params}`);
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

  const agentId = await resolveAgentId(restaurantId);
  if (!agentId) {
    return NextResponse.json({ error: "Restaurant non provisionné" }, { status: 404 });
  }

  const resp = await sipFetch("/faqs", {
    method: "POST",
    body: JSON.stringify({ agentId, question, category, callerPhone }),
  });

  const data = await resp.json();
  return NextResponse.json(data, { status: resp.status });
}

// ============================================================
// PATCH — Le restaurateur répond ou ignore
// ============================================================

export async function PATCH(req: NextRequest) {
  const { id, answer, status } = await req.json();

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const updateBody: Record<string, any> = {};
  if (answer !== undefined) updateBody.answer = answer;
  if (status) updateBody.status = status;

  const resp = await sipFetch(`/faqs/${id}`, {
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

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const resp = await sipFetch(`/faqs/${id}`, { method: "DELETE" });
  const data = await resp.json();
  return NextResponse.json(data, { status: resp.status });
}
