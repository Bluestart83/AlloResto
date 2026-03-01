"use server";

import { getDb } from "@/lib/db";
import type { Restaurant } from "@/db/entities/Restaurant";

const SIP_AGENT_SERVER_URL =
  process.env.SIP_AGENT_SERVER_URL || "http://localhost:4000";

async function resolveAgentToken(restaurantId: string): Promise<string | null> {
  const ds = await getDb();
  const restaurant = await ds.getRepository<Restaurant>("restaurants").findOneBy({ id: restaurantId });
  return restaurant?.agentApiToken || null;
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

export async function fetchFaqs(restaurantId: string, status?: string) {
  const token = await resolveAgentToken(restaurantId);
  if (!token) return [];

  const params = new URLSearchParams();
  if (status && status !== "all") params.set("status", status);
  const qs = params.toString() ? `?${params}` : "";

  const resp = await sipFetch(`/faqs${qs}`, token);
  if (!resp.ok) return [];
  return resp.json();
}

export async function addFaq(restaurantId: string, question: string, category: string, answer?: string) {
  const token = await resolveAgentToken(restaurantId);
  if (!token) return null;

  const resp = await sipFetch("/faqs", token, {
    method: "POST",
    body: JSON.stringify({ question, category }),
  });
  if (!resp.ok) return null;
  const created = await resp.json();

  // If answer provided, update immediately
  if (answer?.trim() && created.id) {
    await sipFetch(`/faqs/${created.id}`, token, {
      method: "PUT",
      body: JSON.stringify({ answer }),
    });
  }

  return created;
}

export async function updateFaq(restaurantId: string, id: string, updates: { answer?: string; status?: string }) {
  const token = await resolveAgentToken(restaurantId);
  if (!token) return null;

  const resp = await sipFetch(`/faqs/${id}`, token, {
    method: "PUT",
    body: JSON.stringify(updates),
  });
  if (!resp.ok) return null;
  return resp.json();
}

export async function deleteFaq(restaurantId: string, id: string) {
  const token = await resolveAgentToken(restaurantId);
  if (!token) return false;

  const resp = await sipFetch(`/faqs/${id}`, token, { method: "DELETE" });
  return resp.ok;
}

export async function importFaqs(restaurantId: string, items: { question: string; answer?: string; category?: string }[]) {
  const token = await resolveAgentToken(restaurantId);
  if (!token) return { created: 0, updated: 0 };

  const resp = await sipFetch("/faqs/import", token, {
    method: "POST",
    body: JSON.stringify({ items }),
  });
  if (!resp.ok) return { created: 0, updated: 0 };
  return resp.json();
}
