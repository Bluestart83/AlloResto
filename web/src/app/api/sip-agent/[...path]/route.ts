import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { ROLE_ADMIN } from "@/lib/roles";

const SIP_AGENT_SERVER_URL =
  process.env.SIP_AGENT_SERVER_URL || "http://localhost:4000";

const ALLOWED_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

/**
 * Bridge proxy: /api/sip-agent/* → sip-agent-server /api/*
 * - Vérifie la session Better Auth + rôle admin
 * - Forward la requête vers le réseau privé
 * - Le browser ne connaît jamais l'URL du sip-agent-server
 */
async function proxyRequest(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  // ── Auth check ──
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  if (session.user.role !== ROLE_ADMIN) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  // ── Build target URL ──
  const { path } = await params;
  const targetPath = path.join("/");
  const url = new URL(`/api/${targetPath}`, SIP_AGENT_SERVER_URL);

  // Forward query params
  req.nextUrl.searchParams.forEach((value, key) => {
    url.searchParams.set(key, value);
  });

  // ── Forward request ──
  const fetchOpts: RequestInit = {
    method: req.method,
    headers: {
      "Content-Type": "application/json",
    },
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
    console.error("[sip-agent-proxy]", err);
    return NextResponse.json(
      { error: "Service sip-agent-server indisponible" },
      { status: 502 },
    );
  }
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
export const PATCH = proxyRequest;
export const DELETE = proxyRequest;
