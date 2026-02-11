/**
 * Seed script — creates the initial admin user.
 *
 * Usage:
 *   npx tsx src/scripts/seed-admin.ts [email] [password]
 *
 * Defaults: admin@voiceorder.ai / admin123
 */

import Database from "better-sqlite3";
import { auth } from "../lib/auth";

const DB_PATH = process.env.DATABASE_URL || "./database.db";

async function main() {
  const email = process.argv[2] || "admin@voiceorder.ai";
  const password = process.argv[3] || "admin123";
  const name = "Admin";

  console.log(`[SEED] Creating admin user: ${email}`);

  try {
    // 1. Sign up the user via Better Auth API
    const signUpResult = await auth.api.signUpEmail({
      body: { email, password, name },
    });

    if (!signUpResult?.user) {
      console.error("[SEED] Sign up failed — user may already exist");
      process.exit(1);
    }

    const userId = signUpResult.user.id;
    console.log(`[SEED] User created: ${userId}`);

    // 2. Set role to admin directly in DB
    // (admin API requires auth, but this is bootstrap — no admin exists yet)
    const db = new Database(DB_PATH);
    db.prepare("UPDATE user SET role = ?, emailVerified = 1 WHERE id = ?").run("admin", userId);
    db.close();

    console.log(`[SEED] Role set to admin`);
    console.log(`[SEED] Done! Login with: ${email} / ${password}`);
  } catch (e: any) {
    // Check if user already exists
    const msg = e?.message || e?.body?.message || "";
    if (msg.includes("already") || msg.includes("exist")) {
      console.log(`[SEED] User ${email} already exists — updating role to admin`);
      const db = new Database(DB_PATH);
      db.prepare("UPDATE user SET role = ?, emailVerified = 1 WHERE email = ?").run("admin", email);
      db.close();
      console.log(`[SEED] Done!`);
    } else {
      console.error("[SEED] Error:", e);
      process.exit(1);
    }
  }

  process.exit(0);
}

main();
