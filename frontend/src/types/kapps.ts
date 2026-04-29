// KApps object model — mirrors backend/internal/models per ARCHITECTURE.md
// section 6.1. Shared types between the API client (kappsApi) and the
// frontend feature components in features/kapps/.

export type TaskStatus = 'open' | 'in_progress' | 'blocked' | 'done';

export interface TaskHistoryEntry {
  at: string;
  actor: string;
  action: string;
  note?: string;
}

export interface Task {
  id: string;
  channelId: string;
  sourceThreadId?: string;
  sourceMessageId?: string;
  title: string;
  owner?: string;
  dueDate?: string | null;
  status: TaskStatus;
  aiGenerated: boolean;
  history?: TaskHistoryEntry[];
}

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';
export type ApprovalDecision = 'approve' | 'reject' | 'comment';

export interface ApprovalDecisionEntry {
  at: string;
  actor: string;
  decision: ApprovalDecision;
  note?: string;
}

export interface ApprovalFields {
  vendor?: string;
  amount?: string;
  justification?: string;
  risk?: string;
  extra?: Record<string, string>;
}

export interface Approval {
  id: string;
  channelId: string;
  templateId: string;
  title: string;
  requester: string;
  approvers: string[];
  fields: ApprovalFields;
  status: ApprovalStatus;
  decisionLog: ApprovalDecisionEntry[];
  sourceThreadId?: string;
  aiGenerated: boolean;
}

export type ArtifactType = 'PRD' | 'RFC' | 'Proposal' | 'SOP' | 'QBR';
export type ArtifactStatus = 'draft' | 'in_review' | 'published';

export interface ArtifactSourceRef {
  kind: string;
  id: string;
  note?: string;
}

export interface ArtifactVersion {
  version: number;
  createdAt: string;
  author: string;
  summary?: string;
}

export interface Artifact {
  id: string;
  channelId: string;
  type: ArtifactType;
  title: string;
  templateId?: string;
  sourceRefs?: ArtifactSourceRef[];
  versions: ArtifactVersion[];
  status: ArtifactStatus;
  publishedCardId?: string;
  aiGenerated: boolean;
  url?: string;
}

export type EventRSVP = 'accepted' | 'declined' | 'none';

export interface EventCard {
  id: string;
  channelId: string;
  sourceMessageId?: string;
  title: string;
  startsAt: string;
  location?: string;
  rsvp: EventRSVP;
  attendeeCount: number;
  aiGenerated: boolean;
}

export type CardKind = 'task' | 'approval' | 'artifact' | 'event';

export interface KAppCard {
  kind: CardKind;
  // threadId is the denormalized back-link a card inherits from its
  // originating thread. Phase 3's `/api/threads/{id}/linked-objects`
  // queries on this field.
  threadId?: string;
  task?: Task;
  approval?: Approval;
  artifact?: Artifact;
  event?: EventCard;
}
