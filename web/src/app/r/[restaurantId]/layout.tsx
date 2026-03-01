import { getDb } from "@/lib/db";
import type { Restaurant } from "@/db/entities/Restaurant";
import Script from "next/script";

const WIDGET_BASE_URL =
  process.env.SIP_AGENT_PUBLIC_URL || "http://localhost:4000";

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ restaurantId: string }>;
}

export default async function PublicRestaurantLayout({
  children,
  params,
}: LayoutProps) {
  const { restaurantId } = await params;

  const ds = await getDb();
  const restaurant = await ds
    .getRepository<Restaurant>("restaurants")
    .findOneBy({ id: restaurantId });

  const chatEnabled = !!restaurant?.agentPublicToken;

  return (
    <div className="public-page">
      {children}
      <footer className="public-footer text-center py-4 text-muted small border-top mt-5">
        Propulse par <strong>AlloResto</strong>
      </footer>
      {chatEnabled && (
        <Script
          src={`${WIDGET_BASE_URL}/widget/chat.js`}
          data-agent-token={restaurant.agentPublicToken!}
          data-lang="fr"
          data-position="bottom-right"
          strategy="afterInteractive"
        />
      )}
    </div>
  );
}
