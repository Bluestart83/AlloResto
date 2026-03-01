import { fetchFaqs } from "./actions";
import FaqClient from "./FaqClient";

interface PageProps {
  params: Promise<{ restaurantId: string }>;
}

export default async function FaqPage({ params }: PageProps) {
  const { restaurantId } = await params;
  const initialFaqs = await fetchFaqs(restaurantId);

  return <FaqClient restaurantId={restaurantId} initialFaqs={Array.isArray(initialFaqs) ? initialFaqs : []} />;
}
