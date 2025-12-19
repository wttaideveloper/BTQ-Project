import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Users,
  Crown,
  Mail,
  UserPlus,
  Clock,
  Check,
  X,
  Zap,
  Gamepad2,
  ArrowLeft,
  Target,
  LogOut,
} from "lucide-react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { setupGameSocket, onEvent } from "@/lib/socket";
import { useTeamBattleSetup } from "@/hooks/useTeamBattleSetup";

interface User {
  id: number;
  username: string;
  email: string | null;
  isOnline: boolean;
  lastSeen: Date;
}

interface Team {
  id: string;
  name: string;
  captainId: number;
  gameSessionId: string;
  members: TeamMember[];
  score: number;
  correctAnswers: number;
  incorrectAnswers: number;
  status: "forming" | "ready" | "playing" | "finished";
  createdAt: Date;
  teamBattleId?: string;
  teamSide?: "A" | "B";
  hasOpponent?: boolean;
  battleStatus?: "forming" | "ready" | "playing" | "finished";
  opponentTeamName?: string | null;
  opponentCaptainId?: number | null;
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
  createdAt?: string | Date;
  expiresAt?: string | Date | null;
}

const TeamBattleSetup: React.FC = () => {
  const { user } = useAuth();
  const [_, setLocation] = useLocation();
  const { toast } = useToast();
  const [gameSessionId, setGameSessionId] = useState<string>("");
  const refetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const updateGameSessionId = useCallback((sessionId: string) => {
    if (!sessionId) return;
    setGameSessionId(sessionId);
    if (typeof window !== "undefined") {
      sessionStorage.setItem("teamBattleSessionId", sessionId);
    }
  }, []);

  const generateNewSessionId = useCallback(() => {
    const newSessionId = `battle-${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 9)}`;
    updateGameSessionId(newSessionId);
    return newSessionId;
  }, [updateGameSessionId]);

  const [teamName, setTeamName] = useState("");
  const [showTeamNameDialog, setShowTeamNameDialog] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [pendingInvitationId, setPendingInvitationId] = useState<string | null>(
    null
  );

  // Shared setup data & mutations
  const {
    teams = [],
    invitations = [],
    onlineUsers = [],
    joinRequests = [],
    debouncedRefetch,
  } = useTeamBattleSetup(gameSessionId);

  // Generate or restore a game session ID - force new ID only when none exists
  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedSessionId = sessionStorage.getItem("teamBattleSessionId");
      if (storedSessionId) {
        setGameSessionId(storedSessionId);
        return;
      }
    }

    generateNewSessionId();
  }, [generateNewSessionId]);

  // WebSocket connection for real-time updates (commented out for now)
  // useEffect(() => {
  //   if (user && gameSessionId) {
  //     console.log('Connecting WebSocket for team battle setup');
  //     const socket = connectSocket();
  //
  //     const handleTeamUpdated = (data: any) => {
  //       console.log('Team updated via WebSocket:', data);
  //       // Refetch teams when team is updated
  //       refetchTeams();
  //     };

  //     const handleTeamCreated = (data: any) => {
  //       console.log('Team created via WebSocket:', data);
  //       // Refetch teams when new team is created
  //       refetchTeams();
  //     };

  //     const handleInvitationAccepted = (data: any) => {
  //       console.log('Invitation accepted via WebSocket:', data);
  //       // Refetch invitations and teams
  //       refetchInvitations();
  //       refetchTeams();
  //     };

  //     // Listen for team-related events
  //     socket.on('team_updated', handleTeamUpdated);
  //     socket.on('team_created', handleTeamCreated);
  //     socket.on('invitation_accepted', handleInvitationAccepted);

  //     return () => {
  //       console.log('Disconnecting WebSocket for team battle setup');
  //       socket.off('team_updated', handleTeamUpdated);
  //       socket.off('team_created', handleTeamCreated);
  //       socket.off('invitation_accepted', handleInvitationAccepted);
  //       disconnectSocket();
  //     };
  //   }
  // }, [user, gameSessionId, refetchTeams, refetchInvitations]);

  // Set user as online when component mounts
  useEffect(() => {
    if (user?.id) {
      const setUserOnline = async () => {
        try {
          await apiRequest("PATCH", `/api/users/${user.id}/online`, {
            isOnline: true,
          });
        } catch (error) {
          // Ignore online status errors
        }
      };
      setUserOnline();

      // Set user as offline when component unmounts
      return () => {
        try {
          apiRequest("PATCH", `/api/users/${user.id}/online`, {
            isOnline: false,
          }).catch(() => {});
        } catch (error) {
          // Ignore cleanup errors
        }

        if (refetchTimeoutRef.current) {
          clearTimeout(refetchTimeoutRef.current);
        }
      };
    }
  }, [user?.id]);

  // onlineUsers provided by hook

  // WebSocket connection - ensure socket is initialized
  useEffect(() => {
    if (user?.id) {
      setupGameSocket(user.id);
    }
  }, [user?.id]);

  // Show toast to captains when a new join request arrives
  useEffect(() => {
    if (!user?.id) return;

    const offJoinRequestCreatedToast = onEvent(
      "join_request_created",
      async (data: any) => {
        try {
          // First check: do we have the team in our current teams array?
          let team = teams.find((t: any) => t.id === data.teamId);

          // If not found, fetch fresh team data
          if (!team && data.teamId) {
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

          if (isCaptain) {
            toast({
              title: "New Join Request",
              description: `${data.requesterUsername} requested to join ${team.name}`,
            });
            debouncedRefetch();
          } else if (data.teamId) {
            // Show generic toast even if team not found yet
            toast({
              title: "New Join Request",
              description: `${data.requesterUsername} wants to join your team`,
            });
            debouncedRefetch();
          }
        } catch (err) {
          // Silent error handling
        }
      }
    );
    return () => {
      offJoinRequestCreatedToast();
    };
  }, [user?.id, teams, toast, debouncedRefetch, gameSessionId]);

  // Subscribe to specific team/invitation/join-request events
  useEffect(() => {
    if (!user?.id) return;

    // Ensure socket is initialized for this user
    setupGameSocket(user.id);

    const offTeamUpdated = onEvent("team_updated", () => {
      debouncedRefetch();
    });
    const offTeamCreated = onEvent("team_created", () => {
      debouncedRefetch();
    });
    const offTeamsUpdated = onEvent("teams_updated", () => {
      debouncedRefetch();
    });
    const offInvitationReceived = onEvent("team_invitation_received", () => {
      debouncedRefetch();
    });
    const offInvitationSent = onEvent("invitation_sent", () => {
      debouncedRefetch();
    });
    const offJoinRequestCreated = onEvent(
      "join_request_created",
      (data: any) => {
        const targetTeam = teams.find((t: Team) => t.id === data.teamId);
        const isCaptain = !!targetTeam && targetTeam.captainId === user?.id;
        if (isCaptain) {
          toast({
            title: "New Join Request",
            description: `${data.requesterUsername} requested to join ${targetTeam.name}`,
          });
          debouncedRefetch();
        }
      }
    );
    const offJoinRequestUpdated = onEvent("join_request_updated", () => {
      debouncedRefetch();
    });
    const offTeamBattleStarted = onEvent("team_battle_started", (data: any) => {
      console.log("[TeamBattleSetup] Received team_battle_started event:", data);
      toast({
        title: "Battle Started!",
        description: "Redirecting to game...",
      });
      // Navigate to game when WebSocket confirms battle started
      if (data.gameSessionId || gameSessionId) {
        setLocation(`/team-battle-game?session=${data.gameSessionId || gameSessionId}`);
      }
    });

    return () => {
      offTeamUpdated();
      offTeamCreated();
      offTeamsUpdated();
      offInvitationReceived();
      offInvitationSent();
      offJoinRequestCreated();
      offJoinRequestUpdated();
      offTeamBattleStarted();
    };
  }, [user?.id, teams, debouncedRefetch, toast, gameSessionId, setLocation]);

  // joinRequests provided by hook

  // Join requests refresh handled by hook subscriptions

  // updateJoinRequestMutation provided by hook

  const handleApproveJoinRequest = (id: string) => {
    // Use API directly if hook mutation not available here
    apiRequest("PATCH", `/api/team-join-requests/${id}`, { status: "accepted" })
      .then(() => {
        toast({ title: "Join Request Updated" });
        debouncedRefetch();
      })
      .catch((error: any) => {
        toast({
          title: "Error",
          description: error.message || "Failed to update join request",
          variant: "destructive",
        });
      });
  };

  const handleRejectJoinRequest = (id: string) => {
    apiRequest("PATCH", `/api/team-join-requests/${id}`, { status: "rejected" })
      .then(() => {
        toast({ title: "Join Request Updated" });
        debouncedRefetch();
      })
      .catch((error: any) => {
        toast({
          title: "Error",
          description: error.message || "Failed to update join request",
          variant: "destructive",
        });
      });
  };

  // Create team mutation
  const createTeamMutation = useMutation({
    mutationFn: async (data: { name: string; gameSessionId: string }) => {
      const res = await apiRequest("POST", "/api/teams", {
        name: data.name,
        gameSessionId: data.gameSessionId,
      });
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Team Created!",
        description: "Your team has been created successfully.",
      });
      debouncedRefetch();
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
      isCaptainInvitation?: boolean;
    }) => {
      const payload = {
        ...data,
        gameSessionId,
      };
      const res = await apiRequest("POST", "/api/team-invitations", payload);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Invitation Sent!",
        description: "Team invitation has been sent successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send invitation",
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
      const res = await apiRequest(
        "PATCH",
        `/api/team-invitations/${invitationId}`,
        { status, teamName }
      );
      return await res.json();
    },
    onSuccess: (data, variables) => {
      if (data?.teamBattle?.gameSessionId) {
        updateGameSessionId(data.teamBattle.gameSessionId);
      }

      if (variables.status === "accepted") {
        const isOpponentInvitation = !!data.teamBattle;

        if (isOpponentInvitation) {
          toast({
            title: "Team Battle Created!",
            description:
              "You are now the captain of Team B! Both teams can now invite teammates.",
          });

          setTimeout(() => {
            toast({
              title: "Battle Lobby Ready!",
              description:
                "Both captains are ready! You can now invite team members to fill your teams.",
              duration: 5000,
            });
          }, 1000);
        } else {
          toast({
            title: "Invitation Accepted!",
            description: "You have joined the team.",
          });
        }

        debouncedRefetch();
      } else {
        toast({
          title: "Invitation Declined",
          description: "You have declined the invitation.",
        });
      }
      setShowTeamNameDialog(false);
      setNewTeamName("");
      setPendingInvitationId(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to respond to invitation",
        variant: "destructive",
      });
      setShowTeamNameDialog(false);
      setNewTeamName("");
      setPendingInvitationId(null);
    },
  });

  // Start battle mutation
  const startBattleMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/team-battle/start", {
        gameSessionId,
      });
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Battle Starting!",
        description: "Waiting for game to initialize...",
      });
      // Don't navigate immediately - wait for WebSocket team_battle_started event
      // The WebSocket listener will handle navigation when game is ready
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to start battle",
        variant: "destructive",
      });
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
      debouncedRefetch();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update team name",
        variant: "destructive",
      });
    },
  });

  // Leave team mutation
  const leaveTeamMutation = useMutation({
    mutationFn: async (teamId: string) => {
      const res = await apiRequest("DELETE", `/api/teams/${teamId}/leave`);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Left Team Successfully!",
        description: "You have left the team and can now join a different one.",
      });
      generateNewSessionId();
      debouncedRefetch();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to leave team",
        variant: "destructive",
      });
    },
  });

  const handleLeaveTeam = (teamId: string) => {
    leaveTeamMutation.mutate(teamId);
  };

  const handleCreateTeam = () => {
    if (!teamName.trim()) {
      toast({
        title: "Error",
        description: "Please enter a team name",
        variant: "destructive",
      });
      return;
    }
    createTeamMutation.mutate({ name: teamName, gameSessionId });
  };

  const handleSendInvitation = (
    userId: number,
    isCaptainInvitation: boolean = false
  ) => {
    const userTeam = teams.find((team: Team) =>
      team.members.some((member: TeamMember) => member.userId === user?.id)
    );

    if (!userTeam) {
      toast({
        title: "Error",
        description: "You must be in a team to send invitations",
        variant: "destructive",
      });
      return;
    }

    sendInvitationMutation.mutate({
      teamId: userTeam.id,
      inviteeId: userId,
      isCaptainInvitation,
    });
  };

  const handleRespondToInvitation = (
    invitationId: string,
    status: "accepted" | "declined",
    isCaptainInvitation: boolean = false
  ) => {
    if (status === "accepted" && isCaptainInvitation) {
      setPendingInvitationId(invitationId);
      setNewTeamName(`${user?.username}'s Team`);
      setShowTeamNameDialog(true);
    } else {
      respondToInvitationMutation.mutate({ invitationId, status });
    }
  };

  const handleAcceptCaptainInvitation = () => {
    if (pendingInvitationId && newTeamName.trim()) {
      respondToInvitationMutation.mutate({
        invitationId: pendingInvitationId,
        status: "accepted",
        teamName: newTeamName.trim(),
      });

      debouncedRefetch();
    }
  };

  const handleStartBattle = () => {
    startBattleMutation.mutate();
  };

  const handleUpdateTeamName = async (teamId: string, newName: string) => {
    await updateTeamNameMutation.mutateAsync({ teamId, name: newName });
  };

  // Find user's team
  const userTeam = teams.find((team: Team) =>
    team.members.some((member: TeamMember) => member.userId === user?.id)
  );

  // If user already belongs to a team, ensure we use that team's session ID
  useEffect(() => {
    if (
      userTeam &&
      userTeam.gameSessionId &&
      userTeam.gameSessionId !== gameSessionId
    ) {
      updateGameSessionId(userTeam.gameSessionId);
    }
  }, [userTeam, gameSessionId, updateGameSessionId]);

  // Check if user is a captain
  const isTeamCaptain = userTeam?.captainId === user?.id;

  // Check battle readiness
  const bothTeamsReady =
    teams.length >= 2 && teams.every((team: Team) => team.members.length >= 3);

  // Get battle status details
  const getBattleStatus = () => {
    if (teams.length === 0) {
      return {
        status: "no-teams",
        message: "No teams formed yet",
        description:
          "Create your team and invite an opposing captain to start the 3v3 battle",
        color: "purple",
      };
    } else if (teams.length === 1) {
      const team = teams[0];
      return {
        status: "waiting-for-opponent-captain",
        message: "Your team created! Waiting for opposing captain",
        description: `Your team "${team.name}" is ready! Invite an opposing captain - when they accept, Team B will be automatically created`,
        color: "blue",
      };
    } else if (teams.length >= 2) {
      const incompleteTeams = teams.filter(
        (team: Team) => team.members.length < 3
      );
      const completeTeams = teams.filter(
        (team: Team) => team.members.length >= 3
      );

      if (incompleteTeams.length > 0) {
        return {
          status: "teams-forming",
          message: "Battle Lobby Ready! Both captains can invite members",
          description: `Both teams have been created! ${completeTeams.length} team(s) complete, ${incompleteTeams.length} team(s) still need members. Captains can now invite team members.`,
          color: "yellow",
        };
      } else {
        return {
          status: "ready-to-battle",
          message: "3v3 Battle Ready!",
          description: `Perfect! Both captains have complete teams with 3 members each. 3v3 battle can begin!`,
          color: "green",
        };
      }
    }
  };

  // ===== Debug UI state =====
  const [showDebug, setShowDebug] = useState<boolean>(false);
  const debugMyCaptainTeams = useMemo(() => {
    return teams
      .filter((t: Team) => t.captainId === user?.id)
      .map((t: Team) => t.id);
  }, [teams, user?.id]);

  // Note: Backend already filters join requests for active teams where user is captain
  // Frontend just uses the data directly without additional filtering
  const validJoinRequests = joinRequests;

  const debugPendingForMyTeams = useMemo(() => {
    const ids = new Set(debugMyCaptainTeams);
    return (validJoinRequests || []).filter(
      (jr: any) => jr.status === "pending" && ids.has(jr.teamId)
    );
  }, [validJoinRequests, debugMyCaptainTeams]); // Floating debug toggle for easy access
  const DebugToggle = () => (
    <div className="fixed bottom-4 right-4 z-50">
      <Button
        size="sm"
        variant="secondary"
        onClick={() => setShowDebug((v) => !v)}
      >
        {showDebug ? "Hide Debug" : "Show Debug"}
      </Button>
    </div>
  );

  const battleStatus = getBattleStatus() || {
    status: "no-teams",
    message: "No teams formed yet",
    description: "Create a team to start the battle process",
    color: "purple",
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <DebugToggle />
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              onClick={() => setLocation("/")}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Home
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Team Battle Setup
              </h1>
              <p className="text-gray-600">
                Form teams and prepare for epic Bible trivia battles
              </p>
            </div>
          </div>

          <div className="text-right">
            <Badge variant="outline" className="text-sm">
              Session: {gameSessionId.slice(-8)}
            </Badge>
            <p className="text-xs text-gray-500 mt-1">
              Share this session ID with friends
            </p>
          </div>
        </div>

        {/* Debug Info */}
        <Alert className="border-blue-200 bg-blue-50">
          <AlertDescription className="text-blue-800">
            <strong>Debug Info:</strong>
            <br />• Online Users: {onlineUsers.length}
            <br />• Teams: {teams.length}
            <br />• Invitations: {invitations.length}
            <br />• Join Requests: {validJoinRequests.length} (total:{" "}
            {joinRequests.length}, filtered:{" "}
            {joinRequests.length - validJoinRequests.length})
            <br />• User ID: {user?.id}
            <br />• Session ID: {gameSessionId}
            <br />
            <Button onClick={debouncedRefetch} size="sm" className="mt-2">
              Force Refresh Data
            </Button>
          </AlertDescription>
        </Alert>

        {/* Battle Status */}
        <Alert
          className={`border-2 ${
            battleStatus.color === "green"
              ? "border-green-300 bg-green-50"
              : battleStatus.color === "blue"
              ? "border-blue-300 bg-blue-50"
              : battleStatus.color === "yellow"
              ? "border-yellow-300 bg-yellow-50"
              : "border-purple-300 bg-purple-50"
          }`}
        >
          <Zap
            className={`h-4 w-4 ${
              battleStatus.color === "green"
                ? "text-green-600"
                : battleStatus.color === "blue"
                ? "text-blue-600"
                : battleStatus.color === "yellow"
                ? "text-yellow-600"
                : "text-purple-600"
            }`}
          />
          <AlertDescription
            className={
              battleStatus.color === "green"
                ? "text-green-800"
                : battleStatus.color === "blue"
                ? "text-blue-800"
                : battleStatus.color === "yellow"
                ? "text-yellow-800"
                : "text-purple-800"
            }
          >
            <strong>3v3 Battle Status:</strong> {battleStatus.message}
            <br />
            <span className="text-sm">{battleStatus.description}</span>
          </AlertDescription>
        </Alert>

        {/* Captain: Pending Join Requests */}
        {isTeamCaptain && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-green-500" /> Pending Join
                Requests
              </CardTitle>
            </CardHeader>
            <CardContent>
              {debugPendingForMyTeams.length > 0 && (
                <Alert className="mb-3 border-yellow-400 bg-yellow-50">
                  <AlertDescription className="text-yellow-800">
                    You have {debugPendingForMyTeams.length} pending member
                    request(s) awaiting action.
                  </AlertDescription>
                </Alert>
              )}
              {validJoinRequests.filter(
                (jr: TeamJoinRequest) => jr.status === "pending"
              ).length === 0 ? (
                <p className="text-sm text-gray-600">No pending requests.</p>
              ) : (
                <div className="space-y-3">
                  {validJoinRequests
                    .filter((jr: TeamJoinRequest) => jr.status === "pending")
                    .map((jr: TeamJoinRequest) => {
                      // Backend already filters to only return join requests for teams where user is captain
                      // So we can directly display all returned join requests
                      const team = teams.find((t: Team) => t.id === jr.teamId);
                      const teamName = team?.name || "Unknown Team";

                      const expiresLabel = jr.expiresAt
                        ? `Expires in ${Math.max(
                            0,
                            Math.floor(
                              (new Date(jr.expiresAt as any).getTime() -
                                Date.now()) /
                                1000
                            )
                          )}s`
                        : "";
                      return (
                        <div
                          key={jr.id}
                          className="flex items-center justify-between rounded border p-3"
                        >
                          <div>
                            <div className="font-medium">
                              {jr.requesterUsername}
                            </div>
                            <div className="text-sm text-gray-600">
                              Requested to join "{teamName}"{" "}
                              {expiresLabel && `• ${expiresLabel}`}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => handleApproveJoinRequest(jr.id)}
                              className="flex items-center gap-1"
                            >
                              <Check className="h-3 w-3" /> Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleRejectJoinRequest(jr.id)}
                              className="flex items-center gap-1"
                            >
                              <X className="h-3 w-3" /> Reject
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* 3v3 Battle Format Display */}
        {teams.length > 0 && (
          <Card className="border-2 border-purple-200 bg-gradient-to-r from-purple-50 to-blue-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-purple-800">
                <Gamepad2 className="h-6 w-6" />
                3v3 Battle Format
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                {/* Team A */}
                <div className="text-center">
                  <div className="bg-blue-100 p-4 rounded-lg border-2 border-blue-300">
                    <h3 className="font-bold text-blue-800 text-lg mb-2">
                      Team A
                    </h3>
                    <div className="text-sm text-blue-700 mb-2">
                      {teams[0]?.name || "Not formed yet"}
                    </div>
                    <div className="text-2xl font-bold text-blue-800">
                      {teams[0]?.members.length || 0}/3
                    </div>
                    <div className="text-xs text-blue-600">members</div>
                  </div>
                </div>

                {/* VS */}
                <div className="text-center">
                  <div className="bg-purple-100 p-4 rounded-full border-2 border-purple-300">
                    <div className="text-3xl font-bold text-purple-800">VS</div>
                    <div className="text-sm text-purple-600">3v3 Battle</div>
                  </div>
                </div>

                {/* Team B */}
                <div className="text-center">
                  <div className="bg-green-100 p-4 rounded-lg border-2 border-green-300">
                    <h3 className="font-bold text-green-800 text-lg mb-2">
                      Team B
                    </h3>
                    <div className="text-sm text-green-700 mb-2">
                      {teams[1]?.name || "Not formed yet"}
                    </div>
                    <div className="text-2xl font-bold text-green-800">
                      {teams[1]?.members.length || 0}/3
                    </div>
                    <div className="text-xs text-green-600">members</div>
                  </div>
                </div>
              </div>

              {/* Battle Status */}
              <div className="mt-4 text-center">
                {bothTeamsReady ? (
                  <div className="bg-green-100 p-3 rounded-lg border border-green-300">
                    <p className="text-green-800 font-medium">
                      🎉 Ready for 3v3 Battle!
                    </p>
                    <p className="text-sm text-green-600">
                      Both captains have complete teams with 3 members each
                    </p>
                  </div>
                ) : (
                  <div className="bg-yellow-100 p-3 rounded-lg border border-yellow-300">
                    <p className="text-yellow-800 font-medium">
                      ⏳ Preparing for 3v3 Battle
                    </p>
                    <p className="text-sm text-yellow-600">
                      {teams.length === 1
                        ? "Captain A created team, waiting for Captain B to accept invitation"
                        : teams.length >= 2
                        ? "Battle Lobby Ready! Both captains can now invite team members"
                        : "Waiting for captains to create teams"}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Debug Panel */}
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Debug: Join Requests Visibility</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowDebug(!showDebug)}
              >
                {showDebug ? "Hide" : "Show"}
              </Button>
            </CardTitle>
          </CardHeader>
          {showDebug && (
            <CardContent>
              <div className="grid md:grid-cols-2 gap-4 text-sm">
                <div className="space-y-2">
                  <div className="font-semibold">User</div>
                  <pre className="bg-gray-100 p-2 rounded overflow-auto">
                    {JSON.stringify(
                      { id: user?.id, username: user?.username, isTeamCaptain },
                      null,
                      2
                    )}
                  </pre>
                  <div className="font-semibold">Teams (IDs)</div>
                  <pre className="bg-gray-100 p-2 rounded overflow-auto">
                    {JSON.stringify(
                      teams.map((t: any) => ({
                        id: t.id,
                        name: t.name,
                        captainId: t.captainId,
                      })),
                      null,
                      2
                    )}
                  </pre>
                </div>
                <div className="space-y-2">
                  <div className="font-semibold">
                    Join Requests (raw - {joinRequests.length})
                  </div>
                  <pre className="bg-gray-100 p-2 rounded overflow-auto max-h-40">
                    {JSON.stringify(joinRequests, null, 2)}
                  </pre>
                  <div className="font-semibold">
                    Join Requests (filtered - {validJoinRequests.length})
                  </div>
                  <pre className="bg-green-100 p-2 rounded overflow-auto max-h-40">
                    {JSON.stringify(validJoinRequests, null, 2)}
                  </pre>
                  <div className="font-semibold">
                    Pending For My Teams ({debugPendingForMyTeams.length})
                  </div>
                  <pre className="bg-yellow-100 p-2 rounded overflow-auto max-h-40">
                    {JSON.stringify(debugPendingForMyTeams, null, 2)}
                  </pre>
                </div>
              </div>
              <div className="mt-2 flex gap-2">
                <Button size="sm" onClick={() => debouncedRefetch()}>
                  Refetch Join Requests
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => debouncedRefetch()}
                >
                  Refetch Teams
                </Button>
              </div>
            </CardContent>
          )}
        </Card>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Left Column - Team Management */}
          <div className="space-y-6">
            {/* Game Finished - Encourage Play Again */}
            {userTeam && userTeam.status === "finished" && (
              <Alert className="border-green-500 bg-green-50">
                <Check className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  <div className="space-y-2">
                    <p className="font-semibold">Match Completed!</p>
                    <p className="text-sm">
                      Your team battle has finished. Leave your current team to
                      start a new match.
                    </p>
                    <div className="flex gap-2 mt-3">
                      <Button
                        onClick={() => handleLeaveTeam(userTeam.id)}
                        disabled={leaveTeamMutation.isPending}
                        size="sm"
                        className="bg-green-600 hover:bg-green-700 text-white"
                      >
                        <LogOut className="h-4 w-4 mr-2" />
                        {isTeamCaptain
                          ? "Delete Team & Start New Match"
                          : "Leave Team & Start New Match"}
                      </Button>
                      <Button
                        onClick={() => setLocation("/")}
                        variant="outline"
                        size="sm"
                      >
                        Return Home
                      </Button>
                    </div>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {/* Create Team */}
            {!userTeam && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Crown className="h-5 w-5 text-yellow-500" />
                    Create Your Team
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-purple-50 p-3 rounded-lg border-l-4 border-purple-400">
                    <h4 className="font-medium text-purple-800 mb-2">
                      Step 1: Create Your Team & Find Opponent Captain
                    </h4>
                    <p className="text-sm text-purple-700">
                      Create your team and invite an opposing captain. When they
                      accept, their team will be automatically created and
                      you'll both become opposing captains.
                    </p>
                    <div className="mt-2 text-xs text-purple-600">
                      <strong>Flow:</strong> Create Team → Invite Opposing
                      Captain → Captain B Accepts → Both Teams Created → Fill
                      Teams → 3v3 Battle
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Team Name
                    </label>
                    <Input
                      value={teamName}
                      onChange={(e) => setTeamName(e.target.value)}
                      placeholder="Enter your team name"
                      className="w-full"
                    />
                  </div>
                  <div className="bg-blue-50 p-3 rounded-lg">
                    <h5 className="font-medium text-blue-800 mb-1">
                      What happens next?
                    </h5>
                    <ul className="text-xs text-blue-700 space-y-1">
                      <li>• You become the team captain</li>
                      <li>
                        • You can invite an opposing captain from online players
                      </li>
                      <li>• Opposing captain will create their own team</li>
                      <li>• Both captains then fill teams with members</li>
                      <li>• Battle starts when both teams have 3 members</li>
                    </ul>
                  </div>
                  <Button
                    onClick={handleCreateTeam}
                    disabled={createTeamMutation.isPending || !teamName.trim()}
                    className="w-full bg-purple-500 hover:bg-purple-600"
                  >
                    <Crown className="mr-2 h-4 w-4" />
                    {createTeamMutation.isPending
                      ? "Creating Team..."
                      : "Create Team & Become Captain"}
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Team Info */}
            {userTeam && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Users className="h-5 w-5 text-blue-500" />
                      <span>Your Team: {userTeam.name}</span>
                      {isTeamCaptain && (
                        <Badge
                          variant="outline"
                          className="ml-2 bg-yellow-50 text-yellow-800 border-yellow-300"
                        >
                          <Crown className="h-3 w-3 mr-1" />
                          You are Captain
                        </Badge>
                      )}
                      {/* Show which team this is */}
                      <Badge variant="default" className="ml-2">
                        {teams.findIndex((t: Team) => t.id === userTeam.id) ===
                        0
                          ? "Team A"
                          : "Team B"}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-xs text-gray-500">
                        {
                          userTeam.members.filter(
                            (m: TeamMember) => m.role === "captain"
                          ).length
                        }{" "}
                        Captain,{" "}
                        {
                          userTeam.members.filter(
                            (m: TeamMember) => m.role === "member"
                          ).length
                        }{" "}
                        Members
                      </div>
                    </div>
                  </CardTitle>
                  <div className="mt-2 p-3 bg-blue-50 rounded-lg border-l-4 border-blue-400">
                    <div className="flex items-center gap-4 text-sm">
                      <div className="flex items-center gap-2">
                        <Crown className="h-4 w-4 text-yellow-500" />
                        <span className="font-medium text-blue-800">
                          Captain:{" "}
                          {
                            userTeam.members.find(
                              (m: TeamMember) => m.role === "captain"
                            )?.username
                          }
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-blue-500" />
                        <span className="font-medium text-blue-800">
                          Members:{" "}
                          {
                            userTeam.members.filter(
                              (m: TeamMember) => m.role === "member"
                            ).length
                          }
                        </span>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium text-gray-900">
                        Team Members ({userTeam.members.length}/3)
                      </h4>
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-2 h-2 rounded-full ${
                            userTeam.members.length >= 3
                              ? "bg-green-500"
                              : "bg-yellow-500"
                          }`}
                        />
                        <span className="text-xs text-gray-500">
                          {userTeam.members.length >= 3
                            ? "Complete"
                            : "Incomplete"}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {userTeam.members.map((member: TeamMember) => (
                        <div
                          key={member.userId}
                          className={`flex items-center justify-between p-3 rounded-lg border-l-4 ${
                            member.role === "captain"
                              ? "bg-yellow-50 border-yellow-400"
                              : "bg-gray-50 border-gray-300"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold ${
                                member.role === "captain"
                                  ? "bg-yellow-500"
                                  : "bg-blue-500"
                              }`}
                            >
                              {member.username.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span
                                  className={`font-medium ${
                                    member.role === "captain"
                                      ? "text-yellow-800"
                                      : "text-gray-900"
                                  }`}
                                >
                                  {member.username}
                                </span>
                                {member.role === "captain" && (
                                  <div className="flex items-center gap-1">
                                    <Crown className="h-4 w-4 text-yellow-500" />
                                    <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full font-medium">
                                      CAPTAIN
                                    </span>
                                  </div>
                                )}
                              </div>
                              <p className="text-xs text-gray-500">
                                Joined:{" "}
                                {new Date(member.joinedAt).toLocaleDateString()}
                              </p>
                              {member.role === "captain" && (
                                <p className="text-xs text-yellow-600 font-medium mt-1">
                                  🎯 Team Leader
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <Badge
                              variant={
                                member.role === "captain"
                                  ? "default"
                                  : member.userId === user?.id
                                  ? "secondary"
                                  : "outline"
                              }
                              className={`text-xs ${
                                member.role === "captain"
                                  ? "bg-yellow-500 hover:bg-yellow-600"
                                  : ""
                              }`}
                            >
                              {member.userId === user?.id
                                ? "You"
                                : member.role === "captain"
                                ? "Captain"
                                : "Member"}
                            </Badge>
                            {member.userId === user?.id && (
                              <Badge variant="outline" className="text-xs">
                                Current User
                              </Badge>
                            )}
                            {member.role === "captain" && (
                              <Badge
                                variant="outline"
                                className="text-xs bg-yellow-100 text-yellow-800 border-yellow-300"
                              >
                                👑 Leader
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Team Status */}
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-3 h-3 rounded-full ${
                        userTeam.members.length >= 3
                          ? "bg-green-500"
                          : "bg-yellow-500"
                      }`}
                    />
                    <span className="text-sm text-gray-600">
                      {userTeam.members.length >= 3
                        ? "Ready for battle!"
                        : "Need more members"}
                    </span>
                  </div>

                  {/* Team Information */}
                  <div className="grid grid-cols-2 gap-4 pt-3 border-t">
                    <div className="text-center">
                      <div className="text-lg font-bold text-blue-600">
                        {userTeam.members.length}
                      </div>
                      <div className="text-xs text-gray-500">Members</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-bold text-green-600">
                        {
                          userTeam.members.filter(
                            (m: TeamMember) => m.role === "captain"
                          ).length
                        }
                      </div>
                      <div className="text-xs text-gray-500">Captain(s)</div>
                    </div>
                  </div>

                  {/* Team Creation Info */}
                  <div className="text-xs text-gray-500 pt-2 border-t">
                    Team created:{" "}
                    {new Date(userTeam.createdAt).toLocaleString()}
                  </div>

                  {/* User Role Information */}
                  <div className="bg-blue-50 p-3 rounded-lg">
                    <h5 className="font-medium text-blue-800 mb-2 flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Your Role & Permissions
                    </h5>
                    <div className="text-sm text-blue-700">
                      {isTeamCaptain ? (
                        <div>
                          <p className="font-medium">
                            🎯 You are the Team Captain
                          </p>
                          <ul className="mt-1 space-y-1 text-xs">
                            <li>• Can invite new members</li>
                            <li>• Can start battles when teams are ready</li>
                            <li>• Can manage team settings</li>
                            <li>• Can see all team information</li>
                          </ul>
                        </div>
                      ) : (
                        <div>
                          <p className="font-medium">
                            👥 You are a Team Member
                          </p>
                          <ul className="mt-1 space-y-1 text-xs">
                            <li>• Can see all team members</li>
                            <li>• Can view team status and progress</li>
                            <li>• Can respond to invitations</li>
                            <li>• Can participate in battles</li>
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Leave Team Button for Captains */}
                  {isTeamCaptain && (
                    <div className="flex justify-end pt-3 border-t">
                      <Button
                        onClick={() => handleLeaveTeam(userTeam.id)}
                        disabled={leaveTeamMutation.isPending}
                        variant="outline"
                        className="border-red-300 text-red-600 hover:bg-red-50"
                      >
                        <LogOut className="h-4 w-4 mr-2" />
                        {userTeam.members.length === 1
                          ? "Delete Team"
                          : "Leave Team"}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Team Member Status (for non-captains) */}
            {userTeam && !isTeamCaptain && (
              <Card className="border-purple-200 bg-purple-50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-purple-800">
                    <Users className="h-5 w-5" />
                    Your Team Status
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-white p-4 rounded-lg border border-purple-200">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-purple-800">
                          You are in:
                        </span>
                        <Badge variant="default" className="bg-purple-500">
                          {teams.findIndex(
                            (t: Team) => t.id === userTeam.id
                          ) === 0
                            ? "Team A"
                            : "Team B"}
                        </Badge>
                      </div>
                      <div className="text-sm text-purple-600">
                        Role: <span className="font-medium">Team Member</span>
                      </div>
                    </div>

                    <div className="space-y-2 text-sm text-purple-700">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-purple-500 rounded-full" />
                        <span>
                          Captain:{" "}
                          <strong>
                            {
                              userTeam.members.find(
                                (m: TeamMember) => m.role === "captain"
                              )?.username
                            }
                          </strong>
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-blue-500 rounded-full" />
                        <span>
                          Team Members:{" "}
                          <strong>{userTeam.members.length}/3</strong>
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-green-500 rounded-full" />
                        <span>
                          Battle Status:{" "}
                          <strong>
                            {userTeam.members.length >= 3
                              ? "Ready"
                              : "Waiting for more members"}
                          </strong>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-purple-100 p-3 rounded-lg">
                    <h4 className="font-medium text-purple-800 mb-2">
                      What you can do:
                    </h4>
                    <ul className="text-sm text-purple-700 space-y-1">
                      <li>
                        • Wait for your captain to invite more team members
                      </li>
                      <li>• Wait for the opposing team to be formed</li>
                      <li>• Participate in the battle when it starts</li>
                      <li>
                        • Leave the team if you want to join a different one
                      </li>
                    </ul>
                  </div>

                  <div className="flex justify-end">
                    <Button
                      onClick={() => handleLeaveTeam(userTeam.id)}
                      disabled={leaveTeamMutation.isPending}
                      variant="outline"
                      className="border-red-300 text-red-600 hover:bg-red-50"
                    >
                      <LogOut className="h-4 w-4 mr-2" />
                      Leave Team
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Invite Opposing Captain */}
            {userTeam && isTeamCaptain && teams.length < 2 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <UserPlus className="h-5 w-5 text-green-500" />
                    Invite Opposing Captain
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-green-50 p-3 rounded-lg border-l-4 border-green-400">
                    <h4 className="font-medium text-green-800 mb-2">
                      Step 2: Invite Opposing Captain
                    </h4>
                    <p className="text-sm text-green-700">
                      Invite an opposing captain to create Team B. When they
                      accept, their team will be automatically created and
                      they'll become the captain of Team B.
                    </p>
                    <div className="mt-2 text-xs text-green-600">
                      <strong>What happens:</strong> Captain B accepts → Team B
                      automatically created → Both teams ready for member
                      invitations
                    </div>
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-medium text-gray-900">
                      Online Players
                    </h4>
                    {onlineUsers.filter(
                      (onlineUser: User) =>
                        onlineUser.id !== user?.id &&
                        !userTeam.members.some(
                          (member: TeamMember) =>
                            member.userId === onlineUser.id
                        )
                    ).length > 0 ? (
                      onlineUsers
                        .filter(
                          (onlineUser: User) =>
                            onlineUser.id !== user?.id &&
                            !userTeam.members.some(
                              (member: TeamMember) =>
                                member.userId === onlineUser.id
                            )
                        )
                        .map((onlineUser: User) => (
                          <div
                            key={onlineUser.id}
                            className="flex items-center justify-between p-2 bg-gray-50 rounded"
                          >
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 bg-green-500 rounded-full" />
                              <span className="font-medium">
                                {onlineUser.username}
                              </span>
                            </div>
                            <Button
                              size="sm"
                              onClick={() =>
                                handleSendInvitation(onlineUser.id, true)
                              }
                              disabled={sendInvitationMutation.isPending}
                              className="bg-green-500 hover:bg-green-600"
                            >
                              <Crown className="mr-1 h-3 w-3" />
                              Invite as Opposing Captain
                            </Button>
                          </div>
                        ))
                    ) : (
                      <div className="text-center py-4 text-gray-500">
                        <p>No other players online right now.</p>
                        <p className="text-sm mt-1">
                          Share the session ID with friends to invite them!
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right Column - Battle Info & Actions */}
          <div className="space-y-6">
            {/* Team Invitations */}
            {invitations.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Mail className="h-5 w-5 text-blue-500" />
                    Team Invitations ({invitations.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {invitations
                    .filter(
                      (invitation: TeamInvitation) =>
                        invitation.status === "pending"
                    )
                    .map((invitation: TeamInvitation) => {
                      const derivedTeamId =
                        invitation.teamBattleId && invitation.teamSide
                          ? `${
                              invitation.teamBattleId
                            }-team-${invitation.teamSide.toLowerCase()}`
                          : invitation.teamId || undefined;
                      const team = derivedTeamId
                        ? teams.find((t: Team) => t.id === derivedTeamId)
                        : undefined;
                      return (
                        <div
                          key={invitation.id}
                          className="p-3 border rounded-lg bg-blue-50"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="flex items-center gap-2">
                                <Crown className="h-4 w-4 text-yellow-500" />
                                <p className="font-medium">
                                  Captain Invitation from{" "}
                                  {invitation.inviterUsername || team?.name}
                                </p>
                              </div>
                              <p className="text-sm text-gray-600">
                                {invitation.inviterUsername || "A captain"}{" "}
                                wants you to become the opposing captain for 3v3
                                battle
                              </p>
                              <p className="text-xs text-blue-600 mt-1">
                                Accept to automatically create Team B and become
                                the captain
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={() =>
                                  handleRespondToInvitation(
                                    invitation.id,
                                    "accepted",
                                    true
                                  )
                                }
                                disabled={respondToInvitationMutation.isPending}
                                className="bg-green-500 hover:bg-green-600"
                              >
                                <Crown className="h-3 w-3 mr-1" />
                                Accept & Create Team
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  handleRespondToInvitation(
                                    invitation.id,
                                    "declined",
                                    true
                                  )
                                }
                                disabled={respondToInvitationMutation.isPending}
                              >
                                <X className="h-3 w-3 mr-1" />
                                Decline
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </CardContent>
              </Card>
            )}

            {/* Invite Team Members */}
            {userTeam && isTeamCaptain && userTeam.members.length < 3 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-blue-500" />
                    Complete Your Team
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-blue-50 p-3 rounded-lg border-l-4 border-blue-400">
                    <h4 className="font-medium text-blue-800 mb-2">
                      Step 3: Fill Your Team with Members
                    </h4>
                    <p className="text-sm text-blue-700">
                      Invite 2 more players to complete your team of 3. Your
                      opposing captain is doing the same for their team.
                    </p>
                    <div className="mt-2 text-xs text-blue-600">
                      <strong>Progress:</strong> {userTeam.members.length}/3
                      members • Need {3 - userTeam.members.length} more
                    </div>
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-medium text-gray-900">
                      Online Players
                    </h4>
                    {onlineUsers.filter(
                      (onlineUser: User) =>
                        onlineUser.id !== user?.id &&
                        !userTeam.members.some(
                          (member: TeamMember) =>
                            member.userId === onlineUser.id
                        ) &&
                        !teams.some(
                          (team: Team) =>
                            team.id !== userTeam.id &&
                            team.members.some(
                              (member: TeamMember) =>
                                member.userId === onlineUser.id &&
                                member.role === "captain"
                            )
                        )
                    ).length > 0 ? (
                      onlineUsers
                        .filter(
                          (onlineUser: User) =>
                            onlineUser.id !== user?.id &&
                            !userTeam.members.some(
                              (member: TeamMember) =>
                                member.userId === onlineUser.id
                            ) &&
                            !teams.some(
                              (team: Team) =>
                                team.id !== userTeam.id &&
                                team.members.some(
                                  (member: TeamMember) =>
                                    member.userId === onlineUser.id &&
                                    member.role === "captain"
                                )
                            )
                        )
                        .map((onlineUser: User) => {
                          // Check if this user is a captain in another team
                          const isCaptainInOtherTeam = teams.some(
                            (team: Team) =>
                              team.id !== userTeam.id &&
                              team.members.some(
                                (member: TeamMember) =>
                                  member.userId === onlineUser.id &&
                                  member.role === "captain"
                              )
                          );

                          return (
                            <div
                              key={onlineUser.id}
                              className="flex items-center justify-between p-2 bg-gray-50 rounded"
                            >
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 bg-green-500 rounded-full" />
                                <div>
                                  <span className="font-medium">
                                    {onlineUser.username}
                                  </span>
                                  {isCaptainInOtherTeam && (
                                    <div className="flex items-center gap-1 mt-1">
                                      <Crown className="h-3 w-3 text-yellow-500" />
                                      <span className="text-xs text-yellow-600 font-medium">
                                        Captain
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                              {isCaptainInOtherTeam ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled
                                  className="text-gray-400"
                                >
                                  <Crown className="h-3 w-3 mr-1" />
                                  Captain
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  onClick={() =>
                                    handleSendInvitation(onlineUser.id, false)
                                  }
                                  disabled={sendInvitationMutation.isPending}
                                  className="bg-blue-500 hover:bg-blue-600"
                                >
                                  <UserPlus className="h-3 w-3 mr-1" />
                                  Invite to Team
                                </Button>
                              )}
                            </div>
                          );
                        })
                    ) : (
                      <div className="text-center py-4 text-gray-500">
                        <p>No available players to invite right now.</p>
                        <p className="text-sm mt-1">
                          Captains cannot be invited as team members.
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Battle Teams Overview */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Gamepad2 className="h-5 w-5 text-purple-500" />
                  3v3 Battle Teams
                </CardTitle>
                <div className="text-sm text-gray-600 mt-1">
                  Format: Team A (3 players) vs Team B (3 players)
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {teams.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">
                    No teams formed yet
                  </p>
                ) : (
                  teams.map((team: Team, index: number) => (
                    <div
                      key={team.id}
                      className={`p-3 border rounded-lg ${
                        team.members.length >= 3
                          ? "border-green-300 bg-green-50"
                          : "border-gray-300 bg-gray-50"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium">{team.name}</h4>
                          <Badge
                            variant={index === 0 ? "default" : "secondary"}
                            className="text-xs"
                          >
                            {index === 0
                              ? "Team A"
                              : `Team ${String.fromCharCode(66 + index)}`}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={
                              team.members.length >= 3 ? "default" : "secondary"
                            }
                          >
                            {team.members.length}/3
                          </Badge>
                          {team.members.length >= 3 && (
                            <Badge
                              variant="outline"
                              className="text-green-600 border-green-300"
                            >
                              ✓ Ready
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="mb-3 p-2 bg-gray-50 rounded border-l-2 border-gray-300">
                        <div className="flex items-center gap-4 text-xs">
                          <div className="flex items-center gap-1">
                            <Crown className="h-3 w-3 text-yellow-500" />
                            <span className="font-medium text-gray-700">
                              Captain:{" "}
                              {
                                team.members.find(
                                  (m: TeamMember) => m.role === "captain"
                                )?.username
                              }
                            </span>
                            {team.members.find(
                              (m: TeamMember) => m.role === "captain"
                            )?.userId === user?.id && (
                              <Badge variant="outline" className="text-xs">
                                You
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <Users className="h-3 w-3 text-gray-500" />
                            <span className="font-medium text-gray-700">
                              Members:{" "}
                              {
                                team.members.filter(
                                  (m: TeamMember) => m.role === "member"
                                ).length
                              }
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <h5 className="text-sm font-medium text-gray-700">
                          Team Members:
                        </h5>
                        <div className="space-y-2">
                          {team.members.map((member: TeamMember) => (
                            <div
                              key={member.userId}
                              className={`flex items-center justify-between p-2 rounded text-sm border-l-2 ${
                                member.role === "captain"
                                  ? "bg-yellow-50 border-yellow-400"
                                  : "bg-gray-50 border-gray-300"
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <div
                                  className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold ${
                                    member.role === "captain"
                                      ? "bg-yellow-500"
                                      : "bg-blue-500"
                                  }`}
                                >
                                  {member.username.charAt(0).toUpperCase()}
                                </div>
                                <span
                                  className={`font-medium ${
                                    member.role === "captain"
                                      ? "text-yellow-800"
                                      : "text-gray-900"
                                  }`}
                                >
                                  {member.username}
                                </span>
                                {member.role === "captain" && (
                                  <div className="flex items-center gap-1">
                                    <Crown className="h-3 w-3 text-yellow-500" />
                                    <span className="text-xs bg-yellow-100 text-yellow-800 px-1 py-0.5 rounded font-medium">
                                      CAPTAIN
                                    </span>
                                  </div>
                                )}
                                {member.userId === user?.id && (
                                  <Badge variant="default" className="text-xs">
                                    You
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-1">
                                <Badge
                                  variant={
                                    member.role === "captain"
                                      ? "default"
                                      : "secondary"
                                  }
                                  className={`text-xs ${
                                    member.role === "captain"
                                      ? "bg-yellow-500 hover:bg-yellow-600"
                                      : ""
                                  }`}
                                >
                                  {member.role === "captain"
                                    ? "Captain"
                                    : "Member"}
                                </Badge>
                                {member.role === "captain" && (
                                  <span className="text-xs text-yellow-600">
                                    👑
                                  </span>
                                )}
                                {/* Show which team this member belongs to */}
                                <Badge variant="outline" className="text-xs">
                                  {index === 0
                                    ? "Team A"
                                    : `Team ${String.fromCharCode(66 + index)}`}
                                </Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Start Battle Button */}
            {isTeamCaptain && bothTeamsReady && (
              <Card className="border-green-200 bg-green-50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-green-800">
                    <Zap className="h-5 w-5" />
                    3v3 Battle Ready!
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-green-700 mb-4">
                    🎉 Perfect! Both captains have complete teams with 3 members
                    each. The epic 3v3 battle can begin!
                  </p>
                  <div className="bg-green-100 p-3 rounded-lg mb-4">
                    <h4 className="font-medium text-green-800 mb-2">
                      3v3 Battle Requirements Met:
                    </h4>
                    <ul className="text-sm text-green-700 space-y-1">
                      <li>✅ Two captains found and teams created</li>
                      <li>✅ Each team has exactly 3 members</li>
                      <li>✅ All members are ready for battle</li>
                      <li>✅ Captain vs Captain 3v3 format ready</li>
                    </ul>
                  </div>
                  <div className="bg-blue-50 p-3 rounded-lg mb-4 border-l-4 border-blue-400">
                    <h4 className="font-medium text-blue-800 mb-1">
                      Captain Battle Format:
                    </h4>
                    <p className="text-sm text-blue-700">
                      <strong>Captain A:</strong> {teams[0]?.name} (3 players)
                      vs <strong>Captain B:</strong> {teams[1]?.name} (3
                      players)
                    </p>
                    <p className="text-xs text-blue-600 mt-1">
                      Captain A:{" "}
                      {
                        teams[0]?.members.find(
                          (m: TeamMember) => m.role === "captain"
                        )?.username
                      }{" "}
                      vs Captain B:{" "}
                      {
                        teams[1]?.members.find(
                          (m: TeamMember) => m.role === "captain"
                        )?.username
                      }
                    </p>
                  </div>
                  <Button
                    onClick={handleStartBattle}
                    disabled={startBattleMutation.isPending}
                    className="w-full bg-green-500 hover:bg-green-600 text-lg py-3"
                  >
                    <Gamepad2 className="mr-2 h-5 w-5" />
                    {startBattleMutation.isPending
                      ? "Starting 3v3 Battle..."
                      : "Start 3v3 Battle!"}
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Battle Requirements Status */}
            {!bothTeamsReady && (
              <Card className="border-gray-200 bg-gray-50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-gray-800">
                    <Target className="h-5 w-5" />
                    3v3 Battle Requirements
                  </CardTitle>
                  <div className="text-sm text-gray-600">
                    Need 2 captains with teams of 3 members each for 3v3 battle
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-4 h-4 rounded-full flex items-center justify-center text-xs ${
                          teams.length >= 2
                            ? "bg-green-500 text-white"
                            : "bg-gray-300 text-gray-600"
                        }`}
                      >
                        {teams.length >= 2 ? "✓" : "○"}
                      </div>
                      <span className="text-sm">
                        2 captains with teams formed ({teams.length}/2) for
                        Captain A vs Captain B
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-4 h-4 rounded-full flex items-center justify-center text-xs ${
                          teams.every((team: Team) => team.members.length >= 3)
                            ? "bg-green-500 text-white"
                            : "bg-gray-300 text-gray-600"
                        }`}
                      >
                        {teams.every((team: Team) => team.members.length >= 3)
                          ? "✓"
                          : "○"}
                      </div>
                      <span className="text-sm">
                        Each team has exactly 3 members (3v3 format)
                      </span>
                    </div>
                    {teams.length > 0 && (
                      <div className="mt-3 p-3 bg-blue-50 rounded border-l-4 border-blue-400">
                        <h4 className="font-medium text-blue-800 mb-2">
                          Current Team Status:
                        </h4>
                        <div className="space-y-1">
                          {teams.map((team: Team, index: number) => (
                            <div
                              key={team.id}
                              className="flex items-center justify-between text-sm"
                            >
                              <span className="text-blue-700">
                                <strong>
                                  Captain {index === 0 ? "A" : "B"}:
                                </strong>{" "}
                                "{team.name}" (Captain:{" "}
                                {
                                  team.members.find(
                                    (m: TeamMember) => m.role === "captain"
                                  )?.username
                                }
                                )
                              </span>
                              <Badge
                                variant={
                                  team.members.length >= 3
                                    ? "default"
                                    : "secondary"
                                }
                                className="text-xs"
                              >
                                {team.members.length}/3 members
                              </Badge>
                            </div>
                          ))}
                        </div>
                        {teams.length === 1 && (
                          <div className="mt-2 p-2 bg-yellow-50 rounded border border-yellow-300">
                            <p className="text-xs text-yellow-700">
                              <strong>Next Step:</strong> Invite an opposing
                              captain - when they accept, Team B will be
                              automatically created
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Waiting for Teams */}
            {!bothTeamsReady && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-yellow-500" />
                    Waiting for Teams
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-600">
                    {teams.length < 2
                      ? "Need at least 2 teams to start a battle"
                      : "Waiting for all teams to have 3 members each"}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Team Name Dialog for Captain Invitations */}
      <Dialog open={showTeamNameDialog} onOpenChange={setShowTeamNameDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-yellow-500" />
              Create Your Team
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="teamName">Team Name</Label>
              <Input
                id="teamName"
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                placeholder="Enter your team name"
                className="w-full"
              />
              <p className="text-sm text-gray-600">
                You are accepting a captain invitation. Enter a name for your
                team (Team B).
              </p>
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setShowTeamNameDialog(false);
                  setNewTeamName("");
                  setPendingInvitationId(null);
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleAcceptCaptainInvitation}
                disabled={
                  !newTeamName.trim() || respondToInvitationMutation.isPending
                }
                className="bg-green-500 hover:bg-green-600"
              >
                <Crown className="h-4 w-4 mr-2" />
                Create Team & Accept
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TeamBattleSetup;
