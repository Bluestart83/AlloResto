import { NextResponse } from "next/server";

const SIP_AGENT_SERVER_URL =
  process.env.SIP_AGENT_SERVER_URL || "http://localhost:4000";

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
  let agents: AgentInfo[] = [];
  let bridges: BridgeInfo[] = [];
  let activeCalls: Record<string, number> = {};
  let serverOnline = false;

  try {
    const [agentsResp, bridgesResp] = await Promise.all([
      fetch(`${SIP_AGENT_SERVER_URL}/api/agents`, {
        signal: AbortSignal.timeout(3000),
      }),
      fetch(`${SIP_AGENT_SERVER_URL}/api/bridges`, {
        signal: AbortSignal.timeout(3000),
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
