import React, { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { 
  Table, 
  TableBody, 
  TableCaption, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { 
  Trophy, 
  Medal, 
  Award, 
  User, 
  ArrowLeft, 
  Filter, 
  RefreshCw 
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// Player type from schema
interface LeaderboardPlayer {
  id: string;
  name: string;
  score: number;
  gamesPlayed: number;
  correctAnswers: number;
  incorrectAnswers: number;
  accuracy: number;
  isCurrentUser?: boolean;
}

const Leaderboard: React.FC = () => {
  const [_, setLocation] = useLocation();
  const { user } = useAuth();
  const [gameType, setGameType] = useState<'all' | 'single' | 'multi'>('all');
  
  // Fetch leaderboard data
  const { data: leaderboardData, isLoading, error, refetch } = useQuery({
    queryKey: ['/api/leaderboard', gameType],
    queryFn: async () => {
      const res = await fetch(`/api/leaderboard?gameType=${gameType}`);
      if (!res.ok) {
        throw new Error('Failed to fetch leaderboard data');
      }
      return res.json();
    },
    refetchInterval: gameType === 'multi' ? 10000 : false, // Only refresh for multiplayer, every 10 seconds
    refetchOnWindowFocus: false, // Don't refetch on window focus
    staleTime: 30000, // Data is fresh for 30 seconds
    gcTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
  
  // Extract players array from the response data structure
  const players: LeaderboardPlayer[] = leaderboardData?.data || [];
  
  // Get last updated time from API response or current time
  const lastUpdated = leaderboardData?.metadata?.timestamp 
    ? new Date(leaderboardData.metadata.timestamp).toLocaleTimeString()
    : new Date().toLocaleTimeString();
  
  // Manual refresh function for better user control
  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);
  
  // Get player rank for trophy display
  const getPlayerRank = (index: number) => {
    if (index === 0) return 'gold';
    if (index === 1) return 'silver';
    if (index === 2) return 'bronze';
    return 'none';
  };
  
  // Render trophy icon based on rank
  const getTrophyIcon = (rank: string) => {
    switch (rank) {
      case 'gold':
        return <Trophy className="h-6 w-6 text-yellow-500" />;
      case 'silver':
        return <Medal className="h-6 w-6 text-gray-400" />;
      case 'bronze':
        return <Award className="h-6 w-6 text-amber-700" />;
      default:
        return null;
    }
  };
  
  return (
    <div className="min-h-screen bg-gradient-to-b from-primary to-primary-dark py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <Button 
            onClick={() => setLocation('/')}
            variant="outline" 
            className="border-white/30 text-white bg-[#2c3e50] hover:bg-[#34495e]"
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Home
          </Button>
          
          <div className="flex items-center">
            <Button 
              onClick={handleRefresh} 
              variant="ghost"
              disabled={isLoading}
              className="text-white hover:bg-white/10 disabled:opacity-50"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} /> 
              {isLoading ? 'Refreshing...' : 'Refresh'}
            </Button>
          </div>
        </div>
        
        <Card className="bg-black/60 border-accent/40 shadow-2xl">
          <CardHeader className="text-center border-b border-accent/20 pb-6">
            <div className="flex items-center justify-center space-x-2 mb-2">
              <Trophy className="h-8 w-8 text-accent animate-pulse" />
              <CardTitle className="game-title text-3xl font-heading font-bold text-white">
                Leaderboard
              </CardTitle>
              <Trophy className="h-8 w-8 text-accent animate-pulse" />
            </div>
            <CardDescription className="text-gray-300">
              Top performers in FaithIQ Bible Trivia
            </CardDescription>
            <div className="text-xs text-gray-400 mt-2">
              Last updated: {lastUpdated}
            </div>
          </CardHeader>
          
          <CardContent className="pt-6">
            <Tabs defaultValue="all" className="w-full mb-6" onValueChange={(value) => setGameType(value as 'all' | 'single' | 'multi')}>
              <TabsList className="grid w-full grid-cols-3 bg-primary-dark">
                <TabsTrigger value="all" className="data-[state=active]:bg-accent data-[state=active]:text-primary">All Games</TabsTrigger>
                <TabsTrigger value="single" className="data-[state=active]:bg-accent data-[state=active]:text-primary">Single Player</TabsTrigger>
                <TabsTrigger value="multi" className="data-[state=active]:bg-accent data-[state=active]:text-primary">Multiplayer</TabsTrigger>
              </TabsList>
            </Tabs>
            
            {isLoading ? (
              <div className="flex justify-center py-8">
                <div className="text-center">
                  <div className="animate-spin h-8 w-8 border-4 border-accent border-t-transparent rounded-full mx-auto mb-4"></div>
                  <p className="text-white">Loading leaderboard...</p>
                </div>
              </div>
            ) : error ? (
              <div className="text-center py-8">
                <p className="text-red-500 mb-4">Failed to load leaderboard data</p>
                <Button onClick={handleRefresh} variant="outline" className="border-white/30 text-white">
                  <RefreshCw className="mr-2 h-4 w-4" /> Retry
                </Button>
              </div>
            ) : !Array.isArray(players) || players.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <p>No players on the leaderboard yet. Be the first!</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableCaption>Updated in real-time for multiplayer games</TableCaption>
                  <TableHeader>
                    <TableRow className="border-accent/30 bg-primary-dark/50">
                      <TableHead className="text-white w-[80px]">Rank</TableHead>
                      <TableHead className="text-white">Player</TableHead>
                      <TableHead className="text-white text-right">Score</TableHead>
                      <TableHead className="text-white text-right">Games</TableHead>
                      <TableHead className="text-white text-right">Accuracy</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {players.map((player, index) => (
                      <TableRow 
                        key={player.id}
                        className={`border-b border-accent/10 ${
                          player.isCurrentUser 
                            ? 'bg-accent/10 hover:bg-accent/20' 
                            : 'hover:bg-white/5'
                        }`}
                      >
                        <TableCell className="font-medium">
                          <div className="flex items-center">
                            <div className="mr-2">
                              {getTrophyIcon(getPlayerRank(index))}
                            </div>
                            <span className="text-lg font-bold text-white">#{index + 1}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center">
                            <div className="bg-primary text-white w-8 h-8 rounded-full flex items-center justify-center mr-2">
                              <User size={15} />
                            </div>
                            <span className={`font-medium ${player.isCurrentUser ? 'text-accent font-bold' : 'text-white'}`}>
                              {player.name} {player.isCurrentUser && '(You)'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-bold text-yellow-400">{player.score}</TableCell>
                        <TableCell className="text-right text-white">{player.gamesPlayed}</TableCell>
                        <TableCell className="text-right">
                          <span className={`px-2 py-1 rounded-md font-medium ${
                            player.accuracy >= 80 ? 'bg-green-500/30 text-green-300' :
                            player.accuracy >= 60 ? 'bg-blue-500/30 text-blue-300' :
                            'bg-orange-500/30 text-orange-300'
                          }`}>
                            {player.accuracy}%
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Leaderboard;