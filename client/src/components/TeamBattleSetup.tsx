import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Crown, Users, UserPlus, Check, X } from "lucide-react";
import TeamDisplay from "./TeamDisplay";
import { setupGameSocket, sendGameEvent, onEvent } from "@/lib/socket";

export interface TeamBattleSetupProps {
  open: boolean;
  onClose: () => void;
  gameType: "question" | "time";
  category: string;
  difficulty: string;
}

type OnlineUser = {
  id: number;
  username: string;
  isOnline?: boolean;
};

interface Team {
  id: string;
  name: string;
  captainId: number;
  gameSessionId: string;
  members: TeamMember[];
  status: "forming" | "ready" | "playing" | "finished";
  teamBattleId?: string;
  teamSide?: "A" | "B";
  hasOpponent?: boolean;
}

interface TeamMember {
  userId: number;
  username: string;
  role: "captain" | "member";
  joinedAt: Date;
}

interface TeamInvitation {
  id: string;
  teamBattleId: string | null;
  teamSide?: "A" | "B" | null;
  teamId?: string | null;
  gameSessionId?: string | null;
  inviterId: number;
  inviterUsername: string;
  inviteeId: number;
  invitationType: "opponent" | "teammate";
  status: "pending" | "accepted" | "declined" | "expired";
  createdAt: Date;
  expiresAt: Date;
}

interface TeamJoinRequest {
  id: string;
  teamId: string;
  requesterId: number;
  requesterUsername: string;
  status: "pending" | "accepted" | "rejected" | "expired" | "cancelled";
  createdAt: Date;
  expiresAt?: Date | null;
}

