import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { ChallengePanel } from '@/components/ChallengePanel';
import { NotificationPanel } from '@/components/NotificationPanel';
import { setupGameSocket } from '@/lib/socket';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { User, Trophy, Medal } from 'lucide-react';

export default function ChallengesPage() {
  const { user } = useAuth();

  // Setup socket connection for real-time updates
  useEffect(() => {
    if (user?.id) {
      setupGameSocket(user.id);
    }
  }, [user?.id]);

  return (
    <div className="container max-w-screen-xl mx-auto bg-background">
      <div className="flex justify-between items-center p-4 border-b bg-white shadow-sm">
        <div className="flex items-center gap-4">
          <Button 
            variant="outline" 
            className="flex items-center gap-2"
            onClick={() => window.location.href = '/'}
          >
            <span>← Home</span>
          </Button>
          <h1 className="text-2xl font-bold text-primary-foreground">Bible Trivia Challenges</h1>
        </div>
        <div className="flex items-center gap-4">
          <NotificationPanel />
          <div className="flex items-center gap-2">
            <Button variant="ghost" className="flex items-center gap-2">
              <User className="h-5 w-5" />
              <span>{user?.username || 'User'}</span>
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 p-4">
        <div className="md:col-span-2">
          <ChallengePanel />
        </div>
        
        <div className="space-y-6">
          <div className="bg-card rounded-lg border shadow-sm p-4">
            <h2 className="text-xl font-semibold mb-4 flex items-center">
              <Trophy className="h-5 w-5 mr-2 text-yellow-500" />
              Your Stats
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-muted rounded-md p-3 text-center">
                <p className="text-sm text-muted-foreground">Games</p>
                <p className="text-2xl font-bold">{user?.totalGames || 0}</p>
              </div>
              <div className="bg-muted rounded-md p-3 text-center">
                <p className="text-sm text-muted-foreground">Win Rate</p>
                <p className="text-2xl font-bold">
                  {user?.totalGames && user?.wins && user.totalGames > 0 ? 
                    Math.round((user.wins / user.totalGames) * 100) : 0}%
                </p>
              </div>
              <div className="bg-muted rounded-md p-3 text-center">
                <p className="text-sm text-muted-foreground">Wins</p>
                <p className="text-2xl font-bold text-green-500">{user?.wins || 0}</p>
              </div>
              <div className="bg-muted rounded-md p-3 text-center">
                <p className="text-sm text-muted-foreground">Losses</p>
                <p className="text-2xl font-bold text-red-500">{user?.losses || 0}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-card rounded-lg border shadow-sm p-4">
            <h2 className="text-xl font-semibold mb-4 flex items-center">
              <Medal className="h-5 w-5 mr-2 text-blue-500" />
              How It Works
            </h2>
            <div className="space-y-3 text-sm">
              <div>
                <h3 className="font-medium mb-1">Challenge a Friend</h3>
                <p className="text-muted-foreground">
                  Send a challenge to any registered player. Pick a category and difficulty level.
                </p>
              </div>
              <Separator />
              <div>
                <h3 className="font-medium mb-1">Answer Questions</h3>
                <p className="text-muted-foreground">
                  Each player answers 10 Bible trivia questions independently at their own time.
                </p>
              </div>
              <Separator />
              <div>
                <h3 className="font-medium mb-1">Compare Results</h3>
                <p className="text-muted-foreground">
                  Once both players complete their rounds, scores are compared to determine the winner.
                </p>
              </div>
              <Separator />
              <div>
                <h3 className="font-medium mb-1">Build Your Reputation</h3>
                <p className="text-muted-foreground">
                  Win challenges to improve your stats and climb the leaderboard.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}