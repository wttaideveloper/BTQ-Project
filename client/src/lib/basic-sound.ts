// A simple audio fallback system when Howler.js doesn't work
let soundEnabled = true;

export type SoundName = 
  | 'correct' 
  | 'wrong' 
  | 'timeout' 
  | 'gameStart' 
  | 'reward' 
  | 'applause' 
  | 'buzzer'
  | 'fanfare'
  | 'celebration';

const soundUrlMap: Record<SoundName, string> = {
  correct: 'https://cdn.freesound.org/previews/171/171671_2437358-lq.mp3',
  wrong: 'https://cdn.freesound.org/previews/171/171495_2437358-lq.mp3',
  timeout: 'https://cdn.freesound.org/previews/171/171493_2437358-lq.mp3',
  gameStart: 'https://cdn.freesound.org/previews/171/171672_2437358-lq.mp3',
  reward: 'https://cdn.freesound.org/previews/231/231156_3593436-lq.mp3',
  applause: 'https://cdn.freesound.org/previews/398/398008_4921277-lq.mp3',
  buzzer: 'https://cdn.freesound.org/previews/528/528954_9237455-lq.mp3',
  fanfare: 'https://cdn.freesound.org/previews/371/371539_7040954-lq.mp3',
  celebration: 'https://cdn.freesound.org/previews/113/113989_761714-lq.mp3'
};

// Cache audio elements to avoid creating too many instances
const audioCache: Partial<Record<SoundName, HTMLAudioElement>> = {};

/**
 * Play a sound using native Audio API as a fallback
 */
export function playBasicSound(soundName: SoundName) {
  if (!soundEnabled) return;
  
  try {
    // Create audio element if it doesn't exist yet
    if (!audioCache[soundName]) {
      const soundUrl = soundUrlMap[soundName];
      if (!soundUrl) {
        console.warn(`No URL for sound: ${soundName}`);
        return;
      }
      
      const audio = new Audio(soundUrl);
      audio.preload = 'auto';
      audioCache[soundName] = audio;
    }
    
    const audioElement = audioCache[soundName];
    if (audioElement) {
      // Reset and play
      audioElement.currentTime = 0;
      
      // Create a play promise and handle potential errors
      const playPromise = audioElement.play();
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          console.warn(`Error playing sound ${soundName}:`, error);
        });
      }
    }
  } catch (error) {
    console.error(`Failed to play sound ${soundName}:`, error);
  }
}

export function toggleBasicSound(enabled: boolean) {
  soundEnabled = enabled;
  
  // Stop all sounds if disabling
  if (!enabled) {
    Object.values(audioCache).forEach(audio => {
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
    });
  }
}

// Initialize by preloading all sounds
export function initBasicSounds() {
  console.log("Initializing basic sound fallback system...");
  
  // Preload all sounds
  Object.entries(soundUrlMap).forEach(([name, url]) => {
    try {
      const audio = new Audio();
      audio.src = url;
      audio.preload = 'auto';
      audioCache[name as SoundName] = audio;
      
      // Add load event listener
      audio.addEventListener('canplaythrough', () => {
        console.log(`Sound ${name} preloaded successfully`);
      });
      
      // Add error listener
      audio.addEventListener('error', (e) => {
        console.error(`Error preloading sound ${name}:`, e);
      });
    } catch (error) {
      console.error(`Failed to preload sound ${name}:`, error);
    }
  });
}