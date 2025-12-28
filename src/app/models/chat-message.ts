export interface ChatMessage {
  id?: string;
  senderId?:string
  sender: 'user' | 'self' | 'system';

  /* نص */
  text?: string;
  key?: string;

  /* صوت */
  audioUrl?: string;
  duration?: number;
  remainingTime?: string;
  isPlaying?: boolean;
  audioRef?: HTMLAudioElement;

  /* بيانات عامة */
  senderName?: string;
  time?: string;

  // ردود الأفعال
  reactions?: {
    [reaction: string]: string[];
  };
}

