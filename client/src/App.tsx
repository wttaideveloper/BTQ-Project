import { Switch, Route, useLocation, Redirect } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "./hooks/use-auth";
import { AdminGate } from "./components/ProtectedRoute";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Game from "@/pages/Game";
import AdminPanel from "@/pages/AdminPanel";
import AuthPage from "@/pages/AuthPage";
import Leaderboard from "@/pages/Leaderboard";
import TeamBattleGame from "@/pages/TeamBattleGame";
import GameHistory from "@/pages/GameHistory";
import Contact from "@/pages/Contact";
import ProfilePage from "@/pages/ProfilePage";
import { markOpenTeamBattleSetup } from "@/lib/team-battle-navigation";
import { useEffect } from "react";
import { voiceService } from "./lib/voice-service";
import { stopSpeaking } from "./lib/sounds";
import NavigationGuardProvider from "@/components/NavigationGuardProvider";
import { Loader2 } from "lucide-react";

function AuthLoadingScreen() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-[#1a1f3a] via-primary to-[#0f1428]">
      <Loader2 className="h-8 w-8 animate-spin text-accent" />
    </div>
  );
}

function TeamBattleSetupRedirect() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    markOpenTeamBattleSetup();
    setLocation("/");
  }, [setLocation]);

  return <AuthLoadingScreen />;
}

function Router() {
  const [location] = useLocation();
  const { user, isLoading } = useAuth();

  // Stop voice narration when route changes (except when entering game)
  useEffect(() => {
    if (
      location !== "/play" &&
      location !== "/game" &&
      location !== "/team-battle-game"
    ) {
      voiceService.stopAllAudio(true);
      stopSpeaking();
    }
  }, [location]);

  // Public auth page — no session required
  if (location === "/auth") {
    return (
      <Switch>
        <Route path="/auth" component={AuthPage} />
      </Switch>
    );
  }

  // Single auth check for all protected pages (avoids N parallel /api/user calls)
  if (isLoading) {
    return <AuthLoadingScreen />;
  }

  if (!user) {
    return <Redirect to="/auth" />;
  }

  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/play" component={Game} />
      <Route path="/game" component={Game} />
      <Route path="/team-battle" component={TeamBattleSetupRedirect} />
      <Route path="/team-battle-game" component={TeamBattleGame} />
      <Route path="/leaderboard" component={Leaderboard} />
      <Route path="/game-history" component={GameHistory} />
      <Route path="/contact" component={Contact} />
      <Route path="/profile" component={ProfilePage} />
      <Route path="/admin">
        <AdminGate>
          <AdminPanel />
        </AdminGate>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  useEffect(() => {
    voiceService.stopAllAudio(true);
    stopSpeaking();
    sessionStorage.removeItem("questionRead");
    for (let i = 0; i <= 20; i++) {
      sessionStorage.removeItem(`questionRead_${i}`);
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <NavigationGuardProvider>
            <Router />
          </NavigationGuardProvider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
