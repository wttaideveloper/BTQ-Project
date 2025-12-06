import { Howl } from 'howler';

// Define sound effects - Family Feud style sounds
const SoundEffects = {
  // Primary correct answer sound - clear ding
  correct: new Howl({
    src: ['/sounds/correct.mp3', 'https://cdn.freesound.org/previews/171/171671_2437358-lq.mp3'],
    volume: 0.7,
    html5: true,
    preload: true,
  }),
  
  // Primary wrong answer sound - clear buzzer
  wrong: new Howl({
    src: ['/sounds/wrong.mp3', 'https://cdn.freesound.org/previews/171/171495_2437358-lq.mp3'],
    volume: 0.7,
    html5: true,
    preload: true,
  }),
  
  // Timeout sound
  timeout: new Howl({
    src: ['/sounds/timeout.mp3', 'https://cdn.freesound.org/previews/171/171493_2437358-lq.mp3'],
    volume: 0.6,
    html5: true,
    preload: true,
  }),
  
  // Game start sound - fanfare
  gameStart: new Howl({
    src: ['/sounds/gamestart.mp3', 'https://cdn.freesound.org/previews/171/171672_2437358-lq.mp3'],
    volume: 0.6,
    html5: true,
    preload: true,
  }),
  
  // Reward unlock sound
  reward: new Howl({
    src: ['/sounds/reward.mp3', 'https://cdn.freesound.org/previews/231/231156_3593436-lq.mp3'],
    volume: 0.6,
    html5: true,
    preload: true,
  }),
  
  // Crowd applause for correct answers
  applause: new Howl({
    src: ['/sounds/applause.mp3', 'https://cdn.freesound.org/previews/398/398008_4921277-lq.mp3'],
    volume: 0.5,
    html5: true,
    preload: true,
  }),
  
  // Game show buzzer - strong buzzing
  buzzer: new Howl({
    src: ['/sounds/buzzer.mp3', 'https://cdn.freesound.org/previews/528/528954_9237455-lq.mp3'],
    volume: 0.6,
    html5: true,
    preload: true,
  }),
  
  // Timer tick sound
  tick: new Howl({
    src: ['/sounds/tick.mp3', 'https://cdn.freesound.org/previews/262/262893_5011430-lq.mp3'],
    volume: 0.3,
    html5: true,
    preload: true,
  }),
  
  // Victory fanfare for game ending
  fanfare: new Howl({
    src: ['/sounds/fanfare.mp3', 'https://cdn.freesound.org/previews/371/371539_7040954-lq.mp3'],
    volume: 0.6,
    html5: true,
    preload: true,
  }),
  
  // Upbeat celebration for streaks
  celebration: new Howl({
    src: ['/sounds/celebration.mp3', 'https://cdn.freesound.org/previews/113/113989_761714-lq.mp3'],
    volume: 0.6,
    html5: true,
    preload: true,
  }),
  
  // Countdown timer alert when time running out
  countdownAlert: new Howl({
    src: ['/sounds/countdown.mp3', 'https://cdn.freesound.org/previews/480/480352_6299438-lq.mp3'],
    volume: 0.5,
    html5: true,
    preload: true,
  }),
  
  // 10 points sound - achievement ding
  points10: new Howl({
    src: ['/sounds/points10.mp3', 'https://cdn.freesound.org/previews/320/320181_5260872-lq.mp3'],
    volume: 0.5,
    html5: true,
    preload: true,
  }),
  
  // Perfect score sound - grand achievement
  perfectScore: new Howl({
    src: ['/sounds/perfect.mp3', 'https://cdn.freesound.org/previews/339/339435_5799023-lq.mp3'],
    volume: 0.6,
    html5: true,
    preload: true,
  }),
  
  // Strong correct sound - for streaks
  correctStreak: new Howl({
    src: ['/sounds/streak.mp3', 'https://cdn.freesound.org/previews/389/389638_7312427-lq.mp3'],
    volume: 0.6,
    html5: true,
    preload: true,
  }),
  
  // Wrong answer with crowd reaction
  wrongCrowd: new Howl({
    src: ['/sounds/crowd.mp3', 'https://cdn.freesound.org/previews/396/396960_5121236-lq.mp3'], 
    volume: 0.5,
    html5: true,
    preload: true,
  })
};

