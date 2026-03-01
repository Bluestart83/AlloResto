import { NextRequest, NextResponse } from "next/server";

// ─── POST /api/calls — webhook onCallEnd (from sip-agent-server) ────────────
// Called at end of each call. Calls are stored in sip-agent-server (CallRecord).
// This endpoint handles AlloResto-specific side effects if needed.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const restaurantId = body.restaurantId || body.finalContext?.restaurant_id;

  if (!restaurantId) {
    return NextResponse.json({ error: "restaurantId required" }, { status: 400 });
  }

  // Calls are stored in sip-agent-server. Nothing to persist locally.
  // Future: could trigger notifications, update local caches, etc.

  return NextResponse.json({ ok: true });
}
