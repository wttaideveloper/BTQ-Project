# 🔍 VERIFICATION CHECKLIST - Team Battle Fix

## ✅ Code Changes Complete

All references to `/api/users/online` in Team Battle components have been updated to `/api/users/team-battle-available`.

---

## 🧪 Test Now (Step-by-Step)

### **IMPORTANT: Hard Refresh First!**
Before testing, do a **hard refresh** in your browser:
- **Windows**: `Ctrl + Shift + R` or `Ctrl + F5`
- **Mac**: `Cmd + Shift + R`

---

### **Test 1: User on Home Page Should NOT Appear**

1. **User A (Browser 1)**:
   - Login
   - **STAY ON HOME PAGE** (do NOT click "Enter Team Battle")
   - Leave this window open

2. **User B (Browser 2 / Incognito)**:
   - Login
   - Click "Enter Team Battle"
   - Click "Create Team"
   - Enter team name and create

3. **Check Available Opponents List**:
   - **Expected**: User A should **NOT** be in the list ✅
   - **If User A appears**: The fix is not working yet

---

### **Test 2: User in Team Battle SHOULD Appear**

4. **User A (Browser 1)**:
   - Now click "Enter Team Battle"
   - Wait 5 seconds

5. **User B (Browser 2)**:
   - Check "Available Opponents" list
   - **Expected**: User A should **NOW** appear in the list ✅

---

### **Test 3: User Leaves Team Battle**

6. **User A (Browser 1)**:
   - Close the Team Battle modal (click X or outside)
   - Wait 5 seconds

7. **User B (Browser 2)**:
   - Check "Available Opponents" list
   - **Expected**: User A should **disappear** from the list ✅

---

## 🔍 Debug if Still Not Working

### Check 1: Browser DevTools Network Tab

1. Open DevTools (F12)
2. Go to Network tab
3. Filter by "Fetch/XHR"
4. When in Team Battle, look for requests
5. **Should see**: `/api/users/team-battle-available`
6. **Should NOT see**: `/api/users/online` (for opponent list)

### Check 2: Browser Console

Look for these logs:
```
[Home] Step 2.5: User marked as in Team Battle
[TeamBattleSetup Page] User removed from Team Battle on unmount
[useTeamBattleSetup] Team Battle availability updated, refetching
```

### Check 3: Server Console

Look for these logs:
```
✅ Migration completed: is_in_team_battle column ready
[GET /api/users/team-battle-available] Returning X users in Team Battle
[PATCH /api/users/:id/team-battle-status] Broadcasted availability update
```

### Check 4: Database Column

If you have database access, verify:
```sql
-- Check if column exists
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'users' AND column_name = 'is_in_team_battle';

-- Check current values
SELECT id, username, is_online, is_in_team_battle 
FROM users 
WHERE is_online = true;
```

---

## 🚨 If Still Broken - Nuclear Option

If the fix still doesn't work after hard refresh:

### Option 1: Clear All Cache
```powershell
# Stop dev server (Ctrl+C)
Remove-Item -Recurse -Force node_modules\.vite
npm run dev
```

### Option 2: Check if Migration Ran
Look in server console for:
```
Running migration: Adding is_in_team_battle column to users...
✅ Migration completed: is_in_team_battle column ready
```

If you DON'T see this, the database column doesn't exist!

### Option 3: Manual Database Fix
If migration didn't run, execute manually:
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_in_team_battle BOOLEAN DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_users_team_battle_availability 
ON users(is_online, is_in_team_battle) 
WHERE is_online = TRUE AND is_in_team_battle = TRUE;
```

---

## 📊 Expected API Behavior

### When User Clicks "Enter Team Battle":
```
POST /api/team-battle/cleanup (cleanup old data)
PATCH /api/users/27/team-battle-status { isInTeamBattle: true }
→ WebSocket broadcast: team_battle_availability_updated
GET /api/users/team-battle-available (returns users with isInTeamBattle=true)
```

### When User Closes Team Battle:
```
PATCH /api/users/27/team-battle-status { isInTeamBattle: false }
→ WebSocket broadcast: team_battle_availability_updated
```

---

## ✅ Success Criteria

The fix is working when:
1. ✅ Users on Home page don't appear in available opponents
2. ✅ Users in Team Battle appear in available opponents
3. ✅ Users disappear when they close Team Battle
4. ✅ Changes happen in real-time (within 5 seconds)
5. ✅ Network tab shows `/api/users/team-battle-available` requests

---

**Last Updated**: 2026-02-12 16:35 IST  
**All Code Changes**: ✅ Complete  
**Ready for Testing**: ✅ Yes
