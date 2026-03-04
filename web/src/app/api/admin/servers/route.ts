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

    if (agentsResp.ok) {
      agents = await agentsResp.json();
      serverOnline = true;
    }

    if (bridgesResp.ok) {
      const data = await bridgesResp.json();
      bridges = data.bridges || [];
      activeCalls = data.activeCalls || {};
    }
  } catch {
    // sip-agent-server is offline
  }

  return NextResponse.json({ agents, bridges, activeCalls, serverOnline });
}
