import { useState, useEffect } from 'react';
import { useRoute } from 'wouter';
import { useAuth } from '@/hooks/use-auth';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { setupGameSocket, submitChallengeAnswer, completeChallenge } from '@/lib/socket';
import {
  Trophy,
  User,
  Clock,
  ArrowLeft,
  Loader2,
  XCircle,
  ChevronsUp,
  ChevronsDown
} from 'lucide-react';
import { 
  Card, 
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Table, 
  TableBody, 
  TableCaption, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import GameBoard from '@/components/GameBoard';
import Avatar from '@/components/Avatar';
import FeedbackModal from '@/components/FeedbackModal';
import { useToast } from '@/hooks/use-toast';
import { speakText, playSound } from '@/lib/sounds';

interface Answer {
  id: string;
  text: string;
  isCorrect: boolean;
}

interface Question {
  id: string;
  text: string;
  context?: string;
  category: string;
  difficulty: string;
  answers: Answer[];
}

interface ChallengeAnswer {
  questionId: string;
  answerId: string;
  isCorrect: boolean;
  timeSpent: number;
}

interface ChallengeResult {
  id: string;
  challengeId: string;
  userId: number;
  score: number;
  correctAnswers: number;
  incorrectAnswers: number;
  averageTime: number;
  completedAt?: Date;
  answers: ChallengeAnswer[];
}

interface Challenge {
  id: string;
  challengerId: number;
  challengeeId: number;
  gameSessionId: string;
  status: string;
  category: string;
  difficulty: string;
  createdAt: Date;
  expiresAt: Date;
  opponentName: string;
  isChallenger: boolean;
  userCompleted: boolean;
  opponentCompleted: boolean;
  isDraw?: boolean;
  winnerUserId?: number;
}

interface GameSession {
  id: string;
  players: any[];
  currentQuestion: number;
  gameType: string;
  category: string;
  difficulty: string;
  startTime: Date;
  endTime?: Date;
  status: string;
}

export default function ChallengePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, params] = useRoute('/challenge/:id');
  const [, gameParams] = useRoute('/game');
  
  // If coming from game with mode=challenge, extract id from query params
  const urlParams = new URLSearchParams(window.location.search);
  const modeParam = urlParams.get('mode');
  const idParam = urlParams.get('id');
  
  // Use either route param or query param
  const challengeId = params?.id || (modeParam === 'challenge' ? idParam : null);

  // Game state
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [showFeedback, setShowFeedback] = useState(false);
  const [isCorrectAnswer, setIsCorrectAnswer] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<Answer | null>(null);
  const [timeSpent, setTimeSpent] = useState(0);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameEnded, setGameEnded] = useState(false);
  const [answers, setAnswers] = useState<ChallengeAnswer[]>([]);
  const [avatarMessage, setAvatarMessage] = useState('');
  const [avatarAnimation, setAvatarAnimation] = useState<'happy' | 'sad' | 'neutral' | 'excited' | 'encouraging' | 'blessing'>('neutral');
  const [totalCorrect, setTotalCorrect] = useState(0);
  const [stats, setStats] = useState({
    correctAnswers: 0,
    incorrectAnswers: 0,
    averageTime: 0
  });

  // Query for challenge details
  const { data: challengeData, isLoading: isLoadingChallenge } = useQuery({
    queryKey: ['/api/challenges', challengeId],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/challenges/${challengeId}`);
      return await res.json();
    },
    enabled: !!challengeId && !!user,
  });

  const challenge: Challenge | undefined = challengeData?.challenge;
  const userResult: ChallengeResult | undefined = challengeData?.userResult;
  const opponentResult: ChallengeResult | undefined = challengeData?.opponentResult;
  const gameSession: GameSession | undefined = challengeData?.gameSession;
  
  // Extract questions from game session
  const [questions, setQuestions] = useState<Question[]>([]);
  
  useEffect(() => {
    if (gameSession) {
      // Fetch questions for this game session
      const fetchQuestions = async () => {
        try {
          const res = await apiRequest('GET', `/api/game/questions?category=${gameSession.category}&difficulty=${gameSession.difficulty}&count=10`);
          const fetchedQuestions = await res.json();
          setQuestions(fetchedQuestions);
        } catch (error) {
          console.error('Failed to fetch questions:', error);
          toast({
            title: 'Error',
            description: 'Failed to load questions for this challenge',
            variant: 'destructive',
          });
        }
      };
      
      fetchQuestions();
    }
  }, [gameSession, toast]);

  // If this is play mode and user has already completed their turn, redirect to results page
  useEffect(() => {
    if (modeParam === 'challenge' && challenge?.userCompleted) {
      window.location.href = `/challenge/${challengeId}`;
    }
  }, [modeParam, challenge, challengeId]);

  // Setup socket connection
  useEffect(() => {
    if (user?.id) {
      setupGameSocket(user.id);
    }
  }, [user?.id]);

  // If we're in results mode and have user result, populate answers
  useEffect(() => {
    if (!modeParam && userResult) {
      setAnswers(userResult.answers);
      setTotalCorrect(userResult.correctAnswers);
      setStats({
        correctAnswers: userResult.correctAnswers,
        incorrectAnswers: userResult.incorrectAnswers,
        averageTime: userResult.averageTime
      });
      setGameEnded(true);
    }
  }, [modeParam, userResult]);

  // Handle game start
  const handleStartGame = () => {
    setGameStarted(true);
    setCurrentQuestionIndex(0);
    playSound('gameStart');
    
    // Initial avatar message
    const startMessage = 'Challenge mode started! May the best Bible scholar win!';
    setAvatarMessage(startMessage);
    setAvatarAnimation('excited');
    
    // Only speak if voice is enabled
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      setTimeout(() => {
        speakText(startMessage);
      }, 300);
    }
  };

  // Handle answer selection
  const handleAnswerSelected = (answer: Answer, time: number) => {
    // Prevent double-processing
    if (showFeedback) return;
    
    setSelectedAnswer(answer);
    setTimeSpent(time);
    setIsCorrectAnswer(answer.isCorrect);
    
    // Stop any ongoing speech first
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    
    // Save answer
    const newAnswer: ChallengeAnswer = {
      questionId: questions[currentQuestionIndex].id,
      answerId: answer.id,
      isCorrect: answer.isCorrect,
      timeSpent: time
    };
    
    // Update stats
    const newAnswers = [...answers, newAnswer];
    setAnswers(newAnswers);
    
    // Calculate stats
    const correctCount = newAnswers.filter(a => a.isCorrect).length;
    const incorrectCount = newAnswers.length - correctCount;
    const avgTime = newAnswers.reduce((sum, a) => sum + a.timeSpent, 0) / newAnswers.length;
    
    setTotalCorrect(correctCount);
    setStats({
      correctAnswers: correctCount,
      incorrectAnswers: incorrectCount,
      averageTime: avgTime
    });
    
    // Prepare feedback message
    const feedbackMessage = answer.isCorrect 
      ? 'Great job! That\'s correct!' 
      : 'Oops! That\'s not quite right.';
    
    // Send answer to server via socket first
    if (challengeId) {
      submitChallengeAnswer(
        challengeId,
        questions[currentQuestionIndex].id,
        answer.id,
        answer.isCorrect,
        time
      );
    }
    
    // We'll use a flag to track if we've already shown feedback
    let feedbackProcessed = false;
    
    // Set feedback visible after a short delay to ensure proper sequence
    setTimeout(() => {
      // Prevent double-processing if somehow triggered multiple times
      if (feedbackProcessed) return;
      feedbackProcessed = true;
      
      setShowFeedback(true);
      
      // Set avatar message
      setAvatarMessage(feedbackMessage);
      setAvatarAnimation(answer.isCorrect ? 'happy' : 'sad');
      playSound(answer.isCorrect ? 'correct' : 'wrong');
      
      // Only speak if voice is enabled - with a safe delay
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        // Ensure any previous speech is canceled
        window.speechSynthesis.cancel();
        
        // Use a slightly longer delay to ensure animations and UI updates complete first
        const speechTimer = setTimeout(() => {
          if (document.visibilityState === 'visible') {
            speakText(feedbackMessage);
          }
          // Clear the timer to prevent memory leaks
          clearTimeout(speechTimer);
        }, 500);
      }
    }, 100);
  };

  // Handle next question
  const handleNextQuestion = () => {
    setShowFeedback(false);
    setSelectedAnswer(null);
    
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
      setAvatarMessage('Keep going! You\'re doing great!');
      setAvatarAnimation('encouraging');
    } else {
      // End game
      setGameEnded(true);
      setAvatarMessage(`Challenge complete! You got ${totalCorrect} out of ${questions.length} correct!`);
      setAvatarAnimation('blessing');
      
      // Complete the challenge
      if (challengeId) {
        completeChallenge(challengeId);
        
        // Redirect to results page after a short delay
        setTimeout(() => {
          window.location.href = `/challenge/${challengeId}`;
        }, 3000);
      }
    }
  };

  // If we're in play mode and loading has finished but no questions, show error
  if (modeParam === 'challenge' && !isLoadingChallenge && questions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-blue-900 to-indigo-900 p-4">
        <div className="bg-blue-950/60 rounded-3xl p-8 max-w-xl mx-auto shadow-2xl border-2 border-accent/40">
          <XCircle className="h-16 w-16 text-destructive mb-6 mx-auto" />
          <h1 className="text-3xl font-bold mb-4 text-white text-center game-title">Error Loading Challenge</h1>
          <p className="text-center text-white/80 mb-6 text-lg">
            We couldn't load the questions for this challenge. Please try again later.
          </p>
          <Button 
            size="lg"
            className="w-full bg-gradient-to-r from-secondary to-secondary-dark hover:from-secondary-light hover:to-secondary text-white font-bold"
            asChild
          >
            <a href="/challenges">
              <ArrowLeft className="mr-2 h-5 w-5" />
              Back to Challenges
            </a>
          </Button>
        </div>
      </div>
    );
  }

  // Show loading state
  if (isLoadingChallenge || (modeParam === 'challenge' && questions.length === 0)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-blue-900 to-indigo-900 p-4">
        <div className="bg-blue-950/60 rounded-3xl p-8 max-w-xl mx-auto shadow-2xl border-2 border-accent/40">
          <Loader2 className="h-16 w-16 animate-spin mb-6 mx-auto text-accent" />
          <h1 className="text-3xl font-bold mb-4 text-white text-center game-title">Loading Challenge</h1>
          <p className="text-center text-white/80 mb-2 text-lg">
            Please wait while we load your challenge...
          </p>
          <p className="text-center text-accent animate-pulse">
            Get ready to test your Bible knowledge!
          </p>
        </div>
      </div>
    );
  }

  // Play Mode
  if (modeParam === 'challenge' && !gameEnded) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-sky-100 to-blue-200 py-8 px-4">
        {!gameStarted ? (
          <div className="max-w-3xl mx-auto bg-white rounded-3xl p-8 shadow-xl border-2 border-primary/30">
            <div className="flex justify-between mb-4">
              <Button 
                variant="outline" 
                className="flex items-center gap-2"
                onClick={() => window.location.href = '/'}
              >
                <span>← Home</span>
              </Button>
              <Button 
                variant="outline" 
                className="flex items-center gap-2"
                onClick={() => window.location.href = '/challenges'}
              >
                <span>← Challenges</span>
              </Button>
            </div>
            <div className="text-center mb-8">
              <h1 className="text-4xl font-bold text-primary mb-2 game-title">Challenge from {challenge?.opponentName}</h1>
              <p className="text-xl text-secondary">
                Category: {challenge?.category} • Difficulty: {challenge?.difficulty}
              </p>
            </div>
            
            <div className="bg-blue-800/50 rounded-xl p-6 mb-8 text-white shadow-md">
              <p className="text-lg mb-6">
                You've been challenged to a Bible Trivia duel! Answer the questions to the best of your ability.
                Your score will be compared with your opponent's score to determine the winner.
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div className="bg-indigo-800/60 rounded-lg p-4 border border-white/30 shadow-inner">
                  <h3 className="font-bold text-lg mb-2 text-accent text-shadow-sm">Game Rules</h3>
                  <ul className="list-disc list-inside space-y-2 text-white/90">
                    <li>10 questions, one at a time</li>
                    <li>20 second time limit per question</li>
                    <li>Faster answers score more points</li>
                    <li>Both players must complete their turns</li>
                  </ul>
                </div>
                
                <div className="bg-indigo-800/60 rounded-lg p-4 border border-white/30 shadow-inner">
                  <h3 className="font-bold text-lg mb-2 text-accent text-shadow-sm">Rewards</h3>
                  <ul className="list-disc list-inside space-y-2 text-white/90">
                    <li>Win to climb the leaderboard</li>
                    <li>Improve your Bible knowledge</li>
                    <li>Earn bragging rights over friends</li>
                    <li>Collect achievements and rewards</li>
                  </ul>
                </div>
              </div>
            </div>
            
            <Button 
              size="lg"
              className="w-full bg-gradient-to-r from-secondary to-secondary-dark hover:from-secondary-light hover:to-secondary text-white py-6 text-xl font-bold shadow-xl"
              onClick={handleStartGame}
            >
              Start Challenge
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="md:col-span-3">
              <GameBoard
                question={questions[currentQuestionIndex].text}
                questionContext={questions[currentQuestionIndex].context}
                answers={questions[currentQuestionIndex].answers}
                currentQuestion={currentQuestionIndex + 1}
                totalQuestions={questions.length}
                category={questions[currentQuestionIndex].category}
                difficultyLevel={questions[currentQuestionIndex].difficulty}
                timeLimit={20}
                onAnswer={handleAnswerSelected}
                onNextQuestion={handleNextQuestion}
                score={totalCorrect}
                avatarMessage={avatarMessage}
                isQuestionAnswered={showFeedback}
                correctAnswers={totalCorrect}
              />
            </div>
            <div className="md:col-span-1">
              <div className="bg-blue-950/80 rounded-2xl overflow-hidden shadow-xl border-2 border-accent/50">
                <div className="p-4 bg-gradient-to-r from-indigo-900/80 to-blue-950">
                  <h3 className="text-xl font-bold text-white mb-1">Challenge Stats</h3>
                </div>
                <div className="p-5 space-y-6 bg-blue-950/90">
                  <div>
                    <p className="text-sm font-medium mb-2 text-white">Progress</p>
                    <Progress value={(currentQuestionIndex + 1) / questions.length * 100} className="h-3 mb-2" />
                    <p className="text-xs text-white/70">
                      Question {currentQuestionIndex + 1} of {questions.length}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium mb-1 text-white">Score</p>
                    <p className="text-3xl font-bold text-white">
                      {totalCorrect} <span className="text-sm text-white/70">/ {questions.length}</span>
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium mb-1 text-white">Accuracy</p>
                    <p className="text-xl font-semibold text-accent">
                      {answers.length > 0 
                        ? `${Math.round((stats.correctAnswers / answers.length) * 100)}%` 
                        : '0%'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium mb-1 text-white">Avg. Time</p>
                    <p className="text-xl font-semibold text-accent">
                      {answers.length > 0 
                        ? `${Math.round(stats.averageTime * 10) / 10}s` 
                        : '0s'}
                    </p>
                  </div>
                </div>
              </div>
              <div className="mt-6">
                <Avatar message={avatarMessage} animation={avatarAnimation} />
              </div>
            </div>
          </div>
        )}

        {showFeedback && (
          <FeedbackModal
            isCorrect={isCorrectAnswer}
            question={questions[currentQuestionIndex].text}
            correctAnswer={questions[currentQuestionIndex].answers.find(a => a.isCorrect)?.text || ''}
            avatarMessage={avatarMessage}
            onClose={handleNextQuestion}
            gameMode="challenge"
          />
        )}
      </div>
    );
  }

  // Results Mode
  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-100 to-blue-200 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex gap-3">
            <Button 
              size="lg"
              variant="outline" 
              asChild 
              className="border-primary text-primary bg-white hover:bg-primary/10"
              onClick={() => window.location.href = '/'}
            >
              <a href="/">
                <ArrowLeft className="mr-2 h-5 w-5" />
                Home
              </a>
            </Button>
            <Button 
              size="lg"
              variant="outline" 
              asChild 
              className="border-primary text-primary bg-white hover:bg-primary/10"
            >
              <a href="/challenges">
                <ArrowLeft className="mr-2 h-5 w-5" />
                Challenges
              </a>
            </Button>
          </div>
          <h1 className="text-3xl font-bold text-primary game-title">Challenge Results</h1>
        </div>

      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Challenge with {challenge?.opponentName}</CardTitle>
              <CardDescription>
                {challenge?.category} • {challenge?.difficulty} • 
                Created {new Date(challenge?.createdAt || '').toLocaleDateString()}
              </CardDescription>
            </div>
            <Badge 
              variant={
                challenge?.status === 'completed' 
                  ? (challenge?.isDraw 
                    ? 'secondary' 
                    : (challenge?.winnerUserId === user?.id ? 'default' : 'destructive')) 
                  : 'outline'
              }
              className="text-sm"
            >
              {challenge?.status === 'completed'
                ? (challenge?.isDraw
                  ? 'DRAW'
                  : (challenge?.winnerUserId === user?.id ? 'WIN' : 'LOSS'))
                : challenge?.status.toUpperCase()}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex flex-col items-center p-4 rounded-lg border">
              <User className="h-12 w-12 mb-2" />
              <h3 className="text-lg font-semibold">You</h3>
              <p className="text-3xl font-bold">{userResult?.score || 0}</p>
              <div className="text-sm text-muted-foreground mt-2">
                <p>{userResult?.correctAnswers || 0} correct</p>
                <p>{userResult?.incorrectAnswers || 0} incorrect</p>
                <p>{userResult?.averageTime ? `${Math.round(userResult.averageTime * 10) / 10}s avg` : 'N/A'}</p>
              </div>
              {challenge?.status === 'completed' && challenge?.winnerUserId === user?.id && (
                <Badge className="mt-2" variant="default">Winner</Badge>
              )}
            </div>
            
            <div className="flex flex-col items-center justify-center">
              {challenge?.status === 'completed' ? (
                <div className="text-center">
                  <Trophy className="h-12 w-12 mx-auto mb-2 text-yellow-500" />
                  <p className="text-lg font-semibold">
                    {challenge?.isDraw ? 'Draw' : `${challenge?.winnerUserId === user?.id ? 'You' : challenge?.opponentName} won!`}
                  </p>
                </div>
              ) : (
                <div className="text-center">
                  <Clock className="h-12 w-12 mx-auto mb-2 text-blue-500" />
                  <p className="text-lg font-semibold">
                    {challenge?.opponentCompleted ? 'Waiting for you' : `Waiting for ${challenge?.opponentName}`}
                  </p>
                </div>
              )}
            </div>
            
            <div className="flex flex-col items-center p-4 rounded-lg border">
              <User className="h-12 w-12 mb-2" />
              <h3 className="text-lg font-semibold">{challenge?.opponentName}</h3>
              <p className="text-3xl font-bold">{opponentResult?.score || '?'}</p>
              <div className="text-sm text-muted-foreground mt-2">
                {opponentResult ? (
                  <>
                    <p>{opponentResult.correctAnswers} correct</p>
                    <p>{opponentResult.incorrectAnswers} incorrect</p>
                    <p>{opponentResult.averageTime ? `${Math.round(opponentResult.averageTime * 10) / 10}s avg` : 'N/A'}</p>
                  </>
                ) : (
                  <p>Not completed yet</p>
                )}
              </div>
              {challenge?.status === 'completed' && challenge?.winnerUserId !== user?.id && !challenge?.isDraw && (
                <Badge className="mt-2" variant="default">Winner</Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {userResult && (
        <Tabs defaultValue="summary">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="summary">Summary</TabsTrigger>
            <TabsTrigger value="answers">Question Details</TabsTrigger>
          </TabsList>
          
          <TabsContent value="summary" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Performance Summary</CardTitle>
                <CardDescription>Your performance in this challenge</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-lg font-semibold mb-2">Score Breakdown</h3>
                    <div className="space-y-4">
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span>Correct Answers</span>
                          <span className="font-medium">{userResult.correctAnswers} / {userResult.answers.length}</span>
                        </div>
                        <Progress value={(userResult.correctAnswers / userResult.answers.length) * 100} className="h-2" />
                      </div>
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span>Accuracy</span>
                          <span className="font-medium">
                            {Math.round((userResult.correctAnswers / userResult.answers.length) * 100)}%
                          </span>
                        </div>
                        <Progress value={(userResult.correctAnswers / userResult.answers.length) * 100} className="h-2" />
                      </div>
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span>Average Time</span>
                          <span className="font-medium">{Math.round(userResult.averageTime * 10) / 10}s</span>
                        </div>
                        <Progress value={(20 - userResult.averageTime) / 20 * 100} className="h-2" />
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <h3 className="text-lg font-semibold mb-2">Statistics</h3>
                    <Table>
                      <TableBody>
                        <TableRow>
                          <TableCell>Total Questions</TableCell>
                          <TableCell className="text-right">{userResult.answers.length}</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>Correct Answers</TableCell>
                          <TableCell className="text-right">{userResult.correctAnswers}</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>Incorrect Answers</TableCell>
                          <TableCell className="text-right">{userResult.incorrectAnswers}</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>Average Time per Question</TableCell>
                          <TableCell className="text-right">{Math.round(userResult.averageTime * 10) / 10}s</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>Fastest Answer</TableCell>
                          <TableCell className="text-right">
                            {Math.min(...userResult.answers.map(a => a.timeSpent))}s
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>Slowest Answer</TableCell>
                          <TableCell className="text-right">
                            {Math.max(...userResult.answers.map(a => a.timeSpent))}s
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="answers" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Question Details</CardTitle>
                <CardDescription>Your answers for each question</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Result</TableHead>
                      <TableHead>Time</TableHead>
                      {opponentResult && <TableHead>Opponent</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {userResult.answers.map((answer, index) => {
                      // Find corresponding opponent answer if available
                      const opponentAnswer = opponentResult?.answers[index];
                      
                      return (
                        <TableRow key={index}>
                          <TableCell>{index + 1}</TableCell>
                          <TableCell>
                            <div className="flex items-center">
                              {answer.isCorrect ? (
                                <Badge variant="default" className="bg-green-500">Correct</Badge>
                              ) : (
                                <Badge variant="destructive">Incorrect</Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{answer.timeSpent}s</TableCell>
                          {opponentResult && (
                            <TableCell>
                              {opponentAnswer ? (
                                <div className="flex items-center gap-2">
                                  {opponentAnswer.isCorrect ? (
                                    <Badge variant="default" className="bg-green-500">Correct</Badge>
                                  ) : (
                                    <Badge variant="destructive">Incorrect</Badge>
                                  )}
                                  <span>{opponentAnswer.timeSpent}s</span>
                                  
                                  {/* Comparison indicator */}
                                  {answer.isCorrect === opponentAnswer.isCorrect ? (
                                    answer.timeSpent < opponentAnswer.timeSpent ? (
                                      <ChevronsUp className="h-4 w-4 text-green-500" />
                                    ) : answer.timeSpent > opponentAnswer.timeSpent ? (
                                      <ChevronsDown className="h-4 w-4 text-red-500" />
                                    ) : null
                                  ) : (
                                    answer.isCorrect ? (
                                      <ChevronsUp className="h-4 w-4 text-green-500" />
                                    ) : (
                                      <ChevronsDown className="h-4 w-4 text-red-500" />
                                    )
                                  )}
                                </div>
                              ) : (
                                <span className="text-muted-foreground">Not answered</span>
                              )}
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
              <CardFooter className="flex justify-center">
                {challenge?.status !== 'completed' && !challenge?.opponentCompleted && (
                  <div className="text-center text-muted-foreground">
                    Waiting for {challenge?.opponentName} to complete their turn...
                  </div>
                )}
              </CardFooter>
            </Card>
          </TabsContent>
        </Tabs>
      )}
      </div>
    </div>
  );
}