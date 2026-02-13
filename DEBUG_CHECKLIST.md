# 🔍 DEBUG CHECKLIST - Finding the Issue

## Step 1: Check Browser Console

Open your browser DevTools (F12) and look for these logs when you click "Enter Team Battle":

```
[Home] Step 2.5: Setting user as in Team Battle
[Home] ✅ Step 2.5: User marked as in Team Battle
```

**If you DON'T see these logs**: The frontend code isn't running (browser cache issue)

---

## Step 2: Check Network Tab

1. Open DevTools (F12)
2. Go to Network tab
3. Clear it
4. Click "Enter Team Battle"
5. Look for these requests:

**Should see:**
- `PATCH /api/users/27/team-battle-status` with body `{isInTeamBattle: true}`
- `GET /api/users/team-battle-available`

**Should NOT see (for opponent list):**
- `GET /api/users/online`

---

## Step 3: Check the Response

Click on the `GET /api/users/team-battle-available` request in Network tab.

**Check the Response tab:**
- Should return an array of users
- Each user should have `isInTeamBattle: true`

**If it returns users with `isInTeamBattle: false` or undefined**: Database column doesn't exist or isn't being set

---

## Step 4: Force Clear Everything

If steps 1-3 show old behavior:

### Clear Browser Cache (HARD)
1. Close ALL browser tabs for localhost:5001
2. Open DevTools (F12)
3. Right-click refresh button
4. Select "Empty Cache and Hard Reload"
5. Or press: `Ctrl + Shift + Delete` → Clear "Cached images and files"

### Clear Vite Cache
```powershell
# Stop dev server (Ctrl+C)
Remove-Item -Recurse -Force node_modules\.vite
npm run dev
```

---

## Step 5: Verify Database Column

The column should exist. Let me verify it was created:

**Check if you see this in server logs when it starts:**
```
Running migration: Adding is_in_team_battle column to users...
✅ Migration completed: is_in_team_battle column ready
```

**If you DON'T see this**: The migration didn't run on server start (but we ran it manually, so the column should exist)

---

## Step 6: Test the API Directly

Open a new browser tab and login, then open DevTools console and run:

```javascript
// Set yourself as in Team Battle
await fetch('/api/users/YOUR_USER_ID/team-battle-status', {
  method: 'PATCH',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({isInTeamBattle: true})
});

// Check who's available
const res = await fetch('/api/users/team-battle-available');
const users = await res.json();
console.log('Team Battle available users:', users);
```

Replace `YOUR_USER_ID` with your actual user ID (usually visible in the UI or network requests).

---

## Step 7: Check Server Logs

When you click "Enter Team Battle", the server should log:

```
[PATCH /api/users/27/team-battle-status] Setting user 27 Team Battle status to true
[Broadcast] team_battle_availability_updated to all Team Battle users
[GET /api/users/team-battle-available] Returning X users in Team Battle
```

**If you DON'T see these logs**: The endpoint isn't being called (frontend cache issue)

---

## Most Likely Issue

Based on the symptoms, it's **99% a browser cache issue**. The old JavaScript is still running.

**Solution:**
1. Close ALL tabs with localhost:5001
2. Clear browser cache completely
3. Restart dev server
4. Open fresh tab and test

---

**Let me know what you see in Steps 1-3 and I'll help debug further!**
