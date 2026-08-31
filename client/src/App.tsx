import { Switch, Route, useLocation, Redirect } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "./hooks/use-auth";
import { AdminGate, CommentatorGate } from "./components/ProtectedRoute";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Game from "@/pages/Game";
import AdminPanel from "@/pages/AdminPanel";
import AdminLoginPage from "@/pages/AdminLoginPage";
import CommentatorLoginPage from "@/pages/CommentatorLoginPage";
import CommentatorDashboard from "@/pages/CommentatorDashboard";
import CommentatorMatchDesk from "@/pages/CommentatorMatchDesk";
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
import WatchMatch from "@/pages/WatchMatch";
import Championship from "@/pages/Championship";
import ChampionshipTeam from "@/pages/ChampionshipTeam";
import MyChampionship from "@/pages/MyChampionship";

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

function AdminRootRedirect() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <AuthLoadingScreen />;
  }

  if (user?.isAdmin) {
    return <Redirect to="/admin/dashboard" />;
  }

  return <Redirect to="/admin/login" />;
}

function Router() {
  const [location] = useLocation();
  const { user, isLoading } = useAuth();

  // Stop voice narration when route changes (except when entering game).
  //
  // IMPORTANT: every hook in this component must run before the public-route
  // early returns below. Previously this effect sat *after* them, so navigating
  // between a normal page and /watch, /overlay, /championships or
  // /championship-teams changed the number of hooks rendered between two
  // renders of the same component and React threw
  // "Rendered fewer hooks than expected than the previous render".
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

  // Public routes — rendered without a player session. These must stay below
  // every hook call above and must not introduce hooks of their own here.
  if (location.startsWith("/watch/")) return <Switch><Route path="/watch/:matchId"><WatchMatch /></Route></Switch>;
  if (location.startsWith("/overlay/")) return <Switch><Route path="/overlay/:matchId"><WatchMatch overlay /></Route></Switch>;
  if (location.startsWith("/championships/")) return <Switch><Route path="/championships/:id" component={Championship} /></Switch>;
  if (location.startsWith("/championship-teams/")) return <Switch><Route path="/championship-teams/:id" component={ChampionshipTeam} /></Switch>;

  // Public auth pages — no player session required
  if (location === "/auth") {
    return (
      <Switch>
        <Route path="/auth" component={AuthPage} />
      </Switch>
    );
  }

  if (location === "/admin/login") {
    return (
      <Switch>
        <Route path="/admin/login" component={AdminLoginPage} />
      </Switch>
    );
  }

  if (location === "/commentator/login") {
    return (
      <Switch>
        <Route path="/commentator/login" component={CommentatorLoginPage} />
      </Switch>
    );
  }

  if (location === "/admin") {
    return <AdminRootRedirect />;
  }

  if (location === "/admin/dashboard") {
    if (isLoading) {
      return <AuthLoadingScreen />;
    }
    return (
      <Switch>
        <Route path="/admin/dashboard">
          <AdminGate>
            <AdminPanel />
          </AdminGate>
        </Route>
      </Switch>
    );
  }

  if (location === "/commentator" || location.startsWith("/commentator/")) {
    if (isLoading) {
      return <AuthLoadingScreen />;
    }
    return (
      <CommentatorGate>
        <Switch>
          <Route path="/commentator" component={CommentatorDashboard} />
          <Route path="/commentator/match/:matchId" component={CommentatorMatchDesk} />
          <Route component={NotFound} />
        </Switch>
      </CommentatorGate>
    );
  }

  // Single auth check for all protected player pages
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
      <Route path="/my-championship" component={MyChampionship} />
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
