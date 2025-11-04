import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { setupGameSocket, closeGameSocket } from '@/lib/socket';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { v4 as uuidv4 } from 'uuid';
import TeamMultiplayer from './TeamMultiplayer';

export interface GameConfig {
  gameMode: 'single' | 'multi';
  gameType: 'question' | 'time';
  category: string;
  difficulty: string;
  playerCount?: number;
  gameId?: string;
  playerNames?: string[];
  multiplayerType?: 'realtime' | 'async' | 'teams'; // Added team mode
}

interface GameSetupProps {
  onStartGame: (config: GameConfig) => void;
}

const GameSetup: React.FC<GameSetupProps> = ({ onStartGame }) => {
  // Get any initial selections from URL
  const search = typeof window !== 'undefined' ? window.location.search : '';
  const params = new URLSearchParams(search);
  const initialGameMode = params.get('mode') as 'single' | 'multi' || 'single';
  const initialGameType = params.get('gameType') as 'question' | 'time' || 'question';
  const initialCategory = params.get('category') || 'Bible Stories';
  const initialDifficulty = params.get('difficulty') || 'Beginner';
  
  const { user } = useAuth();
  const { toast } = useToast();
  const [gameId, setGameId] = useState<string>('');
  const [isCreatingGame, setIsCreatingGame] = useState<boolean>(false);
  const [isJoiningGame, setIsJoiningGame] = useState<boolean>(false);
  const [showJoinForm, setShowJoinForm] = useState<boolean>(false);
  
  const [config, setConfig] = useState<GameConfig>({
    gameMode: initialGameMode,
    gameType: initialGameType,
    category: initialCategory,
    difficulty: initialDifficulty,
    multiplayerType: 'realtime',
  });
  
  // Update the UI when the URL parameter changes
  useEffect(() => {
    setConfig(prev => ({
      ...prev,
      gameMode: initialGameMode,
      gameType: initialGameType,
      category: initialCategory,
      difficulty: initialDifficulty,
    }));
  }, [initialGameMode, initialGameType, initialCategory, initialDifficulty]);

  const [playerCount, setPlayerCount] = useState<number>(initialGameMode === 'multi' ? 2 : 1);
  const [playerNames, setPlayerNames] = useState<string[]>(['Player 1', 'Player 2', 'Player 3']);
  const [teamGameSessionId] = useState<string>(() => uuidv4()); // Stable ID for team mode
  
  // Update first player name to user's name if logged in
  useEffect(() => {
    if (user?.username) {
      setPlayerNames(prev => [user.username, ...prev.slice(1)]);
    }
  }, [user]);

  // Reset component state when mounted (returning from a game)
  useEffect(() => {
    console.log('🔄 GameSetup component mounted - performing full reset');
    
    // IMPORTANT: Close any existing WebSocket from previous games
    console.log('🔌 Closing any existing WebSocket connection...');
    closeGameSocket();
    console.log('✅ WebSocket closed');
    
    setShowJoinForm(false);
    setIsCreatingGame(false);
    setIsJoiningGame(false);
    setGameId('');
    
    // Clean up session storage
    sessionStorage.removeItem('currentGameId');
    sessionStorage.removeItem('questionRead');
    
    console.log('✅ GameSetup reset complete - ready for new game');
  }, []);
  
  // Multiplayer game functions
  const createMultiplayerGame = () => {
    if (!user) {
      toast({
        title: "Authentication Required",
        description: "You must be logged in to create a multiplayer game.",
        variant: "destructive"
      });
      return;
    }
    
    console.log('🎮 CREATE NEW GAME clicked - clearing ALL previous data');
    
    // STEP 1: Close old WebSocket connection completely
    console.log('🔌 Closing old WebSocket connection...');
    closeGameSocket();
    console.log('✅ Old WebSocket closed');
    
    // STEP 2: Clear ALL session storage from previous games
    sessionStorage.clear(); // Clear everything
    console.log('✅ All session storage cleared');
    
    // STEP 3: Reset all local state
    setGameId('');
    setIsJoiningGame(false);
    setShowJoinForm(true); // Keep the form showing
    console.log('✅ Local state reset');
    
    // STEP 4: Set creating state
    setIsCreatingGame(true);
    
    // STEP 5: Generate completely new game ID
    const newGameId = uuidv4().substring(0, 8);
    setGameId(newGameId);
    console.log('✅ New Game ID generated:', newGameId);
    
    // STEP 6: Store only the new game ID
    sessionStorage.setItem('currentGameId', newGameId);
    
    // STEP 7: Create FRESH WebSocket connection
    console.log('🔌 Creating fresh WebSocket connection...');
    const socket = setupGameSocket();
    console.log('✅ Fresh WebSocket created');
    
    // STEP 9: Setup event handlers
    let cleanupDone = false;
    let timeoutId: NodeJS.Timeout;
    
    const cleanup = () => {
      if (cleanupDone) return;
      cleanupDone = true;
      
      console.log('🧹 Cleaning up WebSocket listeners and timeout');
      socket.removeEventListener('open', handleOpen);
      socket.removeEventListener('message', handleMessage);
      socket.removeEventListener('error', handleError);
      if (timeoutId) clearTimeout(timeoutId);
    };
    
    const handleOpen = () => {
      console.log('📡 WebSocket OPEN event fired - sending create_game message');
      
      // Send the create game message
      socket.send(JSON.stringify({
        type: 'create_game',
        playerName: user.username,
        gameId: newGameId,
        gameConfig: {
          gameType: config.gameType,
          category: config.category,
          difficulty: config.difficulty,
          playerCount,
          playerNames: playerNames.slice(0, playerCount)
        }
      }));
      
      console.log('📤 create_game message sent to server');
    };
    
    const handleMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        console.log('📨 WebSocket message:', data.type);
        
        if (data.type === 'game_created') {
          console.log('✅ Game created successfully!');
          
          toast({
            title: "Game Created",
            description: `Game ID: ${data.gameId}. Share this with other players to join.`,
          });
          
          // Clean up everything
          cleanup();
          
          // Start the game
          onStartGame({
            ...config,
            playerCount,
            gameId: data.gameId,
            playerNames: playerNames.slice(0, playerCount)
          });
          
          setIsCreatingGame(false);
        }
      } catch (err) {
        console.error('❌ Failed to parse WebSocket message:', err);
        cleanup();
        setIsCreatingGame(false);
      }
    };
    
    const handleError = () => {
      console.error('❌ WebSocket connection error');
      toast({
        title: "Connection Error",
        description: "Failed to create game. Please try again.",
        variant: "destructive"
      });
      cleanup();
      setIsCreatingGame(false);
    };
    
    socket.addEventListener('open', handleOpen);
    socket.addEventListener('message', handleMessage);
    socket.addEventListener('error', handleError);
    
    // STEP 10: Timeout to prevent infinite "Creating..." state
    timeoutId = setTimeout(() => {
      console.log('⏱️ Game creation timeout (10s) - cleaning up');
      cleanup();
      setIsCreatingGame(false);
      toast({
        title: "Timeout",
        description: "Game creation timed out. Please try again.",
        variant: "destructive"
      });
    }, 10000);
    
    console.log('✅ All handlers setup complete, waiting for server response...');
  };
  
  const joinMultiplayerGame = () => {
    if (!user) {
      toast({
        title: "Authentication Required",
        description: "You must be logged in to join a multiplayer game.",
        variant: "destructive"
      });
      return;
    }
    
    if (!gameId) {
      toast({
        title: "Game ID Required",
        description: "Please enter a valid Game ID to join.",
        variant: "destructive"
      });
      return;
    }
    
    console.log('🎮 JOIN GAME clicked - clearing ALL previous data');
    
    // STEP 1: Close old WebSocket connection completely
    console.log('🔌 Closing old WebSocket connection...');
    closeGameSocket();
    console.log('✅ Old WebSocket closed');
    
    // STEP 2: Clear ALL session storage from previous games
    sessionStorage.clear(); // Clear everything
    console.log('✅ All session storage cleared');
    
    // STEP 3: Reset state
    setIsCreatingGame(false);
    console.log('✅ Local state reset');
    
    // STEP 4: Set joining state
    setIsJoiningGame(true);
    
    // STEP 5: Store the game ID we're joining
    sessionStorage.setItem('currentGameId', gameId);
    console.log('✅ Joining game ID:', gameId);
    
    // STEP 6: Create FRESH WebSocket connection
    console.log('🔌 Creating fresh WebSocket connection...');
    const socket = setupGameSocket();
    console.log('✅ Fresh WebSocket created');
    
    // STEP 7: Setup event handlers
    let cleanupDone = false;
    let timeoutId: NodeJS.Timeout;
    
    const cleanup = () => {
      if (cleanupDone) return;
      cleanupDone = true;
      
      console.log('🧹 Cleaning up WebSocket listeners and timeout');
      socket.removeEventListener('open', handleOpen);
      socket.removeEventListener('message', handleMessage);
      socket.removeEventListener('error', handleError);
      if (timeoutId) clearTimeout(timeoutId);
    };
    
    const handleOpen = () => {
      console.log('📡 WebSocket OPEN event fired - sending join_game message');
      
      // Send the join game message
      socket.send(JSON.stringify({
        type: 'join_game',
        playerName: user.username,
        gameId
      }));
      
      console.log('📤 join_game message sent to server');
    };
    
    const handleMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        console.log('📨 WebSocket message:', data.type);
        
        if (data.type === 'player_joined') {
          console.log('✅ Successfully joined game!');
          
          toast({
            title: "Game Joined",
            description: `Successfully joined the game.`,
          });
          
          // Clean up everything
          cleanup();
          
          // Start the game
          onStartGame({
            ...config,
            playerCount,
            gameId,
            playerNames: playerNames.slice(0, playerCount)
          });
          
          setIsJoiningGame(false);
        } else if (data.type === 'error') {
          console.log('❌ Error joining game:', data.message);
          toast({
            title: "Failed to Join Game",
            description: data.message,
            variant: "destructive"
          });
          cleanup();
          setIsJoiningGame(false);
        }
      } catch (err) {
        console.error('❌ Failed to parse WebSocket message:', err);
        cleanup();
        setIsJoiningGame(false);
      }
    };
    
    const handleError = () => {
      console.error('❌ WebSocket connection error');
      toast({
        title: "Connection Error",
        description: "Failed to join game. Please try again.",
        variant: "destructive"
      });
      cleanup();
      setIsJoiningGame(false);
    };
    
    socket.addEventListener('open', handleOpen);
    socket.addEventListener('message', handleMessage);
    socket.addEventListener('error', handleError);
    
    // STEP 8: Timeout to prevent infinite "Joining..." state
    timeoutId = setTimeout(() => {
      console.log('⏱️ Game join timeout (10s) - cleaning up');
      cleanup();
      setIsJoiningGame(false);
      toast({
        title: "Timeout",
        description: "Failed to join game. Please try again.",
        variant: "destructive"
      });
    }, 10000);
    
    console.log('✅ All handlers setup complete, waiting for server response...');
  };

  const handleStartGame = () => {
    if (config.gameMode === 'single') {
      console.log('🎮 Starting SINGLE PLAYER - clearing ALL previous data');
      
      // Clear ALL session storage for single player
      sessionStorage.clear();
      console.log('✅ All session storage cleared for single player');
      
      // Single player game
      onStartGame({
        ...config,
        playerCount: 1,
        playerNames: [playerNames[0]]
      });
    } else if (config.gameMode === 'multi' && config.multiplayerType === 'async') {
      // Redirect to challenges page for async mode
      window.location.href = '/challenges';
    } else if (config.gameMode === 'multi' && config.multiplayerType === 'teams') {
      // Team mode - handled by TeamMultiplayer component
      return;
    } else {
      // Real-time multiplayer
      // Validate player names for multiplayer
      const requiredPlayers = Array.from({length: playerCount}).map((_, i) => i);
      const emptyNames = requiredPlayers.filter(i => !playerNames[i]?.trim());
      
      if (emptyNames.length > 0) {
        toast({
          title: "Missing Player Names",
          description: "Please enter names for all players before continuing.",
          variant: "destructive"
        });
        return;
      }
      
      // Multiplayer game - show join/create options
      setShowJoinForm(true);
    }
  };

  const handleTeamReady = (teamId: string) => {
    onStartGame({
      ...config,
      playerCount: 6, // 2 teams of 3 players each
      gameId: teamId,
      multiplayerType: 'teams'
    });
  };

  return (
    <div className="modal-animation fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto py-10">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl p-6 mx-4 my-auto max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <Button 
            variant="outline" 
            className="flex items-center gap-2"
            onClick={() => window.location.href = '/'}
          >
            <span>← Home</span>
          </Button>
          <div></div>
        </div>
        <div className="text-center mb-6">
          <h1 className="game-title text-3xl font-heading font-bold text-primary mb-2">
            Faith<span className="text-accent">IQ</span>
          </h1>
          <p className="text-neutral-600">Test your Bible knowledge with our interactive trivia game!</p>
        </div>
        
        {/* Game Setup Options */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div>
            <h3 className="font-heading font-semibold text-lg text-neutral-800 mb-3">Game Mode</h3>
            <RadioGroup 
              value={config.gameMode} 
              onValueChange={(value) => setConfig({...config, gameMode: value as 'single' | 'multi'})}
              className="space-y-2"
            >
              <div className="flex items-center p-3 border rounded-lg cursor-pointer bg-neutral-100 hover:bg-neutral-200">
                <RadioGroupItem value="single" id="single" className="mr-3" />
                <Label htmlFor="single" className="cursor-pointer flex-1">
                  <p className="font-medium text-neutral-800">Single Player</p>
                  <p className="text-sm text-neutral-600">Play solo and earn rewards</p>
                </Label>
              </div>
              <div className="flex items-center p-3 border rounded-lg cursor-pointer bg-neutral-100 hover:bg-neutral-200">
                <RadioGroupItem value="multi" id="multi" className="mr-3" />
                <Label htmlFor="multi" className="cursor-pointer flex-1">
                  <p className="font-medium text-neutral-800">Multiplayer</p>
                  <p className="text-sm text-neutral-600">Compete with up to 3 players</p>
                </Label>
              </div>
            </RadioGroup>

            {config.gameMode === 'multi' && (
              <>
                <div className="mt-3">
                  <Label htmlFor="multiplayerType" className="font-medium text-neutral-800 mb-2 block">
                    Multiplayer Type
                  </Label>
                  <RadioGroup 
                    value={config.multiplayerType} 
                    onValueChange={(value) => setConfig({...config, multiplayerType: value as 'realtime' | 'async' | 'teams'})}
                    className="space-y-2"
                  >
                    <div className="flex items-center p-3 border rounded-lg cursor-pointer bg-neutral-100 hover:bg-neutral-200">
                      <RadioGroupItem value="realtime" id="realtime" className="mr-3" />
                      <Label htmlFor="realtime" className="cursor-pointer flex-1">
                        <p className="font-medium text-neutral-800">Real-time</p>
                        <p className="text-sm text-neutral-600">Play together simultaneously</p>
                      </Label>
                    </div>
                    {/* <div className="flex items-center p-3 border rounded-lg cursor-pointer bg-neutral-100 hover:bg-neutral-200">
                      <RadioGroupItem value="teams" id="teams" className="mr-3" />
                      <Label htmlFor="teams" className="cursor-pointer flex-1">
                        <p className="font-medium text-neutral-800">Team Battle</p>
                        <p className="text-sm text-neutral-600">2 teams of 3 players each compete</p>
                      </Label>
                    </div> */}
                    {/* <div className="flex items-center p-3 border rounded-lg cursor-pointer bg-neutral-100 hover:bg-neutral-200">
                      <RadioGroupItem value="async" id="async" className="mr-3" />
                      <Label htmlFor="async" className="cursor-pointer flex-1">
                        <p className="font-medium text-neutral-800">Challenge</p>
                        <p className="text-sm text-neutral-600">Play asynchronously (turn-based)</p>
                      </Label>
                    </div> */}
                  </RadioGroup>
                </div>
                
                {config.multiplayerType === 'realtime' && (
                <div className="mt-3">
                  <Label htmlFor="playerCount" className="font-medium text-neutral-800 mb-2 block">
                    Number of Players
                  </Label>
                  <Select 
                    value={playerCount.toString()} 
                    onValueChange={(value) => setPlayerCount(parseInt(value))}
                  >
                    <SelectTrigger className="w-full p-3 bg-neutral-100">
                      <SelectValue placeholder="Select player count" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2">2 Players</SelectItem>
                      <SelectItem value="3">3 Players</SelectItem>
                    </SelectContent>
                  </Select>
                </div>)}
                
                {config.multiplayerType === 'realtime' && (
                  <div className="mt-3 border p-3 rounded-lg bg-neutral-50">
                    <Label className="font-medium text-neutral-800 mb-2 block">Player Names</Label>
                    
                    {Array.from({length: playerCount}).map((_, index) => (
                      <div className="flex items-center gap-2 mb-2" key={index}>
                        <div className={`h-6 w-6 rounded-full text-xs flex items-center justify-center ${
                          index === 0 ? 'bg-blue-500 text-white' : 
                          index === 1 ? 'bg-green-500 text-white' : 
                          'bg-orange-500 text-white'
                        }`}>
                          {index + 1}
                        </div>
                        <Input 
                          value={playerNames[index]} 
                          onChange={(e) => {
                            const newNames = [...playerNames];
                            newNames[index] = e.target.value;
                            setPlayerNames(newNames);
                          }}
                          placeholder={`Player ${index + 1}`}
                          className="flex-1"
                          disabled={index === 0 && Boolean(user)}
                        />
                      </div>
                    ))}
                    
                    <p className="text-xs text-neutral-500 mt-1">
                      {user ? 'Your username is locked as Player 1' : 'Enter names for all players'}
                    </p>
                  </div>
                )}
                
                {/* {config.multiplayerType === 'async' && (
                  <div className="mt-3 border p-3 rounded-lg bg-neutral-50">
                    <Label className="font-medium text-neutral-800 mb-2 block">Challenge Mode</Label>
                    <p className="text-sm text-neutral-600 mb-2">
                      In Challenge Mode, you'll create challenges that other players can accept and complete on their own schedule.
                    </p>
                    <p className="text-xs text-neutral-500">
                      Use the dedicated Challenge page to send challenges to specific players.
                    </p>
                  </div>
                )} */}

                {config.multiplayerType === 'teams' && (
                  <div className="mt-3">
                    <TeamMultiplayer 
                      gameSessionId={teamGameSessionId}
                      onTeamReady={handleTeamReady}
                    />
                  </div>
                )}
              </>
            )}
          </div>
          
          <div>
            <h3 className="font-heading font-semibold text-lg text-neutral-800 mb-3">Game Configuration</h3>
            <div className="p-4 border rounded-lg bg-neutral-50">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-neutral-600">Type:</span>
                  <p className="font-medium text-neutral-800">
                    {config.gameType === 'question' ? 'Question-Based' : 'Time-Based'}
                  </p>
                </div>
                <div>
                  <span className="text-neutral-600">Difficulty:</span>
                  <p className="font-medium text-neutral-800">{config.difficulty}</p>
                </div>
                <div className="col-span-2">
                  <span className="text-neutral-600">Category:</span>
                  <p className="font-medium text-neutral-800">{config.category}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Show multiplayer options if appropriate */}
        {showJoinForm && config.gameMode === 'multi' && config.multiplayerType === 'realtime' ? (
          <div className="mt-6 border-t pt-6">
            <h3 className="font-heading font-semibold text-lg text-neutral-800 mb-3 text-center">Real-Time Multiplayer Options</h3>
            
            <div className="grid grid-cols-1 gap-4 max-h-[60vh] overflow-y-auto p-2">
              <div className="sticky top-0 z-10 bg-white pb-2 flex justify-between items-center">
                <Button 
                  onClick={() => {
                    console.log('⬅️ Back button clicked - resetting state');
                    setShowJoinForm(false);
                    setIsCreatingGame(false);
                    setIsJoiningGame(false);
                    setGameId('');
                  }}
                  variant="outline" 
                  className="w-1/3"
                >
                  ← Back
                </Button>
                
                <Button 
                  onClick={createMultiplayerGame}
                  disabled={isCreatingGame}
                  className="w-2/3 bg-accent hover:bg-accent/90 text-primary font-bold py-2 ml-2"
                >
                  {isCreatingGame ? 'Creating...' : '✓ Create New Game'}
                </Button>
              </div>
              
              <div className="p-4 border rounded-lg bg-neutral-50 mt-2">
                <h4 className="font-medium mb-2">Join Existing Game</h4>
                <div className="flex gap-2">
                  <Input 
                    placeholder="Enter Game ID" 
                    value={gameId}
                    onChange={(e) => setGameId(e.target.value)} 
                    className="flex-grow"
                  />
                  <Button 
                    onClick={joinMultiplayerGame}
                    disabled={isJoiningGame || !gameId}
                    className="bg-secondary text-white font-bold"
                  >
                    {isJoiningGame ? 'Joining...' : 'Join'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex justify-center mt-6 mb-16">
            <Button 
              onClick={handleStartGame}
              className="bg-accent text-primary px-8 py-4 rounded-lg hover:bg-accent/90 font-heading font-bold text-lg shadow-xl border-2 border-accent/70 animate-pulse-slow fixed bottom-10 left-1/2 transform -translate-x-1/2 z-10"
            >
              {config.gameMode === 'single' ? 'Start Game' : 'Continue to Multiplayer →'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export { GameSetup };
export default GameSetup;
