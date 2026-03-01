import "reflect-metadata";
import { DataSource, DataSourceOptions } from "typeorm";
import { Restaurant } from "./entities/Restaurant";
import { PhoneLine } from "./entities/PhoneLine";
import { Customer } from "./entities/Customer";
import { MenuCategory } from "./entities/MenuCategory";
import { MenuItem } from "./entities/MenuItem";
import { Call } from "./entities/Call";
import { Order } from "./entities/Order";
import { OrderItem } from "./entities/OrderItem";
import { Reservation } from "./entities/Reservation";
import { DiningRoom } from "./entities/DiningRoom";
import { DiningTable } from "./entities/DiningTable";
import { Message } from "./entities/Message";
import { BlockedPhone } from "./entities/BlockedPhone";
import { ExternalLoad } from "./entities/ExternalLoad";
import { SyncPlatformConfig } from "./entities/SyncPlatformConfig";
import { SyncExternalMapping } from "./entities/SyncExternalMapping";
import { SyncLog } from "./entities/SyncLog";
import { DiningService } from "./entities/DiningService";
import { Offer } from "./entities/Offer";
import { PricingConfig } from "./entities/PricingConfig";
import { DeliveryTrip } from "./entities/DeliveryTrip";

const entities = [
  Restaurant,
  PhoneLine,
  Customer,
  MenuCategory,
  MenuItem,
  Call,
  Order,
  OrderItem,
  Reservation,
  DiningRoom,
  DiningTable,
  Message,
  BlockedPhone,
  ExternalLoad,
  SyncPlatformConfig,
  SyncExternalMapping,
  SyncLog,
  DiningService,
  Offer,
  PricingConfig,
  DeliveryTrip,
];

// ============================================================
// Switch SQLite ↔ PostgreSQL via env
// ============================================================
// POC  : DATABASE_TYPE=sqlite  DATABASE_URL=./poc.db
// Prod : DATABASE_TYPE=postgres DATABASE_URL=postgresql://user:pass@host:5432/db
// ============================================================

function buildOptions(): DataSourceOptions {
  const dbType = process.env.DATABASE_TYPE || "sqlite";

  if (dbType === "postgres") {
    return {
      type: "postgres",
      url: process.env.DATABASE_URL,
      entities,
      synchronize: false, // utiliser migrations en prod
      migrations: ["src/db/migrations/*.ts"],
      logging: process.env.NODE_ENV !== "production",
    };
  }

  // SQLite par défaut (POC)
  return {
    type: "better-sqlite3",
    database: process.env.DATABASE_URL || "./database.db",
    entities,
    synchronize: true, // auto-create tables en dev
    logging: process.env.NODE_ENV !== "production",
  };
}

export const AppDataSource = new DataSource(buildOptions());
