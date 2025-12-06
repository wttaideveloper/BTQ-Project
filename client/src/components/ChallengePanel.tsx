import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { setupGameSocket, createChallenge, acceptChallenge, declineChallenge, onChallengeCreated } from '@/lib/socket';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Loader2, Trophy, Clock, User, Users, ArrowRight, CheckCircle, XCircle } from 'lucide-react';
import { Badge } from "@/components/ui/badge";
import { useToast } from '@/hooks/use-toast';

interface User {
  id: number;
  username: string;
  totalGames: number;
  wins: number;
  losses: number;
  draws: number;
}

interface Challenge {
  id: string;
  status: 'pending' | 'accepted' | 'completed' | 'expired' | 'declined';
  challengerId: number;
  challengeeId: number;
  category: string;
  difficulty: string;
  createdAt: Date;
  expiresAt: Date;
  opponentName: string;
  isChallenger: boolean;
  userCompleted: boolean;
  opponentCompleted: boolean;
  winnerUserId?: number;
  isDraw: boolean;
  isComplete: boolean;
}

export function ChallengePanel() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<number | null>(null);
  const [category, setCategory] = useState('All Categories');
  const [difficulty, setDifficulty] = useState('Beginner');

  // Setup socket connection when component mounts
  useEffect(() => {
    if (user?.id) {
      const socket = setupGameSocket(user.id);
      
      // Setup event listeners
      const unsubscribe = onChallengeCreated((data) => {
        // Refresh challenges when a new one is created
        queryClient.invalidateQueries({ queryKey: ['/api/challenges'] });
        toast({
          title: 'New Challenge Created',
          description: data.message,
        });
      });
      
      return () => {
        unsubscribe();
      };
    }
  }, [user?.id, queryClient, toast]);

  // Query for users to challenge
  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: ['/api/users'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/users');
      return await res.json() as User[];
    },
    enabled: !!user,
  });

  // Query for user's challenges
  const { data: challenges, isLoading: challengesLoading } = useQuery({
    queryKey: ['/api/challenges'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/challenges');
      return await res.json() as Challenge[];
    },
    enabled: !!user,
  });

  // Mutation for creating a challenge
  const createChallengeMutation = useMutation({
    mutationFn: async ({ challengeeId, category, difficulty }: { challengeeId: number, category: string, difficulty: string }) => {
      // Socket-based challenge creation
      createChallenge(challengeeId, category, difficulty);
      return { success: true };
    },
    onSuccess: () => {
      setIsOpen(false);
      toast({
        title: 'Challenge Sent',
        description: 'Your challenge has been sent to the selected player.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to Send Challenge',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Mutation for accepting a challenge
  const acceptChallengeMutation = useMutation({
    mutationFn: async (challengeId: string) => {
      // Socket-based challenge acceptance
      acceptChallenge(challengeId);
      return { success: true };
    },
    onSuccess: () => {
      toast({
        title: 'Challenge Accepted',
        description: 'You have accepted the challenge.',
      });
      // Invalidate challenges query to reflect updated status
      queryClient.invalidateQueries({ queryKey: ['/api/challenges'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to Accept Challenge',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Mutation for declining a challenge
  const declineChallengeMutation = useMutation({
    mutationFn: async (challengeId: string) => {
      // Socket-based challenge decline
      declineChallenge(challengeId);
      return { success: true };
    },
    onSuccess: () => {
      toast({
        title: 'Challenge Declined',
        description: 'You have declined the challenge.',
      });
      // Invalidate challenges query to reflect updated status
      queryClient.invalidateQueries({ queryKey: ['/api/challenges'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to Decline Challenge',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Handle challenge creation
  const handleCreateChallenge = () => {
    if (!selectedUser) {
      toast({
        title: 'Select a Player',
        description: 'Please select a player to challenge.',
        variant: 'destructive',
      });
      return;
    }

    createChallengeMutation.mutate({
      challengeeId: selectedUser,
      category,
      difficulty,
    });
  };

  // Filter challenges by status
  const pendingChallenges = challenges?.filter(c => c.status === 'pending') || [];
  const activeChallenges = challenges?.filter(c => c.status === 'accepted') || [];
  const completedChallenges = challenges?.filter(c => ['completed', 'expired', 'declined'].includes(c.status)) || [];

  // Determine badge color based on challenge status
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending': return <Badge variant="outline">Pending</Badge>;
      case 'accepted': return <Badge variant="secondary">Active</Badge>;
      case 'completed': return <Badge variant="default">Completed</Badge>;
      case 'expired': return <Badge variant="destructive">Expired</Badge>;
      case 'declined': return <Badge variant="destructive">Declined</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  // Render a challenge card
  const renderChallengeCard = (challenge: Challenge) => (
    <Card key={challenge.id} className="mb-4 border-2 shadow-lg bg-white">
      <CardHeader className="bg-slate-50">
        <div className="flex justify-between items-center">
          <CardTitle className="text-lg font-bold text-primary">{challenge.isChallenger ? 'You challenged' : 'Challenge from'} {challenge.opponentName}</CardTitle>
          {getStatusBadge(challenge.status)}
        </div>
        <CardDescription>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            {new Date(challenge.createdAt).toLocaleDateString()}
            {' • '}
            {challenge.category}
            {' • '}
            {challenge.difficulty}
          </div>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4" />
            <span>{challenge.isChallenger ? 'Your' : challenge.opponentName + "'s"} turn:</span>
            {challenge.isChallenger ? 
              (challenge.userCompleted ? <CheckCircle className="h-4 w-4 text-green-500" /> : <Clock className="h-4 w-4 text-yellow-500" />) :
              (challenge.opponentCompleted ? <CheckCircle className="h-4 w-4 text-green-500" /> : <Clock className="h-4 w-4 text-yellow-500" />)
            }
          </div>
          <div className="flex items-center gap-2">
            <User className="h-4 w-4" />
            <span>{!challenge.isChallenger ? 'Your' : challenge.opponentName + "'s"} turn:</span>
            {!challenge.isChallenger ? 
              (challenge.userCompleted ? <CheckCircle className="h-4 w-4 text-green-500" /> : <Clock className="h-4 w-4 text-yellow-500" />) :
              (challenge.opponentCompleted ? <CheckCircle className="h-4 w-4 text-green-500" /> : <Clock className="h-4 w-4 text-yellow-500" />)
            }
          </div>
        </div>
        
        {challenge.status === 'completed' && (
          <div className="flex justify-center mt-4 bg-muted p-2 rounded-md">
            {challenge.isDraw ? (
              <div className="flex items-center gap-2 text-lg font-semibold text-center">
                <Trophy className="h-5 w-5 text-yellow-500" /> Draw!
              </div>
            ) : (
              <div className="flex items-center gap-2 text-lg font-semibold text-center">
                <Trophy className="h-5 w-5 text-yellow-500" />
                {challenge.winnerUserId === user?.id ? 'You won!' : `${challenge.opponentName} won!`}
              </div>
            )}
          </div>
        )}
      </CardContent>
      <CardFooter>
        {challenge.status === 'pending' && !challenge.isChallenger && (
          <div className="flex gap-2 w-full">
            <Button 
              className="flex-1" 
              onClick={() => acceptChallengeMutation.mutate(challenge.id)}
              disabled={acceptChallengeMutation.isPending}
            >
              {acceptChallengeMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
              Accept
            </Button>
            <Button 
              variant="destructive" 
              className="flex-1" 
              onClick={() => declineChallengeMutation.mutate(challenge.id)}
              disabled={declineChallengeMutation.isPending}
            >
              {declineChallengeMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
              Decline
            </Button>
          </div>
        )}
        
        {challenge.status === 'pending' && challenge.isChallenger && (
          <Button className="w-full" asChild>
            <a href={`/challenge/${challenge.id}?mode=challenge`}>
              <Users className="mr-2 h-4 w-4" />
              Play My Turn First
            </a>
          </Button>
        )}

        {challenge.status === 'accepted' && !challenge.userCompleted && (
          <Button className="w-full" asChild>
            <a href={`/challenge/${challenge.id}?mode=challenge`}>
              <Users className="mr-2 h-4 w-4" />
              Play My Turn
            </a>
          </Button>
        )}

        {challenge.status === 'accepted' && challenge.userCompleted && !challenge.opponentCompleted && (
          <div className="w-full text-center text-sm text-muted-foreground">
            Waiting for {challenge.opponentName} to play their turn...
          </div>
        )}

        {challenge.status === 'completed' && (
          <Button variant="outline" className="w-full" asChild>
            <a href={`/challenge/${challenge.id}`}>
              <Trophy className="mr-2 h-4 w-4" />
              View Results
            </a>
          </Button>
        )}
      </CardFooter>
    </Card>
  );

  return (
    <div className="container p-4 bg-white rounded-lg shadow-sm border">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-primary">Challenge System</h1>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button>
              <Users className="mr-2 h-4 w-4" />
              Challenge a Player
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Challenge a Player</DialogTitle>
              <DialogDescription>
                Select a player to challenge to a Bible Trivia duel.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Select a Player</label>
                {usersLoading ? (
                  <div className="flex justify-center p-4">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : (
                  <Select value={selectedUser?.toString() || ""} onValueChange={(value) => setSelectedUser(parseInt(value))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a player to challenge" />
                    </SelectTrigger>
                    <SelectContent>
                      {users?.map((user) => (
                        <SelectItem key={user.id} value={user.id.toString()}>
                          {user.username} ({user.wins}/{user.losses}/{user.draws})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Category</label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="All Categories">All Categories</SelectItem>
                      <SelectItem value="Old Testament">Old Testament</SelectItem>
                      <SelectItem value="New Testament">New Testament</SelectItem>
                      <SelectItem value="Gospels">Gospels</SelectItem>
                      <SelectItem value="Prophets">Prophets</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Difficulty</label>
                  <Select value={difficulty} onValueChange={setDifficulty}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select difficulty" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Beginner">Beginner</SelectItem>
                      <SelectItem value="Intermediate">Intermediate</SelectItem>
                      <SelectItem value="Advanced">Advanced</SelectItem>
                      <SelectItem value="Expert">Expert</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button 
                className="w-full" 
                onClick={handleCreateChallenge}
                disabled={createChallengeMutation.isPending || !selectedUser}
              >
                {createChallengeMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRight className="mr-2 h-4 w-4" />
                )}
                Send Challenge
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="pending">
        <TabsList className="grid w-full grid-cols-3 bg-white border-2 shadow-sm">
          <TabsTrigger value="pending">
            Pending
            {pendingChallenges.length > 0 && (
              <Badge variant="secondary" className="ml-2">{pendingChallenges.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="active">
            Active
            {activeChallenges.length > 0 && (
              <Badge variant="secondary" className="ml-2">{activeChallenges.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="completed">History</TabsTrigger>
        </TabsList>
        
        <TabsContent value="pending" className="mt-4">
          {challengesLoading ? (
            <div className="flex justify-center p-4">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : pendingChallenges.length > 0 ? (
            pendingChallenges.map(renderChallengeCard)
          ) : (
            <div className="text-center p-4 text-muted-foreground">
              No pending challenges. Challenge a player to start a duel!
            </div>
          )}
        </TabsContent>
        
        <TabsContent value="active" className="mt-4">
          {challengesLoading ? (
            <div className="flex justify-center p-4">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : activeChallenges.length > 0 ? (
            activeChallenges.map(renderChallengeCard)
          ) : (
            <div className="text-center p-4 text-muted-foreground">
              No active challenges. Accept a challenge or start a new one!
            </div>
          )}
        </TabsContent>
        
        <TabsContent value="completed" className="mt-4">
          {challengesLoading ? (
            <div className="flex justify-center p-4">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : completedChallenges.length > 0 ? (
            completedChallenges.map(renderChallengeCard)
          ) : (
            <div className="text-center p-4 text-muted-foreground">
              No completed challenges yet.
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}