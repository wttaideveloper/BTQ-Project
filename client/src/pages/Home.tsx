import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';

// NOTE: Multiplayer functionality is disabled for this POC
// Will be implemented in the next iteration
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import holmesImagePath from '@assets/HP HOLMES.jpg';
import { Play, Settings, Sword, Award, Database, LogIn, LogOut, User, Trophy, Bell } from 'lucide-react';
import GameSetup, { GameConfig } from '@/components/GameSetup';
import { useAuth } from '@/hooks/use-auth';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Challenge, Notification } from '@shared/schema';
import { voiceService } from '@/lib/voice-service';
import { stopSpeaking } from '@/lib/sounds';

const Home: React.FC = () => {
  const [_, setLocation] = useLocation();
  const [showGameSetup, setShowGameSetup] = useState(false);
  const [gameSetupKey, setGameSetupKey] = useState(0);
  const [titleEffect, setTitleEffect] = useState(false);
  const { user, logoutMutation } = useAuth();
  
  // Game configuration state
  const [gameType, setGameType] = useState<'question' | 'time'>('question');
  const [category, setCategory] = useState('Bible Stories');
  const [difficulty, setDifficulty] = useState('Beginner');
  
  // Get pending challenges count to display as a badge
  const { data: challenges } = useQuery({
    queryKey: ['/api/challenges'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/challenges');
      return await res.json();
    },
    enabled: !!user,
  });
  
  // Get unread notifications count
  const { data: notifications } = useQuery({
    queryKey: ['/api/notifications'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/notifications');
      return await res.json();
    },
    enabled: !!user,
  });
  
  // Count pending challenges and unread notifications
  const pendingChallenges = challenges?.filter((c: Challenge) => c.status === 'pending') || [];
  const unreadNotifications = notifications?.filter((n: Notification) => !n.read) || [];
  
  // Clean up voice narration when entering home page
  useEffect(() => {
    console.log('🏠 Home component mounted - stopping all voice narration');
    voiceService.stopAllAudio(true); // Block future narration
    stopSpeaking();
    
    // Clear all question read flags from session storage
    sessionStorage.removeItem('questionRead');
    for (let i = 0; i <= 20; i++) {
      sessionStorage.removeItem(`questionRead_${i}`);
    }
  }, []);

  // Animation effect for the title - Family Feud style flashing
  useEffect(() => {
    const interval = setInterval(() => {
      setTitleEffect(prev => !prev);
    }, 1500);
    
    return () => clearInterval(interval);
  }, []);

  const handleStartGame = (config: GameConfig) => {
    // Convert config to query params
    const params = new URLSearchParams();
    
    // Handle special case for playerNames array
    Object.entries(config).forEach(([key, value]) => {
      if (key === 'playerNames' && Array.isArray(value)) {
        params.append(key, encodeURIComponent(value.join(',')));
      } else {
        params.append(key, value.toString());
      }
    });
    
    // Route to /play for game experience
    setLocation(`/play?${params.toString()}`);
  };

  const handleSinglePlayerStart = () => {
    // Start single player game with selected configuration
    const config: GameConfig = {
      gameMode: 'single',
      gameType,
      category,
      difficulty,
      playerCount: 1,
      playerNames: [user?.username || 'Player 1']
    };
    
    handleStartGame(config);
  };

  const handleMultiplayerStart = () => {
    // Open multiplayer setup modal with selected configuration
    const url = new URL(window.location.href);
    url.searchParams.set('mode', 'multi');
    url.searchParams.set('gameType', gameType);
    url.searchParams.set('category', category);
    url.searchParams.set('difficulty', difficulty);
    window.history.replaceState({}, '', url.toString());
    setGameSetupKey(prev => prev + 1);
    setShowGameSetup(true);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary via-primary-dark to-secondary-dark font-heading">
      {/* Header with Auth Controls */}
      <header className="relative w-full py-6 px-6">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          {/* Logo */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-accent rounded-lg flex items-center justify-center">
              <span className="text-primary font-bold text-xl">F</span>
            </div>
            <h1 className="text-2xl font-bold text-white">
              Faith<span className="text-accent">IQ</span>
            </h1>
          </div>

          {/* Auth Controls */}
          <div className="flex items-center gap-3">
            {user ? (
              <>
                <div className="hidden sm:flex items-center gap-2 text-white bg-black/20 px-3 py-2 rounded-lg">
                  <User size={16} />
                  <span className="font-medium">{user.username}</span>
                  {user.isAdmin && (
                    <span className="bg-accent text-primary text-xs font-bold px-2 py-1 rounded-full">
                      ADMIN
                    </span>
                  )}
                </div>
                {user.isAdmin && (
                  <Button
                    onClick={() => setLocation('/admin')}
                    variant="outline"
                    size="sm"
                    className="border-accent/50 text-accent bg-black/20 hover:bg-accent/10"
                  >
                    <Database size={16} className="mr-1" /> Admin
                  </Button>
                )}
                <Button
                  onClick={() => logoutMutation.mutate()}
                  variant="outline"
                  size="sm"
                  className="border-white/30 text-white bg-black/20 hover:bg-white/10"
                >
                  <LogOut size={16} className="mr-1" /> Logout
                </Button>
              </>
            ) : (
              <Button
                onClick={() => setLocation('/auth')}
                variant="outline"
                size="sm"
                className="border-white/30 text-white bg-black/20 hover:bg-white/10"
              >
                <LogIn size={16} className="mr-1" /> Login
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative w-full py-16 px-6">
        <div className="max-w-7xl mx-auto text-center">
          {/* Animated Title */}
          <div className={`mb-8 transition-all duration-700 ${titleEffect ? 'scale-105' : 'scale-100'}`}>
            <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold text-white mb-6 tracking-tight">
              Faith<span className="text-accent drop-shadow-lg">IQ</span>
            </h1>
            <div className="w-full max-w-2xl mx-auto h-2 bg-white/20 rounded-full overflow-hidden mb-6">
              <div className="h-full bg-gradient-to-r from-accent to-accent/70 animate-pulse rounded-full" style={{width: '75%'}}></div>
            </div>
            <p className="text-xl md:text-2xl text-white/90 font-light max-w-3xl mx-auto leading-relaxed">
              Test your Bible knowledge with the ultimate trivia experience
            </p>
          </div>
        </div>
      </section>
      
      {/* Main Content */}
      <main className="w-full max-w-7xl mx-auto px-6 py-12">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left Column - Game Options */}
          <div className="space-y-8">
            {/* Host Avatar */}
            <div className="relative mb-8">
              <div className="absolute inset-0 bg-accent/20 rounded-full filter blur-xl animate-pulse"></div>
              <img 
                src={holmesImagePath} 
                alt="Kingdom Genius Dr. HB Holmes - Bible Trivia Quiz Master" 
                className="w-32 h-32 md:w-40 md:h-40 object-cover rounded-full border-4 border-accent shadow-2xl z-10 relative mx-auto"
              />
              <div className="absolute -bottom-4 left-1/2 transform -translate-x-1/2 bg-gradient-to-r from-accent to-accent/80 text-primary px-6 z-50 py-2 rounded-full font-bold text-sm whitespace-nowrap shadow-lg">
                Dr. HB Holmes
              </div>
            </div>

            {/* Game Configuration */}
            <div className="space-y-6">
              <h2 className="text-3xl md:text-4xl font-bold text-white text-center lg:text-left">
                Configure Your Game
              </h2>
              
              {/* Game Configuration Card */}
              <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
                <div className="space-y-5">
                  {/* Game Type Selection */}
                  <div>
                    <Label className="text-white font-semibold text-base mb-3 block">Game Type</Label>
                    <RadioGroup 
                      value={gameType} 
                      onValueChange={(value) => setGameType(value as 'question' | 'time')}
                      className="space-y-2"
                    >
                      <div className="flex items-center p-3 border border-white/30 rounded-lg cursor-pointer bg-white/5 hover:bg-white/10 transition-all">
                        <RadioGroupItem value="question" id="question" className="mr-3 border-white text-accent" />
                        <Label htmlFor="question" className="cursor-pointer flex-1 text-white">
                          <p className="font-medium">Question-Based</p>
                          <p className="text-sm text-white/70">10 questions, no time limit</p>
                        </Label>
                      </div>
                      <div className="flex items-center p-3 border border-white/30 rounded-lg cursor-pointer bg-white/5 hover:bg-white/10 transition-all">
                        <RadioGroupItem value="time" id="time" className="mr-3 border-white text-accent" />
                        <Label htmlFor="time" className="cursor-pointer flex-1 text-white">
                          <p className="font-medium">Time-Based</p>
                          <p className="text-sm text-white/70">As many questions as possible in 15 minutes</p>
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>

                  {/* Category Selection */}
                  <div>
                    <Label className="text-white font-semibold text-base mb-3 block">Category</Label>
                    <Select value={category} onValueChange={setCategory}>
                      <SelectTrigger className="w-full p-3 bg-white/10 border-white/30 text-white hover:bg-white/20">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="All Categories">All Categories</SelectItem>
                        <SelectItem value="Old Testament">Old Testament</SelectItem>
                        <SelectItem value="New Testament">New Testament</SelectItem>
                        <SelectItem value="Bible Stories">Bible Stories</SelectItem>
                        <SelectItem value="Famous People">Famous People</SelectItem>
                        <SelectItem value="Theme-Based">Theme-Based</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Difficulty Selection */}
                  <div>
                    <Label className="text-white font-semibold text-base mb-3 block">Difficulty</Label>
                    <Select value={difficulty} onValueChange={setDifficulty}>
                      <SelectTrigger className="w-full p-3 bg-white/10 border-white/30 text-white hover:bg-white/20">
                        <SelectValue placeholder="Select difficulty" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Beginner">Beginner</SelectItem>
                        <SelectItem value="Intermediate">Intermediate</SelectItem>
                        <SelectItem value="Advanced">Advanced</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Game Mode Cards */}
              <div className="space-y-4">
                {/* Single Player Card */}
                <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/20 hover:border-accent/50 transition-all duration-300 hover:shadow-2xl hover:shadow-accent/20">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 bg-accent rounded-full flex items-center justify-center flex-shrink-0">
                        <Play className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-white">Single Player</h3>
                        <p className="text-white/70 text-sm">Test your Bible knowledge solo</p>
                      </div>
                    </div>
                    <Button 
                      onClick={handleSinglePlayerStart}
                      className="bg-accent hover:bg-accent/90 text-primary font-bold px-6 py-3"
                    >
                      <Play className="mr-2 h-4 w-4" /> Start
                    </Button>
                  </div>
                </div>

                {/* Multiplayer Card */}
                <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/20 hover:border-secondary/50 transition-all duration-300 hover:shadow-2xl hover:shadow-secondary/20">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 bg-secondary rounded-full flex items-center justify-center flex-shrink-0">
                        <Sword className="h-6 w-6 text-white" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-white">Multiplayer</h3>
                        <p className="text-white/70 text-sm">Compete with up to 3 players</p>
                      </div>
                    </div>
                    <Button 
                      onClick={handleMultiplayerStart}
                      className="bg-secondary hover:bg-secondary/90 text-white font-bold px-6 py-3"
                    >
                      <Sword className="mr-2 h-4 w-4" /> Play
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Rewards & Stats */}
          <div className="space-y-8">
            {/* Rewards Section */}
            <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-sm rounded-2xl p-8 border border-white/20">
              <h3 className="text-2xl font-bold text-white mb-6 text-center">🏆 Earn Rewards</h3>
              <div className="grid grid-cols-1 gap-4">
                <div className="bg-gradient-to-r from-accent/20 to-accent/10 rounded-xl p-4 flex items-center space-x-4">
                  <div className="w-12 h-12 bg-accent rounded-full flex items-center justify-center">
                    <span className="text-primary font-bold text-lg">5</span>
                  </div>
                  <div>
                    <p className="text-white font-semibold">Free Book</p>
                    <p className="text-white/60 text-sm">Get 5 correct answers</p>
                  </div>
                </div>
                <div className="bg-gradient-to-r from-secondary/20 to-secondary/10 rounded-xl p-4 flex items-center space-x-4">
                  <div className="w-12 h-12 bg-secondary rounded-full flex items-center justify-center">
                    <span className="text-white font-bold text-lg">9</span>
                  </div>
                  <div>
                    <p className="text-white font-semibold">FaithIQ Cap</p>
                    <p className="text-white/60 text-sm">Get 9 correct answers</p>
                  </div>
                </div>
                <div className="bg-gradient-to-r from-accent/20 to-accent/10 rounded-xl p-4 flex items-center space-x-4">
                  <div className="w-12 h-12 bg-accent rounded-full flex items-center justify-center">
                    <span className="text-primary font-bold text-lg">12</span>
                  </div>
                  <div>
                    <p className="text-white font-semibold">T-Shirt</p>
                    <p className="text-white/60 text-sm">Perfect score!</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="space-y-4">
              <Button 
                onClick={() => setLocation('/leaderboard')}
                className="w-full bg-gradient-to-r from-accent to-accent/80 hover:from-accent/90 hover:to-accent/70 text-primary font-bold py-4 text-lg"
              >
                <Trophy className="mr-2 h-5 w-5" /> View Leaderboard
              </Button>
              
              {user && (
                <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                  <div className="flex items-center justify-between">
                    <span className="text-white/80">Welcome back, {user.username}!</span>
                    <div className="flex items-center space-x-2">
                      {unreadNotifications.length > 0 && (
                        <Badge variant="destructive" className="px-2">
                          {unreadNotifications.length}
                        </Badge>
                      )}
                      <Bell className="h-4 w-4 text-white/60" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full py-8 px-6 border-t border-white/10">
        <div className="max-w-7xl mx-auto text-center">
          <p className="text-white/60">© {new Date().getFullYear()} FaithIQ. All rights reserved.</p>
        </div>
      </footer>

      {/* Game Setup Modal */}
      {showGameSetup && (
        <GameSetup key={gameSetupKey} onStartGame={handleStartGame} />
      )}
    </div>
  );
};

export default Home;
