import "reflect-metadata";
import { AppDataSource } from "@/db/data-source";

let initialized = false;

export async function getDb() {
  if (!initialized) {
    await AppDataSource.initialize();
    initialized = true;
    console.log(`[DB] Connected (${AppDataSource.options.type})`);
  }
  return AppDataSource;
}
