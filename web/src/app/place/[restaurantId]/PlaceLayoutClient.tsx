"use client";

import { useEffect, useState } from "react";
import Sidebar from "@/components/ui/Sidebar";

interface Props {
  restaurantId: string;
  children: React.ReactNode;
}

export default function PlaceLayoutClient({ restaurantId, children }: Props) {
  const [restaurantName, setRestaurantName] = useState<string>("");

  useEffect(() => {
    fetch("/api/restaurants")
      .then((r) => r.json())
      .then((data: any[]) => {
        const found = data.find((r: any) => r.id === restaurantId);
        if (found) setRestaurantName(found.name);
      })
      .catch(() => {});
  }, [restaurantId]);

  return (
    <div className="d-flex">
      <Sidebar restaurantId={restaurantId} restaurantName={restaurantName} />
      <div className="main-content flex-grow-1">{children}</div>
    </div>
  );
}
