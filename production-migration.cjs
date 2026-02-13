#!/usr/bin/env node

/**
 * Production Database Migration Script
 * 
 * This script adds the is_in_team_battle column to the users table
 * Run this on your production server to enable Team Battle availability tracking
 * 
 * Usage:
 *   node production-migration.cjs
 * 
 * Requirements:
 *   - DATABASE_URL environment variable must be set
 *   - postgres npm package must be installed
 */

const postgres = require('postgres');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    console.error('❌ ERROR: DATABASE_URL environment variable not found');
    console.error('');
    console.error('Please set DATABASE_URL in your environment or .env file');
    console.error('Example: DATABASE_URL=postgresql://user:password@host:port/database');
    process.exit(1);
}

console.log('🔗 Connecting to production database...');
console.log('');

const sql = postgres(connectionString, {
    max: 1, // Only one connection needed for migration
    idle_timeout: 20,
    connect_timeout: 10,
});

async function runMigration() {
    try {
        console.log('📊 Step 1: Checking current database state....');

        // Check if column already exists
        const columnCheck = await sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      AND column_name = 'is_in_team_battle';
    `;

        if (columnCheck.length > 0) {
            console.log('ℹ️  Column is_in_team_battle already exists');
            console.log('');

            // Check current values
            const stats = await sql`
        SELECT 
          COUNT(*) as total_users,
          COUNT(*) FILTER (WHERE is_in_team_battle = TRUE) as users_in_battle,
          COUNT(*) FILTER (WHERE is_online = TRUE) as online_users
        FROM users;
      `;

            console.log('📈 Current Statistics:');
            console.log(`   Total users: ${stats[0].total_users}`);
            console.log(`   Online users: ${stats[0].online_users}`);
            console.log(`   Users marked in Team Battle: ${stats[0].users_in_battle}`);
            console.log('');

            // Ask if we should reset all values to false
            console.log('🔄 Resetting all is_in_team_battle values to FALSE...');
            const resetResult = await sql`
        UPDATE users 
        SET is_in_team_battle = FALSE 
        WHERE is_in_team_battle = TRUE;
      `;
            console.log(`✅ Reset ${resetResult.count} user(s) to is_in_team_battle=false`);
            console.log('');

        } else {
            console.log('📝 Step 2: Adding is_in_team_battle column...');

            await sql`
        ALTER TABLE users 
        ADD COLUMN is_in_team_battle BOOLEAN DEFAULT FALSE;
      `;

            console.log('✅ Column is_in_team_battle added successfully');
            console.log('');

            console.log('📝 Step 3: Creating performance index...');

            await sql`
        CREATE INDEX IF NOT EXISTS idx_users_team_battle_availability 
        ON users(is_online, is_in_team_battle) 
        WHERE is_online = TRUE AND is_in_team_battle = TRUE;
      `;

            console.log('✅ Index idx_users_team_battle_availability created successfully');
            console.log('');
        }

        // Verify final state
        console.log('🔍 Step 4: Verifying migration...');

        const verification = await sql`
      SELECT 
        column_name, 
        data_type, 
        column_default,
        is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      AND column_name = 'is_in_team_battle';
    `;

        if (verification.length > 0) {
            console.log('✅ Verification successful!');
            console.log('');
            console.log('Column details:');
            console.log(`   Name: ${verification[0].column_name}`);
            console.log(`   Type: ${verification[0].data_type}`);
            console.log(`   Default: ${verification[0].column_default}`);
            console.log(`   Nullable: ${verification[0].is_nullable}`);
            console.log('');
        }

        // Check index
        const indexCheck = await sql`
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename = 'users' 
      AND indexname = 'idx_users_team_battle_availability';
    `;

        if (indexCheck.length > 0) {
            console.log('✅ Performance index verified');
            console.log('');
        }

        // Final statistics
        const finalStats = await sql`
      SELECT 
        COUNT(*) as total_users,
        COUNT(*) FILTER (WHERE is_in_team_battle = TRUE) as users_in_battle,
        COUNT(*) FILTER (WHERE is_online = TRUE) as online_users,
        COUNT(*) FILTER (WHERE is_online = TRUE AND is_in_team_battle = TRUE) as available_for_battle
      FROM users;
    `;

        console.log('📊 Final Statistics:');
        console.log(`   Total users: ${finalStats[0].total_users}`);
        console.log(`   Online users: ${finalStats[0].online_users}`);
        console.log(`   Users in Team Battle: ${finalStats[0].users_in_battle}`);
        console.log(`   Available for Team Battle: ${finalStats[0].available_for_battle}`);
        console.log('');

        console.log('🎉 Migration completed successfully!');
        console.log('');
        console.log('✅ Your production server is now ready for Team Battle availability tracking');
        console.log('');

        await sql.end();
        process.exit(0);

    } catch (error) {
        console.error('');
        console.error('❌ Migration failed!');
        console.error('');
        console.error('Error details:');
        console.error(error.message);
        console.error('');

        if (error.stack) {
            console.error('Stack trace:');
            console.error(error.stack);
        }

        await sql.end();
        process.exit(1);
    }
}

// Run the migration
console.log('🚀 Starting Production Database Migration');
console.log('==========================================');
console.log('');

runMigration();
