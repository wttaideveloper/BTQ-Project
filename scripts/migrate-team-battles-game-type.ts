#!/usr/bin/env tsx
import postgres from "postgres";
import readline from "readline/promises";
import { stdin as input, stdout as output } from "node:process";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("ERROR: DATABASE_URL environment variable is not set.");
    process.exit(1);
  }

  const sql = postgres(databaseUrl, {
    // Keep minimal pool for a short migration script
    max: 2,
    transform: {
      // keep default
    },
  });

  try {
    console.log("Previewing rows that WOULD be converted:");
    const preview = await sql`
      SELECT COUNT(*)::int AS count
      FROM team_battles
      WHERE game_type IS NULL OR game_type = 'question'
    `;
    const toConvert = preview[0]?.count ?? 0;
    console.log(`Found ${toConvert} row(s) with game_type IS NULL or 'question'`);

    if (toConvert > 0) {
      console.log("Sample rows (up to 50):");
      const samples = await sql`
        SELECT id, game_session_id, game_type, created_at
        FROM team_battles
        WHERE game_type IS NULL OR game_type = 'question'
        ORDER BY created_at DESC
        LIMIT 50
      `;
      console.table(samples.map((r: any) => ({
        id: r.id,
        game_session_id: r.game_session_id,
        game_type: r.game_type,
        created_at: r.created_at,
      })));
    } else {
      console.log("No rows need conversion. Exiting.");
      await sql.end();
      process.exit(0);
    }

    const rl = readline.createInterface({ input, output });
    const answer = await rl.question("Proceed to update these rows to game_type = 'team_battle'? (yes/no): ");
    rl.close();
    if (answer.trim().toLowerCase() !== "yes") {
      console.log("Migration aborted by user.");
      await sql.end();
      process.exit(0);
    }

    console.log("Running UPDATE...");
    // Perform the update and return the number of updated rows
    const updated = await sql`
      UPDATE team_battles
      SET game_type = 'team_battle'
      WHERE game_type IS NULL OR game_type = 'question'
      RETURNING id
    `;
    const updatedCount = Array.isArray(updated) ? updated.length : 0;
    console.log(`UPDATE completed. Rows updated: ${updatedCount}`);

    console.log("Verification: counts by game_type");
    const counts = await sql`
      SELECT COALESCE(game_type, 'NULL') AS game_type, COUNT(*)::int AS count
      FROM team_battles
      GROUP BY game_type
      ORDER BY count DESC
    `;
    console.table(counts.map((r: any) => ({ game_type: r.game_type, count: r.count })));

    // Extra safety check: ensure rapid_fire rows untouched (report count)
    const rapid = await sql`
      SELECT COUNT(*)::int AS count FROM team_battles WHERE game_type = 'rapid_fire'
    `;
    console.log(`Rows with game_type='rapid_fire' (should be unchanged): ${rapid[0]?.count ?? 0}`);

    console.log("Migration script finished successfully.");
    await sql.end();
    process.exit(0);
  } catch (err) {
    console.error("Migration failed:", err);
    try { await sql.end(); } catch (e) {}
    process.exit(1);
  }
}

main();


