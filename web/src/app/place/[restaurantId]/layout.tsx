import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import PlaceLayoutClient from "./PlaceLayoutClient";

interface Props {
  children: React.ReactNode;
  params: Promise<{ restaurantId: string }>;
}

export default async function PlaceLayout({ children, params }: Props) {
  const { restaurantId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) redirect("/login");

  // Restaurant users can only access their own restaurant
  const user = session.user as Record<string, unknown>;
  if (user.role !== "admin" && user.restaurantId !== restaurantId) {
    redirect("/login");
  }

  return (
    <PlaceLayoutClient restaurantId={restaurantId}>
      {children}
    </PlaceLayoutClient>
  );
}
