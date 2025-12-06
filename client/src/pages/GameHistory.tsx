import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Trophy, Users, Clock, Target, TrendingUp, BarChart3, Calendar } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { apiRequest } from '@/lib/queryClient';

interface UserStats {
  totalGames: number;
  wins: number;
  losses: number;
  draws: number;
  totalScore: number;
  averageScore: number;
  bestScore: number;
  winRate: number;
  averageGameDuration: number;
  favoriteCategory: string;
  favoriteDifficulty: string;
}

interface GlobalStats {
  totalGames: number;
  totalPlayers: number;
  totalTeams: number;
  averageScore: number;
  averageAccuracy: number;
  totalQuestionsAnswered: number;
}

export default function GameHistory() {
  const { user } = useAuth();
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [globalStats, setGlobalStats] = useState<GlobalStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchStats();
    }
  }, [user]);

  const fetchStats = async () => {
    try {
      setLoading(true);
      
      // Fetch user statistics
      if (user) {
        const userResponse = await apiRequest('GET', `/api/statistics/user/${user.id}`);
        const userData = await userResponse.json();
        setUserStats(userData);
      }

      // Fetch global statistics
      const globalResponse = await apiRequest('GET', '/api/statistics/global');
      const globalData = await globalResponse.json();
      setGlobalStats(globalData);
    } catch (error) {
      console.error('Error fetching statistics:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Game Statistics & History
          </h1>
          <p className="text-xl text-gray-600">
            Track your progress and compete with other players
          </p>
        </div>

        {/* Statistics Overview */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* User Stats */}
          {userStats && (
            <>
              <Card className="bg-gradient-to-r from-blue-500 to-blue-600 text-white">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-blue-100">Total Games</p>
                      <p className="text-3xl font-bold">{userStats.totalGames}</p>
                    </div>
                    <Trophy className="h-8 w-8 text-blue-200" />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-r from-green-500 to-green-600 text-white">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-green-100">Win Rate</p>
                      <p className="text-3xl font-bold">{userStats.winRate.toFixed(1)}%</p>
                    </div>
                    <Target className="h-8 w-8 text-green-200" />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-r from-purple-500 to-purple-600 text-white">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-purple-100">Best Score</p>
                      <p className="text-3xl font-bold">{userStats.bestScore}</p>
                    </div>
                    <TrendingUp className="h-8 w-8 text-purple-200" />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-r from-orange-500 to-orange-600 text-white">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-orange-100">Avg Score</p>
                      <p className="text-3xl font-bold">{userStats.averageScore.toFixed(1)}</p>
                    </div>
                    <BarChart3 className="h-8 w-8 text-orange-200" />
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        {/* Detailed Statistics */}
        {userStats && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-6 w-6" />
                Detailed Statistics
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{userStats.wins}</div>
                  <div className="text-gray-600">Wins</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">{userStats.losses}</div>
                  <div className="text-gray-600">Losses</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-yellow-600">{userStats.draws}</div>
                  <div className="text-gray-600">Draws</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{userStats.totalScore}</div>
                  <div className="text-gray-600">Total Score</div>
                </div>
              </div>
              
              <div className="mt-6 grid md:grid-cols-2 gap-6">
                <div className="text-center">
                  <div className="text-lg font-semibold text-gray-800">{userStats.favoriteCategory}</div>
                  <div className="text-gray-600">Favorite Category</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-semibold text-gray-800">{userStats.favoriteDifficulty}</div>
                  <div className="text-gray-600">Favorite Difficulty</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Global Statistics */}
        {globalStats && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-6 w-6" />
                Global Statistics
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{globalStats.totalGames}</div>
                  <div className="text-gray-600">Total Games Played</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{globalStats.totalPlayers}</div>
                  <div className="text-gray-600">Active Players</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">{globalStats.totalTeams}</div>
                  <div className="text-gray-600">Teams Created</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-600">{globalStats.averageAccuracy.toFixed(1)}%</div>
                  <div className="text-gray-600">Global Accuracy</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tabs for Game History and Leaderboards */}
        <Tabs defaultValue="history" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="history" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Game History
            </TabsTrigger>
            <TabsTrigger value="leaderboard" className="flex items-center gap-2">
              <Trophy className="h-4 w-4" />
              Leaderboard
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
    </div>
  );
}


