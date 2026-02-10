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

  @ManyToOne("Restaurant", "diningTables")
  @JoinColumn({ name: "restaurant_id" })
  restaurant!: Restaurant;

  @Column({ name: "dining_room_id", type: "varchar" })
  diningRoomId!: string;

  @ManyToOne("DiningRoom", "tables")
  @JoinColumn({ name: "dining_room_id" })
  diningRoom!: DiningRoom;

  @Column({ name: "table_number", type: "varchar", length: 20 })
  tableNumber!: string;

  @Column({ type: "int" })
  seats!: number;

  @Column({ name: "is_active", type: "boolean", default: true })
  isActive!: boolean;

  @Column({ name: "display_order", type: "int", default: 0 })
  displayOrder!: number;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
