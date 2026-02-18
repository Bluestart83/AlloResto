import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import type { Restaurant } from "@/db/entities/Restaurant";

const SIP_AGENT_SERVER_URL =
  process.env.SIP_AGENT_SERVER_URL || "http://localhost:4000";

/**
 * Proxy public pour le chat widget.
 * /api/chat/:restaurantId/chat/sessions → sip-agent-server /api/chat/sessions
 *
 * Pas d'auth utilisateur — le restaurantId est public (dans l'URL de la page).
 * Le token API de l'agent est injecté côté serveur, jamais exposé au client.
 */
async function proxyChat(
  req: NextRequest,
  { params }: { params: Promise<{ restaurantId: string; path: string[] }> }
) {
  const { restaurantId, path } = await params;

  // Load restaurant + token from DB
  const ds = await getDb();
  const restaurant = await ds
    .getRepository<Restaurant>("restaurants")
    .findOneBy({ id: restaurantId });

  if (!restaurant?.agentApiToken) {
    return NextResponse.json(
      { error: "Restaurant non trouvé ou chat non configuré" },
      { status: 404 }
    );
  }

  // Build target URL: /api/chat/sessions, /api/chat/sessions/:id/messages, etc.
  const targetPath = path.join("/");
  const url = new URL(`/api/${targetPath}`, SIP_AGENT_SERVER_URL);

  // Forward query params
  req.nextUrl.searchParams.forEach((value, key) => {
    url.searchParams.set(key, value);
  });

  // Build request
  const headers: Record<string, string> = {
    Authorization: `Bearer ${restaurant.agentApiToken}`,
  };

  const fetchOpts: RequestInit = {
    method: req.method,
    headers,
    signal: AbortSignal.timeout(60000),
  };

  if (req.method !== "GET" && req.method !== "HEAD") {
    const body = await req.text();
    if (body) {
      fetchOpts.body = body;
      headers["Content-Type"] = "application/json";
    }
  }

  try {
    const resp = await fetch(url.toString(), fetchOpts);
    const contentType = resp.headers.get("content-type") || "";

    // SSE streaming — relay directly
    if (contentType.includes("text/event-stream") && resp.body) {
      return new Response(resp.body, {
        status: resp.status,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    if (resp.status === 204) {
      return new NextResponse(null, { status: 204 });
    }

    const data = contentType.includes("json")
      ? await resp.json()
      : await resp.text();

    return contentType.includes("json")
      ? NextResponse.json(data, { status: resp.status })
      : new NextResponse(data, {
          status: resp.status,
          headers: { "Content-Type": contentType },
        });
  } catch (err) {
    console.error("[chat-proxy]", err);
    return NextResponse.json(
      { error: "Service chat indisponible" },
      { status: 502 }
    );
  }
}

export const GET = proxyChat;
export const POST = proxyChat;
export const DELETE = proxyChat;
