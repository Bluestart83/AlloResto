import { fetchCalls } from "./actions";
import CallsClient from "./CallsClient";

interface PageProps {
  params: Promise<{ restaurantId: string }>;
}

export default async function CallsPage({ params }: PageProps) {
  const { restaurantId } = await params;
  const initialCalls = await fetchCalls(restaurantId);

  return <CallsClient restaurantId={restaurantId} initialCalls={Array.isArray(initialCalls) ? initialCalls : []} />;
}
