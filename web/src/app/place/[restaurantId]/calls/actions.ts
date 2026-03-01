"use server";

import { getDb } from "@/lib/db";
import type { Restaurant } from "@/db/entities/Restaurant";
import type { Customer } from "@/db/entities/Customer";

const SIP_AGENT_SERVER_URL =
  process.env.SIP_AGENT_SERVER_URL || "http://localhost:4000";

async function resolveRestaurant(restaurantId: string) {
  const ds = await getDb();
  return ds.getRepository<Restaurant>("restaurants").findOneBy({ id: restaurantId });
}

async function sipFetch(path: string, agentToken: string, init?: RequestInit): Promise<Response> {
  return fetch(`${SIP_AGENT_SERVER_URL}/api${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${agentToken}`,
      ...(init?.headers as Record<string, string>),
    },
    signal: AbortSignal.timeout(10_000),
  });
}

/**
 * Map sip-agent-server generic outcomes → AlloResto specific outcomes.
 * sip-agent-server uses: completed, abandoned, error, in_progress, transferred, no_balance
 * AlloResto UI expects: order_placed, reservation_placed, message_left, info_only, abandoned, error, in_progress
 */
function mapOutcome(outcome: string, toolCalls?: { name: string }[]): string {
  if (outcome === "in_progress") return "in_progress";
  if (outcome === "abandoned") return "abandoned";
  if (outcome === "error" || outcome === "no_balance") return "error";

  const toolNames = (toolCalls || []).map((tc) => tc.name);
  if (toolNames.includes("confirm_order")) return "order_placed";
  if (toolNames.includes("confirm_reservation")) return "reservation_placed";
  if (toolNames.includes("leave_message")) return "message_left";
  return "info_only";
}

export async function fetchCalls(restaurantId: string, limit = 100) {
  const restaurant = await resolveRestaurant(restaurantId);
  if (!restaurant?.agentApiToken) return [];

  const params = new URLSearchParams({ limit: String(limit) });
  const resp = await sipFetch(`/calls?${params}`, restaurant.agentApiToken);
  if (!resp.ok) return [];

  const calls: any[] = await resp.json();

  // Enrich: map outcomes + resolve customers from local DB
  const ds = await getDb();
  const callerNumbers = [...new Set(calls.map((c) => c.callerNumber).filter(Boolean))];
  const customerMap = new Map<string, any>();

  if (callerNumbers.length > 0) {
    const customers = await ds.getRepository<Customer>("customers").find({
      where: callerNumbers.map((phone) => ({ restaurantId, phone })),
    });
    for (const c of customers) {
      customerMap.set(c.phone, { firstName: c.firstName, lastName: c.lastName, phone: c.phone });
    }
  }

  return calls.map((call) => ({
    ...call,
    outcome: mapOutcome(call.outcome, call.toolCalls),
    customer: customerMap.get(call.callerNumber) || null,
  }));
}
