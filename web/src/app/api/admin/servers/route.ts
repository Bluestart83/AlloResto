import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { ROLE_ADMIN } from "@/lib/roles";

const SIP_AGENT_SERVER_URL =
  process.env.SIP_AGENT_SERVER_URL || "http://localhost:4000";
const SIP_ACCOUNT_API_KEY = process.env.SIP_ACCOUNT_API_KEY || "";

function apiHeaders(): HeadersInit {
  return {
    "Content-Type": "application/json",
    ...(SIP_ACCOUNT_API_KEY ? { "X-API-Key": SIP_ACCOUNT_API_KEY } : {}),
  };
}

interface AgentInfo {
  id: string;
  name: string;
  transportType: string;
  isActive: boolean;
  pauseReason: string | null;
  externalSessionUrl: string | null;
}

interface BridgeInfo {
  phoneLineId: string;
  agentId: string;
  host: string;
  wsUrl: string;
  sipRegistered: boolean;
  lastCodec: string;
}

/**
 * GET /api/admin/servers
 * Returns agents + bridges + active calls from sip-agent-server.
 * No worker info exposed — internal to the platform.
 */
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  if (session.user.role !== ROLE_ADMIN) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  let agents: AgentInfo[] = [];
  let bridges: BridgeInfo[] = [];
  let activeCalls: Record<string, number> = {};
  let serverOnline = false;

  try {
    console.log("[admin/servers] Fetching from:", SIP_AGENT_SERVER_URL);
    console.log("[admin/servers] API key present:", !!SIP_ACCOUNT_API_KEY, "length:", SIP_ACCOUNT_API_KEY.length);
    console.log("[admin/servers] Headers:", JSON.stringify(apiHeaders()));

    const [agentsResp, bridgesResp] = await Promise.all([
      fetch(`${SIP_AGENT_SERVER_URL}/api/agents`, {
        headers: apiHeaders(),
        signal: AbortSignal.timeout(5000),
      }),
      fetch(`${SIP_AGENT_SERVER_URL}/api/bridges`, {
        headers: apiHeaders(),
        signal: AbortSignal.timeout(5000),
      }),
    ]);

    console.log("[admin/servers] agents response:", agentsResp.status, agentsResp.statusText);
    console.log("[admin/servers] bridges response:", bridgesResp.status, bridgesResp.statusText);

    if (agentsResp.ok) {
      agents = await agentsResp.json();
      console.log("[admin/servers] agents count:", agents.length);
      serverOnline = true;
    } else {
      const text = await agentsResp.text();
      console.log("[admin/servers] agents error body:", text.substring(0, 500));
    }

    if (bridgesResp.ok) {
      const data = await bridgesResp.json();
      bridges = data.bridges || [];
      activeCalls = data.activeCalls || {};
      console.log("[admin/servers] bridges count:", bridges.length);
    } else {
      const text = await bridgesResp.text();
      console.log("[admin/servers] bridges error body:", text.substring(0, 500));
    }
  } catch (err) {
    console.error("[admin/servers] FETCH ERROR:", err);
  }

  return NextResponse.json({ agents, bridges, activeCalls, serverOnline });
}
