-- Commentator role and championship assignment.
-- is_commentator is independent of is_admin.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_commentator BOOLEAN DEFAULT FALSE;

ALTER TABLE championships
  ADD COLUMN IF NOT EXISTS commentator_user_id INTEGER REFERENCES users(id);

CREATE INDEX IF NOT EXISTS championships_commentator_user_idx
  ON championships(commentator_user_id)
  WHERE commentator_user_id IS NOT NULL;
