import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import type { Restaurant } from "./Restaurant";
import type { DiningRoom } from "./DiningRoom";

@Entity("dining_tables")
export class DiningTable {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "restaurant_id", type: "varchar" })
  restaurantId!: string;

  @ManyToOne(() => require("./Restaurant").Restaurant, "diningTables")
  @JoinColumn({ name: "restaurant_id" })
  restaurant!: Restaurant;

  @Column({ name: "dining_room_id", type: "varchar" })
  diningRoomId!: string;

  @ManyToOne(() => require("./DiningRoom").DiningRoom, "tables")
  @JoinColumn({ name: "dining_room_id" })
  diningRoom!: DiningRoom;

  @Column({ name: "table_number", type: "varchar", length: 20 })
  tableNumber!: string;

  @Column({ type: "int" })
  seats!: number;

  @Column({ name: "min_seats", type: "int", default: 1 })
  minSeats!: number;

  @Column({ name: "max_seats", type: "int", nullable: true })
  maxSeats!: number | null;

  @Column({ name: "is_combinable", type: "boolean", default: false })
  isCombinable!: boolean;

  @Column({ name: "is_active", type: "boolean", default: true })
  isActive!: boolean;

  @Column({ name: "display_order", type: "int", default: 0 })
  displayOrder!: number;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
