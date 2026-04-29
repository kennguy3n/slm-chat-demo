export interface Message {
  id: string;
  channelId: string;
  threadId?: string;
  senderId: string;
  content: string;
  createdAt: string;
  // Phase 4 — when a message was drafted or sent on behalf of an AI
  // Employee, `aiEmployeeId` records which one. The chat surface
  // uses this to render a mode badge next to the message so the
  // human reader immediately knows the message wasn't typed by a
  // person.
  aiEmployeeId?: string;
}
