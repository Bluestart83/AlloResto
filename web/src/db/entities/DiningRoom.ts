import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from "typeorm";
import { Restaurant } from "./Restaurant";
import { DiningTable } from "./DiningTable";

@Entity("dining_rooms")
export class DiningRoom {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "restaurant_id", type: "varchar" })
  restaurantId!: string;

  @ManyToOne(() => Restaurant, r => r.diningRooms)
  @JoinColumn({ name: "restaurant_id" })
  restaurant!: Restaurant;

  @Column({ type: "varchar", length: 100 })
  name!: string;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  @Column({ name: "display_order", type: "int", default: 0 })
  displayOrder!: number;

  // --- Sync plateformes ---
  @Column({ type: "varchar", length: 30, nullable: true })
  type!: string | null;

  @Column({ type: "int", nullable: true })
  capacity!: number | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  @OneToMany(() => DiningTable, dt => dt.diningRoom)
  tables!: DiningTable[];
}