let soundEnabled = true;
let voiceEnabled = true;
let speakingInstance: SpeechSynthesisUtterance | null = null;

// Helper function to select the best male voice available
function selectMaleVoice(utterance: SpeechSynthesisUtterance, voices: SpeechSynthesisVoice[]) {
  // Prioritized list of known male voices across different platforms
  const maleVoiceKeywords = [
    'Male', 'Daniel', 'David', 'Mark', 'Josh', 'Guy', 'Tom', 'Nathan',
    'Microsoft David', 'Google UK English Male', 'US English Male'
  ];
  
  // Look for a voice with any of these keywords
  for (const keyword of maleVoiceKeywords) {
    const matchingVoice = voices.find(voice => 
      voice.name.includes(keyword) || 
      (voice.name.toLowerCase().includes('male') && !voice.name.toLowerCase().includes('female'))
    );
    
    if (matchingVoice) {
      utterance.voice = matchingVoice;
      console.log('Selected male voice:', matchingVoice.name);
      return;
    }
  }
  
  // If no specific male voice is found, try to find any voice with 'en-US' locale
  // that doesn't contain 'female' in the name
  const usVoice = voices.find(voice => 
    voice.lang === 'en-US' && 
    !voice.name.toLowerCase().includes('female')
  );
  
  if (usVoice) {
    utterance.voice = usVoice;
    console.log('Selected US voice:', usVoice.name);
    return;
  }
  
  // Last resort: use the first English voice
  const anyEnglishVoice = voices.find(voice => 
    voice.lang.startsWith('en') && 
    !voice.name.toLowerCase().includes('female')
  );
  
  if (anyEnglishVoice) {
    utterance.voice = anyEnglishVoice;
    console.log('Selected English voice:', anyEnglishVoice.name);
  } else {
    // Force lower pitch as fallback to make any voice sound more masculine
    utterance.pitch = 0.7;
    console.log('No male voice found, using default with lower pitch');
  }
}

// Initialize sounds
export function initSounds() {
  console.log("Initializing sound system...");
  
  // Preload sounds
  Object.values(SoundEffects).forEach(sound => {
    sound.load();
  });
  
  // Check browser audio capabilities
  const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
  if (AudioContext) {
    console.log("AudioContext is supported");
    try {
      const audioContext = new AudioContext();
      console.log("Audio context state:", audioContext.state);
    } catch (err) {
      console.error("Error creating audio context:", err);
    }
  } else {
    console.warn("AudioContext is not supported in this browser");
  }
  
  // Test a simple sound
  try {
    // Play and immediately stop to test if audio works
    const testId = SoundEffects.tick.play();
    SoundEffects.tick.stop(testId);
    console.log("Audio test completed");
  } catch (err) {
    console.error("Error during audio test:", err);
  }
  
  // Check if sound is enabled in localStorage
  const savedSoundPreference = localStorage.getItem('soundEnabled');
  if (savedSoundPreference) {
    soundEnabled = savedSoundPreference === 'true';
  }
  
  // Check if voice is enabled in localStorage
  const savedVoicePreference = localStorage.getItem('voiceEnabled');
  if (savedVoicePreference) {
    voiceEnabled = savedVoicePreference === 'true';
  }
  
  console.log("Sound system initialized", {
    soundEnabled,
    voiceEnabled
  });
}

