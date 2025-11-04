// Voice service for ElevenLabs voice cloning

interface VoiceStatus {
  hasVoiceClone: boolean;
  voiceId?: string;
  name?: string;
  description?: string;
}

interface TTSResponse {
  audio: string;
  format: string;
}

class VoiceService {
  private static instance: VoiceService;
  private voiceStatus: VoiceStatus | null = null;
  private audioCache: Map<string, HTMLAudioElement> = new Map();
  private isSpeaking: boolean = false;
  private speechQueue: string[] = [];
  private currentSpeechStartTime: number | null = null;
  private currentSpeechText: string = '';
  private isStopped: boolean = false;

  static getInstance(): VoiceService {
    if (!VoiceService.instance) {
      VoiceService.instance = new VoiceService();
    }
    return VoiceService.instance;
  }

  // Get current voice clone status
  async getVoiceStatus(): Promise<VoiceStatus> {
    try {
      const response = await fetch('/api/voice/status');
      if (!response.ok) {
        throw new Error('Failed to get voice status');
      }
      
      const status = await response.json();
      this.voiceStatus = status;
      return status;
    } catch (error) {
      console.error('Error getting voice status:', error);
      return { hasVoiceClone: false };
    }
  }

  // Speak text using cloned voice
  async speakWithClonedVoice(text: string): Promise<void> {
    // Check if voice service has been stopped
    if (this.isStopped) {
      console.log('⚠️ Voice service stopped, skipping narration:', text.substring(0, 50) + '...');
      return;
    }

    // Check if we're already speaking the exact same text (prevents duplicate overlap)
    if (this.isSpeaking && this.currentSpeechText === text) {
      console.log('⚠️ Skipping duplicate narration:', text.substring(0, 50) + '...');
      return;
    }
    
    // If already speaking, stop current speech and start new one immediately for smoother transitions
    if (this.isSpeaking) {
      console.log('Voice already speaking, stopping current and starting new:', text.substring(0, 50) + '...');
      this.stopAllAudio(false); // Stop current but allow new narration
      // Wait a moment for the stop to take effect
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log('Starting to speak:', text.substring(0, 50) + '...');
    this.isSpeaking = true;
    this.currentSpeechStartTime = Date.now();
    this.currentSpeechText = text;

    // Add natural pauses to slow down speech
    const slowedText = this.addNaturalPauses(text);

    try {
      // Check if we have a voice clone
      if (!this.voiceStatus?.hasVoiceClone) {
        console.warn('No voice clone available, falling back to default speech');
        this.fallbackToDefaultSpeech(text);
        this.isSpeaking = false;
        this.processQueue();
        return;
      }

      const response = await fetch('/api/voice/speak', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: slowedText }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate speech');
      }

      const data: TTSResponse = await response.json();
      
      // Convert base64 to audio and play
      await this.playAudioFromBase64(data.audio);
      
      // The queue will be processed automatically when audio ends
    } catch (error) {
      console.error('Error speaking with cloned voice:', error);
      // Fall back to default speech synthesis
      this.fallbackToDefaultSpeech(text);
      this.isSpeaking = false;
      this.processQueue();
    }
  }

  // Process the speech queue
  private async processQueue(): Promise<void> {
    console.log(`Queue status: ${this.speechQueue.length} items, speaking: ${this.isSpeaking}, stopped: ${this.isStopped}`);
    if (this.speechQueue.length > 0 && !this.isSpeaking && !this.isStopped) {
      const nextText = this.speechQueue.shift();
      if (nextText) {
        console.log('Processing queued speech:', nextText.substring(0, 50) + '...');
        await this.speakWithClonedVoice(nextText);
      }
    } else if (this.speechQueue.length === 0) {
      console.log('Queue is empty, voice system ready');
    }
  }

