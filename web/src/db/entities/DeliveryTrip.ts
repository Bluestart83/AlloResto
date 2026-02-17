import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { Restaurant } from "./Restaurant";

export type TripStatus = "planning" | "in_progress" | "completed" | "cancelled";

export interface TripStop {
  orderId: string;
  sequence: number;
  customerName: string | null;
  customerPhone: string;
  deliveryAddress: string;
  deliveryLat: number;
  deliveryLng: number;
  estimatedArrival: string | null;
  legDistanceKm: number | null;
  legDurationMin: number | null;
  deliveredAt: string | null;
  orderTotal: number;
  itemCount: number;
  notes: string | null;
}

@Entity("delivery_trips")
export class DeliveryTrip {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "restaurant_id", type: "varchar" })
  restaurantId!: string;

  @ManyToOne(() => Restaurant, r => r.deliveryTrips)
  @JoinColumn({ name: "restaurant_id" })
  restaurant!: Restaurant;

  @Column({ type: "varchar", length: 20, default: "planning" })
  status!: TripStatus;

  @Column({ type: "simple-json", default: "[]" })
  stops!: TripStop[];

  @Column({ name: "total_distance_km", type: "decimal", precision: 6, scale: 1, nullable: true })
  totalDistanceKm!: number | null;

  @Column({ name: "total_duration_min", type: "int", nullable: true })
  totalDurationMin!: number | null;

  @Column({ name: "order_count", type: "int", default: 0 })
  orderCount!: number;

  @Column({ name: "google_maps_url", type: "text", nullable: true })
  googleMapsUrl!: string | null;

  @Column({ name: "overview_polyline", type: "text", nullable: true })
  overviewPolyline!: string | null;

  @Column({ name: "started_at", type: "datetime", nullable: true })
  startedAt!: Date | null;

  @Column({ name: "completed_at", type: "datetime", nullable: true })
  completedAt!: Date | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
