/**
 * Auto-provisioning d'agents dans sip-agent-server.
 *
 * Quand un restaurant est cree dans AlloResto, ce service appelle l'API
 * de sip-agent-server pour creer un Account (si absent), un FinalCustomer,
 * un Agent, et les 12 ToolConfigs associes.
 *
 * Fire-and-forget : les erreurs sont loguees, jamais propagees.
 * Le restaurant est cree quoi qu'il arrive.
 */

import { ALLORESTO_TOOL_DEFINITIONS } from "./sip-agent-tool-definitions";

const SIP_AGENT_SERVER_URL =
  process.env.SIP_AGENT_SERVER_URL || "http://localhost:4000";
const ALLORESTO_URL =
  process.env.ALLORESTO_CALLBACK_URL || "http://alloresto:3000";

const ACCOUNT_NAME = "AlloResto";
const ACCOUNT_EMAIL = "admin@alloresto.local";

let cachedAccountId: string | null = null;

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function sipFetch(
  path: string,
  init?: RequestInit
): Promise<Response> {
  return fetch(`${SIP_AGENT_SERVER_URL}/api${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
    signal: AbortSignal.timeout(10_000),
  });
}

// ─── Account ──────────────────────────────────────────────────────────────────

async function ensureAccount(): Promise<string> {
  if (cachedAccountId) return cachedAccountId;

  // Cherche un account existant
  const listResp = await sipFetch("/accounts");
  if (listResp.ok) {
    const accounts = (await listResp.json()) as { id: string; name: string }[];
    const existing = accounts.find((a) => a.name === ACCOUNT_NAME);
    if (existing) {
      cachedAccountId = existing.id;
      return existing.id;
    }
  }

  // Crée le compte
  const createResp = await sipFetch("/accounts", {
    method: "POST",
    body: JSON.stringify({
      name: ACCOUNT_NAME,
      email: ACCOUNT_EMAIL,
      isActive: true,
    }),
  });

  if (!createResp.ok) {
    const text = await createResp.text();
    throw new Error(`Account creation failed (${createResp.status}): ${text}`);
  }

  const account = (await createResp.json()) as { id: string };
  cachedAccountId = account.id;
  console.log(`[sip-provisioning] Account created: ${account.id}`);
  return account.id;
}

// ─── FinalCustomer ───────────────────────────────────────────────────────────

async function ensureFinalCustomer(
  accountId: string,
  restaurant: { id: string; name: string; contactEmail?: string | null; phone?: string | null }
): Promise<string> {
  const createResp = await sipFetch("/final-customers", {
    method: "POST",
    body: JSON.stringify({
      accountId,
      name: restaurant.name,
      email: restaurant.contactEmail || null,
      phone: restaurant.phone || null,
      currency: "EUR",
      costMarginPct: 30,
      isActive: true,
    }),
  });

  if (!createResp.ok) {
    const text = await createResp.text();
    throw new Error(`FinalCustomer creation failed (${createResp.status}): ${text}`);
  }

  const fc = (await createResp.json()) as { id: string };
  console.log(`[sip-provisioning] FinalCustomer created: ${fc.id}`);
  return fc.id;
}

// ─── Agent ────────────────────────────────────────────────────────────────────

export async function provisionAgent(restaurant: {
  id: string;
  name: string;
  aiVoice: string;
  timezone: string;
  contactEmail?: string | null;
  phone?: string | null;
  sip?: {
    domain: string;
    username: string;
    password: string;
  } | null;
}): Promise<{ agentId: string | null; finalCustomerId: string | null }> {
  try {
    const accountId = await ensureAccount();

    // Crée le FinalCustomer
    const finalCustomerId = await ensureFinalCustomer(accountId, restaurant);

    // Crée l'agent
    const agentResp = await sipFetch("/agents", {
      method: "POST",
      body: JSON.stringify({
        accountId,
        finalCustomerId,
        name: restaurant.name,
        basePrompt: "",
        aiModel: "gpt-realtime",
        aiVoice: restaurant.aiVoice || "sage",
        vadThreshold: 0.5,
        vadSilenceMs: 500,
        vadPrefixPaddingMs: 300,
        temperature: 0.7,
        transportType: "sip_bridge",
        timezone: restaurant.timezone || "Europe/Paris",
        apiBaseUrl: ALLORESTO_URL,
        maxCallDurationSec: 600,
        onCallEndWebhook: `${ALLORESTO_URL}/api/calls`,
        externalSessionUrl: `${ALLORESTO_URL}/api/ai?restaurantId={{config.restaurantId}}&callerPhone={{callerPhone}}`,
        config: { restaurantId: restaurant.id },
        sipDomain: restaurant.sip?.domain || null,
        sipUsername: restaurant.sip?.username || null,
        sipPassword: restaurant.sip?.password || null,
        isActive: true,
      }),
    });

    if (!agentResp.ok) {
      const text = await agentResp.text();
      console.error(
        `[sip-provisioning] Agent creation failed (${agentResp.status}): ${text}`
      );
      return { agentId: null, finalCustomerId };
    }

    const agent = (await agentResp.json()) as {
      id: string;
      apiToken: string;
    };
    console.log(
      `[sip-provisioning] Agent created: ${agent.id} (token: ${agent.apiToken})`
    );

    // Crée les 12 ToolConfigs
    for (const toolDef of ALLORESTO_TOOL_DEFINITIONS) {
      const toolResp = await sipFetch(`/agents/${agent.id}/tools`, {
        method: "POST",
        body: JSON.stringify({
          name: toolDef.name,
          description: toolDef.description,
          parameters: toolDef.parameters,
          http: toolDef.http,
          contextUpdates: toolDef.contextUpdates || null,
          extraCostResponseField: toolDef.extraCostResponseField || null,
          triggersHangup: toolDef.triggersHangup || false,
          triggersTransfer: toolDef.triggersTransfer || false,
          mutesClientAudio: toolDef.mutesClientAudio || false,
          skipResponseCreate: toolDef.skipResponseCreate || false,
          isEnabled: true,
          sortOrder: toolDef.sortOrder,
        }),
      });

      if (!toolResp.ok) {
        console.error(
          `[sip-provisioning] Tool ${toolDef.name} creation failed: ${toolResp.status}`
        );
      }
    }

    console.log(
      `[sip-provisioning] ${ALLORESTO_TOOL_DEFINITIONS.length} tools created for agent ${agent.id}`
    );
    return { agentId: agent.id, finalCustomerId };
  } catch (err) {
    console.error("[sip-provisioning] Provisioning failed:", err);
    return { agentId: null, finalCustomerId: null };
  }
}

// ─── Update ───────────────────────────────────────────────────────────────────

export async function updateAgent(
  agentId: string,
  updates: {
    name?: string;
    aiVoice?: string;
    timezone?: string;
    sipDomain?: string;
    sipUsername?: string;
    sipPassword?: string;
  }
): Promise<void> {
  try {
    const resp = await sipFetch(`/agents/${agentId}`, {
      method: "PUT",
      body: JSON.stringify(updates),
    });

    if (!resp.ok) {
      console.error(
        `[sip-provisioning] Agent update failed: ${resp.status}`
      );
    }
  } catch (err) {
    console.error("[sip-provisioning] Agent update failed:", err);
  }
}
