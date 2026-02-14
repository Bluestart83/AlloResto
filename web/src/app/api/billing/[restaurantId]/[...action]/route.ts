import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { ROLE_ADMIN } from "@/lib/roles";
import { getDb } from "@/lib/db";
import { Restaurant } from "@/db/entities/Restaurant";

const SIP_AGENT_SERVER_URL =
  process.env.SIP_AGENT_SERVER_URL || "http://localhost:4000";

/**
 * Billing proxy: /api/billing/:restaurantId/:action* → sip-agent-server
 *
 * - Verifie la session Better Auth
 * - Verifie que l'utilisateur a acces au restaurant (admin ou owner)
 * - Recupere le finalCustomerId du restaurant
 * - Forward vers /api/final-customers/:finalCustomerId/billing/:action*
 */
async function proxyRequest(
  req: NextRequest,
  { params }: { params: Promise<{ restaurantId: string; action: string[] }> }
) {
  // ── Auth check ──
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Non authentifie" }, { status: 401 });
  }

  const { restaurantId, action } = await params;

  // Verifier acces au restaurant
  const user = session.user as Record<string, unknown>;
  if (user.role !== ROLE_ADMIN && user.restaurantId !== restaurantId) {
    return NextResponse.json({ error: "Acces refuse" }, { status: 403 });
  }

  // Charger le restaurant pour obtenir finalCustomerId
  const ds = await getDb();
  const restaurant = await ds.getRepository(Restaurant).findOneBy({ id: restaurantId });
  if (!restaurant) {
    return NextResponse.json({ error: "Restaurant introuvable" }, { status: 404 });
  }
  if (!restaurant.finalCustomerId) {
    return NextResponse.json(
      { error: "Facturation non configuree pour ce restaurant" },
      { status: 404 }
    );
  }

  // ── Build target URL ──
  const actionPath = action.join("/");
  const url = new URL(
    `/api/final-customers/${restaurant.finalCustomerId}/billing/${actionPath}`,
    SIP_AGENT_SERVER_URL
  );

  // Forward query params
  req.nextUrl.searchParams.forEach((value, key) => {
    url.searchParams.set(key, value);
  });

  // ── Forward request ──
  const fetchOpts: RequestInit = {
    method: req.method,
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(15000),
  };

  if (req.method !== "GET" && req.method !== "HEAD") {
    const body = await req.text();
    if (body) fetchOpts.body = body;
  }

  try {
    const resp = await fetch(url.toString(), fetchOpts);
    const contentType = resp.headers.get("content-type") || "";

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
    console.error("[billing-proxy]", err);
    return NextResponse.json(
      { error: "Service billing indisponible" },
      { status: 502 }
    );
  }
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
export const DELETE = proxyRequest;