  // Play audio from base64 string
  private async playAudioFromBase64(base64Audio: string): Promise<void> {
    try {
      // Check cache first
      if (this.audioCache.has(base64Audio)) {
        const audio = this.audioCache.get(base64Audio)!;
        audio.currentTime = 0;
        
        // Remove existing event listeners to prevent duplicates
        audio.removeEventListener('ended', this.handleAudioEnd);
        audio.removeEventListener('error', this.handleAudioError);
        
        // Add event listeners
        audio.addEventListener('ended', this.handleAudioEnd);
        audio.addEventListener('error', this.handleAudioError);
        
        await audio.play();
        return;
      }

      // Create new audio element
      const audio = new Audio(`data:audio/mp3;base64,${base64Audio}`);
      audio.preload = 'auto';
      
      // Cache the audio
      this.audioCache.set(base64Audio, audio);
      
      // Add event listeners
      audio.addEventListener('ended', this.handleAudioEnd);
      audio.addEventListener('error', this.handleAudioError);
      
      // Play the audio
      await audio.play();
    } catch (error) {
      console.error('Error playing audio:', error);
      this.isSpeaking = false;
      this.processQueue();
      throw error;
    }
  }

  // Handle audio end event
  private handleAudioEnd = () => {
    console.log('Audio finished, processing queue...');
    this.isSpeaking = false;
    this.currentSpeechStartTime = null;
    this.currentSpeechText = '';
    this.processQueue();
  };

  // Handle audio error event
  private handleAudioError = () => {
    console.log('Audio error, processing queue...');
    this.isSpeaking = false;
    this.currentSpeechStartTime = null;
    this.currentSpeechText = '';
    this.processQueue();
  };

  // Fallback to default speech synthesis
  private fallbackToDefaultSpeech(text: string): void {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1;
      utterance.pitch = 0.8;
      utterance.volume = 0.8;
      
      // Try to select a male voice
      const voices = window.speechSynthesis.getVoices();
      const maleVoice = voices.find(voice => 
        voice.name.toLowerCase().includes('male') && 
        !voice.name.toLowerCase().includes('female')
      );
      
      if (maleVoice) {
        utterance.voice = maleVoice;
      }
      
      window.speechSynthesis.speak(utterance);
    }
  }

  // Stop all audio playback. If blockNew is true, prevent any new narration from starting
  stopAllAudio(blockNew: boolean = false): void {
    console.log('🛑 Stopping all audio and voice narration', { blockNew });
    
    // Optionally set stopped flag to prevent new speech
    this.isStopped = blockNew;
    
    this.audioCache.forEach(audio => {
      audio.pause();
      audio.currentTime = 0;
    });
    
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    
    // Clear speech queue and reset speaking state
    this.speechQueue = [];
    this.isSpeaking = false;
    this.currentSpeechStartTime = null;
    this.currentSpeechText = '';
  }

  // Reset the stopped flag (call when starting a new game)
  reset(): void {
    console.log('🔄 Resetting voice service');
    this.isStopped = false;
  }

  // Get current speech information for pause/resume
  getCurrentSpeechInfo(): { text: string; startTime: number | null; isSpeaking: boolean } {
    return {
      text: this.currentSpeechText,
      startTime: this.currentSpeechStartTime,
      isSpeaking: this.isSpeaking
    };
  }

  // Clear audio cache
  clearCache(): void {
    this.audioCache.clear();
  }

  // Check if voice cloning is available
  isVoiceCloningAvailable(): boolean {
    return this.voiceStatus?.hasVoiceClone || false;
  }

  // Get voice clone info
  getVoiceCloneInfo(): { name?: string; description?: string } {
    return {
      name: this.voiceStatus?.name,
      description: this.voiceStatus?.description,
    };
  }

  // Check if currently speaking
  isCurrentlySpeaking(): boolean {
    return this.isSpeaking;
  }

  // Get queue length
  getQueueLength(): number {
    return this.speechQueue.length;
  }

  // Add natural pauses to slow down speech
  private addNaturalPauses(text: string): string {
    // Add pauses after punctuation and at natural break points
    let slowedText = text
      // Add longer pauses after sentences
      .replace(/\./g, '... ')
      .replace(/\!/g, '!... ')
      .replace(/\?/g, '?... ')
      // Add shorter pauses after commas
      .replace(/,/g, ',.. ')
      // Add pauses after colons
      .replace(/:/g, ':.. ')
      // Add pauses after question numbers
      .replace(/(Question \d+):/g, '$1... ')
      // Clean up multiple spaces
      .replace(/\s+/g, ' ')
      .trim();
    
    return slowedText;
  }
}

// Export singleton instance
export const voiceService = VoiceService.getInstance();

// Export types
export type { VoiceStatus, TTSResponse }; 