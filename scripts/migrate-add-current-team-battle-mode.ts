#!/usr/bin/env tsx
import fs from "fs";
import path from "path";
import postgres from "postgres";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("ERROR: DATABASE_URL environment variable is not set.");
    process.exit(1);
  }

  const sqlFilePath = path.resolve(process.cwd(), "scripts", "add-current-team-battle-mode.sql");
  if (!fs.existsSync(sqlFilePath)) {
    console.error(`ERROR: SQL file not found at ${sqlFilePath}`);
    process.exit(1);
  }

  const sqlText = fs.readFileSync(sqlFilePath, "utf8");

  const sql = postgres(databaseUrl, { max: 2 });

  try {
    console.log(`Executing migration SQL from ${sqlFilePath}...`);
    // Use unsafe to execute raw SQL script content
    await sql.unsafe(sqlText);
    console.log("Migration executed successfully.");
    await sql.end();
    process.exit(0);
  } catch (err) {
    console.error("Migration failed:", err);
    try { await sql.end(); } catch (e) {}
    process.exit(1);
  }
}

main();


