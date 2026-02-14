import "reflect-metadata";
import { AppDataSource } from "@/db/data-source";

let initPromise: Promise<void> | null = null;

export async function getDb() {
  if (!initPromise) {
    initPromise = (async () => {
      if (AppDataSource.options.type === "better-sqlite3") {
        // Disable FK checks during synchronize so TypeORM can drop/recreate tables
        const opts = AppDataSource.options as any;
        opts.synchronize = false;
        await AppDataSource.initialize();
        const qr = AppDataSource.createQueryRunner();
        await qr.query("PRAGMA foreign_keys = OFF");
        await AppDataSource.synchronize();
        await qr.query("PRAGMA foreign_keys = ON");
        await qr.query("PRAGMA journal_mode = WAL");
        await qr.query("PRAGMA busy_timeout = 5000");
        await qr.release();
      } else {
        await AppDataSource.initialize();
      }
      console.log(`[DB] Connected (${AppDataSource.options.type})`);
    })();
  }
  await initPromise;
  return AppDataSource;
}
