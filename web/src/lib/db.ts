import "reflect-metadata";
import { AppDataSource } from "@/db/data-source";

let initialized = false;

export async function getDb() {
  if (!initialized) {
    if (AppDataSource.options.type === "better-sqlite3") {
      // Disable FK checks during synchronize so TypeORM can recreate tables
      const opts = AppDataSource.options as any;
      const origSync = opts.synchronize;
      opts.synchronize = false;
      await AppDataSource.initialize();
      await AppDataSource.query("PRAGMA foreign_keys = OFF");
      await AppDataSource.synchronize();
      await AppDataSource.query("PRAGMA foreign_keys = ON");
      opts.synchronize = origSync;
    } else {
      await AppDataSource.initialize();
    }
    initialized = true;
    console.log(`[DB] Connected (${AppDataSource.options.type})`);
  }
  return AppDataSource;
}
