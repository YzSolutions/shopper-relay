// Apply db/migrations/*.sql in order, once each.
//
//   npm run db:migrate

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "@neondatabase/serverless";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const DIR = "db/migrations";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL in .env.local.");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query("create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())");
    const applied = new Set((await pool.query("select name from schema_migrations")).rows.map((r) => r.name));
    const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
    for (const file of files) {
      if (applied.has(file)) continue;
      const client = await pool.connect();
      try {
        await client.query("begin");
        await client.query(readFileSync(join(DIR, file), "utf8"));
        await client.query("insert into schema_migrations (name) values ($1)", [file]);
        await client.query("commit");
        console.log(`applied ${file}`);
      } catch (err) {
        await client.query("rollback");
        throw err;
      } finally {
        client.release();
      }
    }
    console.log("Database is up to date.");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err?.message ?? err);
  process.exit(1);
});
