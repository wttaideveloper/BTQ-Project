# 🧪 Testing Guide - Team Battle Availability Fix

## ✅ Implementation Status
All code changes are complete and the dev server should have automatically reloaded with the new changes.

---

## 🔍 What to Test

### Test 1: User NOT in Team Battle should NOT appear
**Steps:**
1. **User A**: Login and stay on Home page (do NOT click "Enter Team Battle")
2. **User B**: Login, click "Enter Team Battle", create a team
3. **Expected Result**: User A should NOT appear in User B's "Available Opponents" list ✅

### Test 2: User IN Team Battle should appear
**Steps:**
1. **User A**: Login, click "Enter Team Battle"
2. **User B**: Login, click "Enter Team Battle", create a team
3. **Expected Result**: User A SHOULD appear in User B's "Available Opponents" list ✅

### Test 3: User leaves Team Battle
**Steps:**
1. **User A**: Login, click "Enter Team Battle" (appears in list)
2. **User B**: Can see User A in available opponents
3. **User A**: Close Team Battle modal (go back to Home)
4. **Expected Result**: User A should disappear from User B's available opponents list ✅

### Test 4: Real-time updates
**Steps:**
1. **User A**: On Home page
2. **User B**: In Team Battle, checking available opponents (User A not visible)
3. **User A**: Click "Enter Team Battle"
4. **Expected Result**: User A should appear in User B's list within 5 seconds ✅

---

## 🐛 If It's Still Not Working

### Check 1: Clear Browser Cache
```
1. Open DevTools (F12)
2. Right-click the refresh button
3. Select "Empty Cache and Hard Reload"
```

### Check 2: Verify Migration Ran
Check the server console for:
```
✅ Migration completed: is_in_team_battle column ready
```

### Check 3: Check Network Tab
1. Open DevTools → Network tab
2. When in Team Battle, look for request to `/api/users/team-battle-available`
3. Should see this endpoint being called (not `/api/users/online`)

### Check 4: Check Console Logs
Look for these logs:
```
[Home] Step 2.5: User marked as in Team Battle
[TeamBattleSetup Page] User removed from Team Battle on unmount
[useTeamBattleSetup] Team Battle availability updated, refetching
```

---

## 📊 Expected Behavior Summary

| User State | Appears in Available List? |
|-----------|---------------------------|
| Logged in, on Home page | ❌ NO |
| Logged in, in Team Battle | ✅ YES |
| Logged in, closed Team Battle | ❌ NO |
| Logged out | ❌ NO |

---

## 🔧 Quick Fixes

### If old behavior persists:
1. **Stop the dev server** (Ctrl+C)
2. **Clear node_modules/.vite cache**:
   ```powershell
   Remove-Item -Recurse -Force node_modules\.vite
   ```
3. **Restart dev server**:
   ```powershell
   npm run dev
   ```

### If database column doesn't exist:
The migration should have run automatically. Check server logs for:
```
Running migration: Adding is_in_team_battle column to users...
✅ Migration completed: is_in_team_battle column ready
```

---

## 📝 What Changed

### Frontend
- `Home.tsx`: Sets `isInTeamBattle = true` when entering Team Battle
- `TeamBattleSetup.tsx` (page): Sets `isInTeamBattle = false` when leaving
- `TeamBattleSetup.tsx` (component): Uses new endpoint
- `useTeamBattleSetup.ts`: Uses new endpoint + WebSocket listener

### Backend
- `database.ts`: New methods + migration
- `routes.ts`: New API endpoints
- `schema.ts`: New field

### Database
- New column: `is_in_team_battle` (boolean, default false)
- New index for performance

---

## ✅ Success Indicators

You'll know it's working when:
1. Users on Home page don't appear in available opponents
2. Only users who clicked "Enter Team Battle" appear
3. Users disappear when they close Team Battle
4. Changes happen in real-time (within 5 seconds)

---

**Last Updated**: 2026-02-12 16:20 IST  
**Status**: Ready for Testing
