import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { Restaurant } from "@/db/entities/Restaurant";
import { PhoneLine } from "@/db/entities/PhoneLine";
import { decryptSipPassword } from "@/services/sip-encryption.service";
import {
  provisionAgent,
  updateAgent,
} from "@/services/sip-agent-provisioning.service";

/** Charge les creds SIP depuis la PhoneLine d'un restaurant (déchiffre le mot de passe). */
async function loadSipCreds(restaurantId: string): Promise<{
  domain: string;
  username: string;
  password: string;
} | null> {
  const ds = await getDb();
  const phoneLine = await ds.getRepository(PhoneLine).findOneBy({ restaurantId });
  if (!phoneLine?.sipDomain || !phoneLine?.sipUsername || !phoneLine?.sipPassword) {
    return null;
  }
  try {
    const password = decryptSipPassword(phoneLine.sipPassword, phoneLine.id);
    return {
      domain: phoneLine.sipDomain,
      username: phoneLine.sipUsername,
      password,
    };
  } catch (err) {
    console.error(`[sip-provisioning] Failed to decrypt SIP password for phoneLine ${phoneLine.id}:`, err);
    return null;
  }
}

// GET /api/restaurants — liste (ou un seul si ?id=xxx)
export async function GET(req: NextRequest) {
  const ds = await getDb();
  const id = req.nextUrl.searchParams.get("id");

  if (id) {
    const restaurant = await ds.getRepository(Restaurant).findOneBy({ id });
    if (!restaurant) {
      return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
    }
    return NextResponse.json(restaurant);
  }

  const restaurants = await ds.getRepository(Restaurant).find({
    where: { isActive: true },
    order: { createdAt: "DESC" },
  });
  return NextResponse.json(restaurants);
}

// POST /api/restaurants — créer un restaurant
export async function POST(req: NextRequest) {
  const ds = await getDb();
  const body = await req.json();

  const restaurant = ds.getRepository(Restaurant).create(body as Partial<Restaurant>);
  const saved = await ds.getRepository(Restaurant).save(restaurant) as Restaurant;

  // Auto-provision agent + FinalCustomer dans sip-agent-server
  const sip = await loadSipCreds(saved.id);
  const { agentId, finalCustomerId } = await provisionAgent({
    id: saved.id,
    name: saved.name,
    aiVoice: saved.aiVoice,
    timezone: saved.timezone,
    contactEmail: saved.contactEmail,
    phone: saved.phone,
    sip,
  });
  if (agentId || finalCustomerId) {
    if (agentId) saved.agentId = agentId;
    if (finalCustomerId) saved.finalCustomerId = finalCustomerId;
    await ds.getRepository(Restaurant).save(saved);
  }

  return NextResponse.json(saved, { status: 201 });
}

// PATCH /api/restaurants — mettre à jour un restaurant
export async function PATCH(req: NextRequest) {
  const ds = await getDb();
  const { id, ...updates } = await req.json();

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const restaurant = await ds.getRepository(Restaurant).findOneBy({ id });
  if (!restaurant) {
    return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
  }

  const oldName = restaurant.name;
  const oldVoice = restaurant.aiVoice;
  const oldTimezone = restaurant.timezone;
  const hadAgent = !!restaurant.agentId;

  Object.assign(restaurant, updates);
  const saved = await ds.getRepository(Restaurant).save(restaurant);

  // Pas encore d'agent → provisionner si sipEnabled
  if (!hadAgent && !saved.agentId && saved.sipEnabled) {
    const sip = await loadSipCreds(saved.id);
    const { agentId, finalCustomerId } = await provisionAgent({
      id: saved.id,
      name: saved.name,
      aiVoice: saved.aiVoice,
      timezone: saved.timezone,
      contactEmail: saved.contactEmail,
      phone: saved.phone,
      sip,
    });
    if (agentId || finalCustomerId) {
      if (agentId) saved.agentId = agentId;
      if (finalCustomerId) saved.finalCustomerId = finalCustomerId;
      await ds.getRepository(Restaurant).save(saved);
    }
  }
  // Agent existant → sync nom/voix/timezone si changé
  else if (saved.agentId) {
    const agentUpdates: Record<string, string> = {};
    if (saved.name !== oldName) agentUpdates.name = saved.name;
    if (saved.aiVoice !== oldVoice) agentUpdates.aiVoice = saved.aiVoice;
    if (saved.timezone !== oldTimezone) agentUpdates.timezone = saved.timezone;
    if (Object.keys(agentUpdates).length > 0) {
      await updateAgent(saved.agentId, agentUpdates);
    }
  }

  return NextResponse.json(saved);
}
