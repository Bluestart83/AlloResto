import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from "typeorm";
import type { Restaurant } from "./Restaurant";

/**
 * FAQ — Base de connaissances par restaurant
 *
 * Flow :
 * 1. L'IA reçoit TOUTE la FAQ (status=answered) dans son prompt
 * 2. Client pose une question :
 *    - Si la FAQ contient la réponse → l'IA répond directement
 *    - Si c'est nouveau → l'IA appelle log_new_faq (function call)
 *      → POST /api/faq → crée une entry avec status="pending"
 * 3. Le restaurateur voit les questions en attente sur le dashboard
 *    → Il saisit la réponse → status passe à "answered"
 * 4. Au prochain appel, l'IA connaît la réponse
 *
 * Le dédoublonnage est 100% côté IA : elle a la FAQ, elle sait
 * si la question a déjà été posée ou non.
 */

@Entity("faqs")
@Index(["restaurantId", "status"])
export class Faq {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "restaurant_id", type: "varchar" })
  restaurantId!: string;

  @ManyToOne(() => require("./Restaurant").Restaurant, "faqs", { onDelete: "CASCADE" })
  @JoinColumn({ name: "restaurant_id" })
  restaurant!: Restaurant;

  // ---- Question (remontée par l'IA) ----

  @Column({ type: "text" })
  question!: string;

  // ---- Réponse (saisie par le restaurateur) ----

  @Column({ type: "text", nullable: true })
  answer!: string | null;

  // ---- Métadonnées ----

  @Column({
    type: "varchar",
    length: 30,
    default: "other",
    comment: "horaires | livraison | allergens | paiement | parking | reservation | promotion | ingredients | other",
  })
  category!: string;

  @Column({
    type: "varchar",
    length: 20,
    default: "pending",
    comment: "pending | answered | ignored",
  })
  status!: string;

  /** Nombre de fois que l'IA a remonté cette question */
  @Column({ name: "ask_count", type: "int", default: 1 })
  askCount!: number;

  @Column({ name: "last_caller_phone", type: "varchar", length: 20, nullable: true })
  lastCallerPhone!: string | null;

  @Column({ name: "last_asked_at", type: "datetime", nullable: true })
  lastAskedAt!: Date | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
