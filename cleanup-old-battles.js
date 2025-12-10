/**
 * Cleanup script to remove old/stale team battles and join requests
 * Run this to clean up test data
 */

import postgres from 'postgres';
import 'dotenv/config';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('❌ DATABASE_URL not found in environment');
  process.exit(1);
}

const sql = postgres(connectionString);

async function cleanup() {
  try {
    console.log('🧹 Starting cleanup...');
    
    // DELETE ALL FORMING BATTLES (for fresh start)
    const allBattles = await sql`
      DELETE FROM team_battles 
      WHERE status = 'forming'
      RETURNING id, team_a_name, team_b_name, created_at
    `;
    console.log(`✅ Deleted ${allBattles.length} forming battles`);
    allBattles.forEach(b => {
      const age = Math.round((Date.now() - new Date(b.created_at).getTime()) / 60000);
      console.log(`  - ${b.team_a_name} vs ${b.team_b_name || 'NO OPPONENT'} (${age} minutes old)`);
    });
    
    // Delete ALL join requests (since battles are gone)
    const allRequests = await sql`
      DELETE FROM team_join_request 
      RETURNING id
    `;
    console.log(`✅ Deleted ${allRequests.length} join requests`);
    
    console.log('\n✅ Cleanup completed! All forming battles and join requests deleted.');
    console.log('You can now create fresh teams for testing.');
    
  } catch (error) {
    console.error('❌ Cleanup error:', error);
  } finally {
    await sql.end();
    process.exit(0);
  }
}

cleanup();
