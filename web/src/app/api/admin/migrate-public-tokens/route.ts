import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import type { Restaurant } from "@/db/entities/Restaurant";
import { Not, IsNull } from "typeorm";

const SIP_AGENT_SERVER_URL =
  process.env.SIP_AGENT_SERVER_URL || "http://localhost:4000";
const SIP_ACCOUNT_API_KEY = process.env.SIP_ACCOUNT_API_KEY || "";

/**
 * One-shot migration: fetch publicToken from sip-agent-server for each restaurant
 * that has an agentId but no agentPublicToken.
 *
 * GET /api/admin/migrate-public-tokens
 */
export async function GET() {
  const ds = await getDb();
  const repo = ds.getRepository<Restaurant>("restaurants");

  const restaurants = await repo.find({
    where: { agentId: Not(IsNull()) },
  });

  const toMigrate = restaurants.filter((r) => r.agentId && !r.agentPublicToken);

  if (toMigrate.length === 0) {
    return NextResponse.json({ message: "Tous les restaurants ont déjà un publicToken", total: restaurants.length });
  }

  const results: { id: string; name: string; status: string }[] = [];

  for (const r of toMigrate) {
    try {
      const resp = await fetch(`${SIP_AGENT_SERVER_URL}/api/agents/${r.agentId}`, {
        headers: {
          "Content-Type": "application/json",
          ...(SIP_ACCOUNT_API_KEY ? { "X-API-Key": SIP_ACCOUNT_API_KEY } : {}),
        },
        signal: AbortSignal.timeout(10_000),
      });

      if (!resp.ok) {
        results.push({ id: r.id, name: r.name, status: `error: ${resp.status}` });
        continue;
      }

      const agent = (await resp.json()) as { publicToken?: string; apiToken?: string };

      if (agent.publicToken) {
        r.agentPublicToken = agent.publicToken;
        // Also sync agentApiToken if missing
        if (!r.agentApiToken && agent.apiToken) {
          r.agentApiToken = agent.apiToken;
        }
        await repo.save(r);
        results.push({ id: r.id, name: r.name, status: "migrated" });
      } else {
        results.push({ id: r.id, name: r.name, status: "no publicToken on agent" });
      }
    } catch (err: any) {
      results.push({ id: r.id, name: r.name, status: `error: ${err.message}` });
    }
  }

  const migrated = results.filter((r) => r.status === "migrated").length;
  return NextResponse.json({ migrated, total: toMigrate.length, results });
}
