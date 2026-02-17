import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import type { Order } from "./Order";
import type { MenuItem } from "./MenuItem";

@Entity("order_items")
export class OrderItem {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "order_id", type: "varchar" })
  orderId!: string;

  @ManyToOne("orders", "items", { onDelete: "CASCADE" })
  @JoinColumn({ name: "order_id" })
  order!: Order;

  @Column({ name: "menu_item_id", type: "varchar", nullable: true })
  menuItemId!: string | null;

  @ManyToOne("menu_items", { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "menu_item_id" })
  menuItem!: MenuItem | null;

  // Snapshot du nom (au cas où le menu change)
  @Column({ type: "varchar", length: 255 })
  name!: string;

  @Column({ type: "int", default: 1 })
  quantity!: number;

  @Column({ name: "unit_price", type: "decimal", precision: 8, scale: 2 })
  unitPrice!: number;

  @Column({ name: "total_price", type: "decimal", precision: 8, scale: 2 })
  totalPrice!: number;

  // Ex: [{"name":"Taille","choice":"Grande","extra_price":2}]
  @Column({ name: "selected_options", type: "simple-json", default: "[]" })
  selectedOptions!: any[];

  @Column({ type: "text", nullable: true })
  notes!: string | null;
}
