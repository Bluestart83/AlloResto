import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { PhoneLine } from "@/db/entities/PhoneLine";
import { Restaurant } from "@/db/entities/Restaurant";
import { encryptSipPassword, isEncrypted } from "@/services/sip-encryption.service";

/**
 * GET /api/phone-lines?restaurantId=xxx
 * Retourne la phone line d'un restaurant (sans le mot de passe en clair).
 */
export async function GET(req: NextRequest) {
  const restaurantId = req.nextUrl.searchParams.get("restaurantId");
  if (!restaurantId) {
    return NextResponse.json({ error: "restaurantId requis" }, { status: 400 });
  }

  const ds = await getDb();
  const phoneLine = await ds.getRepository(PhoneLine).findOneBy({ restaurantId });
  const restaurant = await ds.getRepository(Restaurant).findOneBy({ id: restaurantId });

  if (!restaurant) {
    return NextResponse.json({ error: "Restaurant non trouvé" }, { status: 404 });
  }

  return NextResponse.json({
    phoneLine: phoneLine
      ? {
          id: phoneLine.id,
          phoneNumber: phoneLine.phoneNumber,
          provider: phoneLine.provider,
          sipDomain: phoneLine.sipDomain,
          sipUsername: phoneLine.sipUsername,
          hasSipPassword: !!phoneLine.sipPassword,
          twilioTrunkSid: phoneLine.twilioTrunkSid,
          isActive: phoneLine.isActive,
        }
      : null,
    sipEnabled: restaurant.sipEnabled,
    sipBridge: restaurant.sipBridge,
  });
}

/**
 * PUT /api/phone-lines
 * Crée ou met à jour la phone line + sipBridge d'un restaurant.
 */
export async function PUT(req: NextRequest) {
  const body = await req.json();
  const {
    restaurantId,
    phoneNumber,
    provider,
    sipDomain,
    sipUsername,
    sipPassword,
    twilioTrunkSid,
    isActive,
    sipEnabled,
    sipBridge,
  } = body;

  if (!restaurantId || !phoneNumber) {
    return NextResponse.json(
      { error: "restaurantId et phoneNumber requis" },
      { status: 400 }
    );
  }

  const ds = await getDb();

  // Update sipEnabled + sipBridge on restaurant
  const restaurantUpdate: Record<string, boolean> = {};
  if (sipEnabled !== undefined) restaurantUpdate.sipEnabled = !!sipEnabled;
  if (sipBridge !== undefined) restaurantUpdate.sipBridge = !!sipBridge;
  if (Object.keys(restaurantUpdate).length > 0) {
    await ds.getRepository(Restaurant).update(restaurantId, restaurantUpdate);
  }

  // Upsert phone line
  const repo = ds.getRepository(PhoneLine);
  let phoneLine = await repo.findOneBy({ restaurantId });

  if (!phoneLine) {
    phoneLine = repo.create({
      restaurantId,
      phoneNumber,
      provider: provider || "twilio",
    } as Partial<PhoneLine>) as PhoneLine;
  }

  phoneLine.phoneNumber = phoneNumber;
  if (provider !== undefined) phoneLine.provider = provider;
  if (sipDomain !== undefined) phoneLine.sipDomain = sipDomain || null;
  if (sipUsername !== undefined) phoneLine.sipUsername = sipUsername || null;
  if (twilioTrunkSid !== undefined) phoneLine.twilioTrunkSid = twilioTrunkSid || null;
  if (isActive !== undefined) phoneLine.isActive = isActive;

  // Encrypt password if provided (non-empty string)
  if (sipPassword) {
    // Save first to get the ID for encryption salt
    phoneLine = await repo.save(phoneLine);
    phoneLine.sipPassword = encryptSipPassword(sipPassword, phoneLine.id);
  }

  await repo.save(phoneLine);

  return NextResponse.json({
    ok: true,
    phoneLineId: phoneLine.id,
    phoneLine: {
      id: phoneLine.id,
      hasSipPassword: !!phoneLine.sipPassword,
    },
  });
}
