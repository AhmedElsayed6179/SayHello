export interface ChatMessage {
  sender: 'user' | 'system';
  text?: string;
  key?: string;
  time?: string;
  senderName?: string;
}