// Play sound effect with error handling
export function playSound(sound: keyof typeof SoundEffects) {
  if (!soundEnabled) return;
  
  try {
    if (SoundEffects[sound]) {
      // Add event listeners for diagnostic purposes
      SoundEffects[sound].once('loaderror', (id: number, err: string) => {
        console.error(`Error loading sound ${sound}:`, err);
      });
      
      // Play the sound and return the ID
      const soundId = SoundEffects[sound].play();
      
      // Check if the sound played successfully
      if (soundId === undefined) {
        console.warn(`Could not play sound: ${sound}`);
      }
    } else {
      console.warn(`Sound not found: ${sound}`);
    }
  } catch (error) {
    console.error(`Error playing sound ${sound}:`, error);
  }
}

// Toggle sound on/off
export function toggleSound(enabled: boolean) {
  soundEnabled = enabled;
  localStorage.setItem('soundEnabled', enabled.toString());
  
  // Stop all sounds if disabling
  if (!enabled) {
    Object.values(SoundEffects).forEach(sound => {
      sound.stop();
    });
  }
}

// Check if sound is enabled
export function isSoundEnabled() {
  return soundEnabled;
}

// Toggle voice on/off
export function toggleVoice(enabled: boolean) {
  voiceEnabled = enabled;
  localStorage.setItem('voiceEnabled', enabled.toString());
  
  // Stop speaking if disabling
  if (!enabled && speakingInstance) {
    window.speechSynthesis.cancel();
  }
}

// Check if voice is enabled
export function isVoiceEnabled() {
  return voiceEnabled;
}

// Speak text using speech synthesis
export function speakText(text: string, rate: number = 1) {
  if (!voiceEnabled || !window.speechSynthesis) return;
  
  // Cancel any current speech
  if (speakingInstance) {
    window.speechSynthesis.cancel();
  }
  
  // Create speech instance
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = rate;
  utterance.pitch = 1;
  utterance.volume = 0.8;
  
  // Ensure a male voice on all devices
  // First attempt to load voices (they might not be ready yet)
  let voices = window.speechSynthesis.getVoices();
  
  // If no voices are available yet, wait for them to be loaded
  if (voices.length === 0) {
    // Set a default male-sounding voice by adjusting parameters
    utterance.pitch = 0.8; // Lower pitch for male voice
    
    // Try to get voices again after they load
    window.speechSynthesis.onvoiceschanged = () => {
      voices = window.speechSynthesis.getVoices();
      selectMaleVoice(utterance, voices);
    };
  } else {
    // Voices already loaded, select male voice
    selectMaleVoice(utterance, voices);
  }
  
  // Force a more masculine sound regardless of voice selection
  utterance.pitch = 0.8; // Lower pitch sounds more masculine
  
  // Store the instance
  speakingInstance = utterance;
  
  // Speak
  window.speechSynthesis.speak(utterance);
  
  // Clear the instance when done
  utterance.onend = () => {
    speakingInstance = null;
  };
}

// Stop speaking
export function stopSpeaking() {
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
    speakingInstance = null;
  }
}

// Positive feedback messages
export const positiveFeedbackMessages = [
  "Amen! That's correct!",
  "Hallelujah! You got it right!",
  "Praise the Lord! Perfect answer!",
  "Well done, good and faithful servant!",
  "Blessed are those who know the scriptures!",
  "Your knowledge shines like a light!",
  "The truth has set you free!",
  "Wonderful! Your faith is strong!",
  "Divine wisdom guides your answers!",
  "The Lord smiles upon your knowledge!"
];

// Negative feedback messages
export const negativeFeedbackMessages = [
  "Not quite right, but keep the faith!",
  "Let's study that scripture again together.",
  "The Lord gives wisdom to those who seek it!",
  "Try again! Persistence is a virtue.",
  "Remember, even Solomon had to learn!",
  "Fear not! We learn through our mistakes.",
  "Don't lose heart! Knowledge comes with study.",
  "Keep seeking the truth in scripture!",
  "The journey of faith includes learning!",
  "Let's reflect on this passage together."
];