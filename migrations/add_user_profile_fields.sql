-- Migration: Add user profile fields
-- Date: 2026-07-03

ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_image TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_email_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique
  ON users(email)
  WHERE email IS NOT NULL;

COMMENT ON COLUMN users.full_name IS 'User display name';
COMMENT ON COLUMN users.profile_image IS 'URL path to profile picture or default avatar';
COMMENT ON COLUMN users.is_email_verified IS 'Whether the user has verified their email address';
COMMENT ON COLUMN users.last_login_at IS 'Timestamp of the most recent login';
