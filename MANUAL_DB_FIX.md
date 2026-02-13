# 🔧 Quick Database Column Check

Run this SQL query to check if the column exists:

```sql
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'users' AND column_name = 'is_in_team_battle';
```

**If the query returns NO rows**: The column doesn't exist and the migration didn't run.

**If the query returns 1 row**: The column exists and the fix should work.

---

## Manual Fix (if column doesn't exist)

If the column doesn't exist, run this SQL manually:

```sql
-- Add the column
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS is_in_team_battle BOOLEAN DEFAULT FALSE;

-- Create the index
CREATE INDEX IF NOT EXISTS idx_users_team_battle_availability 
ON users(is_online, is_in_team_battle) 
WHERE is_online = TRUE AND is_in_team_battle = TRUE;

-- Verify it worked
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'users' AND column_name = 'is_in_team_battle';
```

---

## After Running Manual Fix

1. **Restart the dev server** (Ctrl+C, then `npm run dev`)
2. **Hard refresh browser** (Ctrl+Shift+R)
3. **Test again**

The fix should now work!
