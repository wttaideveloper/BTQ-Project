// Quick script to run the is_in_team_battle migration
const postgres = require('postgres');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    console.error('❌ DATABASE_URL environment variable not found');
    process.exit(1);
}

console.log('🔗 Connecting to database...');
console.log('📍 Database:', connectionString.replace(/:[^:@]*@/, ':****@'));

const sql = postgres(connectionString);

async function runMigration() {
    try {
        console.log('\n📝 Step 1: Adding is_in_team_battle column...');

        // Add the column
        await sql`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS is_in_team_battle BOOLEAN DEFAULT FALSE;
    `;
        console.log('✅ Column added successfully');

        console.log('\n📝 Step 2: Creating performance index...');

        // Create the index
        await sql`
      CREATE INDEX IF NOT EXISTS idx_users_team_battle_availability 
      ON users(is_online, is_in_team_battle) 
      WHERE is_online = TRUE AND is_in_team_battle = TRUE;
    `;
        console.log('✅ Index created successfully');

        console.log('\n📝 Step 3: Verifying migration...');

        // Verify the column exists
        const result = await sql`
      SELECT column_name, data_type, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'is_in_team_battle';
    `;

        if (result.length > 0) {
            console.log('✅ Migration completed successfully!');
            console.log('📊 Column details:');
            console.log('   - Name:', result[0].column_name);
            console.log('   - Type:', result[0].data_type);
            console.log('   - Default:', result[0].column_default);
            console.log('\n🎉 The fix is now active! Restart your dev server and test.');
        } else {
            console.log('⚠️ Warning: Column verification failed');
        }

        await sql.end();
        process.exit(0);
    } catch (error) {
        console.error('\n❌ Migration failed:', error.message);
        console.error('Error details:', error);
        await sql.end();
        process.exit(1);
    }
}

runMigration();
