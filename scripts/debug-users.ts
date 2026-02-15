import pkg from "pg";
const { Client } = pkg;

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

async function run() {
  await client.connect();

  // 🔥 FORCE both users into rapid_fire mode
  await client.query(`
    UPDATE users
    SET is_in_team_battle = true,
        current_team_battle_mode = 'rapid_fire'
    WHERE id IN (21, 22);
  `);

  const result = await client.query(`
    SELECT id, username, is_in_team_battle, current_team_battle_mode
    FROM users
    WHERE id IN (21, 22);
  `);

  console.table(result.rows);

  await client.end();
}

run();