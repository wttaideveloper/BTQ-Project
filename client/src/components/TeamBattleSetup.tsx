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
import { Crown, Users, UserPlus, Check, X, Mail, Clock } from "lucide-react";
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
            // Only invalidate if the event belongs to current game session
            // or if no gameSessionId is provided (backward compatibility)
            if (!data.gameSessionId || data.gameSessionId === gameSessionId) {
              queryClient.invalidateQueries({
                queryKey: ["/api/team-join-requests"],
              });
            }
            break;
          }

          case "join_request_updated": {
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

          case "invitation_expired": {
            // Handle when an invitation expires because another player accepted first
            console.log("[WebSocket] invitation_expired received", data);

            // Invalidate invitations to update the UI
            queryClient.invalidateQueries({
              queryKey: ["/api/team-invitations"],
            });

            toast({
              title: "Invitation Expired",
              description: data.message || "This invitation has expired.",
              variant: "destructive",
            });
            break;
          }

          case "teams_updated":
          case "team_update": {
            console.log("[WebSocket] teams_updated received", data);
            if (wsSessionId) {
              if (wsSessionId !== gameSessionId) {
                setGameSessionId(wsSessionId);
              }

              // Show notification toast if message provided
              if (data.message) {
                toast({
                  title: "Team Update",
                  description: data.message,
                });
              }

              // Always invalidate to ensure all clients refetch fresh data
              queryClient.invalidateQueries({
                queryKey: ["/api/teams"],
              });
              // Force refetch to ensure immediate update
              queryClient.refetchQueries({
                queryKey: ["/api/teams"],
              });
              // Also invalidate available teams
              queryClient.invalidateQueries({
                queryKey: ["/api/teams/available"],
              });
              // Force refetch available teams
              queryClient.refetchQueries({
                queryKey: ["/api/teams/available"],
              });
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

          case "teammate_disconnected": {
            // Handle when a teammate (same team) disconnects - show simple toast, not popup
            toast({
              title: "Teammate Disconnected",
              description:
                data.message ||
                `${data.disconnectedPlayerName} has left your team.`,
              variant: "default",
            });
            // Refresh teams data to reflect the disconnection
            if (wsSessionId) {
              queryClient.invalidateQueries({
                queryKey: ["/api/teams", wsSessionId],
              });
            }
            break;
          }

          case "opponent_team_member_disconnected": {
            // Handle opponent team member disconnection (not captain) - show toast, not popup
            toast({
              title: "Opponent Team Member Disconnected",
              description:
                data.message ||
                `${data.disconnectedPlayerName} from team "${data.disconnectedTeamName}" has disconnected.`,
              variant: "default",
            });
            // Refresh teams data to reflect the disconnection
            if (wsSessionId) {
              queryClient.invalidateQueries({
                queryKey: ["/api/teams", wsSessionId],
              });
            }
            break;
          }

          case "team_member_removed": {
            // Handle when a team member is removed by captain
            console.log("[WebSocket] team_member_removed received", data);
            toast({
              title: "Removed from Team",
              description:
                "You have been removed from the team by the captain. Returning to home.",
              variant: "destructive",
            });
            // Force refetch of teams data
            queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
            queryClient.refetchQueries({ queryKey: ["/api/teams"] });
            // Also refetch available teams
            queryClient.invalidateQueries({
              queryKey: ["/api/teams/available"],
            });
            queryClient.refetchQueries({ queryKey: ["/api/teams/available"] });
            // Redirect to home page
            setTimeout(() => {
              window.location.href = "/";
            }, 2000); // Delay to show toast
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
      if (!gameSessionId) return [];
      console.log(
        "[TeamBattleSetup] Fetching teams for gameSessionId:",
        gameSessionId
      );
      const res = await apiRequest(
        "GET",
        `/api/teams?gameSessionId=${gameSessionId}`
      );
      const data = await res.json();
      console.log(
        "[TeamBattleSetup] Teams fetched:",
        data.map((t: Team) => ({
          id: t.id,
          name: t.name,
          membersCount: t.members.length,
        }))
      );
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
      const res = await apiRequest("GET", "/api/teams/available");
      const data = await res.json();
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

    const offJoinRequestCreatedToast = onEvent(
      "join_request_created",
      async (data: any) => {
        try {
          // First check: do we have the team in our current teams array?
          let team = teams.find((t: any) => t.id === data.teamId);

          // If not found, fetch fresh team data
          if (!team && data.teamId && gameSessionId) {
            try {
              const res = await apiRequest(
                "GET",
                `/api/teams?gameSessionId=${gameSessionId}`
              );
              const freshTeams = await res.json();
              team = freshTeams.find((t: any) => t.id === data.teamId);
            } catch (err) {
              // Silent error handling
            }
          }

          const isCaptain = team && team.captainId === user?.id;

          if (isCaptain && team) {
            toast({
              title: "New Join Request",
              description: `${data.requesterUsername} requested to join ${team.name}`,
            });
            queryClient.invalidateQueries({
              queryKey: ["/api/team-join-requests"],
            });
          } else if (data.teamId) {
            // Show generic toast even if team not found yet
            toast({
              title: "New Join Request",
              description: `${data.requesterUsername} wants to join your team`,
            });
            queryClient.invalidateQueries({
              queryKey: ["/api/team-join-requests"],
            });
          }
        } catch (err) {
          // Silent error handling
        }
      }
    );
    return () => {
      offJoinRequestCreatedToast();
    };
  }, [user?.id, teams, toast, gameSessionId, queryClient, open]);

  // Listen for when member's join request is accepted
  useEffect(() => {
    if (!open || !user) return;

    const offJoinRequestAccepted = onEvent(
      "join_request_updated",
      (data: any) => {
        // Only handle if this is for the current user and request was accepted
        if (data.requesterId === user.id && data.status === "accepted") {
          // Show success toast
          toast({
            title: "✅ Joined Team!",
            description:
              data.message ||
              `You've been accepted to ${data.teamName || "the team"}!`,
          });

          // Update to the team's game session
          if (data.gameSessionId && data.gameSessionId !== gameSessionId) {
            setGameSessionId(data.gameSessionId);
          }

          // Invalidate all team-related queries
          queryClient.invalidateQueries({ queryKey: ["/api/teams/available"] });
          queryClient.invalidateQueries({
            queryKey: ["/api/team-join-requests"],
          });
          if (data.gameSessionId) {
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
    // Navigate when countdown reaches 0
    // Check if user is in ANY team (captain or member)
    const isInAnyTeam = teams?.some((team: Team) =>
      team.members.some((member: TeamMember) => member.userId === user?.id)
    );

    if (
      countdown === 0 &&
      !hasNavigatedToGame &&
      gameSessionId &&
      isInAnyTeam
    ) {
      setHasNavigatedToGame(true);
      onClose();
      setLocation(`/team-battle-game?gameSessionId=${gameSessionId}`);
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

  // Ref to track if we should send leave event (only when page actually unloads)
  const shouldSendLeaveEventRef = useRef(false);

  // Handle page unload (reload, close, exit, network issues)
  useEffect(() => {
    if (!open || !userTeam) {
      shouldSendLeaveEventRef.current = false;
      return;
    }

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Only show the dialog - DON'T send the leave event yet
      // The event will only be sent if the page actually unloads (user confirms)

      // Prevent leaving if battle countdown is active
      if (countdown !== null && countdown > 0) {
        e.preventDefault();
        e.returnValue =
          "Battle is starting soon. Are you sure you want to leave?";
        shouldSendLeaveEventRef.current = true;
        return e.returnValue;
      }

      // If user is in a team, show warning
      if (userTeam) {
        e.preventDefault();
        e.returnValue = `You will be removed from "${userTeam.name}". Are you sure you want to leave?`;
        // Set flag - if page actually unloads, we'll send the event
        shouldSendLeaveEventRef.current = true;
        return e.returnValue;
      }
    };

    // Detect if user cancels (page becomes visible again without unloading)
    const handleVisibilityChange = () => {
      // If page becomes visible again and flag is set, user likely cancelled
      if (document.visibilityState === 'visible' && shouldSendLeaveEventRef.current) {
        // Reset flag after a short delay to allow pagehide to fire if user actually reloads
        setTimeout(() => {
          // Only reset if page is still visible (user cancelled)
          if (document.visibilityState === 'visible') {
            shouldSendLeaveEventRef.current = false;
          }
        }, 200);
      }
    };

    // Only send leave event when page actually unloads (user confirmed the dialog)
    const handlePageHide = () => {
      if (shouldSendLeaveEventRef.current && userTeam && user) {
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
    };

    // Also handle unload as fallback (though pagehide is more reliable)
    const handleUnload = () => {
      if (shouldSendLeaveEventRef.current && userTeam && user) {
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
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("unload", handleUnload);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      shouldSendLeaveEventRef.current = false;
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("unload", handleUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
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

      // Check for conflict error (opponent slot already filled)
      if (!res.ok) {
        const errorData = await res.json();
        if (errorData.error === "OPPONENT_SLOT_FILLED") {
          throw new Error(
            errorData.message || "The opponent slot has already been filled."
          );
        }
        throw new Error(errorData.message || "Failed to respond to invitation");
      }

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
      // Close team name dialog if open
      setShowTeamNameDialog(false);
      setPendingInvitationId(null);
      setNewTeamName("");

      toast({
        title: "Error",
        description: error.message || "Failed to respond to invitation",
        variant: "destructive",
      });

      // Refresh invitations to remove expired ones
      queryClient.invalidateQueries({ queryKey: ["/api/team-invitations"] });

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
      const res = await apiRequest("GET", "/api/team-join-requests");
      const raw = await res.json();

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
      return pending;
    },
    enabled: open && !!user,
    refetchInterval: 3000,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    staleTime: 0,
    gcTime: 0,
  });

  // Track which team is being requested for join
  const [joinRequestingTeamId, setJoinRequestingTeamId] = useState<
    string | null
  >(null);
  const sendJoinRequestMutation = useMutation({
    mutationFn: async (data: { teamId: string }) => {
      setJoinRequestingTeamId(data.teamId);
      const res = await apiRequest("POST", "/api/team-join-requests", data);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Join Request Sent",
        description: "Your request was sent to the team leader.",
      });
      setJoinRequestingTeamId(null);
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
      setJoinRequestingTeamId(null);
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
      console.log("[TeamBattleSetup] Calling remove member API", {
        teamId,
        userId,
      });
      const res = await apiRequest(
        "PATCH",
        `/api/teams/${teamId}/remove-member`,
        { userId }
      );
      const data = await res.json();
      console.log("[TeamBattleSetup] Remove member API response", {
        status: res.status,
        data,
      });
      if (!res.ok) {
        throw new Error(data.message || "Failed to remove member");
      }
      return data;
    },
    onSuccess: (data, variables) => {
      console.log("[TeamBattleSetup] removeMemberMutation onSuccess called", {
        data,
        variables,
      });
      toast({
        title: "Member Removed",
        description: "Member removed from team.",
      });
      // Invalidate teams data to force fresh fetch
      console.log("[TeamBattleSetup] Invalidating teams queries");
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      // Refresh available teams list so removed spots appear in join-as-member
      queryClient.invalidateQueries({ queryKey: ["/api/teams/available"] });
      // Also manually refetch teams to ensure immediate update
      refetchTeams();
      console.log(
        "[TeamBattleSetup] Queries invalidated and manual refetch called"
      );
    },
    onError: (error: any) => {
      console.log("[TeamBattleSetup] removeMemberMutation onError", error);
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
    <div className="fixed inset-0 bg-gradient-to-br from-black/80 via-primary-dark/80 to-secondary-dark/80 backdrop-blur-sm flex items-center justify-center z-50 overflow-y-auto py-2 sm:py-4 md:py-6 px-2 sm:px-4">
      <div className="bg-gradient-to-br from-white via-blue-50/30 to-purple-50/30 rounded-xl sm:rounded-2xl shadow-2xl w-full max-w-4xl mx-auto my-auto max-h-[98vh] sm:max-h-[95vh] overflow-hidden border border-white/20">
        {/* Header Section */}
        <div className="bg-gradient-to-r from-primary via-primary-dark to-secondary p-3 sm:p-4 md:p-6 relative overflow-hidden">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAwIDEwIEwgNDAgMTAgTSAxMCAwIEwgMTAgNDAgTSAwIDIwIEwgNDAgMjAgTSAyMCAwIEwgMjAgNDAgTSAwIDMwIEwgNDAgMzAgTSAzMCAwIEwgMzAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjA1IiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-30"></div>
          <div className="relative z-10 flex justify-between items-center gap-2">
            <Button
              variant="ghost"
              className="flex items-center gap-1 sm:gap-2 text-white hover:bg-white/20 transition-all duration-200 px-2 sm:px-3 py-1.5 sm:py-2 text-sm sm:text-base"
              onClick={handleBackButton}
              disabled={
                leaveTeamMutation.isPending ||
                (countdown !== null && countdown > 0)
              }
            >
              <span className="text-base sm:text-lg">←</span>
              <span className="font-medium hidden xs:inline">
                {leaveTeamMutation.isPending ? "Leaving..." : "Back"}
              </span>
            </Button>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              <span className="text-white/80 text-xs sm:text-sm font-medium">Live</span>
            </div>
          </div>
          <div className="relative z-10 text-center mt-2 sm:mt-3 md:mt-4">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-heading font-extrabold text-white mb-1 sm:mb-2 tracking-tight">
              Team Battle Setup
            </h1>
            <p className="text-white/90 text-xs sm:text-sm md:text-base font-medium px-2">
              Configure your team battle with the same game settings
            </p>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto max-h-[calc(98vh-140px)] sm:max-h-[calc(95vh-180px)] p-3 sm:p-4 md:p-6 bg-white/95">
          {/* Game Configuration Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 mb-4 sm:mb-6">
            <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 rounded-lg sm:rounded-xl p-3 sm:p-4 md:p-5 border border-blue-200/50 shadow-sm hover:shadow-md transition-shadow duration-200">
              <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-blue-500 rounded-lg flex items-center justify-center shadow-md flex-shrink-0">
                  <Users className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                </div>
                <h3 className="font-heading font-bold text-base sm:text-lg text-blue-900">
                  Game Mode
                </h3>
              </div>
              <div className="space-y-1">
                <p className="font-semibold text-sm sm:text-base text-blue-800">Team Battle</p>
                <p className="text-xs sm:text-sm text-blue-700/80">
                  Two teams compete using the selected configuration
                </p>
              </div>
            </div>

            <div className="bg-gradient-to-br from-purple-50 to-purple-100/50 rounded-lg sm:rounded-xl p-3 sm:p-4 md:p-5 border border-purple-200/50 shadow-sm hover:shadow-md transition-shadow duration-200">
              <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-purple-500 rounded-lg flex items-center justify-center shadow-md flex-shrink-0">
                  <Crown className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                </div>
                <h3 className="font-heading font-bold text-base sm:text-lg text-purple-900">
                  Configuration
                </h3>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:gap-3 text-xs sm:text-sm">
                <div className="bg-white/60 rounded-lg p-1.5 sm:p-2">
                  <span className="text-purple-600 text-xs font-medium">
                    Type
                  </span>
                  <p className="font-semibold text-purple-900 mt-0.5 text-xs sm:text-sm break-words">
                    {gameType === "question" ? "Question-Based" : "Time-Based"}
                  </p>
                </div>
                <div className="bg-white/60 rounded-lg p-1.5 sm:p-2">
                  <span className="text-purple-600 text-xs font-medium">
                    Difficulty
                  </span>
                  <p className="font-semibold text-purple-900 mt-0.5 text-xs sm:text-sm">
                    {difficulty}
                  </p>
                </div>
                <div className="col-span-2 bg-white/60 rounded-lg p-1.5 sm:p-2">
                  <span className="text-purple-600 text-xs font-medium">
                    Category
                  </span>
                  <p className="font-semibold text-purple-900 mt-0.5 text-xs sm:text-sm break-words">
                    {category}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Current Teams Overview */}
          <div className="mb-4 sm:mb-6 space-y-3 sm:space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg sm:rounded-xl p-3 sm:p-4 border border-blue-200/50">
              <div className="flex-1 min-w-0">
                <h3 className="text-lg sm:text-xl font-heading font-bold text-gray-900 flex items-center gap-2">
                  <Users className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 flex-shrink-0" />
                  <span className="truncate">Current Teams</span>
                </h3>
                <p className="text-xs sm:text-sm text-gray-600 mt-1">
                  Everyone can see who has joined each side in real time
                </p>
              </div>
              <div className="flex items-center gap-2 bg-white rounded-full px-3 sm:px-4 py-1.5 sm:py-2 shadow-sm flex-shrink-0">
                <div className="flex gap-1">
                  {[...Array(teams.length)].map((_, i) => (
                    <div
                      key={i}
                      className="w-2 h-2 bg-green-500 rounded-full"
                    ></div>
                  ))}
                  {[...Array(2 - teams.length)].map((_, i) => (
                    <div
                      key={i}
                      className="w-2 h-2 bg-gray-300 rounded-full"
                    ></div>
                  ))}
                </div>
                <span className="text-xs sm:text-sm font-bold text-gray-700 whitespace-nowrap">
                  {teams.length} / 2
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
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
                return (
                  <TeamDisplay
                    key={`${team.id}-${team.members.length}`}
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
                <div className="border border-dashed border-neutral-300 rounded-lg p-3 sm:p-4 flex flex-col items-center justify-center text-center text-neutral-500 bg-neutral-50 min-h-[120px] sm:min-h-[140px]">
                  <p className="font-medium text-sm sm:text-base text-neutral-700 mb-1">
                    Waiting for opposing team
                  </p>
                  <p className="text-xs sm:text-sm px-2">
                    Invite another captain to form the next team.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Countdown overlay when both captains are ready */}
          {countdown !== null && countdown > 0 && (
            <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4">
              <div className="bg-white rounded-xl sm:rounded-2xl px-6 sm:px-8 md:px-10 py-6 sm:py-7 md:py-8 shadow-2xl border border-neutral-200 text-center max-w-sm w-full mx-4">
                <p className="text-xs sm:text-sm font-medium text-neutral-500 mb-2">
                  Both teams are ready
                </p>
                <h2 className="text-4xl sm:text-5xl font-bold text-primary mb-2 sm:mb-3">
                  {countdown}
                </h2>
                <p className="text-sm sm:text-base text-neutral-600">Game starting soon...</p>
              </div>
            </div>
          )}

          {/* Landing: Enter Team Battle */}
          {currentStage === "enter" && (
            <div className="mt-4 sm:mt-6 space-y-3 sm:space-y-4">
              <div className="bg-gradient-to-br from-blue-50 to-purple-50 p-4 sm:p-5 md:p-6 rounded-lg sm:rounded-xl border border-blue-200/50 shadow-sm">
                <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-blue-500 to-purple-500 rounded-lg sm:rounded-xl flex items-center justify-center shadow-md flex-shrink-0">
                    <UserPlus className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-heading font-bold text-lg sm:text-xl text-gray-900">
                      Enter Team Battle
                    </h3>
                    <p className="text-xs sm:text-sm text-gray-600">
                      Choose how you'd like to participate
                    </p>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <button
                  onClick={() => setCurrentStage("create-team")}
                  className="group relative overflow-hidden bg-gradient-to-br from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-lg sm:rounded-xl p-4 sm:p-5 md:p-6 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-[1.02] sm:hover:scale-105"
                >
                  <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  <div className="relative z-10 flex flex-col items-center gap-2 sm:gap-3">
                    <div className="w-12 h-12 sm:w-14 sm:h-14 bg-white/20 rounded-full flex items-center justify-center">
                      <Crown className="h-6 w-6 sm:h-7 sm:w-7 text-white" />
                    </div>
                    <div className="text-center">
                      <p className="font-bold text-base sm:text-lg mb-1">Create a Team</p>
                      <p className="text-xs sm:text-sm text-white/90">
                        Become a team captain
                      </p>
                    </div>
                  </div>
                </button>
                <button
                  onClick={() => setCurrentStage("join-as-member")}
                  className="group relative overflow-hidden bg-white hover:bg-gray-50 border-2 border-gray-300 hover:border-blue-400 rounded-lg sm:rounded-xl p-4 sm:p-5 md:p-6 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-[1.02] sm:hover:scale-105"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-50/50 to-purple-50/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  <div className="relative z-10 flex flex-col items-center gap-2 sm:gap-3">
                    <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-br from-blue-100 to-purple-100 rounded-full flex items-center justify-center group-hover:from-blue-200 group-hover:to-purple-200 transition-colors duration-300">
                      <Users className="h-6 w-6 sm:h-7 sm:w-7 text-blue-600" />
                    </div>
                    <div className="text-center">
                      <p className="font-bold text-base sm:text-lg mb-1 text-gray-900">
                        Join as Member
                      </p>
                      <p className="text-xs sm:text-sm text-gray-600">
                        Join an existing team
                      </p>
                    </div>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Stage 1: Create Team */}
          {currentStage === "create-team" && (
            <div className="mt-4 sm:mt-6 space-y-4 sm:space-y-5">
              <div className="bg-gradient-to-r from-blue-500 to-blue-600 p-4 sm:p-5 rounded-lg sm:rounded-xl shadow-lg">
                <div className="flex items-start gap-3 sm:gap-4">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Crown className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-heading font-bold text-lg sm:text-xl text-white mb-1 sm:mb-2">
                      Step 1: Create Your Team
                    </h3>
                    <p className="text-xs sm:text-sm text-white/90">
                      Create your team to start the battle. You'll become the
                      team captain
                    </p>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-lg sm:rounded-xl p-4 sm:p-5 border border-gray-200 shadow-sm">
                <Label
                  htmlFor="teamName"
                  className="text-xs sm:text-sm font-semibold text-gray-700 mb-2 block flex items-center gap-2"
                >
                  <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-blue-600 flex-shrink-0" />
                  Team Name
                </Label>
                <input
                  id="teamName"
                  type="text"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder="Enter your team name"
                  className="w-full px-3 sm:px-4 py-2.5 sm:py-3 text-sm sm:text-base border-2 border-gray-300 rounded-lg sm:rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 text-gray-900 placeholder-gray-400"
                />
              </div>
              <Button
                onClick={handleCreateTeam}
                disabled={createTeamMutation.isPending || !teamName.trim()}
                className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-bold py-3 sm:py-4 text-sm sm:text-base rounded-lg sm:rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-[1.01] sm:hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
              >
                {createTeamMutation.isPending ? (
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    <span>Creating Team...</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Crown className="h-5 w-5" />
                    <span>Create Team</span>
                  </div>
                )}
              </Button>
            </div>
          )}

          {/* Stage: Join as Member */}
          {currentStage === "join-as-member" && (
            <div className="mt-4 sm:mt-6 space-y-4 sm:space-y-5">
              <div className="bg-gradient-to-r from-purple-500 to-purple-600 p-4 sm:p-5 rounded-lg sm:rounded-xl shadow-lg">
                <div className="flex items-start gap-3 sm:gap-4">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
                    <UserPlus className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-heading font-bold text-lg sm:text-xl text-white mb-1 sm:mb-2">
                      Join an Existing Team
                    </h3>
                    <p className="text-xs sm:text-sm text-white/90">
                      Browse available teams and send a join request to the
                      leader
                    </p>
                  </div>
                </div>
              </div>

              {myActiveJoinRequest && (
                <div className="bg-gradient-to-r from-yellow-50 to-orange-50 p-3 sm:p-4 rounded-lg sm:rounded-xl border border-yellow-300 shadow-sm">
                  <div className="flex items-start gap-2 sm:gap-3">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 bg-yellow-400 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-yellow-900" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs sm:text-sm font-semibold text-yellow-900 mb-1">
                        Pending Request
                      </p>
                      <p className="text-xs sm:text-sm text-yellow-800 break-words">
                        You have a pending join request to team ID:{" "}
                        <span className="font-mono text-xs">{myActiveJoinRequest.teamId}</span>
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          cancelJoinRequestMutation.mutate(
                            myActiveJoinRequest.id
                          )
                        }
                        disabled={cancelJoinRequestMutation.isPending}
                        className="mt-2 sm:mt-3 text-xs sm:text-sm border-yellow-400 text-yellow-800 hover:bg-yellow-100"
                      >
                        {cancelJoinRequestMutation.isPending
                          ? "Cancelling..."
                          : "Cancel Request"}
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              <div className="bg-white rounded-lg sm:rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="bg-gradient-to-r from-purple-50 to-blue-50 px-3 sm:px-4 md:px-5 py-2 sm:py-3 border-b border-gray-200">
                  <h4 className="font-heading font-bold text-sm sm:text-base text-gray-900 flex items-center gap-2">
                    <Users className="h-4 w-4 sm:h-5 sm:w-5 text-purple-600 flex-shrink-0" />
                    <span>Available Teams</span>
                  </h4>
                </div>
                <div className="max-h-48 sm:max-h-64 overflow-y-auto">
                  {availableTeamsForJoin.length === 0 && (
                    <div className="px-4 sm:px-5 py-6 sm:py-8 text-center">
                      <div className="w-12 h-12 sm:w-16 sm:h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-2 sm:mb-3">
                        <Users className="h-6 w-6 sm:h-8 sm:w-8 text-gray-400" />
                      </div>
                      <p className="text-xs sm:text-sm text-gray-500 font-medium">
                        No available teams right now
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        Check back later or create your own team
                      </p>
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
                            className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3 px-3 sm:px-4 md:px-5 py-3 sm:py-4 border-b last:border-b-0 hover:bg-gray-50 transition-colors duration-150"
                          >
                            <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0 w-full sm:w-auto">
                              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-purple-400 to-blue-400 rounded-lg flex items-center justify-center flex-shrink-0">
                                <Crown className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                              </div>
                              <div className="flex flex-col min-w-0 flex-1">
                                <p className="font-semibold text-sm sm:text-base text-gray-900 truncate">
                                  {team.name}{" "}
                                  {team.teamSide && (
                                    <span className="text-xs font-normal text-gray-500">
                                      (Team {team.teamSide})
                                    </span>
                                  )}
                                </p>
                                <div className="flex items-center gap-1.5 sm:gap-2 mt-1 flex-wrap">
                                  <span className="text-xs text-gray-600 flex items-center gap-1">
                                    <Users className="h-3 w-3 flex-shrink-0" />
                                    {team.members.length}/3
                                  </span>
                                  <span className="text-xs text-gray-400 hidden sm:inline">
                                    •
                                  </span>
                                  <span className="text-xs text-gray-600 truncate">
                                    Captain ID: {team.captainId}
                                  </span>
                                </div>
                              </div>
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
                                joinRequestingTeamId === team.id
                              }
                              className="w-full sm:w-auto text-xs font-bold px-3 sm:px-4 py-1.5 sm:py-2 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white rounded-lg shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                            >
                              {isFull
                                ? "Team Full"
                                : alreadyMember
                                ? "Already in Team"
                                : myActiveJoinRequest
                                ? "Request Pending"
                                : joinRequestingTeamId === team.id
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

              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                <Button
                  variant="outline"
                  onClick={() => setCurrentStage("enter")}
                  className="flex-1 border-2 border-gray-300 hover:border-gray-400 hover:bg-gray-50 font-semibold py-2.5 sm:py-3 text-sm sm:text-base rounded-lg sm:rounded-xl transition-all duration-200"
                >
                  Back
                </Button>
                <Button
                  onClick={() => setCurrentStage("create-team")}
                  className="flex-1 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-bold py-2.5 sm:py-3 text-sm sm:text-base rounded-lg sm:rounded-xl shadow-md hover:shadow-lg transition-all duration-200"
                >
                  Create a Team Instead
                </Button>
              </div>
            </div>
          )}

          {/* Stage 2: Invite Opponent */}
          {currentStage === "invite-opponent" && (
            <div className="mt-4 sm:mt-6 space-y-4 sm:space-y-5">
              <div className="bg-gradient-to-r from-green-500 to-emerald-600 p-4 sm:p-5 rounded-lg sm:rounded-xl shadow-lg">
                <div className="flex items-start gap-3 sm:gap-4">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Crown className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-heading font-bold text-lg sm:text-xl text-white mb-1 sm:mb-2">
                      Step 2: Invite Opponent Captain
                    </h3>
                    <p className="text-xs sm:text-sm text-white/90">
                      Invite an opponent to be the captain of the opposing team.
                      Once they accept, you can invite teammates
                    </p>
                  </div>
                </div>
              </div>

              {userTeam && (
                <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-3 sm:p-4 rounded-lg sm:rounded-xl border border-blue-200 shadow-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 sm:w-8 sm:h-8 bg-blue-500 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-white" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-gray-600 font-medium">
                        Your Team
                      </p>
                      <p className="text-sm font-bold text-gray-900 truncate">
                        {userTeam.name}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="bg-white rounded-lg sm:rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="bg-gradient-to-r from-green-50 to-emerald-50 px-3 sm:px-4 md:px-5 py-2 sm:py-3 border-b border-gray-200">
                  <h4 className="font-heading font-bold text-sm sm:text-base text-gray-900 flex items-center gap-2">
                    <UserPlus className="h-4 w-4 sm:h-5 sm:w-5 text-green-600 flex-shrink-0" />
                    <span>Available Opponents</span>
                  </h4>
                </div>
                <div className="max-h-48 sm:max-h-64 overflow-y-auto">
                  {isLoading && (
                    <div className="px-4 sm:px-5 py-6 sm:py-8 text-center">
                      <div className="w-10 h-10 sm:w-12 sm:h-12 border-4 border-green-200 border-t-green-500 rounded-full animate-spin mx-auto mb-2 sm:mb-3"></div>
                      <p className="text-xs sm:text-sm text-gray-500 font-medium">
                        Loading online players...
                      </p>
                    </div>
                  )}
                  {isError && !isLoading && (
                    <div className="px-4 sm:px-5 py-6 sm:py-8 text-center">
                      <div className="w-12 h-12 sm:w-16 sm:h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-2 sm:mb-3">
                        <X className="h-6 w-6 sm:h-8 sm:w-8 text-red-500" />
                      </div>
                      <p className="text-xs sm:text-sm text-red-600 font-medium">
                        Failed to load online players
                      </p>
                    </div>
                  )}
                  {!isLoading &&
                    !isError &&
                    availableOpponents.length === 0 && (
                      <div className="px-4 sm:px-5 py-6 sm:py-8 text-center">
                        <div className="w-12 h-12 sm:w-16 sm:h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-2 sm:mb-3">
                          <Users className="h-6 w-6 sm:h-8 sm:w-8 text-gray-400" />
                        </div>
                        <p className="text-xs sm:text-sm text-gray-500 font-medium">
                          No available opponents online right now
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          Share the session ID with friends to invite them
                        </p>
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
                            className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3 px-3 sm:px-4 md:px-5 py-3 sm:py-4 border-b last:border-b-0 hover:bg-gray-50 transition-colors duration-150"
                          >
                            <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0 w-full sm:w-auto">
                              <div className="relative flex-shrink-0">
                                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-green-400 to-emerald-500 rounded-full flex items-center justify-center text-white font-bold text-sm sm:text-base">
                                  {player.username.charAt(0).toUpperCase()}
                                </div>
                                <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 sm:w-3 sm:h-3 bg-green-500 rounded-full border-2 border-white"></div>
                              </div>
                              <div className="flex flex-col min-w-0 flex-1">
                                <p className="font-semibold text-sm sm:text-base text-gray-900 truncate">
                                  {player.username}
                                </p>
                                {pendingInvitation && (
                                  <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 font-medium w-fit mt-1">
                                    Invitation Sent
                                  </span>
                                )}
                              </div>
                            </div>
                            <Button
                              size="sm"
                              onClick={(e) =>
                                handleInviteOpponent(player.id, e)
                              }
                              disabled={
                                pendingInviteId === player.id ||
                                !!pendingInvitation ||
                                alreadyInvitedByMe
                              }
                              className="w-full sm:w-auto text-xs font-bold px-3 sm:px-4 py-1.5 sm:py-2 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white rounded-lg shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
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
            <div className="mt-4 sm:mt-6 space-y-4 sm:space-y-5">
              <div className="bg-gradient-to-r from-purple-500 to-indigo-600 p-4 sm:p-5 rounded-lg sm:rounded-xl shadow-lg">
                <div className="flex items-start gap-3 sm:gap-4">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Users className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-heading font-bold text-lg sm:text-xl text-white mb-1 sm:mb-2">
                      Step 3: Invite Teammates
                    </h3>
                    <p className="text-xs sm:text-sm text-white/90">
                      Great! Your opponent has accepted. Now invite teammates to
                      complete your team
                    </p>
                  </div>
                </div>
              </div>

              {userTeam && (
                <div className="bg-neutral-50 p-2.5 sm:p-3 rounded-lg mb-3 sm:mb-4">
                  <p className="text-xs sm:text-sm text-neutral-600">
                    <span className="font-medium">Your Team:</span>{" "}
                    <span className="truncate">{userTeam.name}</span> ({userTeam.members.length}/3 members)
                  </p>
                </div>
              )}

              <div>
                <h4 className="font-medium text-sm sm:text-base text-neutral-800 mb-2 sm:mb-3">
                  Available Players
                </h4>
                <div className="border rounded-lg bg-neutral-50 max-h-48 sm:max-h-64 overflow-y-auto">
                  {isLoading && (
                    <div className="px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm text-neutral-500">
                      Loading online players...
                    </div>
                  )}
                  {isError && !isLoading && (
                    <div className="px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm text-red-500">
                      Failed to load online players.
                    </div>
                  )}
                  {!isLoading &&
                    !isError &&
                    availableTeammates.length === 0 && (
                      <div className="px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm text-neutral-500">
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
                            className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 sm:py-3 border-b last:border-b-0"
                          >
                            <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0 w-full sm:w-auto">
                              <div className="w-2 h-2 bg-green-500 rounded-full flex-shrink-0"></div>
                              <p className="font-medium text-sm sm:text-base text-neutral-900 truncate">
                                {player.username}
                              </p>
                              {pendingInvitation && (
                                <span className="text-xs px-2 py-0.5 sm:py-1 rounded-full bg-yellow-100 text-yellow-700 flex-shrink-0">
                                  Invitation Sent
                                </span>
                              )}
                            </div>
                            <Button
                              size="sm"
                              onClick={(e) =>
                                handleInviteTeammate(player.id, e)
                              }
                              disabled={
                                pendingInviteId === player.id ||
                                !!pendingInvitation ||
                                alreadyInvitedByMe ||
                                (userTeam?.members.length || 0) >= 3
                              }
                              className="w-full sm:w-auto text-xs font-semibold px-3 py-1.5 sm:py-1 bg-purple-600 hover:bg-purple-700 text-white rounded-lg"
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
            <div className="mt-4 sm:mt-6 space-y-3 sm:space-y-4">
              <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-3 sm:p-4 rounded-lg sm:rounded-xl border border-blue-200">
                <h4 className="font-heading font-bold text-base sm:text-lg text-gray-900 mb-1 flex items-center gap-2 flex-wrap">
                  <Mail className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 flex-shrink-0" />
                  <span>Choose Your Team</span>
                  <span className="ml-auto bg-blue-500 text-white text-xs font-bold px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full">
                    {
                      invitations.filter(
                        (inv: TeamInvitation) =>
                          inv.status === "pending" && inv.inviteeId === user?.id
                      ).length
                    }
                  </span>
                </h4>
                <p className="text-xs sm:text-sm text-gray-600">
                  You have multiple team invitations. Choose which team you'd
                  like to join
                </p>
              </div>
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
                      className="bg-white p-3 sm:p-4 md:p-5 rounded-lg sm:rounded-xl border-2 border-blue-200 shadow-sm hover:shadow-md transition-all duration-200"
                    >
                      <div className="flex flex-col sm:flex-row items-start justify-between gap-3 sm:gap-4">
                        <div className="flex items-start gap-2 sm:gap-3 flex-1 min-w-0">
                          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-blue-400 to-purple-500 rounded-lg sm:rounded-xl flex items-center justify-center flex-shrink-0">
                            {invitation.invitationType === "opponent" ? (
                              <Crown className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                            ) : (
                              <Users className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-1 sm:mb-2">
                              <p className="font-bold text-sm sm:text-base text-gray-900">
                                {invitation.invitationType === "opponent"
                                  ? "Team Captain"
                                  : "Team Member"}{" "}
                                Invitation
                              </p>
                              <span className="bg-blue-100 text-blue-700 text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0">
                                {invitation.invitationType === "opponent"
                                  ? "Captain"
                                  : "Member"}
                              </span>
                            </div>
                            <p className="text-xs sm:text-sm text-gray-700 mb-2">
                              <span className="font-semibold text-blue-600">
                                {invitation.inviterUsername || "Someone"}
                              </span>{" "}
                              invites you to join as{" "}
                              {invitation.invitationType === "opponent"
                                ? "opposing team captain"
                                : "a teammate"}
                            </p>
                            <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 inline-block">
                              {invitation.invitationType === "opponent"
                                ? "👑 You'll lead your own team"
                                : "🤝 You'll join their existing team"}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-row sm:flex-col gap-2 w-full sm:w-auto">
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
                            className="flex-1 sm:flex-none text-xs font-bold px-3 sm:px-4 py-1.5 sm:py-2 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white rounded-lg shadow-sm"
                          >
                            <Check className="h-3 w-3 mr-1" />
                            {pendingResponseId === invitation.id
                              ? "Accepting..."
                              : "Accept"}
                          </Button>
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
                            className="flex-1 sm:flex-none text-xs font-semibold border-2 border-gray-300 hover:border-red-400 hover:bg-red-50 hover:text-red-600 rounded-lg"
                          >
                            <X className="h-3 w-3 mr-1" />
                            {pendingResponseId === invitation.id
                              ? "Declining..."
                              : "Decline"}
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
        {/* End of scrollable content */}
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
