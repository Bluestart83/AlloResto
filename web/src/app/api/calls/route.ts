import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { Call, type CallOutcome } from "@/db/entities/Call";

// GET /api/calls?restaurantId=xxx&limit=20
export async function GET(req: NextRequest) {
  const ds = await getDb();
  const restaurantId = req.nextUrl.searchParams.get("restaurantId");
  const limit = parseInt(req.nextUrl.searchParams.get("limit") || "20");

  if (!restaurantId) {
    return NextResponse.json({ error: "restaurantId required" }, { status: 400 });
  }

  // Cleanup: marquer abandoned les appels in_progress dépassant MAX_CALL_DURATION
  const maxDuration = parseInt(process.env.MAX_CALL_DURATION || "600");
  const cutoff = new Date(Date.now() - maxDuration * 1000);
  const repo = ds.getRepository(Call);
  const stale = await repo.find({
    where: { restaurantId, outcome: "in_progress" },
  });
  for (const call of stale) {
    if (new Date(call.startedAt) < cutoff) {
      await repo.update(call.id, {
        outcome: "abandoned",
        endedAt: new Date(new Date(call.startedAt).getTime() + maxDuration * 1000),
        durationSec: maxDuration,
      });
    }
  }

  const calls = await repo.find({
    where: { restaurantId },
    relations: ["customer"],
    order: { startedAt: "DESC" },
    take: limit,
  });

  return NextResponse.json(calls);
}

// POST /api/calls — créer un log d'appel (appelé par sip-agent-server webhook)
export async function POST(req: NextRequest) {
  const ds = await getDb();
  const body = await req.json();

  // Map CallSessionResult fields → Call entity fields
  const ctx = body.finalContext || {};
  const tokens = body.costs?.tokens || {};
  const toolCalls: any[] = body.toolCalls || [];

  // Determine outcome from tool calls
  let outcome: CallOutcome = "in_progress";
  const toolNames = toolCalls.map((tc: any) => tc.name);
  if (toolNames.includes("confirm_order")) {
    outcome = "order_placed";
  } else if (toolNames.includes("confirm_reservation")) {
    outcome = "reservation_placed";
  } else if (toolNames.includes("leave_message")) {
    outcome = "message_left";
  } else if (body.outcome === "completed") {
    outcome = "info_only";
  } else if (body.outcome === "error") {
    outcome = "error";
  } else if (body.outcome === "abandoned") {
    outcome = "abandoned";
  }

  const restaurantId = body.restaurantId || ctx.restaurant_id;

  if (!restaurantId) {
    return NextResponse.json({ error: "restaurantId required (body or finalContext)" }, { status: 400 });
  }

  const call = ds.getRepository(Call).create({
    restaurantId,
    customerId: body.customerId || ctx.customer_id || null,
    callerNumber: body.callerPhone || body.callerNumber || "",
    startedAt: body.startedAt || new Date(),
    endedAt: body.endedAt || null,
    durationSec: body.durationSec || null,
    transcript: body.transcript || [],
    outcome,
    costAi: body.costs?.costTotal || body.costAi || 0,
    costCurrency: body.costs?.costCurrency || body.costCurrency || "EUR",
    aiModel: body.aiModel || null,
    inputTokens: tokens.inputTokens || body.inputTokens || 0,
    outputTokens: tokens.outputTokens || body.outputTokens || 0,
    inputAudioTokens: tokens.inputAudioTokens || body.inputAudioTokens || 0,
    outputAudioTokens: tokens.outputAudioTokens || body.outputAudioTokens || 0,
  } as Partial<Call>) as Call;

  const saved = await ds.getRepository(Call).save(call);
  return NextResponse.json(saved, { status: 201 });
}

// PATCH /api/calls — mettre à jour un appel (fin d'appel, outcome, transcript)
export async function PATCH(req: NextRequest) {
  const ds = await getDb();
  const body = await req.json();
  const { id, ...updates } = body;

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  await ds.getRepository(Call).update(id, updates);
  const updated = await ds.getRepository(Call).findOneBy({ id });

  return NextResponse.json(updated);
}
