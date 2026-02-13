// Reset all users' isInTeamBattle status to false
const postgres = require('postgres');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    console.error('❌ DATABASE_URL environment variable not found');
    process.exit(1);
}

console.log('🔗 Connecting to database...');

const sql = postgres(connectionString);

async function resetAllTeamBattleStatus() {
    try {
        console.log('\n📝 Resetting all users isInTeamBattle to false...');

        const result = await sql`
      UPDATE users 
      SET is_in_team_battle = FALSE 
      WHERE is_in_team_battle = TRUE;
    `;

        console.log(`✅ Reset ${result.count} user(s) isInTeamBattle status`);

        // Verify
        const check = await sql`
      SELECT COUNT(*) as count 
      FROM users 
      WHERE is_in_team_battle = TRUE;
    `;

        console.log(`📊 Users with isInTeamBattle=true: ${check[0].count}`);
        console.log('\n🎉 All users reset successfully!');

        await sql.end();
        process.exit(0);
    } catch (error) {
        console.error('\n❌ Reset failed:', error.message);
        await sql.end();
        process.exit(1);
    }
}

resetAllTeamBattleStatus();
