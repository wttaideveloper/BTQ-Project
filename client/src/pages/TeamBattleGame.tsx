import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Clock, Users, Crown, Check, X } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { setupGameSocket, sendGameEvent } from '@/lib/socket';

interface TeamMember {
  userId: number;
  username: string;
  role: "captain" | "member";
  joinedAt: Date;
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
}

interface Question {
  id: string;
  text: string;
  answers: Array<{
    id: string;
    text: string;
    isCorrect: boolean;
  }>;
  category: string;
  difficulty: string;
  timeLimit?: number;
}

interface GameState {
  phase: 'waiting' | 'ready' | 'playing' | 'question' | 'results' | 'finished';
  currentQuestion?: Question;
  questionNumber?: number;
  totalQuestions?: number;
  timeRemaining?: number;
  teams?: Team[];
  playerTeam?: Team;
  opposingTeam?: Team;
}

export default function TeamBattleGame() {
  const [_, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [gameState, setGameState] = useState<GameState>({ phase: 'waiting' });
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [teamAnswer, setTeamAnswer] = useState<string | null>(null);
  const [memberAnswers, setMemberAnswers] = useState<Record<string, string>>({});
  const [connected, setConnected] = useState(false);

  // Get game session ID from URL
  const search = typeof window !== 'undefined' ? window.location.search : '';
  const params = new URLSearchParams(search);
  const gameSessionId = params.get('gameSessionId');

  useEffect(() => {
    if (!user || !gameSessionId) {
      setLocation('/');
      return;
    }

    // Setup WebSocket connection
    const socket = setupGameSocket(user.id);
    
    const handleMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        console.log('Team Battle Game Event:', data);

        switch (data.type) {
          case 'connection_established':
            setConnected(true);
            // Request current game state
            sendGameEvent({
              type: 'get_game_state',
              gameSessionId,
              userId: user.id
            });
            break;

          case 'authenticated':
            console.log('Player authenticated for team battle');
            break;

          case 'game_state_update':
            updateGameState(data);
            break;

          case 'team_battle_started':
            setGameState(prev => ({ ...prev, phase: 'playing' }));
            toast({
              title: "Battle Started!",
              description: "The team battle has begun. Get ready for questions!"
            });
            break;

          case 'team_battle_question':
            setGameState(prev => ({
              ...prev,
              phase: 'question',
              currentQuestion: data.question,
              questionNumber: data.questionNumber,
              totalQuestions: data.totalQuestions,
              timeRemaining: data.timeLimit || 30
            }));
            setSelectedAnswer(null);
            setHasSubmitted(false);
            setTeamAnswer(null);
            setMemberAnswers({});
            break;

          case 'team_answer_submitted':
            if (data.userId !== user.id) {
              setMemberAnswers(prev => ({
                ...prev,
                [data.username]: data.answerId
              }));
            }
            break;

          case 'team_answer_finalized':
            setTeamAnswer(data.finalAnswer.answerId);
            setGameState(prev => ({ ...prev, phase: 'results' }));
            break;

          case 'team_battle_round_complete':
            // Show round results
            toast({
              title: "Round Complete",
              description: `Your team ${data.yourTeamCorrect ? 'got it right' : 'got it wrong'}!`
            });
            break;

          case 'team_battle_finished':
            setGameState(prev => ({ 
              ...prev, 
              phase: 'finished',
              teams: data.finalScores
            }));
            toast({
              title: "Battle Finished!",
              description: data.winner ? `${data.winner.name} wins!` : "It's a draw!"
            });
            break;

          case 'teams_updated':
          case 'team_update':
            if (data.teams) {
              updateTeamsData(data.teams);
            }
            break;

          case 'error':
            toast({
              title: "Error",
              description: data.message,
              variant: "destructive"
            });
            break;
        }
      } catch (error) {
        console.error('Error handling WebSocket message:', error);
      }
    };

    socket.addEventListener('message', handleMessage);

    // Cleanup
    return () => {
      socket.removeEventListener('message', handleMessage);
    };
  }, [user, gameSessionId]);

  const updateGameState = (data: any) => {
    setGameState(prev => ({
      ...prev,
      ...data.gameState,
      playerTeam: data.playerTeam,
      opposingTeam: data.opposingTeam
    }));
  };

  const updateTeamsData = (teams: Team[]) => {
    const playerTeam = teams.find(team => 
      team.members.some(member => member.userId === user?.id)
    );
    const opposingTeam = teams.find(team => 
      team.id !== playerTeam?.id
    );

    setGameState(prev => ({
      ...prev,
      teams,
      playerTeam,
      opposingTeam
    }));
  };

  const submitAnswer = (answerId: string) => {
    if (hasSubmitted || !gameState.currentQuestion || !gameState.playerTeam) return;

    setSelectedAnswer(answerId);
    setHasSubmitted(true);

    sendGameEvent({
      type: 'submit_team_answer',
      teamId: gameState.playerTeam.id,
      questionId: gameState.currentQuestion.id,
      answerId,
      userId: user?.id,
      username: user?.username
    });

    toast({
      title: "Answer Submitted",
      description: "Your answer has been sent to your team captain."
    });
  };

  const finalizeTeamAnswer = (answerId: string) => {
    if (!gameState.currentQuestion || !gameState.playerTeam) return;

    sendGameEvent({
      type: 'finalize_team_answer',
      teamId: gameState.playerTeam.id,
      finalAnswer: {
        questionId: gameState.currentQuestion.id,
        answerId
      }
    });
  };

  const isTeamCaptain = () => {
    return gameState.playerTeam?.captainId === user?.id;
  };

  const renderWaitingPhase = () => (
    <div className="max-w-4xl mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-6 w-6" />
            Waiting for Battle to Start
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="text-center">
            <p className="text-lg mb-4">Welcome, {user?.username}!</p>
            <p className="text-muted-foreground">
              You're connected to the team battle. Waiting for all teams to be ready...
            </p>
          </div>

          {gameState.playerTeam && (
            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Crown className="h-5 w-5" />
                    Your Team: {gameState.playerTeam.name}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {gameState.playerTeam.members.map(member => (
                      <div key={member.userId} className="flex items-center gap-2">
                        <Badge variant={member.role === 'captain' ? 'default' : 'secondary'}>
                          {member.role === 'captain' ? 'Captain' : 'Member'}
                        </Badge>
                        <span>{member.username}</span>
                        {member.userId === user?.id && <Badge variant="outline">You</Badge>}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {gameState.opposingTeam && (
                <Card>
                  <CardHeader>
                    <CardTitle>Opposing Team: {gameState.opposingTeam.name}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {gameState.opposingTeam.members.map(member => (
                        <div key={member.userId} className="flex items-center gap-2">
                          <Badge variant={member.role === 'captain' ? 'default' : 'secondary'}>
                            {member.role === 'captain' ? 'Captain' : 'Member'}
                          </Badge>
                          <span>{member.username}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          <div className="text-center">
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
              {connected ? 'Connected' : 'Connecting...'}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderQuestionPhase = () => {
    if (!gameState.currentQuestion) return null;

    return (
      <div className="max-w-4xl mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Question {gameState.questionNumber} of {gameState.totalQuestions}</span>
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                <span>{gameState.timeRemaining}s</span>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="text-lg font-medium">
              {gameState.currentQuestion.text}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {gameState.currentQuestion.answers.map((answer) => (
                <Button
                  key={answer.id}
                  variant={selectedAnswer === answer.id ? "default" : "outline"}
                  className="h-auto p-4 text-left justify-start"
                  onClick={() => submitAnswer(answer.id)}
                  disabled={hasSubmitted}
                >
                  {answer.text}
                  {selectedAnswer === answer.id && <Check className="ml-2 h-4 w-4" />}
                </Button>
              ))}
            </div>

            {hasSubmitted && (
              <div className="bg-green-50 p-4 rounded-lg">
                <p className="text-green-800">✓ Your answer has been submitted to your team captain!</p>
              </div>
            )}

            {/* Team answers section for captain */}
            {isTeamCaptain() && Object.keys(memberAnswers).length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Team Answers (Captain View)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {Object.entries(memberAnswers).map(([username, answerId]) => {
                      const answer = gameState.currentQuestion!.answers.find(a => a.id === answerId);
                      return (
                        <div key={username} className="flex items-center gap-2">
                          <Badge variant="outline">{username}</Badge>
                          <span>{answer?.text}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-4 space-y-2">
                    <p className="font-medium">Finalize team answer:</p>
                    <div className="grid grid-cols-2 gap-2">
                      {gameState.currentQuestion.answers.map((answer) => (
                        <Button
                          key={answer.id}
                          variant="outline"
                          size="sm"
                          onClick={() => finalizeTeamAnswer(answer.id)}
                        >
                          {answer.text}
                        </Button>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </CardContent>
        </Card>
      </div>
    );
  };

  const handlePlayAgain = () => {
    // Navigate to team battle setup for a new match
    setLocation('/team-battle');
    
    toast({
      title: "Starting New Match",
      description: "Setting up teams for a new battle!"
    });
  };

  const renderFinishedPhase = () => (
    <div className="max-w-4xl mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle>Battle Complete!</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {gameState.teams && (
            <div className="grid md:grid-cols-2 gap-4">
              {gameState.teams.map((team, index) => (
                <Card key={team.id}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      {index === 0 && <Crown className="h-5 w-5 text-yellow-500" />}
                      {team.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div>Score: {team.score}</div>
                      <div>Correct: {team.correctAnswers}</div>
                      <div>Incorrect: {team.incorrectAnswers}</div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <div className="flex gap-4 justify-center">
            <Button 
              onClick={handlePlayAgain}
              className="bg-gradient-to-r from-accent to-accent-dark text-primary hover:from-accent-light hover:to-accent font-bold"
            >
              Play Again
            </Button>
            <Button 
              variant="outline"
              onClick={() => setLocation('/')}
            >
              Return to Home
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card>
          <CardContent className="p-6">
            <p>Please log in to access the team battle.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!gameSessionId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card>
          <CardContent className="p-6">
            <p>Invalid game session. Please return to the home page.</p>
            <Button className="mt-4" onClick={() => setLocation('/')}>
              Go Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50">
      {gameState.phase === 'waiting' && renderWaitingPhase()}
      {gameState.phase === 'question' && renderQuestionPhase()}
      {gameState.phase === 'finished' && renderFinishedPhase()}
    </div>
  );
}