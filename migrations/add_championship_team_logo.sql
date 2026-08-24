-- Add optional team identity logo while retaining the existing emoji fallback.
ALTER TABLE championship_teams
ADD COLUMN IF NOT EXISTS logo_url TEXT;
