export interface ChatMessage {
  sender: 'user' | 'system';
  text?: string;
  audioUrl?: string;
  key?: string;
  time?: string;
  senderName?: string;
  currentTime?: string;
  isPlaying?: boolean;
  audioRef?: HTMLAudioElement;
}
