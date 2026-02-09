/**
 * GET /api/ai/prompt?restaurantId=xxx&callerPhone=0612345678
 *
 * Appelé par le SIP service Python à chaque nouvel appel entrant.
 * Retourne le system prompt complet avec le menu, les prix,
 * le contexte client, et les tools (function calling).
 */

import { NextRequest, NextResponse } from "next/server";
import { buildAiSessionConfig } from "@/services/ai-prompt.service";

export async function GET(req: NextRequest) {
  const restaurantId = req.nextUrl.searchParams.get("restaurantId");
  const callerPhone = req.nextUrl.searchParams.get("callerPhone") || "";

  if (!restaurantId) {
    return NextResponse.json(
      { error: "restaurantId required" },
      { status: 400 }
    );
  }

  try {
    const config = await buildAiSessionConfig(restaurantId, callerPhone);
    return NextResponse.json(config);
  } catch (error: any) {
    console.error("AI prompt build error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to build AI config" },
      { status: 500 }
    );
  }
}
