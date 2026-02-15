-- Add nullable current_team_battle_mode column to users table
-- Run in staging first. This is idempotent: will skip if column exists.

DO $$
BEGIN
  -- add column if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'current_team_battle_mode'
  ) THEN
    ALTER TABLE users
      ADD COLUMN current_team_battle_mode VARCHAR;
    RAISE NOTICE 'Added column current_team_battle_mode to users';
  ELSE
    RAISE NOTICE 'Column current_team_battle_mode already exists, skipping';
  END IF;
END
$$;


