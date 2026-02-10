import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { Restaurant } from "@/db/entities/Restaurant";
import { PhoneLine } from "@/db/entities/PhoneLine";
import { decryptSipPassword, isEncrypted } from "@/services/sip-encryption.service";

/**
 * GET /api/sip/agents
 *
 * Retourne la liste des restaurants actifs nécessitant un service vocal.
 * Utilisé par le service manager Python pour découvrir les agents à démarrer.
 */
export async function GET() {
  const ds = await getDb();

  const restaurants = await ds.getRepository(Restaurant).find({
    where: { isActive: true },
    relations: ["phoneLine"],
  });

  const agents = restaurants
    .filter((r) => r.phoneLine?.isActive)
    .map((r) => {
      const pl = r.phoneLine;
      let sipPassword: string | null = null;

      if (r.sipBridge && pl.sipPassword) {
        sipPassword = isEncrypted(pl.sipPassword)
          ? decryptSipPassword(pl.sipPassword, pl.id)
          : pl.sipPassword;
      }

      return {
        restaurantId: r.id,
        restaurantName: r.name,
        sipBridge: r.sipBridge,
        sipDomain: r.sipBridge ? pl.sipDomain : null,
        sipUsername: r.sipBridge ? pl.sipUsername : null,
        sipPassword,
        phoneNumber: pl.phoneNumber,
        provider: pl.provider,
      };
    });

  return NextResponse.json(agents);
}
