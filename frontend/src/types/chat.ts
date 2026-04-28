export interface Message {
  id: string;
  channelId: string;
  threadId?: string;
  senderId: string;
  content: string;
  createdAt: string;
}