const TeamBattleSetup: React.FC<TeamBattleSetupProps> = ({
  open,
  onClose,
  gameType,
  category,
  difficulty,
}) => {
  if (!open) return null;

  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [readyStatus, setReadyStatus] = useState<{
    teamAReady: boolean;
    teamBReady: boolean;
  } | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [gameSessionId, setGameSessionId] = useState<string | null>(null);
  const [hasNavigatedToGame, setHasNavigatedToGame] = useState(false);
  const [, setLocation] = useLocation();

  const createGameSession = useCallback(() => {
    const newGameSessionId = `battle-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)}`;
    setGameSessionId(newGameSessionId);
    return newGameSessionId;
  }, []);

  // CRITICAL: Reset all state when modal closes to prevent stale data
  useEffect(() => {
    if (!open) {
      console.log("🧹 Modal closed - resetting all team battle state");
      // Clear gameSessionId
      setGameSessionId(null);
      // Clear ready status
      setReadyStatus(null);
      setCountdown(null);
      setIsReady(false);
      // Clear UI state
      setCurrentStage("enter");
      setTeamName("");
      setSelectedOpponentId(null);
      setPendingInviteId(null);
      setPendingResponseId(null);
      setShowTeamNameDialog(false);
      setShowBackConfirmation(false);
      // CRITICAL: Invalidate all team-related queries to force fresh fetch on next open
      queryClient.removeQueries({ queryKey: ["/api/teams/available"] });
      queryClient.removeQueries({ queryKey: ["/api/teams"] });
      queryClient.removeQueries({ queryKey: ["/api/team-invitations"] });
      queryClient.removeQueries({ queryKey: ["/api/team-join-requests"] });
    }
  }, [open, queryClient]);

  // WebSocket setup for real-time updates (shared socket)
  useEffect(() => {
    if (!user) return;

    const socket = setupGameSocket(user.id);

    const handleMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);

        const wsSessionId: string | undefined = data.gameSessionId;

        switch (data.type) {
          case "team_state_restored": {
            if (data.gameSessionId && data.gameSessionId !== gameSessionId) {
              setGameSessionId(data.gameSessionId);
            }

            if (data.gameSessionId) {
              // If the server sent full teams list, hydrate the cache directly
              if (Array.isArray(data.teams)) {
                queryClient.setQueryData(
                  ["/api/teams", data.gameSessionId],
                  data.teams
                );
              } else {
                queryClient.invalidateQueries({
                  queryKey: ["/api/teams", data.gameSessionId],
                });
              }
            }

            toast({
              title: "Reconnected!",
              description: data.message || "Reconnected to your team!",
            });
            break;
          }

          case "join_request_created": {
            // Enhanced debug logging for join request created event
            console.log("[Socket] join_request_created event received:", data);
            console.log(
              "[Socket] Current gameSessionId:",
              gameSessionId,
              "Event gameSessionId:",
              data.gameSessionId
            );

            // Only invalidate if the event belongs to current game session
            // or if no gameSessionId is provided (backward compatibility)
            if (!data.gameSessionId || data.gameSessionId === gameSessionId) {
              console.log(
                "[Socket] Invalidating join requests for current session"
              );
              queryClient.invalidateQueries({
                queryKey: ["/api/team-join-requests"],
              });
            } else {
              console.log(
                `[Socket] Ignoring join request from different session ${data.gameSessionId}`
              );
            }
            break;
          }

          case "join_request_updated": {
            console.log("[Socket] join_request_updated:", data);

            // Invalidate join requests
            queryClient.invalidateQueries({
              queryKey: ["/api/team-join-requests"],
            });

            // Invalidate teams for the session
            if (wsSessionId) {
              queryClient.invalidateQueries({
                queryKey: ["/api/teams", wsSessionId],
              });
            }

            // Invalidate available teams (removes from Join as Member list)
            queryClient.invalidateQueries({
              queryKey: ["/api/teams/available"],
            });

            // If accepted, show success message and update session
            if (data.status === "accepted" && data.gameSessionId) {
              toast({
                title: "Join Request Accepted!",
                description:
                  data.message || `You've been accepted to the team!`,
              });

              // Update game session to the team's session
              if (data.gameSessionId !== gameSessionId) {
                setGameSessionId(data.gameSessionId);
              }

              // Invalidate teams for the new session
              queryClient.invalidateQueries({
                queryKey: ["/api/teams", data.gameSessionId],
              });
            } else if (data.status === "rejected") {
              toast({
                title: "Join Request Rejected",
                description: "Your request to join the team was rejected.",
                variant: "destructive",
              });
            }

            break;
          }

          case "opponent_accepted_invitation": {
            if (wsSessionId && wsSessionId !== gameSessionId) {
              setGameSessionId(wsSessionId);
            }

            setCurrentStage("invite-teammates");

            if (wsSessionId) {
              queryClient.invalidateQueries({
                queryKey: ["/api/teams", wsSessionId],
              });
            }

            toast({
              title: "Opponent Joined!",
              description:
                data.message || "Your opponent has joined the battle!",
            });
            break;
          }

          case "teams_updated":
          case "team_update": {
            if (wsSessionId) {
              if (wsSessionId !== gameSessionId) {
                setGameSessionId(wsSessionId);
              }

              // If the server sent full teams list, hydrate the cache directly
              if (Array.isArray(data.teams)) {
                queryClient.setQueryData(
                  ["/api/teams", wsSessionId],
                  data.teams
                );
              } else {
                queryClient.invalidateQueries({
                  queryKey: ["/api/teams", wsSessionId],
                });
              }
            }
            break;
          }

          case "team_ready_status": {
            if (
              data.teamAReady !== undefined &&
              data.teamBReady !== undefined
            ) {
              setReadyStatus({
                teamAReady: data.teamAReady,
                teamBReady: data.teamBReady,
              });
            }
            break;
          }

          case "team_battle_countdown": {
            const seconds = typeof data.seconds === "number" ? data.seconds : 5;
            if (wsSessionId && wsSessionId !== gameSessionId) {
              setGameSessionId(wsSessionId);
            }
            setCountdown(seconds);
            break;
          }

          case "opponent_disconnected": {
            // Handle opponent disconnection in team setup phase
            setDisconnectedPlayerInfo({
              playerName: data.disconnectedPlayerName || "A player",
              teamName: data.disconnectedTeamName || "Opponent team",
            });
            setShowOpponentDisconnectedDialog(true);
            // Refresh teams data to reflect the disconnection
            if (wsSessionId) {
              queryClient.invalidateQueries({
                queryKey: ["/api/teams", wsSessionId],
              });
            }
            break;
          }

          case "opponent_team_member_disconnected": {
            // Handle team member disconnection during active battle
            toast({
              title: "Team Member Disconnected",
              description:
                data.message ||
                `${data.disconnectedPlayerName} from ${data.disconnectedTeamName} has disconnected.`,
              variant: "destructive",
            });
            break;
          }

          case "team_battle_cancelled": {
            if (wsSessionId && wsSessionId !== gameSessionId) {
              setGameSessionId(wsSessionId);
            }

            toast({
              title: "Battle Cancelled",
              description:
                data.message || "The team battle has been cancelled.",
              variant: "destructive",
            });

            // Clear game session and close modal
            setGameSessionId(null);
            onClose();
            break;
          }
        }
      } catch (error) {
        // Silent error handling
      }
    };

    socket.addEventListener("message", handleMessage);

    return () => {
      socket.removeEventListener("message", handleMessage);
    };
  }, [user, queryClient, toast, gameSessionId]);

  // Local countdown timer when both teams are ready
  useEffect(() => {
    if (countdown === null || countdown <= 0) return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [countdown]);

  // Get teams for this game session with refetch capability
  const { data: teams = [], refetch: refetchTeams } = useQuery<Team[]>({
    queryKey: ["/api/teams", gameSessionId],
    queryFn: async () => {
      console.log(
        `[Teams Query] Fetching teams for gameSessionId=${gameSessionId}`
      );
      if (!gameSessionId) return [];
      const res = await apiRequest(
        "GET",
        `/api/teams?gameSessionId=${gameSessionId}`
      );
      const data = await res.json();
      console.log(`[Teams Query] Received ${data.length} teams:`, data);
      return data;
    },
    enabled: open && !!user && !!gameSessionId,
    refetchInterval: 2000,
  });

  const [currentStage, setCurrentStage] = useState<
    | "enter"
    | "create-team"
    | "invite-opponent"
    | "invite-teammates"
    | "join-as-member"
  >("enter");

  // Get ALL available teams (across all sessions) for join-as-member
  const { data: allAvailableTeams = [] } = useQuery<Team[]>({
    queryKey: ["/api/teams/available"],
    queryFn: async () => {
      console.log("🔄 Fetching available teams...");
      const res = await apiRequest("GET", "/api/teams/available");
      const data = await res.json();
      console.log(
        `📥 Received ${data.length} available teams:`,
        data.map((t: any) => `${t.name} (session: ${t.gameSessionId})`)
      );
      return data;
    },
    enabled: open && !!user,
    refetchInterval: 2000,
    refetchOnMount: true, // Always refetch on mount to get fresh data
    refetchOnWindowFocus: true, // Refetch when window gains focus
    gcTime: 0, // Don't cache data (replaces deprecated cacheTime)
  });

  // Derive user's team from latest backend data (must be declared before
  // effects that depend on it)
  const userTeam = useMemo(() => {
    if (!teams || !user) return null;
    return (
      teams.find((team: Team) =>
        team.members.some((member: TeamMember) => member.userId === user.id)
      ) || null
    );
  }, [teams, user]);

  // Show toast to captains when a new join request arrives
  useEffect(() => {
    if (!user?.id || !open) return;

    console.log(
      "[Component Join Request Toast] Setting up listener for user:",
      user.id
    );

    const offJoinRequestCreatedToast = onEvent(
      "join_request_created",
      async (data: any) => {
        console.log("[Component Join Request Toast] Event received:", data);
        console.log(
          "[Component Join Request Toast] Current user ID:",
          user?.id
        );
        console.log(
          "[Component Join Request Toast] Teams at event time:",
          teams.length
        );

        try {
          // First check: do we have the team in our current teams array?
          let team = teams.find((t: any) => t.id === data.teamId);
          console.log(
            "[Component Join Request Toast] Found team in local array:",
            !!team
          );

          // If not found, fetch fresh team data
          if (!team && data.teamId && gameSessionId) {
            console.log(
              "[Component Join Request Toast] Fetching fresh team data for:",
              data.teamId
            );
            try {
              const res = await apiRequest(
                "GET",
                `/api/teams?gameSessionId=${gameSessionId}`
              );
              const freshTeams = await res.json();
              team = freshTeams.find((t: any) => t.id === data.teamId);
              console.log(
                "[Component Join Request Toast] Fresh team found:",
                !!team
              );
            } catch (err) {
              console.error(
                "[Component Join Request Toast] Failed to fetch fresh teams:",
                err
              );
            }
          }

          const isCaptain = team && team.captainId === user?.id;
          console.log(
            "[Component Join Request Toast] Is user captain?",
            isCaptain,
            "(captainId:",
            team?.captainId,
            "userId:",
            user?.id,
            ")"
          );

          if (isCaptain && team) {
            console.log(
              "[Component Join Request Toast] ✅ Showing toast for captain"
            );
            toast({
              title: "New Join Request",
              description: `${data.requesterUsername} requested to join ${team.name}`,
            });
            queryClient.invalidateQueries({
              queryKey: ["/api/team-join-requests"],
            });
          } else if (data.teamId) {
            // Show generic toast even if team not found yet
            console.log(
              "[Component Join Request Toast] ⚠️ Showing generic toast (team might not be loaded yet)"
            );
            toast({
              title: "New Join Request",
              description: `${data.requesterUsername} wants to join your team`,
            });
            queryClient.invalidateQueries({
              queryKey: ["/api/team-join-requests"],
            });
          }
        } catch (err) {
          console.error(
            "[Component Join Request Toast] Error in handler:",
            err
          );
        }
      }
    );
    return () => {
      console.log("[Component Join Request Toast] Cleaning up listener");
      offJoinRequestCreatedToast();
    };
  }, [user?.id, teams, toast, gameSessionId, queryClient, open]);

  // Listen for when member's join request is accepted
  useEffect(() => {
    if (!open || !user) return;

    const offJoinRequestAccepted = onEvent(
      "join_request_updated",
      (data: any) => {
        console.log("[Member Join Accepted] Event received:", data);

        // Only handle if this is for the current user and request was accepted
        if (data.requesterId === user.id && data.status === "accepted") {
          console.log("[Member Join Accepted] User's request was accepted!");

          // Show success toast
          toast({
            title: "✅ Joined Team!",
            description:
              data.message ||
              `You've been accepted to ${data.teamName || "the team"}!`,
          });

          // Update to the team's game session
          if (data.gameSessionId && data.gameSessionId !== gameSessionId) {
            console.log(
              "[Member Join Accepted] Switching to game session:",
              data.gameSessionId
            );
            setGameSessionId(data.gameSessionId);
          }

          // Invalidate all team-related queries
          queryClient.invalidateQueries({ queryKey: ["/api/teams/available"] });
          queryClient.invalidateQueries({
            queryKey: ["/api/team-join-requests"],
          });
          if (data.gameSessionId) {
            console.log(
              "[Member Join Accepted] Invalidating teams query for gameSessionId:",
              data.gameSessionId
            );
            queryClient.invalidateQueries({
              queryKey: ["/api/teams", data.gameSessionId],
            });

            // Force refetch to ensure data is fresh
            queryClient.refetchQueries({
              queryKey: ["/api/teams", data.gameSessionId],
            });
          }

          // Switch to the main team view (not join-as-member)
          setCurrentStage("invite-teammates");
        }
      }
    );

    return () => {
      offJoinRequestAccepted();
    };
  }, [open, user, gameSessionId, toast, queryClient, setGameSessionId]);

  // Check if opponent has accepted (2 teams exist)
  const opponentAccepted = teams.length >= 2;

  // When countdown finishes, move everyone into the team battle game screen
  useEffect(() => {
    console.log(
      `[Navigation Check] countdown=${countdown}, hasNavigatedToGame=${hasNavigatedToGame}, gameSessionId=${gameSessionId}, userTeam=`,
      userTeam
    );
    console.log(`[Navigation Check] teams=`, teams);
    console.log(`[Navigation Check] user.id=`, user?.id);

    // Navigate when countdown reaches 0
    // Check if user is in ANY team (captain or member)
    const isInAnyTeam = teams?.some((team: Team) =>
      team.members.some((member: TeamMember) => member.userId === user?.id)
    );

    console.log(`[Navigation Check] isInAnyTeam=${isInAnyTeam}`);

    if (
      countdown === 0 &&
      !hasNavigatedToGame &&
      gameSessionId &&
      isInAnyTeam
    ) {
      console.log(
        `[Navigation] ✅ Navigating to game! gameSessionId=${gameSessionId}`
      );
      setHasNavigatedToGame(true);
      onClose();
      setLocation(`/team-battle-game?gameSessionId=${gameSessionId}`);
    } else if (countdown === 0 && !hasNavigatedToGame) {
      console.warn(`[Navigation] ❌ Navigation blocked:`, {
        gameSessionId: !!gameSessionId,
        isInAnyTeam,
        teamsCount: teams?.length,
        userId: user?.id,
      });
    }
  }, [
    countdown,
    hasNavigatedToGame,
    gameSessionId,
    teams,
    user,
    onClose,
    setLocation,
  ]);
  const [teamName, setTeamName] = useState("");
  const [selectedOpponentId, setSelectedOpponentId] = useState<number | null>(
    null
  );
  const [pendingInviteId, setPendingInviteId] = useState<number | null>(null);
  const [pendingResponseId, setPendingResponseId] = useState<string | null>(
    null
  );

  // Team name dialog state for opponent invitations
  const [showTeamNameDialog, setShowTeamNameDialog] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [pendingInvitationId, setPendingInvitationId] = useState<string | null>(
    null
  );

  // Back button confirmation dialog
  const [showBackConfirmation, setShowBackConfirmation] = useState(false);

  // Opponent disconnected dialog
  const [showOpponentDisconnectedDialog, setShowOpponentDisconnectedDialog] =
    useState(false);
  const [disconnectedPlayerInfo, setDisconnectedPlayerInfo] = useState<{
    playerName: string;
    teamName: string;
  } | null>(null);

  // Handle page unload (reload, close, exit, network issues)
  useEffect(() => {
    if (!open || !userTeam) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Notify opponents about disconnection before page unloads
      if (userTeam && user) {
        try {
          sendGameEvent({
            type: "player_leaving_team_setup",
            gameSessionId: userTeam.gameSessionId || gameSessionId || undefined,
            userId: user.id,
            username: user.username,
            teamId: userTeam.id,
            teamName: userTeam.name,
          });
        } catch (error) {
          // Silent error handling - WebSocket might already be closing
        }
      }

      // Prevent leaving if battle countdown is active
      if (countdown !== null && countdown > 0) {
        e.preventDefault();
        e.returnValue =
          "Battle is starting soon. Are you sure you want to leave?";
        return e.returnValue;
      }

      // If user is in a team, show warning
      if (userTeam) {
        e.preventDefault();
        e.returnValue = `You will be removed from "${userTeam.name}". Are you sure you want to leave?`;
        return e.returnValue;
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [open, userTeam, countdown, user, gameSessionId]);

  // Load real online users from the backend
  const {
    data: onlineUsers,
    isLoading,
    isError,
  } = useQuery<OnlineUser[]>({
    queryKey: ["/api/users/online"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/users/online");
      return await res.json();
    },
    enabled: open,
    refetchInterval: 3000,
  });

  // Get user's team invitations
  const { data: invitations = [] } = useQuery<TeamInvitation[]>({
    queryKey: ["/api/team-invitations"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/team-invitations");
      return await res.json();
    },
    enabled: open && !!user,
    refetchInterval: 2000,
  });

  const getInvitationTeamId = (invitation: TeamInvitation) => {
    if (invitation.teamBattleId && invitation.teamSide) {
      return `${
        invitation.teamBattleId
      }-team-${invitation.teamSide.toLowerCase()}`;
    }
    return invitation.teamId;
  };

  const [isReady, setIsReady] = useState(false);

  const handleReadyToPlay = async () => {
    if (!userTeam || !user) return;
    try {
      sendGameEvent({
        type: "team_battle_ready",
        gameSessionId: userTeam.gameSessionId || gameSessionId || undefined,
        teamBattleId: userTeam.teamBattleId,
        teamSide: userTeam.teamSide,
        userId: user.id,
      });

      setIsReady(true);
      toast({
        title: "Team Ready!",
        description: "Your team is ready to play. Waiting for opponent...",
      });
    } catch (error) {
      // Silent error handling
      toast({
        title: "Error",
        description: "Failed to mark team as ready. Please try again.",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    if (!userTeam) {
      // Show landing stage until user chooses
      setCurrentStage("enter");
    } else if (!opponentAccepted) {
      setCurrentStage("invite-opponent");
    } else {
      setCurrentStage("invite-teammates");
    }
  }, [userTeam, opponentAccepted]);

  // Create team mutation
  const createTeamMutation = useMutation({
    mutationFn: async (data: { name: string }) => {
      const sessionId = gameSessionId || createGameSession();
      const res = await apiRequest("POST", "/api/teams", {
        ...data,
        gameSessionId: sessionId,
      });
      return await res.json();
    },
    onSuccess: (createdTeam: Team) => {
      if (createdTeam?.gameSessionId) {
        setGameSessionId(createdTeam.gameSessionId);
      }
      toast({
        title: "Team Created!",
        description: "Your team has been created successfully.",
      });
      // Invalidate both session-specific teams AND the global available teams list
      queryClient.invalidateQueries({
        queryKey: ["/api/teams", createdTeam?.gameSessionId || gameSessionId],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/teams/available"],
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create team",
        variant: "destructive",
      });
    },
  });

  // Send invitation mutation
  const sendInvitationMutation = useMutation({
    mutationFn: async (data: {
      teamId: string;
      inviteeId: number;
      invitationType: "opponent" | "teammate";
      isCaptainInvitation?: boolean;
    }) => {
      if (!gameSessionId) {
        throw new Error(
          "No active game session. Please create or join a team first."
        );
      }
      const res = await apiRequest("POST", "/api/team-invitations", {
        ...data,
        gameSessionId,
      });
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Invitation Sent!",
        description: "Team invitation has been sent successfully.",
      });
      setSelectedOpponentId(null);
      setPendingInviteId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/team-invitations"] });
    },
    onError: (error: any) => {
      let errorMessage = "Failed to send invitation";

      if (error.message) {
        errorMessage = error.message;
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      }

      toast({
        title: "Cannot Send Invitation",
        description: errorMessage,
        variant: "destructive",
      });
      setPendingInviteId(null);
    },
  });

  // Update team name mutation
  const updateTeamNameMutation = useMutation({
    mutationFn: async ({ teamId, name }: { teamId: string; name: string }) => {
      const res = await apiRequest("PATCH", `/api/teams/${teamId}`, { name });
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Team Name Updated!",
        description: "Your team name has been updated successfully.",
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/teams", gameSessionId],
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update team name",
        variant: "destructive",
      });
    },
  });

  // Respond to invitation mutation
  const respondToInvitationMutation = useMutation({
    mutationFn: async ({
      invitationId,
      status,
      teamName,
    }: {
      invitationId: string;
      status: "accepted" | "declined";
      teamName?: string;
    }) => {
      const payload: { status: string; teamName?: string } = { status };
      if (teamName) {
        payload.teamName = teamName;
      }
      const res = await apiRequest(
        "PATCH",
        `/api/team-invitations/${invitationId}`,
        payload
      );
      return await res.json();
    },
    onSuccess: async (data, variables) => {
      if (variables.status === "accepted") {
        const acceptedInvitation = invitations.find(
          (inv: TeamInvitation) => inv.id === variables.invitationId
        );

        // Prefer the session id from the updated battle so all clients sync
        const serverSessionId =
          (data as any)?.teamBattle?.gameSessionId ||
          (data as any)?.team?.gameSessionId ||
          acceptedInvitation?.gameSessionId ||
          gameSessionId;

        if (!serverSessionId) {
          toast({
            title: "Session Error",
            description:
              "Could not determine game session for this invitation.",
            variant: "destructive",
          });
          return;
        }

        if (gameSessionId !== serverSessionId) {
          setGameSessionId(serverSessionId);
        }

        let latestTeams: Team[] = [];

        await queryClient.invalidateQueries({
          queryKey: ["/api/teams", serverSessionId],
        });

        try {
          latestTeams = await queryClient.fetchQuery({
            queryKey: ["/api/teams", serverSessionId],
            queryFn: async () => {
              const res = await apiRequest(
                "GET",
                `/api/teams?gameSessionId=${serverSessionId}`
              );
              return await res.json();
            },
          });

          // Push fresh teams into cache so every component sees the same list
          queryClient.setQueryData(
            ["/api/teams", serverSessionId],
            latestTeams
          );
        } catch (error) {
          console.error(
            "Failed to fetch updated teams after acceptance",
            error
          );
        }

        if (
          acceptedInvitation?.invitationType === "opponent" ||
          acceptedInvitation?.invitationType === "teammate"
        ) {
          const hasBothTeams = Array.isArray(latestTeams)
            ? latestTeams.length >= 2
            : teams.length >= 2;
          setCurrentStage(
            hasBothTeams ? "invite-teammates" : "invite-opponent"
          );
        }

        toast({
          title: "Invitation Accepted!",
          description:
            "You have joined the team battle. Other pending invitations have been automatically declined.",
        });
      } else {
        toast({
          title: "Invitation Declined",
          description: "You have declined the invitation.",
        });
      }

      // Refresh invitations list to show updated status
      queryClient.invalidateQueries({ queryKey: ["/api/team-invitations"] });
      // Refresh available teams list after opponent acceptance
      queryClient.invalidateQueries({ queryKey: ["/api/teams/available"] });
      setPendingResponseId(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to respond to invitation",
        variant: "destructive",
      });
      setPendingResponseId(null);
    },
  });

  const handleCreateTeam = () => {
    if (!teamName.trim()) {
      toast({
        title: "Error",
        description: "Please enter a team name",
        variant: "destructive",
      });
      return;
    }
    createTeamMutation.mutate({ name: teamName });
  };

  const handleInviteOpponent = (userId: number, event?: React.MouseEvent) => {
    event?.preventDefault();
    event?.stopPropagation();

    if (!userTeam) {
      toast({
        title: "Error",
        description: "You must create a team first",
        variant: "destructive",
      });
      return;
    }

    // Check if we already sent invitation to this user (prevent spam)
    const alreadySentInvitation = invitations.some(
      (inv: TeamInvitation) =>
        inv.inviteeId === userId &&
        inv.inviterId === user?.id &&
        inv.status === "pending" &&
        inv.invitationType === "opponent"
    );

    if (alreadySentInvitation) {
      toast({
        title: "Already Invited",
        description: "You have already sent an invitation to this player",
        variant: "destructive",
      });
      return;
    }

    if (pendingInviteId !== null) {
      return; // Prevent multiple simultaneous invitations
    }

    setPendingInviteId(userId);
    sendInvitationMutation.mutate({
      teamId: userTeam.id,
      inviteeId: userId,
      invitationType: "opponent",
      isCaptainInvitation: true,
    });
  };

  const handleInviteTeammate = (userId: number, event?: React.MouseEvent) => {
    event?.preventDefault();
    event?.stopPropagation();

    if (!userTeam) {
      toast({
        title: "Error",
        description: "You must be in a team to send invitations",
        variant: "destructive",
      });
      return;
    }

    // Check if we already sent invitation to this user (prevent spam)
    const alreadySentInvitation = invitations.some(
      (inv: TeamInvitation) =>
        inv.inviteeId === userId &&
        inv.inviterId === user?.id &&
        inv.status === "pending" &&
        inv.invitationType === "teammate"
    );

    if (alreadySentInvitation) {
      toast({
        title: "Already Invited",
        description: "You have already sent an invitation to this player",
        variant: "destructive",
      });
      return;
    }

    if (pendingInviteId !== null) {
      return; // Prevent multiple simultaneous invitations
    }

    setPendingInviteId(userId);
    sendInvitationMutation.mutate({
      teamId: userTeam.id,
      inviteeId: userId,
      invitationType: "teammate",
      isCaptainInvitation: false,
    });
  };

  // Join-as-member: fetch ALL join requests for current user's teams
  const { data: joinRequests = [] } = useQuery<TeamJoinRequest[]>({
    queryKey: ["/api/team-join-requests"],
    queryFn: async () => {
      console.log(
        `[TeamBattleSetup] Fetching ALL join requests for current user`
      );
      const res = await apiRequest("GET", "/api/team-join-requests");
      const raw = await res.json();
      console.log(
        `[TeamBattleSetup] Received ${raw.length} join requests:`,
        raw
      );

      // Normalize from snake_case to camelCase
      const normalized = (Array.isArray(raw) ? raw : []).map((jr: any) => {
        const teamId = jr.teamId ?? jr.team_id;
        const requesterId = jr.requesterId ?? jr.requester_id;
        const requesterUsername =
          jr.requesterUsername ?? jr.requester_username ?? "Unknown";
        const status = jr.status;
        const createdAt = jr.createdAt ?? jr.created_at;
        const expiresAt =
          jr.expiresAt ?? jr.expires_at ?? jr.expires_at_ms ?? null;

        console.log(
          `  [JR ${jr.id}] ${requesterUsername} -> ${teamId} (status: ${status})`
        );

        return {
          id: jr.id,
          teamId,
          requesterId,
          requesterUsername,
          status,
          createdAt,
          expiresAt,
        };
      });

      // Only return pending requests (backend should already filter, but double-check)
      const pending = normalized.filter((jr: any) => jr.status === "pending");
      console.log(
        `[TeamBattleSetup] Showing ${pending.length} pending join requests`
      );
      return pending;
    },
    enabled: open && !!user,
    refetchInterval: 3000,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    staleTime: 0,
    gcTime: 0,
  });

  const sendJoinRequestMutation = useMutation({
    mutationFn: async (data: { teamId: string }) => {
      const res = await apiRequest("POST", "/api/team-join-requests", data);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Join Request Sent",
        description: "Your request was sent to the team leader.",
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/team-join-requests"],
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send join request",
        variant: "destructive",
      });
    },
  });

  const cancelJoinRequestMutation = useMutation({
    mutationFn: async (joinRequestId: string) => {
      const res = await apiRequest(
        "PATCH",
        `/api/team-join-requests/${joinRequestId}`,
        { status: "cancelled" }
      );
      return await res.json();
    },
    onSuccess: () => {
      toast({ title: "Cancelled", description: "Join request cancelled." });
      queryClient.invalidateQueries({
        queryKey: ["/api/team-join-requests"],
      });
    },
  });

  const respondToJoinRequestMutation = useMutation({
    mutationFn: async (payload: {
      joinRequestId: string;
      status: "accepted" | "rejected";
    }) => {
      const res = await apiRequest(
        "PATCH",
        `/api/team-join-requests/${payload.joinRequestId}`,
        { status: payload.status }
      );
      return await res.json();
    },
    onSuccess: () => {
      toast({ title: "Updated", description: "Join request updated." });
      queryClient.invalidateQueries({
        queryKey: ["/api/team-join-requests"],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/teams/available"] });
      if (gameSessionId) {
        queryClient.invalidateQueries({
          queryKey: ["/api/teams", gameSessionId],
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to update request",
        variant: "destructive",
      });
    },
  });

  const myActiveJoinRequest = useMemo(() => {
    if (!user) return null;
    return (
      (joinRequests || []).find(
        (r) => r.requesterId === user.id && r.status === "pending"
      ) || null
    );
  }, [joinRequests, user]);

  const availableTeamsForJoin = useMemo(() => {
    // Teams that are not full (max 3) and not playing/finished
    // Use allAvailableTeams if in join-as-member stage, otherwise use teams from current session
    const teamsToFilter =
      currentStage === "join-as-member" ? allAvailableTeams : teams;
    const filtered = (teamsToFilter || []).filter(
      (t: Team) =>
        (t.members?.length || 0) < 3 &&
        t.status === "forming" &&
        !t.members?.some((m: TeamMember) => m.userId === user?.id)
    );

    if (currentStage === "join-as-member" && filtered.length > 0) {
      console.log(
        "👥 Available teams for join:",
        filtered.map(
          (t: Team) =>
            `${t.name} (${t.members?.length || 0}/3 members, session: ${
              t.gameSessionId
            })`
        )
      );
    }

    return filtered;
  }, [teams, allAvailableTeams, currentStage, user]);

  const handleRespondToInvitation = (
    invitationId: string,
    status: "accepted" | "declined",
    event?: React.MouseEvent
  ) => {
    event?.preventDefault();
    event?.stopPropagation();

    if (pendingResponseId !== null) {
      return; // Prevent multiple simultaneous responses
    }

    // Check if this is an opponent invitation
    const invitation = invitations.find((inv) => inv.id === invitationId);

    if (status === "accepted" && invitation?.invitationType === "opponent") {
      // Show team name dialog for opponent invitations
      setPendingInvitationId(invitationId);
      setNewTeamName(`${user?.username}'s Team`);
      setShowTeamNameDialog(true);
    } else {
      // Direct accept for teammate invitations or declined invitations
      setPendingResponseId(invitationId);
      respondToInvitationMutation.mutate({ invitationId, status });
    }
  };

  // Handle accepting opponent invitation with custom team name
  const handleAcceptOpponentInvitation = () => {
    if (!pendingInvitationId || !newTeamName.trim()) {
      toast({
        title: "Error",
        description: "Please enter a team name",
        variant: "destructive",
      });
      return;
    }

    setPendingResponseId(pendingInvitationId);
    respondToInvitationMutation.mutate({
      invitationId: pendingInvitationId,
      status: "accepted",
      teamName: newTeamName.trim(),
    });

    // Close dialog
    setShowTeamNameDialog(false);
    setPendingInvitationId(null);
    setNewTeamName("");
  };

  const handleUpdateTeamName = async (teamId: string, newName: string) => {
    await updateTeamNameMutation.mutateAsync({ teamId, name: newName });
  };

  const leaveTeamMutation = useMutation({
    mutationFn: async (teamId: string) => {
      const res = await apiRequest("DELETE", `/api/teams/${teamId}/leave`);
      return await res.json();
    },
    onSuccess: (data, teamId) => {
      toast({
        title: "Left Team",
        description: "You have left the team battle successfully.",
      });
      // Clear the current game session since user left
      setGameSessionId(null);
      // Invalidate queries to refresh the UI
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      queryClient.invalidateQueries({ queryKey: ["/api/team-invitations"] });
      refetchTeams();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to leave team battle",
        variant: "destructive",
      });
    },
  });

  const handleLeaveTeam = (teamId: string) => {
    leaveTeamMutation.mutate(teamId);
  };

  const removeMemberMutation = useMutation({
    mutationFn: async ({
      teamId,
      userId,
    }: {
      teamId: string;
      userId: number;
    }) => {
      const res = await apiRequest(
        "PATCH",
        `/api/teams/${teamId}/remove-member`,
        { userId }
      );
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Member Removed",
        description: "Member removed from team.",
      });
      if (gameSessionId) {
        queryClient.invalidateQueries({
          queryKey: ["/api/teams", gameSessionId],
        });
      }
      // Refresh available teams list so removed spots appear in join-as-member
      queryClient.invalidateQueries({ queryKey: ["/api/teams/available"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to remove member",
        variant: "destructive",
      });
    },
  });

  // Enhanced back button handler with confirmation
  const handleBackButton = () => {
    // Prevent leaving if battle is in progress (countdown active)
    if (countdown !== null && countdown > 0) {
      toast({
        title: "Cannot Leave Now",
        description:
          "Battle is starting soon. Please wait for it to begin or use the Leave Team button after it starts.",
        variant: "destructive",
      });
      return;
    }

    // If user is in a team, show confirmation dialog
    if (userTeam) {
      setShowBackConfirmation(true);
    } else {
      // No team to leave, just close the modal
      onClose();
    }
  };

  // Handle confirmed back action
  const handleConfirmBack = async () => {
    if (!userTeam) return;

    setShowBackConfirmation(false);

    try {
      // Leave the team first
      await leaveTeamMutation.mutateAsync(userTeam.id);
      // Then close the modal
      onClose();
    } catch (error) {
      // If leaving fails, still close the modal but show error
      console.error("Failed to leave team on back:", error);
      toast({
        title: "Warning",
        description: "Could not leave team properly, but closing setup.",
        variant: "destructive",
      });
      onClose();
    }
  };

  const visiblePlayers = (onlineUsers || []).filter(
    (p) => (p.isOnline ?? true) && p.id !== user?.id
  );

  // Filter players for opponent invitation (exclude those already in teams)
  const availableOpponents = visiblePlayers.filter(
    (player) =>
      !teams.some((team: Team) =>
        team.members.some((member: TeamMember) => member.userId === player.id)
      )
  );

  // Filter players for teammate invitation (exclude those in any team and captains)
  const availableTeammates = visiblePlayers.filter(
    (player) =>
      !teams.some((team: Team) =>
        team.members.some((member: TeamMember) => member.userId === player.id)
      ) &&
      !teams.some(
        (team: Team) => team.captainId === player.id && team.id !== userTeam?.id
      )
  );

  const orderedTeams = useMemo(() => {
    if (!teams.length) return [];
    if (!userTeam) return teams;
    const remaining = teams.filter((team) => team.id !== userTeam.id);
    return [userTeam, ...remaining];
  }, [teams, userTeam]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto py-10">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl p-4 sm:p-6 mx-4 my-auto max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <Button
            variant="outline"
            className="flex items-center gap-2"
            onClick={handleBackButton}
            disabled={
              leaveTeamMutation.isPending ||
              (countdown !== null && countdown > 0)
            }
          >
            <span>← {leaveTeamMutation.isPending ? "Leaving..." : "Back"}</span>
          </Button>
          <div></div>
        </div>

        <div className="text-center mb-6">
          <h1 className="game-title text-3xl font-heading font-bold text-primary mb-2">
            Team Battle Setup
          </h1>
          <p className="text-neutral-600">
            Configure your team battle with the same game settings.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div>
            <h3 className="font-heading font-semibold text-lg text-neutral-800 mb-3">
              Game Mode
            </h3>
            <div className="p-4 border rounded-lg bg-neutral-50">
              <p className="font-medium text-neutral-800 mb-1">Team Battle</p>
              <p className="text-sm text-neutral-600">
                Two teams compete using the selected configuration.
              </p>
            </div>
          </div>

          <div>
            <h3 className="font-heading font-semibold text-lg text-neutral-800 mb-3">
              Game Configuration
            </h3>
            <div className="p-4 border rounded-lg bg-neutral-50">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-neutral-600">Type:</span>
                  <p className="font-medium text-neutral-800">
                    {gameType === "question" ? "Question-Based" : "Time-Based"}
                  </p>
                </div>
                <div>
                  <span className="text-neutral-600">Difficulty:</span>
                  <p className="font-medium text-neutral-800">{difficulty}</p>
                </div>
                <div className="col-span-2">
                  <span className="text-neutral-600">Category:</span>
                  <p className="font-medium text-neutral-800">{category}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Current Teams Overview */}
        <div className="mb-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-semibold text-neutral-900">
                Current Teams
              </h3>
              <p className="text-sm text-neutral-500">
                Everyone can see who has joined each side in real time.
              </p>
            </div>
            <span className="text-sm text-neutral-500">
              {teams.length} / 2 teams formed
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {orderedTeams.map((team) => {
              const isUserTeam = userTeam?.id === team.id;
              const isUserInTeam = team.members.some(
                (m) => m.userId === user?.id
              );
              const isTeamReady = readyStatus
                ? team.teamSide === "A"
                  ? readyStatus.teamAReady
                  : team.teamSide === "B"
                  ? readyStatus.teamBReady
                  : false
                : false;
              console.log(
                `[TeamBattleSetup] Rendering team: ${team.name}, teamId: ${team.id}`
              );
              console.log(
                `[TeamBattleSetup] All join requests for this session (${
                  joinRequests?.length || 0
                }):`,
                joinRequests?.map((jr) => ({
                  id: jr.id,
                  requester: jr.requesterUsername,
                  teamId: jr.teamId,
                  status: jr.status,
                }))
              );
              return (
                <TeamDisplay
                  key={team.id}
                  team={team}
                  currentUserId={user?.id || 0}
                  onReady={isUserTeam ? handleReadyToPlay : undefined}
                  onUpdateTeamName={
                    isUserInTeam ? handleUpdateTeamName : undefined
                  }
                  onLeaveTeam={isUserInTeam ? handleLeaveTeam : undefined}
                  onRemoveMember={(teamId, userId) =>
                    removeMemberMutation.mutate({ teamId, userId })
                  }
                  isUserTeam={isUserTeam}
                  isReady={isTeamReady}
                  joinRequests={(joinRequests || []).filter((jr) => {
                    // Backend already filters to only return join requests for teams
                    // where the current user is captain, so we just need to match exact teamId
                    const matches = jr.teamId === team.id;

                    console.log(
                      `[TeamBattleSetup] Join request ${jr.id}:`,
                      `\n  jr.teamId="${jr.teamId}"`,
                      `\n  team.id="${team.id}"`,
                      `\n  matches=${matches}`,
                      `\n  jr.requesterUsername="${jr.requesterUsername}"`,
                      `\n  team.name="${team.name}"`
                    );
                    return matches;
                  })}
                  onAcceptJoinRequest={(jrId) =>
                    respondToJoinRequestMutation.mutate({
                      joinRequestId: jrId,
                      status: "accepted",
                    })
                  }
                  onRejectJoinRequest={(jrId) =>
                    respondToJoinRequestMutation.mutate({
                      joinRequestId: jrId,
                      status: "rejected",
                    })
                  }
                  title={
                    isUserTeam
                      ? "Your Team"
                      : team.teamSide
                      ? `Team ${team.teamSide}`
                      : "Opponent Team"
                  }
                />
              );
            })}

            {teams.length < 2 && (
              <div className="border border-dashed border-neutral-300 rounded-lg p-4 flex flex-col items-center justify-center text-center text-neutral-500 bg-neutral-50">
                <p className="font-medium text-neutral-700 mb-1">
                  Waiting for opposing team
                </p>
                <p className="text-sm">
                  Invite another captain to form the next team.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Countdown overlay when both captains are ready */}
        {countdown !== null && countdown > 0 && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60]">
            <div className="bg-white rounded-2xl px-10 py-8 shadow-2xl border border-neutral-200 text-center max-w-sm mx-4">
              <p className="text-sm font-medium text-neutral-500 mb-2">
                Both teams are ready
              </p>
              <h2 className="text-5xl font-bold text-primary mb-3">
                {countdown}
              </h2>
              <p className="text-neutral-600">Game starting soon...</p>
            </div>
          </div>
        )}

        {/* Landing: Enter Team Battle */}
        {currentStage === "enter" && (
          <div className="mt-6 space-y-4">
            <div className="bg-neutral-50 p-4 rounded-lg border">
              <h3 className="font-semibold text-lg text-neutral-800 mb-2">
                Enter Team Battle
              </h3>
              <p className="text-sm text-neutral-600">
                Choose how you'd like to participate.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Button
                onClick={() => setCurrentStage("create-team")}
                className="w-full bg-primary hover:bg-primary/90 text-white"
              >
                Create a Team
              </Button>
              <Button
                variant="outline"
                onClick={() => setCurrentStage("join-as-member")}
                className="w-full"
              >
                Join as Member
              </Button>
            </div>
          </div>
        )}

        {/* Stage 1: Create Team */}
        {currentStage === "create-team" && (
          <div className="mt-6 space-y-4">
            <div className="bg-blue-50 p-4 rounded-lg border-l-4 border-blue-400">
              <h3 className="font-semibold text-lg text-blue-800 mb-2">
                Step 1: Create Your Team
              </h3>
              <p className="text-sm text-blue-700">
                Create your team to start the battle. You'll become the team
                captain.
              </p>
            </div>
            <div>
              <Label
                htmlFor="teamName"
                className="text-sm font-medium text-neutral-700 mb-2 block"
              >
                Team Name
              </Label>
              <input
                id="teamName"
                type="text"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="Enter your team name"
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <Button
              onClick={handleCreateTeam}
              disabled={createTeamMutation.isPending || !teamName.trim()}
              className="w-full bg-primary hover:bg-primary/90 text-white font-semibold py-2"
            >
              {createTeamMutation.isPending
                ? "Creating Team..."
                : "Create Team"}
            </Button>
          </div>
        )}

        {/* Stage: Join as Member */}
        {currentStage === "join-as-member" && (
          <div className="mt-6 space-y-4">
            <div className="bg-amber-50 p-4 rounded-lg border-l-4 border-amber-400">
              <h3 className="font-semibold text-lg text-amber-800 mb-2 flex items-center gap-2">
                <UserPlus className="h-5 w-5" />
                Join an Existing Team
              </h3>
              <p className="text-sm text-amber-700">
                Browse available teams and send a join request to the leader.
              </p>
            </div>

            {myActiveJoinRequest && (
              <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-200">
                <p className="text-sm text-yellow-800">
                  You have a pending join request to team ID:{" "}
                  {myActiveJoinRequest.teamId}
                </p>
                <div className="mt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      cancelJoinRequestMutation.mutate(myActiveJoinRequest.id)
                    }
                    disabled={cancelJoinRequestMutation.isPending}
                  >
                    {cancelJoinRequestMutation.isPending
                      ? "Cancelling..."
                      : "Cancel Request"}
                  </Button>
                </div>
              </div>
            )}

            <div>
              <h4 className="font-medium text-neutral-800 mb-3">
                Available Teams
              </h4>
              <div className="border rounded-lg bg-neutral-50 max-h-64 overflow-y-auto">
                {availableTeamsForJoin.length === 0 && (
                  <div className="px-4 py-3 text-sm text-neutral-500">
                    No available teams right now.
                  </div>
                )}
                {availableTeamsForJoin.length > 0 && (
                  <>
                    {availableTeamsForJoin.map((team) => {
                      const isFull = (team.members?.length || 0) >= 3;
                      const alreadyMember = team.members.some(
                        (m) => m.userId === user?.id
                      );
                      return (
                        <div
                          key={team.id}
                          className="flex items-center justify-between px-4 py-3 border-b last:border-b-0"
                        >
                          <div className="flex flex-col">
                            <p className="font-medium text-neutral-900">
                              {team.name}{" "}
                              {team.teamSide ? `(Team ${team.teamSide})` : ""}
                            </p>
                            <span className="text-xs text-neutral-600">
                              Members: {team.members.length}/3 · Captain ID:{" "}
                              {team.captainId}
                            </span>
                          </div>
                          <Button
                            size="sm"
                            onClick={() =>
                              sendJoinRequestMutation.mutate({
                                teamId: team.id,
                              })
                            }
                            disabled={
                              isFull ||
                              alreadyMember ||
                              !!myActiveJoinRequest ||
                              sendJoinRequestMutation.isPending
                            }
                            className="text-xs font-semibold px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white"
                          >
                            {isFull
                              ? "Team Full"
                              : alreadyMember
                              ? "Already in Team"
                              : myActiveJoinRequest
                              ? "Request Pending"
                              : sendJoinRequestMutation.isPending
                              ? "Requesting..."
                              : "Request to Join"}
                          </Button>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setCurrentStage("enter")}
              >
                Back
              </Button>
              <Button
                onClick={() => setCurrentStage("create-team")}
                className="bg-primary text-white"
              >
                Create a Team Instead
              </Button>
            </div>
          </div>
        )}

        {/* Stage 2: Invite Opponent */}
        {currentStage === "invite-opponent" && (
          <div className="mt-6 space-y-4">
            <div className="bg-green-50 p-4 rounded-lg border-l-4 border-green-400">
              <h3 className="font-semibold text-lg text-green-800 mb-2 flex items-center gap-2">
                <Crown className="h-5 w-5" />
                Step 2: Invite Opponent Captain
              </h3>
              <p className="text-sm text-green-700">
                Invite an opponent to be the captain of the opposing team. Once
                they accept, you can invite teammates.
              </p>
            </div>

            {userTeam && (
              <div className="bg-neutral-50 p-3 rounded-lg mb-4">
                <p className="text-sm text-neutral-600">
                  <span className="font-medium">Your Team:</span>{" "}
                  {userTeam.name}
                </p>
              </div>
            )}

            <div>
              <h4 className="font-medium text-neutral-800 mb-3">
                Available Opponents
              </h4>
              <div className="border rounded-lg bg-neutral-50 max-h-64 overflow-y-auto">
                {isLoading && (
                  <div className="px-4 py-3 text-sm text-neutral-500">
                    Loading online players...
                  </div>
                )}
                {isError && !isLoading && (
                  <div className="px-4 py-3 text-sm text-red-500">
                    Failed to load online players.
                  </div>
                )}
                {!isLoading && !isError && availableOpponents.length === 0 && (
                  <div className="px-4 py-3 text-sm text-neutral-500">
                    No available opponents online right now.
                  </div>
                )}
                {!isLoading && !isError && availableOpponents.length > 0 && (
                  <>
                    {availableOpponents.map((player) => {
                      const pendingInvitation = invitations.find(
                        (inv: TeamInvitation) =>
                          inv.inviteeId === player.id &&
                          inv.status === "pending" &&
                          getInvitationTeamId(inv) === userTeam?.id
                      );
                      const alreadyInvitedByMe = invitations.some(
                        (inv: TeamInvitation) =>
                          inv.inviteeId === player.id &&
                          inv.inviterId === user?.id &&
                          inv.status === "pending" &&
                          inv.invitationType === "opponent"
                      );
                      const invitationCount = invitations.filter(
                        (inv: TeamInvitation) =>
                          inv.inviteeId === player.id &&
                          inv.status === "pending"
                      ).length;
                      return (
                        <div
                          key={player.id}
                          className="flex items-center justify-between px-4 py-3 border-b last:border-b-0"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                            <p className="font-medium text-neutral-900">
                              {player.username}
                            </p>
                            {pendingInvitation && (
                              <span className="text-xs px-2 py-1 rounded-full bg-yellow-100 text-yellow-700">
                                Invitation Sent
                              </span>
                            )}
                          </div>
                          <Button
                            size="sm"
                            onClick={(e) => handleInviteOpponent(player.id, e)}
                            disabled={
                              pendingInviteId === player.id ||
                              !!pendingInvitation ||
                              alreadyInvitedByMe
                            }
                            className="text-xs font-semibold px-3 py-1 bg-green-600 hover:bg-green-700 text-white"
                          >
                            {pendingInvitation
                              ? "Invited"
                              : alreadyInvitedByMe
                              ? "Already Invited"
                              : pendingInviteId === player.id
                              ? "Inviting..."
                              : invitationCount > 0
                              ? `Invite (${invitationCount} pending)`
                              : "Invite as Opponent"}
                          </Button>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Stage 3: Invite Teammates (only after opponent accepts) */}
        {currentStage === "invite-teammates" && (
          <div className="mt-6 space-y-4">
            <div className="bg-purple-50 p-4 rounded-lg border-l-4 border-purple-400">
              <h3 className="font-semibold text-lg text-purple-800 mb-2 flex items-center gap-2">
                <Users className="h-5 w-5" />
                Step 3: Invite Teammates
              </h3>
              <p className="text-sm text-purple-700">
                Great! Your opponent has accepted. Now invite teammates to
                complete your team.
              </p>
            </div>

            {userTeam && (
              <div className="bg-neutral-50 p-3 rounded-lg mb-4">
                <p className="text-sm text-neutral-600">
                  <span className="font-medium">Your Team:</span>{" "}
                  {userTeam.name} ({userTeam.members.length}/3 members)
                </p>
              </div>
            )}

            <div>
              <h4 className="font-medium text-neutral-800 mb-3">
                Available Players
              </h4>
              <div className="border rounded-lg bg-neutral-50 max-h-64 overflow-y-auto">
                {isLoading && (
                  <div className="px-4 py-3 text-sm text-neutral-500">
                    Loading online players...
                  </div>
                )}
                {isError && !isLoading && (
                  <div className="px-4 py-3 text-sm text-red-500">
                    Failed to load online players.
                  </div>
                )}
                {!isLoading && !isError && availableTeammates.length === 0 && (
                  <div className="px-4 py-3 text-sm text-neutral-500">
                    No available players to invite right now.
                  </div>
                )}
                {!isLoading && !isError && availableTeammates.length > 0 && (
                  <>
                    {availableTeammates.map((player) => {
                      const pendingInvitation = invitations.find(
                        (inv: TeamInvitation) =>
                          inv.inviteeId === player.id &&
                          inv.status === "pending" &&
                          getInvitationTeamId(inv) === userTeam?.id
                      );
                      const alreadyInvitedByMe = invitations.some(
                        (inv: TeamInvitation) =>
                          inv.inviteeId === player.id &&
                          inv.inviterId === user?.id &&
                          inv.status === "pending" &&
                          inv.invitationType === "teammate"
                      );
                      const invitationCount = invitations.filter(
                        (inv: TeamInvitation) =>
                          inv.inviteeId === player.id &&
                          inv.status === "pending"
                      ).length;
                      return (
                        <div
                          key={player.id}
                          className="flex items-center justify-between px-4 py-3 border-b last:border-b-0"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                            <p className="font-medium text-neutral-900">
                              {player.username}
                            </p>
                            {pendingInvitation && (
                              <span className="text-xs px-2 py-1 rounded-full bg-yellow-100 text-yellow-700">
                                Invitation Sent
                              </span>
                            )}
                          </div>
                          <Button
                            size="sm"
                            onClick={(e) => handleInviteTeammate(player.id, e)}
                            disabled={
                              pendingInviteId === player.id ||
                              !!pendingInvitation ||
                              alreadyInvitedByMe ||
                              (userTeam?.members.length || 0) >= 3
                            }
                            className="text-xs font-semibold px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white"
                          >
                            {pendingInvitation
                              ? "Invited"
                              : alreadyInvitedByMe
                              ? "Already Invited"
                              : pendingInviteId === player.id
                              ? "Inviting..."
                              : invitationCount > 0
                              ? `Invite (${invitationCount} pending)`
                              : "Invite to Team"}
                          </Button>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Pending Invitations */}
        {invitations.filter(
          (inv: TeamInvitation) =>
            inv.status === "pending" && inv.inviteeId === user?.id
        ).length > 0 && (
          <div className="mt-6 space-y-3">
            <h4 className="font-medium text-neutral-800 mb-2">
              Choose Your Team (
              {
                invitations.filter(
                  (inv: TeamInvitation) =>
                    inv.status === "pending" && inv.inviteeId === user?.id
                ).length
              }{" "}
              invitation
              {invitations.filter(
                (inv: TeamInvitation) =>
                  inv.status === "pending" && inv.inviteeId === user?.id
              ).length !== 1
                ? "s"
                : ""}
              )
            </h4>
            <p className="text-sm text-neutral-600 mb-3">
              You have multiple team invitations. Choose which team you'd like
              to join:
            </p>
            {invitations
              .filter(
                (inv: TeamInvitation) =>
                  inv.status === "pending" && inv.inviteeId === user?.id
              )
              .map((invitation: TeamInvitation) => {
                const derivedTeamId = getInvitationTeamId(invitation);
                const team = derivedTeamId
                  ? teams.find((t: Team) => t.id === derivedTeamId)
                  : undefined;
                return (
                  <div
                    key={invitation.id}
                    className="bg-blue-50 p-4 rounded-lg border border-blue-200"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-blue-900">
                          {invitation.invitationType === "opponent"
                            ? "Team Captain"
                            : "Team Member"}{" "}
                          Invitation
                        </p>
                        <p className="text-sm text-blue-700">
                          <span className="font-medium">
                            {invitation.inviterUsername || "Someone"}
                          </span>{" "}
                          invites you to join as{" "}
                          {invitation.invitationType === "opponent"
                            ? "opposing team captain"
                            : "a teammate"}
                        </p>
                        <p className="text-xs text-blue-600 mt-1">
                          {invitation.invitationType === "opponent"
                            ? "You'll lead your own team"
                            : "You'll join their existing team"}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) =>
                            handleRespondToInvitation(
                              invitation.id,
                              "declined",
                              e
                            )
                          }
                          disabled={pendingResponseId === invitation.id}
                          className="text-xs"
                        >
                          <X className="h-3 w-3 mr-1" />
                          {pendingResponseId === invitation.id
                            ? "Declining..."
                            : "Decline"}
                        </Button>
                        <Button
                          size="sm"
                          onClick={(e) =>
                            handleRespondToInvitation(
                              invitation.id,
                              "accepted",
                              e
                            )
                          }
                          disabled={pendingResponseId === invitation.id}
                          className="text-xs bg-green-600 hover:bg-green-700 text-white"
                        >
                          <Check className="h-3 w-3 mr-1" />
                          {pendingResponseId === invitation.id
                            ? "Accepting..."
                            : "Accept"}
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>

      {/* Team Name Dialog for Opponent Invitations */}
      <Dialog open={showTeamNameDialog} onOpenChange={setShowTeamNameDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-yellow-500" />
              Choose Your Team Name
            </DialogTitle>
            <DialogDescription>
              You've been invited to be an opposing team captain! Choose a name
              for your team.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="opponent-team-name">Team Name</Label>
              <Input
                id="opponent-team-name"
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                placeholder="Enter your team name"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newTeamName.trim()) {
                    handleAcceptOpponentInvitation();
                  }
                }}
                autoFocus
              />
            </div>
            <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
              <p className="text-sm text-blue-800">
                <strong>As team captain, you will:</strong>
              </p>
              <ul className="text-xs text-blue-700 mt-2 space-y-1 ml-4 list-disc">
                <li>Lead your own team (Team B)</li>
                <li>Invite up to 2 teammates to join you</li>
                <li>Compete against the inviting team</li>
              </ul>
            </div>
          </div>
          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowTeamNameDialog(false);
                setPendingInvitationId(null);
                setNewTeamName("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAcceptOpponentInvitation}
              disabled={
                !newTeamName.trim() || respondToInvitationMutation.isPending
              }
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {respondToInvitationMutation.isPending
                ? "Creating Team..."
                : "Accept & Create Team"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Back Button Confirmation Dialog */}
      <Dialog
        open={showBackConfirmation}
        onOpenChange={setShowBackConfirmation}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <X className="h-5 w-5 text-red-500" />
              Leave Team Battle Setup?
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to leave the team battle setup? This will
              remove you from your current team.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="bg-amber-50 p-3 rounded-lg border border-amber-200">
              <p className="text-sm text-amber-800">
                <strong>What happens when you leave:</strong>
              </p>
              <ul className="text-xs text-amber-700 mt-2 space-y-1 ml-4 list-disc">
                <li>You will be removed from "{userTeam?.name}"</li>
                <li>Any pending invitations will be cancelled</li>
                <li>You can start a new team battle anytime</li>
              </ul>
            </div>
          </div>
          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setShowBackConfirmation(false)}
            >
              Stay in Setup
            </Button>
            <Button
              onClick={handleConfirmBack}
              disabled={leaveTeamMutation.isPending}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {leaveTeamMutation.isPending ? "Leaving..." : "Yes, Leave Team"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Opponent Disconnected Dialog */}
      <Dialog
        open={showOpponentDisconnectedDialog}
        onOpenChange={setShowOpponentDisconnectedDialog}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <X className="h-5 w-5 text-red-500" />
              Opponent Disconnected
            </DialogTitle>
            <DialogDescription>
              {disconnectedPlayerInfo?.playerName} from team "
              {disconnectedPlayerInfo?.teamName}" has disconnected from the team
              setup.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="bg-red-50 p-3 rounded-lg border border-red-200">
              <p className="text-sm text-red-800">
                <strong>
                  The opponent team has been affected by this disconnection.
                </strong>
              </p>
              <ul className="text-xs text-red-700 mt-2 space-y-1 ml-4 list-disc">
                <li>
                  The disconnected player has been removed from their team
                </li>
                <li>You can continue waiting or leave the team setup</li>
                <li>The battle cannot proceed until both teams are ready</li>
              </ul>
            </div>
          </div>
          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setShowOpponentDisconnectedDialog(false)}
            >
              Continue Waiting
            </Button>
            <Button
              onClick={() => {
                if (userTeam) {
                  handleLeaveTeam(userTeam.id);
                }
                setShowOpponentDisconnectedDialog(false);
              }}
              disabled={leaveTeamMutation.isPending}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {leaveTeamMutation.isPending ? "Leaving..." : "Leave Team"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TeamBattleSetup;
