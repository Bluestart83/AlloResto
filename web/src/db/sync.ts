import "reflect-metadata";
import { AppDataSource } from "./data-source";

async function sync() {
  console.log("[DB] Initializing...");
  await AppDataSource.initialize();
  console.log(`[DB] Connected (${AppDataSource.options.type})`);

  await AppDataSource.synchronize();
  console.log("[DB] Schema synchronized");

  await AppDataSource.destroy();
  console.log("[DB] Done");
}

sync().catch(console.error);
