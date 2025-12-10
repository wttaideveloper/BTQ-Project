import { useCallback, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { setupGameSocket, onEvent } from "@/lib/socket";

export interface Team {
  id: string;
  name: string;
  captainId: number;
  gameSessionId: string;
  members: TeamMember[];
  score?: number;
  correctAnswers?: number;
  incorrectAnswers?: number;
  status: "forming" | "ready" | "playing" | "finished";
  createdAt?: Date;
  teamBattleId?: string;
  teamSide?: "A" | "B";
  hasOpponent?: boolean;
  battleStatus?: "forming" | "ready" | "playing" | "finished";
  opponentTeamName?: string | null;
  opponentCaptainId?: number | null;
}

export interface TeamMember {
  userId: number;
  username: string;
  role: "captain" | "member";
  joinedAt: Date;
}

export interface TeamInvitation {
  id: string;
  teamBattleId: string | null;
  teamSide?: "A" | "B" | null;
  teamId?: string | null;
  inviterId: number;
  inviterUsername: string;
  inviteeId: number;
  invitationType: "opponent" | "teammate";
  status: "pending" | "accepted" | "declined" | "expired";
  createdAt: Date;
  expiresAt: Date;
}

export interface TeamJoinRequest {
  id: string;
  teamId: string;
  requesterId: number;
  requesterUsername: string;
  status: "pending" | "accepted" | "rejected" | "expired" | "cancelled";
  createdAt?: string | Date;
  expiresAt?: string | Date | null;
}

export interface OnlineUser {
  id: number;
  username: string;
  email?: string | null;
  isOnline: boolean;
  lastSeen?: Date;
}

export function useTeamBattleSetup(gameSessionId?: string) {
  const { user } = useAuth();
  const { toast } = useToast();

  // Debounced refetch controller
  const refetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const debouncedRefetchFactory = (
    refetchers: Array<() => void>
  ) => {
    return () => {
      if (refetchTimeoutRef.current) clearTimeout(refetchTimeoutRef.current);
      refetchTimeoutRef.current = setTimeout(() => {
        refetchers.forEach((fn) => fn());
      }, 1000);
    };
  };

  useEffect(() => {
    return () => {
      if (refetchTimeoutRef.current) clearTimeout(refetchTimeoutRef.current);
    };
  }, []);

  // Teams in current session
  const {
    data: teams = [],
    refetch: refetchTeams,
  } = useQuery({
    queryKey: ["/api/teams", gameSessionId],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/teams?gameSessionId=${gameSessionId}`
      );
      return await res.json();
    },
    enabled: !!gameSessionId && !!user,
    refetchInterval: 10000,
    staleTime: 5000,
  });

  // Invitations for current user
  const {
    data: invitations = [],
    refetch: refetchInvitations,
  } = useQuery({
    queryKey: ["/api/team-invitations"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/team-invitations");
      return await res.json();
    },
    enabled: !!user,
    refetchInterval: 15000,
    staleTime: 10000,
  });

  // Online users (for inviting)
  const { data: onlineUsers = [] } = useQuery({
    queryKey: ["/api/users/online"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/users/online");
      return await res.json();
    },
    enabled: !!user,
    refetchInterval: 30000,
    staleTime: 15000,
  });

  // Join requests
  const { data: joinRequests = [], refetch: refetchJoinRequests } = useQuery({
    queryKey: ["/api/team-join-requests"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/team-join-requests");
      const raw = await res.json();
      const now = Date.now();
      const normalized = (Array.isArray(raw) ? raw : []).map((jr: any) => ({
        id: jr.id,
        teamId: jr.teamId ?? jr.team_id,
        requesterId: jr.requesterId ?? jr.requester_id,
        requesterUsername:
          jr.requesterUsername ?? jr.requester_username ?? "Unknown",
        status: jr.status,
        createdAt: jr.createdAt ?? jr.created_at,
        expiresAt: jr.expiresAt ?? jr.expires_at ?? null,
      }));
      return normalized.filter((jr: any) => {
        if (jr.status !== "pending") return true;
        if (!jr.expiresAt) return true;
        const exp = new Date(jr.expiresAt).getTime();
        return isNaN(exp) ? true : exp > now;
      });
    },
    enabled: !!user,
    refetchInterval: 20000,
    staleTime: 10000,
  });

  // Debounced refetch combining all
  const debouncedRefetch = useCallback(
    debouncedRefetchFactory([refetchTeams, refetchInvitations, refetchJoinRequests]),
    [refetchTeams, refetchInvitations, refetchJoinRequests]
  );

  // Socket subscriptions for relevant events
  useEffect(() => {
    if (!user?.id) return;
    setupGameSocket(user.id);

    const offTeamUpdated = onEvent("team_updated", () => debouncedRefetch());
    const offTeamCreated = onEvent("team_created", () => debouncedRefetch());
    const offTeamsUpdated = onEvent("teams_updated", () => debouncedRefetch());
    const offInvitationReceived = onEvent("team_invitation_received", () => debouncedRefetch());
    const offInvitationSent = onEvent("invitation_sent", () => debouncedRefetch());
    const offJoinRequestCreated = onEvent("join_request_created", () => debouncedRefetch());
    const offJoinRequestUpdated = onEvent("join_request_updated", () => debouncedRefetch());

    return () => {
      offTeamUpdated();
      offTeamCreated();
      offTeamsUpdated();
      offInvitationReceived();
      offInvitationSent();
      offJoinRequestCreated();
      offJoinRequestUpdated();
    };
  }, [user?.id, debouncedRefetch]);

  // Mutations
  const createTeamMutation = useMutation({
    mutationFn: async (data: { name: string; gameSessionId: string }) => {
      const res = await apiRequest("POST", "/api/teams", data);
      return await res.json();
    },
    onSuccess: () => {
      toast({ title: "Team Created!", description: "Your team has been created." });
      debouncedRefetch();
    },
  });

  const sendInvitationMutation = useMutation({
    mutationFn: async (data: { teamId: string; inviteeId: number; isCaptainInvitation?: boolean; gameSessionId?: string }) => {
      const res = await apiRequest("POST", "/api/team-invitations", data);
      return await res.json();
    },
    onSuccess: () => {
      toast({ title: "Invitation Sent!", description: "Team invitation sent." });
    },
  });

  const respondToInvitationMutation = useMutation({
    mutationFn: async (data: { invitationId: string; status: "accepted" | "declined"; teamName?: string }) => {
      const res = await apiRequest("PATCH", `/api/team-invitations/${data.invitationId}`, data);
      return await res.json();
    },
    onSuccess: () => {
      debouncedRefetch();
    },
  });

  const leaveTeamMutation = useMutation({
    mutationFn: async (teamId: string) => {
      const res = await apiRequest("DELETE", `/api/teams/${teamId}/leave`);
      return await res.json();
    },
    onSuccess: () => {
      toast({ title: "Left Team", description: "You have left the team." });
      debouncedRefetch();
    },
  });

  const updateTeamNameMutation = useMutation({
    mutationFn: async ({ teamId, name }: { teamId: string; name: string }) => {
      const res = await apiRequest("PATCH", `/api/teams/${teamId}`, { name });
      return await res.json();
    },
    onSuccess: () => {
      toast({ title: "Team Name Updated" });
      debouncedRefetch();
    },
  });

  const updateJoinRequestMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: TeamJoinRequest["status"] }) => {
      const res = await apiRequest("PATCH", `/api/team-join-requests/${id}`, { status });
      return await res.json();
    },
    onSuccess: () => {
      toast({ title: "Join Request Updated" });
      debouncedRefetch();
    },
  });

  return {
    // data
    teams,
    invitations,
    onlineUsers,
    joinRequests,
    // helpers
    debouncedRefetch,
    // mutations
    createTeamMutation,
    sendInvitationMutation,
    respondToInvitationMutation,
    leaveTeamMutation,
    updateTeamNameMutation,
    updateJoinRequestMutation,
  };
}
