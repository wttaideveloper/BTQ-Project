import React from 'react';
import { Button } from './ui/button';
import { playSound, toggleSound, isSoundEnabled } from '@/lib/sounds';
import { playBasicSound, toggleBasicSound, SoundName } from '@/lib/basic-sound';

/**
 * Simple component for testing both sound systems
 */
const SoundTest: React.FC = () => {
  const [soundEnabled, setSoundEnabled] = React.useState(isSoundEnabled());
  
  // Toggle sound system between enabled/disabled
  const handleToggleSound = () => {
    const newState = !soundEnabled;
    setSoundEnabled(newState);
    toggleSound(newState);
    toggleBasicSound(newState);
  };
  
  // Test Howler.js sound
  const testHowlerSound = (soundName: string) => {
    console.log(`Testing Howler sound: ${soundName}`);
    // @ts-ignore - we're accepting any string here for testing
    playSound(soundName);
  };
  
  // Test basic Audio API sound
  const testBasicSound = (soundName: SoundName) => {
    console.log(`Testing basic sound: ${soundName}`);
    playBasicSound(soundName);
  };
  
  // Available sounds for testing
  const soundNames = ['correct', 'wrong', 'applause', 'buzzer', 'celebration', 'fanfare'];
  
  return (
    <div className="p-4 bg-gray-100 rounded-lg mb-4">
      <h3 className="text-lg font-bold mb-2">Sound Test Panel</h3>
      
      <div className="mb-4">
        <Button 
          onClick={handleToggleSound}
          variant={soundEnabled ? "default" : "outline"}
          className="mb-2 w-full"
        >
          Sound: {soundEnabled ? "ON" : "OFF"}
        </Button>
        
        <div className="text-sm text-gray-500 mb-2">
          Sound system state: {soundEnabled ? "Enabled" : "Disabled"}
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-2 mb-4">
        <div>
          <h4 className="text-sm font-bold mb-1">Howler Sounds:</h4>
          <div className="grid grid-cols-2 gap-1">
            {soundNames.map(sound => (
              <Button 
                key={`howler-${sound}`}
                size="sm"
                variant="outline"
                onClick={() => testHowlerSound(sound)}
                className="text-xs"
                disabled={!soundEnabled}
              >
                {sound}
              </Button>
            ))}
          </div>
        </div>
        
        <div>
          <h4 className="text-sm font-bold mb-1">Basic Audio API:</h4>
          <div className="grid grid-cols-2 gap-1">
            {soundNames.map(sound => (
              <Button 
                key={`basic-${sound}`}
                size="sm"
                variant="outline"
                onClick={() => testBasicSound(sound as SoundName)}
                className="text-xs"
                disabled={!soundEnabled}
              >
                {sound}
              </Button>
            ))}
          </div>
        </div>
      </div>
      
      <div className="text-xs text-gray-500">
        Note: You can use this panel to test both sound systems. If Howler.js doesn't work,
        the basic Audio API fallback should still function.
      </div>
    </div>
  );
};

export default SoundTest;