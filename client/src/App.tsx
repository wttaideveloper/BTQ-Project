import { Switch, Route, useLocation } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "./hooks/use-auth";
import { ProtectedRoute } from "./components/ProtectedRoute";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Game from "@/pages/Game";
import AdminPanel from "@/pages/AdminPanel";
import AuthPage from "@/pages/AuthPage";
import Leaderboard from "@/pages/Leaderboard";
import ChallengesPage from "@/pages/ChallengesPage";
import ChallengePage from "@/pages/ChallengePage";
import TeamBattleGame from "@/pages/TeamBattleGame";
import TeamBattleSetup from "@/pages/TeamBattleSetup";
import GameHistory from "@/pages/GameHistory";
import { useEffect } from "react";
import { voiceService } from "./lib/voice-service";
import { stopSpeaking } from "./lib/sounds";

function Router() {
  const [location] = useLocation();
  
  // Stop voice narration when route changes (except when entering game)
  useEffect(() => {
    if (location !== '/play' && location !== '/game' && location !== '/team-battle-game') {
      console.log(`🔄 Route changed to ${location} - stopping voice narration`);
      voiceService.stopAllAudio(true); // Block future narration
      stopSpeaking();
    }
  }, [location]);

  return (
    <Switch>
      <ProtectedRoute path="/" component={Home} adminOnly={false} />
      <ProtectedRoute path="/play" component={Game} adminOnly={false} />
      <ProtectedRoute path="/game" component={Game} adminOnly={false} />
      <ProtectedRoute path="/team-battle" component={TeamBattleSetup} adminOnly={false} />
      <ProtectedRoute path="/team-battle-game" component={TeamBattleGame} adminOnly={false} />
      <ProtectedRoute path="/leaderboard" component={Leaderboard} adminOnly={false} />
      <ProtectedRoute path="/game-history" component={GameHistory} adminOnly={false} />
      <ProtectedRoute path="/challenges" component={ChallengesPage} adminOnly={false} />
      <ProtectedRoute path="/challenge/:id" component={ChallengePage} adminOnly={false} />
      <Route path="/auth" component={AuthPage} />
      <ProtectedRoute path="/admin" component={AdminPanel} adminOnly={true} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  // Global voice cleanup on app mount
  useEffect(() => {
    console.log('🚀 App mounted - ensuring voice is stopped');
    voiceService.stopAllAudio(true); // Block future narration
    stopSpeaking();
    
    // Clear all question read flags from session storage
    sessionStorage.removeItem('questionRead');
    for (let i = 0; i <= 20; i++) {
      sessionStorage.removeItem(`questionRead_${i}`);
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <Router />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
