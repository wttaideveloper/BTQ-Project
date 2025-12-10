import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Users, Crown, Mail, UserPlus, Clock, Check, X } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

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
  averageTime: number;
  status: "forming" | "ready" | "playing" | "finished";
  createdAt: Date;
}

interface TeamMember {
  userId: number;
  username: string;
  role: "captain" | "member";
  joinedAt: Date;
}

interface TeamInvitation {
  id: string;
  teamId: string;
  inviterId: number;
  inviteeId: number;
  status: "pending" | "accepted" | "declined" | "expired";
  createdAt: Date;
  expiresAt: Date;
}

interface TeamMultiplayerProps {
  gameSessionId: string;
  onTeamReady: (teamId: string) => void;
}

export const TeamMultiplayer: React.FC<TeamMultiplayerProps> = ({
  gameSessionId,
  onTeamReady,
}) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [teamName, setTeamName] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<number[]>([]);
  const [currentTeam, setCurrentTeam] = useState<Team | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [isCreatingTeam, setIsCreatingTeam] = useState(false);
  // Per-user invite loading state
  const [inviteLoadingId, setInviteLoadingId] = useState<number | null>(null);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [socket, setSocket] = useState<WebSocket | null>(null);

  // Fetch online users with proper configuration
  const { data: onlineUsers = [] } = useQuery<User[]>({
    queryKey: ["/api/users/online"],
    staleTime: 60000, // Cache for 1 minute
    refetchOnWindowFocus: false,
  });

  // Fetch teams for current game session with proper configuration
  const { data: teams = [] } = useQuery<Team[]>({
    queryKey: ["/api/teams", gameSessionId],
    queryFn: () =>
      apiRequest("GET", `/api/teams?gameSessionId=${gameSessionId}`).then(
        (res) => res.json()
      ),
    staleTime: 30000, // Cache for 30 seconds
    refetchOnWindowFocus: false,
  });

  // Fetch team invitations with proper configuration
  const { data: invitations = [] } = useQuery<TeamInvitation[]>({
    queryKey: ["/api/team-invitations"],
    staleTime: 30000, // Cache for 30 seconds
    refetchOnWindowFocus: false,
  });

  // Create team mutation
  const createTeamMutation = useMutation({
    mutationFn: async (data: { name: string; gameSessionId: string }) => {
      const res = await apiRequest("POST", "/api/teams", data);
      return res.json();
    },
    onSuccess: (team) => {
      setCurrentTeam(team);
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      toast({
        title: "Team Created",
        description: `Team "${team.name}" has been created successfully!`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Create Team",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Send invitation mutation
  const sendInvitationMutation = useMutation({
    mutationFn: async (data: { teamId: string; inviteeId: number }) => {
      const res = await apiRequest("POST", "/api/team-invitations", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team-invitations"] });
      toast({
        title: "Invitation Sent",
        description: "Team invitation has been sent successfully!",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Send Invitation",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Respond to invitation mutation
  const respondToInvitationMutation = useMutation({
    mutationFn: async (data: {
      invitationId: string;
      status: "accepted" | "declined";
    }) => {
      const res = await apiRequest(
        "PATCH",
        `/api/team-invitations/${data.invitationId}`,
        {
          status: data.status,
        }
      );
      return res.json();
    },
    onSuccess: (invitation) => {
      queryClient.invalidateQueries({ queryKey: ["/api/team-invitations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      toast({
        title:
          invitation.status === "accepted"
            ? "Invitation Accepted 3"
            : "Invitation Declined",
        description: `You have ${invitation.status} the team invitation.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Respond",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Set user online status on component mount and setup WebSocket
  useEffect(() => {
    if (!user) return;

    let isMounted = true;
    let ws: WebSocket | null = null;

    // Set online status once
    const setOnlineStatus = async () => {
      try {
        await apiRequest("PATCH", `/api/users/${user.id}/online`, {
          isOnline: true,
        });
      } catch (error) {
        console.log("Failed to set online status:", error);
      }
    };

    setOnlineStatus();

    // Setup WebSocket connection
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    ws = new WebSocket(`${protocol}//${host}/ws`);

    ws.onopen = () => {
      if (!isMounted) return;
      console.log("WebSocket connected successfully");
      setSocket(ws);

      // Authenticate with the server
      if (ws) {
        ws.send(
          JSON.stringify({
            type: "authenticate",
            userId: user.id,
            playerName: user.username,
            gameId: gameSessionId,
          })
        );
      }
    };

    ws.onmessage = (event) => {
      if (!isMounted) return;

      try {
        const data = JSON.parse(event.data);
        console.log("WebSocket message received:", data);

        switch (data.type) {
          case "connection_established":
            console.log("WebSocket connection confirmed");
            break;

          case "team_created":
            setCurrentTeam(data.team);
            queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
            toast({
              title: "Team Created",
              description: "Your team has been created successfully!",
            });
            break;

          case "opposing_team_created":
            queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
            toast({
              title: "Opposing Team Created",
              description: data.message,
            });
            break;

          case "team_captain_assigned":
            setCurrentTeam(data.team);
            queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
            toast({
              title: "Team Captain",
              description: data.message,
            });
            break;

          case "team_invitation_received":
          case "team_member_invitation_received":
            // Force immediate re-fetch of invitations and teams
            queryClient.invalidateQueries({
              queryKey: ["/api/team-invitations"],
            });
            queryClient.invalidateQueries({ queryKey: ["/api/users/online"] });
            queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
            // Force refetch immediately
            setTimeout(() => {
              queryClient.refetchQueries({
                queryKey: ["/api/team-invitations"],
              });
              queryClient.refetchQueries({ queryKey: ["/api/teams"] });
            }, 100);
            toast({
              title: "Team Invitation",
              description: `You have been invited to join a team by ${data.inviterName}`,
            });
            break;

          case "team_captain_invitation_received":
            // Force immediate re-fetch of invitations and teams
            queryClient.invalidateQueries({
              queryKey: ["/api/team-invitations"],
            });
            queryClient.invalidateQueries({ queryKey: ["/api/users/online"] });
            queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
            // Force refetch immediately
            setTimeout(() => {
              queryClient.refetchQueries({
                queryKey: ["/api/team-invitations"],
              });
              queryClient.refetchQueries({ queryKey: ["/api/teams"] });
            }, 100);
            toast({
              title: "Team Captain Invitation",
              description: data.message,
            });
            break;

          case "team_member_invitation_sent":
          case "opposing_captain_invitation_sent":
          case "team_created_and_invitation_sent":
            queryClient.invalidateQueries({
              queryKey: ["/api/team-invitations"],
            });
            queryClient.invalidateQueries({ queryKey: ["/api/users/online"] });
            toast({
              title: "Invitation Sent",
              description: data.message || "Invitation sent successfully",
            });
            break;

          case "invitation_sent":
            toast({
              title: "Invitation Sent",
              description: data.message || "Invitation sent successfully",
            });
            break;

          case "team_update":
          case "team_updated":
          case "teams_updated":
          case "force_refresh_teams":
            if (data.team) {
              setCurrentTeam(data.team);
            }
            // Force immediate refresh of all team-related queries
            queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
            queryClient.invalidateQueries({ queryKey: ["/api/users/online"] });
            queryClient.invalidateQueries({
              queryKey: ["/api/team-invitations"],
            });
            // Force immediate refetch
            setTimeout(() => {
              queryClient.refetchQueries({ queryKey: ["/api/teams"] });
              queryClient.refetchQueries({
                queryKey: ["/api/team-invitations"],
              });
              queryClient.refetchQueries({ queryKey: ["/api/users/online"] });
            }, 50);
            break;

          case "team_joined_successfully":
            setCurrentTeam(data.team);
            queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
            queryClient.invalidateQueries({
              queryKey: ["/api/team-invitations"],
            });
            queryClient.invalidateQueries({ queryKey: ["/api/users/online"] });
            toast({
              title: "Team Joined!",
              description:
                data.message || "You have successfully joined the team!",
            });
            break;

          case "online_users_updated":
            queryClient.invalidateQueries({ queryKey: ["/api/users/online"] });
            break;

          case "invitation_declined":
            toast({
              title: "Invitation Declined",
              description: data.message,
              variant: "destructive",
            });
            break;

          case "invitation_declined_confirmed":
            queryClient.invalidateQueries({
              queryKey: ["/api/team-invitations"],
            });
            toast({
              title: "Invitation Declined",
              description: data.message,
            });
            break;

          case "recruitment_success":
            toast({
              title: "Success",
              description: data.message || "Player recruited successfully!",
            });
            queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
            break;

          case "team_battle_started":
            toast({
              title: "Battle Started!",
              description: "Redirecting to your individual game interface...",
            });
            // Redirect to individual team battle game interface
            setTimeout(() => {
              window.location.href = `/team-battle?gameSessionId=${gameSessionId}`;
            }, 1500);
            break;

          case "both_teams_ready":
            toast({
              title: "Both Teams Ready",
              description: data.message,
            });
            break;

          case "error":
            toast({
              title: "Error",
              description: data.message,
              variant: "destructive",
            });
            break;
        }
      } catch (error) {
        console.error("Error parsing WebSocket message:", error);
      }
    };

    ws.onerror = (error) => {
      if (!isMounted) return;
      console.error("WebSocket error:", error);
      toast({
        title: "Connection Error",
        description:
          "Failed to connect to the game server. Please refresh the page.",
        variant: "destructive",
      });
    };

    ws.onclose = () => {
      console.log("WebSocket connection closed");
      if (isMounted) {
        setSocket(null);
      }
    };

    return () => {
      isMounted = false;
      setSocket(null);

      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }

      // Set user offline
      if (user) {
        apiRequest("PATCH", `/api/users/${user.id}/online`, {
          isOnline: false,
        }).catch(console.error);
      }
    };
  }, [user?.id, gameSessionId]);

  // Check if user is already in a team
  useEffect(() => {
    if (user && teams.length > 0) {
      const userTeam = teams.find((team) =>
        team.members.some((member) => member.userId === user.id)
      );
      setCurrentTeam(userTeam || null);
    }
  }, [user, teams]);

  const handleCreateTeam = async () => {
    if (!teamName.trim()) {
      toast({
        title: "Team Name Required",
        description: "Please enter a team name.",
        variant: "destructive",
      });
      return;
    }

    setIsCreatingTeam(true);
    try {
      const res = await apiRequest("POST", "/api/teams", {
        name: teamName,
        gameSessionId,
      });
      const team = await res.json();

      setCurrentTeam(team);
      setTeamName("");
      queryClient.invalidateQueries({
        queryKey: ["/api/teams", gameSessionId],
      });

      toast({
        title: "Team Created",
        description: `Team "${team.name}" created successfully.`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create team. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsCreatingTeam(false);
    }
  };

  const handleInviteUser = async (userId: number) => {
    if (!user) {
      toast({
        title: "Authentication Error",
        description: "Please log in to recruit players.",
        variant: "destructive",
      });
      return;
    }

    if (!socket) {
      toast({
        title: "Connection Error",
        description: "WebSocket not initialized. Please refresh the page.",
        variant: "destructive",
      });
      return;
    }

    setInviteLoadingId(userId);
    try {
      // Check WebSocket connection
      if (socket.readyState !== WebSocket.OPEN) {
        throw new Error(
          `WebSocket not connected (state: ${socket.readyState})`
        );
      }

      const recruitmentMessage = {
        type: "recruit_player",
        gameSessionId,
        inviteeUserId: userId,
        recruiterId: user.id,
        recruiterName: user.username,
      };

      socket.send(JSON.stringify(recruitmentMessage));
    } catch (error) {
      console.error("Recruitment failed:", error);
      toast({
        title: "Communication Error",
        description: `Failed to send recruitment: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        variant: "destructive",
      });
    } finally {
      setInviteLoadingId(null);
    }
  };

  const handleSendEmailInvite = async () => {
    if (!currentTeam || !inviteEmail.trim()) {
      toast({
        title: "Error",
        description: "Please enter a valid email address.",
        variant: "destructive",
      });
      return;
    }

    setIsSendingEmail(true);
    try {
      await apiRequest("POST", "/api/team-invitations/email", {
        teamId: currentTeam.id,
        inviteeEmail: inviteEmail,
        teamName: currentTeam.name,
      });

      setInviteEmail("");
      toast({
        title: "Email Invitation Sent",
        description: "Team invitation sent via email.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to send email invitation.",
        variant: "destructive",
      });
    } finally {
      setIsSendingEmail(false);
    }
  };

  const handleRespondToInvitation = (
    invitation: TeamInvitation,
    status: "accepted" | "declined"
  ) => {
    if (!socket) {
      toast({
        title: "Connection Error",
        description: "No connection to game server.",
        variant: "destructive",
      });
      return;
    }

    const eventType =
      status === "accepted"
        ? "accept_team_invitation"
        : "decline_team_invitation";

    socket.send(
      JSON.stringify({
        type: eventType,
        invitation,
        gameSessionId,
      })
    );

    toast({
      title:
        status === "accepted"
          ? "Accepting Invitation..."
          : "Declining Invitation...",
      description: "Processing your response...",
    });
  };

  const handleStartBattle = () => {
    if (!socket || !currentTeam || !user) return;

    socket.send(
      JSON.stringify({
        type: "start_team_battle",
        gameSessionId,
        teamId: currentTeam.id,
        captainId: user.id,
      })
    );

    toast({
      title: "Starting Battle...",
      description: "Initiating team battle for all players.",
    });
  };

  const canStartGame =
    currentTeam && currentTeam.members.length === 3 && teams.length === 2;
  const isTeamCaptain = currentTeam && currentTeam.captainId === user?.id;
  const bothTeamsReady =
    teams.length === 2 && teams.every((team) => team.members.length === 3);

  return (
    <div className="fixed inset-0 bg-black overflow-y-auto">
      {/* Animated Background Effects - using app's primary colors */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-20 left-20 w-72 h-72 bg-primary/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-20 right-20 w-96 h-96 bg-secondary/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-accent/10 rounded-full blur-3xl animate-pulse delay-500"></div>
      </div>

      {/* Content Container */}
      <div className="relative z-10 min-h-screen p-8">
        {/* Header Section */}
        <div className="text-center space-y-6 mb-12">
          <div className="space-y-4">
            <h1 className="text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent font-heading tracking-tight game-title">
              TEAM BATTLE
            </h1>
            <div className="w-32 h-1 bg-gradient-to-r from-primary to-accent mx-auto rounded-full shadow-glow"></div>
          </div>

          <p className="text-xl text-white/80 max-w-2xl mx-auto leading-relaxed">
            Assemble your dream team of 3 biblical scholars and engage in the
            ultimate scripture showdown!
          </p>

          <div className="flex justify-center gap-6 flex-wrap">
            <div className="bg-primary/20 backdrop-blur-sm rounded-2xl px-6 py-4 border border-primary/40">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/30 rounded-lg">
                  <Users className="h-6 w-6 text-white" />
                </div>
                <div className="text-left">
                  <div className="text-white font-semibold">Team Size</div>
                  <div className="text-white/70 text-sm">3 Players Each</div>
                </div>
              </div>
            </div>

            <div className="bg-secondary/20 backdrop-blur-sm rounded-2xl px-6 py-4 border border-secondary/40">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-secondary/30 rounded-lg">
                  <Clock className="h-6 w-6 text-white" />
                </div>
                <div className="text-left">
                  <div className="text-white font-semibold">Game Mode</div>
                  <div className="text-white/70 text-sm">Real-time Battle</div>
                </div>
              </div>
            </div>

            <div className="bg-accent/20 backdrop-blur-sm rounded-2xl px-6 py-4 border border-accent/40">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-accent/30 rounded-lg">
                  <Crown className="h-6 w-6 text-black" />
                </div>
                <div className="text-left">
                  <div className="text-white font-semibold">Victory</div>
                  <div className="text-white/70 text-sm">Best Team Wins</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-12">
            {/* Team Formation Section */}
            <div className="space-y-8">
              <Card className="bg-primary/20 border-primary/40 backdrop-blur-lg shadow-2xl">
                <CardHeader className="pb-6">
                  <CardTitle className="text-white flex items-center gap-4 text-2xl font-bold">
                    <div className="p-3 bg-primary/30 rounded-xl border border-primary/50">
                      <Users className="h-8 w-8 text-white" />
                    </div>
                    <div>
                      <div className="text-2xl">
                        {currentTeam
                          ? `Team: ${currentTeam.name}`
                          : "Team Battle Status"}
                      </div>
                      <div className="text-white/70 text-sm font-normal mt-1">
                        Build your biblical dream team
                      </div>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-8">
                  {!currentTeam ? (
                    <div className="text-center p-8 bg-accent/20 border border-accent/40 rounded-xl">
                      <div className="space-y-4">
                        <div className="w-16 h-16 bg-accent/30 rounded-2xl flex items-center justify-center mx-auto">
                          <UserPlus className="h-8 w-8 text-black" />
                        </div>
                        <div>
                          <h3 className="text-white font-bold text-xl mb-2">
                            Ready to Start Team Battle?
                          </h3>
                          <p className="text-white/70 text-lg">
                            Recruit your first player from the online champions
                            list to begin forming teams.
                          </p>
                          <p className="text-white/60 text-sm mt-2">
                            The first player you recruit will automatically
                            become captain of the opposing team!
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-8">
                      <div className="space-y-4">
                        <div className="flex items-center justify-between mb-6">
                          <h3 className="text-white font-bold text-xl">
                            Team Roster
                          </h3>
                          <Badge
                            variant="outline"
                            className="bg-primary/30 text-white border-primary px-4 py-2 text-lg"
                          >
                            {currentTeam.members.length}/3 Players
                          </Badge>
                        </div>
                        {currentTeam.members.map((member, index) => (
                          <div
                            key={member.userId}
                            className="flex items-center justify-between p-6 bg-card/50 border border-primary/30 rounded-xl hover:bg-card/70 transition-all duration-200"
                          >
                            <div className="flex items-center gap-4">
                              <div
                                className={`w-16 h-16 rounded-2xl flex items-center justify-center text-white font-bold text-xl ${
                                  member.role === "captain"
                                    ? "bg-gradient-to-r from-accent to-accent-dark shadow-lg shadow-accent/30"
                                    : "bg-gradient-to-r from-primary to-secondary shadow-lg shadow-primary/30"
                                }`}
                              >
                                {index + 1}
                              </div>
                              <div>
                                <div className="flex items-center gap-3">
                                  <span className="text-white font-bold text-lg">
                                    {member.username}
                                  </span>
                                  {member.role === "captain" && (
                                    <Crown className="h-6 w-6 text-accent" />
                                  )}
                                </div>
                                <span className="text-white/70 text-sm">
                                  {member.role === "captain"
                                    ? "Team Captain"
                                    : "Team Member"}
                                </span>
                              </div>
                            </div>
                            <Badge
                              variant={
                                member.role === "captain"
                                  ? "default"
                                  : "secondary"
                              }
                              className={`px-4 py-2 text-sm font-semibold ${
                                member.role === "captain"
                                  ? "bg-accent/30 text-black border-accent"
                                  : "bg-secondary/30 text-white border-secondary"
                              }`}
                            >
                              {member.role === "captain" ? "Captain" : "Member"}
                            </Badge>
                          </div>
                        ))}

                        {/* Empty slots */}
                        {Array.from({
                          length: 3 - currentTeam.members.length,
                        }).map((_, index) => (
                          <div
                            key={`empty-${index}`}
                            className="flex items-center p-6 bg-card/20 border-2 border-dashed border-muted/50 rounded-xl"
                          >
                            <div className="w-16 h-16 rounded-2xl bg-muted/30 flex items-center justify-center text-muted-foreground font-bold text-xl mr-4">
                              {currentTeam.members.length + index + 1}
                            </div>
                            <div>
                              <span className="text-muted-foreground font-medium text-lg">
                                Awaiting Player...
                              </span>
                              <div className="text-muted-foreground/70 text-sm">
                                Invite friends to join your team
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      {currentTeam.members.length < 3 &&
                        currentTeam.captainId === user?.id && (
                          <div className="text-center p-6 bg-accent/20 border border-accent/40 rounded-xl">
                            <div className="space-y-2">
                              <p className="text-white font-bold text-lg">
                                Need {3 - currentTeam.members.length} More
                                Player
                                {3 - currentTeam.members.length > 1 ? "s" : ""}
                              </p>
                              <p className="text-white/70">
                                Invite friends using the player recruitment
                                panel →
                              </p>
                            </div>
                          </div>
                        )}

                      {bothTeamsReady && isTeamCaptain && (
                        <Button
                          onClick={handleStartBattle}
                          className="w-full h-16 bg-gradient-to-r from-correct to-correct/80 hover:from-correct/90 hover:to-correct/70 text-white font-bold text-xl shadow-2xl rounded-xl game-button"
                        >
                          <div className="flex items-center gap-3">
                            <Check className="h-6 w-6" />
                            Start Team Battle!
                          </div>
                        </Button>
                      )}

                      {!bothTeamsReady && currentTeam && (
                        <div className="text-center p-4 bg-yellow-500/20 rounded-xl border border-yellow-500/40">
                          <p className="text-yellow-200 font-semibold">
                            {teams.length < 2
                              ? "Waiting for opposing team..."
                              : "Each team needs exactly 3 members to start battle..."}
                          </p>
                          <div className="mt-2 text-yellow-100 text-sm">
                            {teams.map((team) => (
                              <div key={team.id}>
                                {team.name}: {team.members.length}/3 members
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Player Recruitment Section */}
            <div className="space-y-8">
              <Card className="bg-secondary/20 border-secondary/40 backdrop-blur-lg shadow-2xl">
                <CardHeader className="pb-6">
                  <CardTitle className="text-white flex items-center gap-4 text-2xl font-bold">
                    <div className="p-3 bg-secondary/30 rounded-xl border border-secondary/50">
                      <UserPlus className="h-8 w-8 text-white" />
                    </div>
                    <div>
                      <div className="text-2xl">Player Recruitment</div>
                      <div className="text-white/70 text-sm font-normal mt-1">
                        Assemble your championship team
                      </div>
                    </div>
                  </CardTitle>
                  <div className="flex items-center gap-3 mt-4">
                    <div className="w-3 h-3 bg-correct rounded-full animate-pulse"></div>
                    <span className="text-white font-semibold text-lg">
                      {onlineUsers.length} Warriors Online
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-8">
                  {/* Online Players List */}
                  <div className="space-y-4">
                    <h4 className="text-white font-bold text-xl flex items-center gap-3">
                      <Users className="h-6 w-6" />
                      Available Champions
                    </h4>
                    <div className="max-h-80 overflow-y-auto space-y-3">
                      {onlineUsers.map((onlineUser) => (
                        <div
                          key={onlineUser.id}
                          className="group flex items-center justify-between p-6 bg-card/50 border border-secondary/30 rounded-xl transition-all duration-200 hover:bg-card/70 hover:scale-102"
                        >
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-gradient-to-r from-correct to-correct/80 rounded-2xl flex items-center justify-center shadow-lg shadow-correct/30">
                              <div className="w-3 h-3 bg-white rounded-full"></div>
                            </div>
                            <div>
                              <span className="text-white font-bold text-lg">
                                {onlineUser.username}
                              </span>
                              <div className="flex items-center gap-2 mt-1">
                                <div className="w-2 h-2 bg-correct rounded-full animate-pulse"></div>
                                <span className="text-xs text-white/70 font-medium">
                                  Ready for Battle
                                </span>
                              </div>
                            </div>
                          </div>
                          {user && onlineUser.id !== user.id && (
                            <Button
                              size="lg"
                              onClick={() => handleInviteUser(onlineUser.id)}
                              disabled={
                                inviteLoadingId !== null &&
                                inviteLoadingId !== onlineUser.id
                              }
                              className="bg-gradient-to-r from-secondary to-accent group-hover:from-secondary-dark group-hover:to-accent-dark text-white font-bold px-6 py-3 rounded-xl shadow-lg game-button group-hover:scale-105"
                            >
                              {inviteLoadingId === onlineUser.id ? (
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <UserPlus className="h-5 w-5" />
                                  Recruit
                                </div>
                              )}
                            </Button>
                          )}
                        </div>
                      ))}
                      {onlineUsers.length === 0 && (
                        <div className="text-center text-muted-foreground py-12">
                          <Users className="h-16 w-16 mx-auto mb-4 opacity-50" />
                          <p className="font-bold text-xl mb-2">
                            No Champions Online
                          </p>
                          <p className="text-muted-foreground/70">
                            Invite friends via email to join the battle
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {user && (
                    <>
                      <Separator className="bg-white/20" />

                      {/* Email Recruitment Section */}
                      <div className="space-y-6">
                        <h4 className="text-white font-bold text-xl flex items-center gap-3">
                          <Mail className="h-6 w-6" />
                          Email Recruitment
                        </h4>
                        <div className="space-y-4">
                          <Input
                            placeholder="Enter champion's email address"
                            value={inviteEmail}
                            onChange={(e) => setInviteEmail(e.target.value)}
                            className="bg-white/10 border-secondary/40 text-white placeholder:text-gray-400 h-16 text-xl rounded-xl focus:border-secondary focus:ring-secondary/20"
                          />
                          <Button
                            onClick={handleSendEmailInvite}
                            disabled={isSendingEmail || !inviteEmail.trim()}
                            className="w-full h-16 bg-gradient-to-r from-secondary to-accent hover:from-secondary-dark hover:to-accent-dark text-white font-bold text-xl shadow-2xl rounded-xl game-button"
                          >
                            {isSendingEmail ? (
                              <div className="flex items-center gap-3">
                                <div className="w-6 h-6 border-3 border-white/30 border-t-white rounded-full animate-spin"></div>
                                Sending Battle Invitation...
                              </div>
                            ) : (
                              <div className="flex items-center gap-3">
                                <Mail className="h-6 w-6" />
                                Send Battle Invitation
                              </div>
                            )}
                          </Button>
                        </div>
                        <p className="text-sm text-white/70 text-center">
                          Battle invitations expire in 5 minutes
                        </p>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        {/* Team Invitations Panel */}
        {invitations.filter(
          (inv) => inv.status === "pending" && inv.inviteeId === user?.id
        ).length > 0 && (
          <div className="mt-12 max-w-4xl mx-auto">
            <Card className="bg-accent/20 border-accent/40 backdrop-blur-lg shadow-2xl">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-4 text-2xl font-bold">
                  <div className="p-3 bg-accent/30 rounded-xl border border-accent/50">
                    <Mail className="h-8 w-8 text-black" />
                  </div>
                  <div>
                    <div className="text-2xl">Battle Invitations</div>
                    <div className="text-white/70 text-sm font-normal mt-1">
                      You've been recruited for battle!
                    </div>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {invitations
                  .filter(
                    (inv) =>
                      inv.status === "pending" && inv.inviteeId === user?.id
                  )
                  .map((invitation) => (
                    <div
                      key={invitation.id}
                      className="flex items-center justify-between p-6 bg-card/50 border border-accent/30 rounded-xl"
                    >
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-accent/30 rounded-xl">
                          <Users className="h-6 w-6 text-black" />
                        </div>
                        <div>
                          <span className="text-white font-bold text-lg">
                            Team Battle Invitation
                          </span>
                          <div className="flex items-center gap-2 mt-1">
                            <Clock className="h-4 w-4 text-accent" />
                            <span className="text-white/70 text-sm font-medium">
                              {Math.ceil(
                                (new Date(invitation.expiresAt).getTime() -
                                  Date.now()) /
                                  60000
                              )}{" "}
                              minutes remaining
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <Button
                          onClick={() =>
                            handleRespondToInvitation(invitation, "declined")
                          }
                          variant="outline"
                          className="border-incorrect/50 text-white hover:bg-incorrect/20 px-6 py-3 font-bold"
                        >
                          <X className="h-4 w-4 mr-2" />
                          Decline
                        </Button>
                        <Button
                          onClick={() =>
                            handleRespondToInvitation(invitation, "accepted")
                          }
                          className="bg-gradient-to-r from-correct to-correct/80 hover:from-correct/90 hover:to-correct/70 text-white font-bold px-6 py-3 game-button"
                        >
                          <Check className="h-4 w-4 mr-2" />
                          Join Battle!
                        </Button>
                      </div>
                    </div>
                  ))}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};

export default TeamMultiplayer;
