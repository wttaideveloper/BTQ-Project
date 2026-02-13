# 🎮 Team Battle Module - Complete Analysis & Fix Documentation

## 📋 Table of Contents
1. [Module Overview](#module-overview)
2. [Current Architecture](#current-architecture)
3. [Problem Analysis](#problem-analysis)
4. [Correct Flow Design](#correct-flow-design)
5. [Implementation Plan](#implementation-plan)
6. [Database Schema](#database-schema)
7. [API Endpoints](#api-endpoints)
8. [WebSocket Events](#websocket-events)

---

## 🎯 Module Overview

The Team Battle module enables real-time multiplayer Bible trivia battles between two teams (Team A vs Team B). Each team consists of:
- **1 Captain** (team leader who creates the team and sends invitations)
- **Up to 2 Members** (teammates who join via invitation)

### Supported Battle Formats
- ✅ 1v1 (captain vs captain)
- ✅ 1v2, 1v3, 2v2, 2v3, 3v3
- ✅ Any combination with at least 1 member per team

---

## 🏗️ Current Architecture

### **Frontend Components**

#### 1. **Home.tsx** (`client/src/pages/Home.tsx`)
- **Entry Point**: "Enter Team Battle" button (line 740-821)
- **Responsibilities**:
  - Cleanup stale data when entering Team Battle
  - Open Team Battle Setup modal
  - Set user online status (❌ **PROBLEM: Sets user online globally, not Team Battle specific**)

```typescript
// Current problematic flow (lines 240-248)
const setUserOnline = async () => {
  await apiRequest("PATCH", `/api/users/${user.id}/online`, {
    isOnline: true,  // ❌ This makes user appear available everywhere
  });
};
```

#### 2. **TeamBattleSetup.tsx** (Component) (`client/src/components/TeamBattleSetup.tsx`)
- **Main Modal**: 3780 lines
- **Key Features**:
  - Team creation and management
  - Invitation system (opponent & teammate)
  - Real-time updates via WebSocket
  - Online users list for invitations

#### 3. **TeamBattleSetup.tsx** (Page) (`client/src/pages/TeamBattleSetup.tsx`)
- **Alternative Page View**: 2625 lines
- Similar functionality to component version

#### 4. **useTeamBattleSetup.ts** Hook (`client/src/hooks/useTeamBattleSetup.ts`)
- **Shared Logic**: 276 lines
- Manages queries and mutations for:
  - Teams
  - Invitations
  - Online users
  - Join requests

### **Backend Components**

#### 1. **Database Layer** (`server/database.ts`)
- **Key Methods**:
  - `getOnlineUsers()`: Returns all users where `isOnline = true` (line 1978-1984)
  - `setUserOnline(userId, isOnline)`: Updates user online status (line 1986-1997)
  - `createTeamInvitation()`: Creates invitation records (line 2110-2129)
  - `getTeamInvitationsByUser()`: Fetches user's invitations (line 2054-2069)

#### 2. **Socket Layer** (`server/socket.ts`)
- **Real-time Events**:
  - `team_updated`: Team state changes
  - `team_invitation_received`: New invitation
  - `online_users_updated`: Online status changes
  - `team_battle_started`: Battle initialization

### **Database Schema** (`shared/schema.ts`)

```typescript
// Users table (line 195-208)
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  isOnline: boolean("is_online").default(false),  // ❌ Global online status
  lastSeen: timestamp("last_seen").defaultNow(),
  // ... other fields
});

// Team Invitations table (line 358-369)
export const teamInvitations = pgTable("team_invitations", {
  id: text("id").primaryKey(),
  teamBattleId: text("team_battle_id"),
  inviterId: integer("inviter_id").notNull(),
  inviteeId: integer("invitee_id").notNull(),
  invitationType: text("invitation_type").default("teammate"),
  teamSide: text("team_side"), // "A" or "B"
  status: text("status").default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
});
```

---

## ❌ Problem Analysis

### **Current Broken Flow**

```
┌─────────────────────────────────────────────────────────────┐
│ Step 1: User is on Home Page                                │
│ - User is logged in                                         │
│ - isOnline = true (set globally)                            │
│ - User has NOT opened Team Battle yet                       │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Step 2: Captain creates team and invites opponent           │
│ - Captain sees this user in "available" list                │
│ - Captain sends invitation                                  │
│ - Invitation is saved to database                           │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Step 3: User is still on Home Page                          │
│ ❌ PROBLEM: User doesn't see the invitation                 │
│ - User hasn't opened Team Battle modal                      │
│ - No notification system for pending invitations            │
│ - Invitation sits in database unnoticed                     │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Step 4: User later clicks "Enter Team Battle"               │
│ ❌ PROBLEM: Invitation may have expired                     │
│ - User finally opens Team Battle modal                      │
│ - Invitation might be too old                               │
│ - Captain may have moved on                                 │
└─────────────────────────────────────────────────────────────┘
```

### **Root Causes**

1. **❌ Confusing "Online" with "Ready for Team Battle"**
   - `isOnline` is a global flag (user logged in)
   - Should have separate `isInTeamBattle` flag
   - Current code: `getOnlineUsers()` returns ALL logged-in users

2. **❌ No Context-Aware Availability**
   - Users appear available even when not in Team Battle
   - No way to filter users who are actually ready to receive invitations

3. **❌ Missing Invitation Delivery System**
   - Invitations are saved but not actively delivered
   - No real-time notification when user is outside Team Battle
   - User must manually check by opening Team Battle

4. **❌ No Invitation Queue on Entry**
   - When user opens Team Battle, pending invitations aren't immediately shown
   - No "You have pending invitations" prompt

---

## ✅ Correct Flow Design

### **Desired User Experience**

```
┌─────────────────────────────────────────────────────────────┐
│ Step 1: User is on Home Page                                │
│ - User is logged in (isOnline = true)                       │
│ - User is NOT in Team Battle (isInTeamBattle = false)       │
│ - User does NOT appear in available list                    │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Step 2: User clicks "Enter Team Battle"                     │
│ ✅ User is marked as ready (isInTeamBattle = true)          │
│ ✅ User NOW appears in available list                       │
│ ✅ System checks for pending invitations                    │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Step 3: If pending invitations exist                        │
│ ✅ Show prominent notification                              │
│ ✅ Display invitation details                               │
│ ✅ Allow accept/decline actions                             │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Step 4: Captain can now send invitations                    │
│ ✅ Only users with isInTeamBattle = true are shown          │
│ ✅ Invitation is delivered immediately                      │
│ ✅ Recipient sees it in real-time                           │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Step 5: User leaves Team Battle                             │
│ ✅ isInTeamBattle set to false                              │
│ ✅ User removed from available list                         │
│ ✅ Pending invitations remain in database                   │
└─────────────────────────────────────────────────────────────┘
```

### **Key Principles**

1. **✅ Separate Concerns**
   - `isOnline`: User is logged in (global)
   - `isInTeamBattle`: User is actively in Team Battle module (context-specific)

2. **✅ Context-Aware Availability**
   - Only show users who are currently in Team Battle
   - Filter: `WHERE isOnline = true AND isInTeamBattle = true`

3. **✅ Immediate Invitation Delivery**
   - If recipient is in Team Battle: Real-time WebSocket delivery
   - If recipient is outside: Store in database, show on next entry

4. **✅ Pending Invitation Check**
   - On Team Battle entry: Query for pending invitations
   - Show prominent UI if any exist
   - Allow quick accept/decline

---

## 🔧 Implementation Plan

### **Phase 1: Database Schema Update**

#### 1.1 Add `isInTeamBattle` Column to Users Table

```sql
-- Migration: add_is_in_team_battle.sql
ALTER TABLE users 
ADD COLUMN is_in_team_battle BOOLEAN DEFAULT FALSE;

-- Add index for faster queries
CREATE INDEX idx_users_team_battle_availability 
ON users(is_online, is_in_team_battle) 
WHERE is_online = TRUE AND is_in_team_battle = TRUE;

-- Add comment
COMMENT ON COLUMN users.is_in_team_battle IS 
'Indicates if user is currently in the Team Battle module and ready to receive invitations';
```

#### 1.2 Update Schema Definition

```typescript
// shared/schema.ts
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email"),
  isAdmin: boolean("is_admin").default(false),
  isOnline: boolean("is_online").default(false),
  isInTeamBattle: boolean("is_in_team_battle").default(false), // ✅ NEW
  lastSeen: timestamp("last_seen").defaultNow(),
  // ... other fields
});

// Update User type
export type User = typeof users.$inferSelect;
```

### **Phase 2: Backend API Updates**

#### 2.1 Update Database Methods

```typescript
// server/database.ts

// ✅ NEW: Get users available for Team Battle
async getTeamBattleAvailableUsers(): Promise<User[]> {
  const result = await db
    .select()
    .from(users)
    .where(
      and(
        eq(users.isOnline, true),
        eq(users.isInTeamBattle, true)
      )
    );
  return result as User[];
}

// ✅ NEW: Set user Team Battle status
async setUserTeamBattleStatus(
  userId: number, 
  isInTeamBattle: boolean
): Promise<User> {
  await db
    .update(users)
    .set({
      isInTeamBattle,
      lastSeen: new Date(),
    })
    .where(eq(users.id, userId));
  
  const updated = await this.getUser(userId);
  if (!updated) throw new Error(`User with id ${userId} not found`);
  return updated;
}

// ✅ UPDATE: Modify existing method to use new flag
async getOnlineUsers(): Promise<User[]> {
  // Keep for backward compatibility, but prefer getTeamBattleAvailableUsers
  const result = await db
    .select()
    .from(users)
    .where(eq(users.isOnline, true));
  return result as User[];
}
```

#### 2.2 Add New API Endpoints

```typescript
// server/routes.ts

// ✅ NEW: Get Team Battle available users
app.get("/api/users/team-battle-available", async (req, res) => {
  try {
    const users = await database.getTeamBattleAvailableUsers();
    res.json(users);
  } catch (error) {
    res.status(500).json({ 
      error: "Failed to fetch Team Battle available users" 
    });
  }
});

// ✅ NEW: Set user Team Battle status
app.patch("/api/users/:id/team-battle-status", async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { isInTeamBattle } = req.body;
    
    const user = await database.setUserTeamBattleStatus(
      userId, 
      isInTeamBattle
    );
    
    // Broadcast status change to all Team Battle users
    const io = req.app.get("io");
    if (io) {
      io.emit("team_battle_availability_updated", {
        userId,
        isInTeamBattle,
      });
    }
    
    res.json(user);
  } catch (error) {
    res.status(500).json({ 
      error: "Failed to update Team Battle status" 
    });
  }
});

// ✅ NEW: Get pending invitations for user
app.get("/api/users/:id/pending-team-invitations", async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const invitations = await database.getTeamInvitationsByUser(
      userId, 
      "pending"
    );
    
    // Filter out expired invitations
    const now = new Date();
    const validInvitations = invitations.filter(
      inv => new Date(inv.expiresAt) > now
    );
    
    res.json(validInvitations);
  } catch (error) {
    res.status(500).json({ 
      error: "Failed to fetch pending invitations" 
    });
  }
});
```

### **Phase 3: Frontend Updates**

#### 3.1 Update Home.tsx - Entry Point

```typescript
// client/src/pages/Home.tsx

// ✅ UPDATE: "Enter Team Battle" button handler
<Button
  onClick={async () => {
    setIsLoadingTeamBattle(true);
    
    try {
      // Step 1: Clear cache
      console.log("[Home] Clearing client-side cache");
      queryClient.removeQueries({ queryKey: ["/api/teams"] });
      queryClient.removeQueries({ queryKey: ["/api/team-invitations"] });
      queryClient.removeQueries({ queryKey: ["/api/users/online"] });
      
      // Step 2: Server-side cleanup
      console.log("[Home] Starting server-side cleanup");
      await apiRequest("POST", "/api/team-battle/cleanup");
      
      // ✅ Step 3: Mark user as "in Team Battle"
      console.log("[Home] Setting user as in Team Battle");
      await apiRequest("PATCH", `/api/users/${user.id}/team-battle-status`, {
        isInTeamBattle: true,
      });
      
      // Step 4: Invalidate queries
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      queryClient.invalidateQueries({ 
        queryKey: ["/api/users/team-battle-available"] 
      });
      
      // Step 5: Open modal
      console.log("[Home] Opening Team Battle modal");
      setShowTeamBattleSetup(true);
      
    } catch (error) {
      console.error("[Home] Error during setup:", error);
      setShowTeamBattleSetup(true); // Open anyway
    } finally {
      setTimeout(() => {
        setIsLoadingTeamBattle(false);
      }, 300);
    }
  }}
  disabled={isLoadingTeamBattle}
  className="..."
>
  {isLoadingTeamBattle ? (
    <>
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      <span>Loading...</span>
    </>
  ) : (
    <>
      <Sword className="mr-2 h-4 w-4" />
      <span>Enter Team Battle</span>
    </>
  )}
</Button>
```

#### 3.2 Update TeamBattleSetup Component

```typescript
// client/src/components/TeamBattleSetup.tsx

const TeamBattleSetup = ({ open, onClose, gameType, category, difficulty }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [pendingInvitations, setPendingInvitations] = useState<TeamInvitation[]>([]);
  const [showPendingInvitationsDialog, setShowPendingInvitationsDialog] = useState(false);

  // ✅ NEW: Check for pending invitations on mount
  useEffect(() => {
    if (!user?.id || !open) return;

    const checkPendingInvitations = async () => {
      try {
        const response = await apiRequest(
          "GET", 
          `/api/users/${user.id}/pending-team-invitations`
        );
        const invitations = await response.json();
        
        if (invitations.length > 0) {
          setPendingInvitations(invitations);
          setShowPendingInvitationsDialog(true);
          
          toast({
            title: "Pending Invitations!",
            description: `You have ${invitations.length} pending team invitation(s)`,
            duration: 5000,
          });
        }
      } catch (error) {
        console.error("Failed to check pending invitations:", error);
      }
    };

    checkPendingInvitations();
  }, [user?.id, open, toast]);

  // ✅ UPDATE: Set Team Battle status on mount
  useEffect(() => {
    if (!user?.id || !open) return;

    const setTeamBattleStatus = async () => {
      try {
        await apiRequest("PATCH", `/api/users/${user.id}/team-battle-status`, {
          isInTeamBattle: true,
        });
        console.log("[TeamBattleSetup] User marked as in Team Battle");
      } catch (error) {
        console.error("Failed to set Team Battle status:", error);
      }
    };

    setTeamBattleStatus();

    // ✅ Cleanup: Remove user from Team Battle on unmount
    return () => {
      apiRequest("PATCH", `/api/users/${user.id}/team-battle-status`, {
        isInTeamBattle: false,
      }).catch(() => {});
      console.log("[TeamBattleSetup] User removed from Team Battle");
    };
  }, [user?.id, open]);

  // ✅ UPDATE: Use Team Battle available users endpoint
  const { data: availableUsers = [] } = useQuery({
    queryKey: ["/api/users/team-battle-available"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/users/team-battle-available");
      return await res.json();
    },
    enabled: !!user?.id && open,
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  // ✅ NEW: Pending Invitations Dialog
  return (
    <>
      {/* Existing Team Battle Setup UI */}
      {/* ... */}

      {/* ✅ NEW: Pending Invitations Dialog */}
      <Dialog 
        open={showPendingInvitationsDialog} 
        onOpenChange={setShowPendingInvitationsDialog}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">
              📬 Pending Team Invitations
            </DialogTitle>
            <DialogDescription>
              You have {pendingInvitations.length} pending invitation(s). 
              Review and respond below.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 max-h-96 overflow-y-auto">
            {pendingInvitations.map((invitation) => (
              <Card key={invitation.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-lg">
                      {invitation.invitationType === "opponent" 
                        ? "🎯 Battle Invitation" 
                        : "👥 Team Invitation"}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      From: <strong>{invitation.inviterUsername}</strong>
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Expires: {new Date(invitation.expiresAt).toLocaleString()}
                    </p>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => handleAcceptInvitation(invitation.id)}
                    >
                      <Check className="mr-1 h-4 w-4" />
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDeclineInvitation(invitation.id)}
                    >
                      <X className="mr-1 h-4 w-4" />
                      Decline
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setShowPendingInvitationsDialog(false)}
            >
              Review Later
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
```

#### 3.3 Update useTeamBattleSetup Hook

```typescript
// client/src/hooks/useTeamBattleSetup.ts

export function useTeamBattleSetup(gameSessionId?: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // ✅ UPDATE: Use Team Battle available users
  const { 
    data: onlineUsers = [], 
    refetch: refetchOnlineUsers 
  } = useQuery({
    queryKey: ["/api/users/team-battle-available"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/users/team-battle-available");
      return await res.json();
    },
    enabled: !!user?.id,
    refetchInterval: 5000,
  });

  // ✅ NEW: Listen for Team Battle availability updates
  useEffect(() => {
    if (!user?.id) return;

    const offAvailabilityUpdated = onEvent(
      "team_battle_availability_updated", 
      () => {
        console.log("[useTeamBattleSetup] Availability updated, refetching");
        queryClient.invalidateQueries({ 
          queryKey: ["/api/users/team-battle-available"] 
        });
      }
    );

    return () => {
      offAvailabilityUpdated();
    };
  }, [user?.id, queryClient]);

  // ... rest of the hook
}
```

### **Phase 4: WebSocket Event Updates**

#### 4.1 Add New WebSocket Events

```typescript
// server/socket.ts

// ✅ NEW: Broadcast when user enters/leaves Team Battle
function broadcastTeamBattleAvailability(userId: number, isInTeamBattle: boolean) {
  io.emit("team_battle_availability_updated", {
    userId,
    isInTeamBattle,
    timestamp: new Date(),
  });
  console.log(`[WebSocket] User ${userId} Team Battle status: ${isInTeamBattle}`);
}

// ✅ UPDATE: Call this when user status changes
// (Integrate into existing user status handlers)
```

#### 4.2 Update Invitation Delivery Logic

```typescript
// server/socket.ts or server/routes.ts

// ✅ UPDATE: When creating invitation
async function sendTeamInvitation(inviterId: number, inviteeId: number, type: string) {
  // Create invitation in database
  const invitation = await database.createTeamInvitation({
    id: generateId(),
    inviterId,
    inviteeId,
    invitationType: type,
    status: "pending",
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    // ... other fields
  });

  // ✅ Check if invitee is currently in Team Battle
  const invitee = await database.getUser(inviteeId);
  
  if (invitee?.isInTeamBattle) {
    // ✅ Real-time delivery via WebSocket
    sendToUser(inviteeId, {
      type: "team_invitation_received",
      invitation,
    });
    console.log(`[Invitation] Delivered in real-time to user ${inviteeId}`);
  } else {
    // ✅ Store for later (user will see on next Team Battle entry)
    console.log(`[Invitation] Stored for user ${inviteeId} (not in Team Battle)`);
  }

  return invitation;
}
```

---

## 📊 Database Schema Changes

### **Migration Script**

```sql
-- File: migrations/add_team_battle_availability.sql

-- ============================================================================
-- Migration: Add Team Battle Availability Tracking
-- Description: Adds isInTeamBattle flag to track users actively in Team Battle
-- Date: 2026-02-12
-- ============================================================================

-- Step 1: Add new column
ALTER TABLE users 
ADD COLUMN is_in_team_battle BOOLEAN DEFAULT FALSE;

-- Step 2: Add index for performance
CREATE INDEX idx_users_team_battle_availability 
ON users(is_online, is_in_team_battle) 
WHERE is_online = TRUE AND is_in_team_battle = TRUE;

-- Step 3: Add column comment
COMMENT ON COLUMN users.is_in_team_battle IS 
'Indicates if user is currently in the Team Battle module and ready to receive invitations. 
This is separate from isOnline which only indicates if user is logged in.';

-- Step 4: Initialize existing online users (optional, for testing)
-- UPDATE users SET is_in_team_battle = FALSE WHERE is_online = TRUE;

-- Verification query
SELECT 
  id, 
  username, 
  is_online, 
  is_in_team_battle,
  last_seen
FROM users
WHERE is_online = TRUE
ORDER BY last_seen DESC;
```

### **Rollback Script**

```sql
-- File: migrations/rollback_team_battle_availability.sql

-- Drop index
DROP INDEX IF EXISTS idx_users_team_battle_availability;

-- Drop column
ALTER TABLE users DROP COLUMN IF EXISTS is_in_team_battle;
```

---

## 🔌 API Endpoints Summary

### **New Endpoints**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/users/team-battle-available` | Get users currently in Team Battle |
| `PATCH` | `/api/users/:id/team-battle-status` | Set user's Team Battle status |
| `GET` | `/api/users/:id/pending-team-invitations` | Get user's pending invitations |

### **Updated Endpoints**

| Method | Endpoint | Changes |
|--------|----------|---------|
| `GET` | `/api/users/online` | Keep for backward compatibility, but deprecated |

---

## 📡 WebSocket Events Summary

### **New Events**

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `team_battle_availability_updated` | Server → Client | `{ userId, isInTeamBattle, timestamp }` | User entered/left Team Battle |

### **Updated Events**

| Event | Direction | Changes |
|-------|-----------|---------|
| `team_invitation_received` | Server → Client | Now only sent if user is in Team Battle |
| `online_users_updated` | Server → Client | Deprecated in favor of `team_battle_availability_updated` |

---

## ✅ Testing Checklist

### **Unit Tests**

- [ ] `setUserTeamBattleStatus()` updates database correctly
- [ ] `getTeamBattleAvailableUsers()` filters correctly
- [ ] Pending invitations are fetched correctly
- [ ] Expired invitations are filtered out

### **Integration Tests**

- [ ] User enters Team Battle → `isInTeamBattle` set to `true`
- [ ] User leaves Team Battle → `isInTeamBattle` set to `false`
- [ ] Available users list updates in real-time
- [ ] Invitations are delivered immediately if user is in Team Battle
- [ ] Invitations are stored if user is not in Team Battle
- [ ] Pending invitations show on Team Battle entry

### **End-to-End Tests**

1. **Scenario 1: User Not in Team Battle**
   - [ ] User A is on Home page (not in Team Battle)
   - [ ] User B creates team and tries to invite User A
   - [ ] User A does NOT appear in available list
   - [ ] Invitation cannot be sent

2. **Scenario 2: User Enters Team Battle**
   - [ ] User A clicks "Enter Team Battle"
   - [ ] User A appears in available list immediately
   - [ ] User B can now send invitation
   - [ ] User A sees invitation in real-time

3. **Scenario 3: Pending Invitations**
   - [ ] User B sends invitation while User A is away
   - [ ] Invitation is stored in database
   - [ ] User A later enters Team Battle
   - [ ] User A sees pending invitation dialog
   - [ ] User A can accept/decline

4. **Scenario 4: User Leaves Team Battle**
   - [ ] User A is in Team Battle
   - [ ] User A closes modal or navigates away
   - [ ] User A is removed from available list
   - [ ] User B cannot send new invitations to User A

---

## 🎯 Success Criteria

✅ **The fix is successful when:**

1. **Availability is Context-Aware**
   - Users only appear available when actively in Team Battle
   - `isInTeamBattle` flag accurately reflects user state

2. **Invitations are Delivered Properly**
   - Real-time delivery if user is in Team Battle
   - Stored for later if user is not in Team Battle
   - Pending invitations shown on Team Battle entry

3. **No Missed Invitations**
   - Users see all pending invitations when entering Team Battle
   - Clear UI for accepting/declining
   - Expired invitations are filtered out

4. **Clean User Experience**
   - No confusion about availability
   - Clear feedback when entering/leaving Team Battle
   - Smooth real-time updates

---

## 📝 Implementation Notes

### **Priority Order**

1. **Phase 1** (Database) - Must be done first
2. **Phase 2** (Backend API) - Depends on Phase 1
3. **Phase 3** (Frontend) - Depends on Phase 2
4. **Phase 4** (WebSocket) - Can be done in parallel with Phase 3

### **Deployment Steps**

1. Run database migration
2. Deploy backend changes
3. Deploy frontend changes
4. Test end-to-end
5. Monitor for issues

### **Rollback Plan**

If issues arise:
1. Revert frontend changes
2. Revert backend changes
3. Run rollback migration
4. Verify system stability

---

## 🔍 Additional Considerations

### **Performance Optimization**

- Index on `(isOnline, isInTeamBattle)` for fast queries
- Cache available users list (5-second refresh)
- Debounce status updates to avoid spam

### **Edge Cases**

1. **User closes browser without leaving Team Battle**
   - Solution: Server-side timeout (5 minutes of inactivity)
   - Set `isInTeamBattle = false` automatically

2. **User has multiple tabs open**
   - Solution: Use session storage to track active tab
   - Only one tab can be "in Team Battle"

3. **Invitation expires while user is viewing it**
   - Solution: Show expiration countdown
   - Disable accept button when expired

### **Future Enhancements**

1. **Push Notifications**
   - Notify users of invitations even when not in app
   - Use browser notifications API

2. **Invitation History**
   - Show past invitations (accepted/declined/expired)
   - Analytics on invitation response rates

3. **Smart Availability**
   - Auto-set `isInTeamBattle = false` after 10 minutes of inactivity
   - "Away" status for users who are idle

---

## 📚 Related Documentation

- [TEAM_BATTLE_READY_FIX.md](./TEAM_BATTLE_READY_FIX.md) - Ready status fix
- [BATTLE_START_FIX.md](./BATTLE_START_FIX.md) - Battle start validation
- [TEAMBATTLE_DESIGN_IMPROVEMENTS.md](./TEAMBATTLE_DESIGN_IMPROVEMENTS.md) - UI improvements

---

**Last Updated**: 2026-02-12  
**Author**: AI Assistant  
**Status**: 📋 Implementation Plan Ready
