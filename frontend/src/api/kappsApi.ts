import { apiFetch } from './client';
import { fetchThreadMessages } from './chatApi';
import { getElectronAI } from './electronBridge';
import type {
  Approval,
  ApprovalDecision,
  ApprovalFields,
  Artifact,
  ArtifactSourcePin,
  ArtifactStatus,
  ArtifactType,
  ArtifactVersion,
  Form,
  FormStatus,
  FormTemplate,
  KAppCard,
  Task,
  TaskStatus,
} from '../types/kapps';
import type {
  ApprovalTemplate,
  ArtifactKind,
  ArtifactSection,
  DraftArtifactResponse,
  KAppsExtractTasksResponse,
  PrefillApprovalResponse,
} from '../types/ai';

// Fetch the seeded KApp cards for the demo. Phase 0 returns the four sample
// cards from store.seedCards. An optional channelId scopes the response.
export async function fetchKAppCards(channelId?: string): Promise<KAppCard[]> {
  const qs = channelId ? `?channelId=${encodeURIComponent(channelId)}` : '';
  const data = await apiFetch<{ cards: KAppCard[] }>(`/api/kapps/cards${qs}`);
  return data.cards ?? [];
}

// extractKAppTasks runs B2B task extraction over a thread.
//
// Electron mode: fetches the thread's messages from the Go data API
// and forwards them to the main-process inference router via IPC.
// HTTP mode: legacy POST /api/kapps/tasks/extract.
export async function extractKAppTasks(req: {
  threadId: string;
}): Promise<KAppsExtractTasksResponse> {
  const ipc = getElectronAI();
  if (ipc) {
    const messages = await fetchThreadMessages(req.threadId);
    if (messages.length === 0) {
      throw new Error('thread not found');
    }
    return ipc.extractKAppTasks({
      threadId: req.threadId,
      messages: messages.map((m) => ({
        id: m.id,
        channelId: m.channelId,
        senderId: m.senderId,
        content: m.content,
      })),
    });
  }
  return apiFetch<KAppsExtractTasksResponse>('/api/kapps/tasks/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
}

// prefillApproval runs B2B approval prefill over a thread. Electron
// mode forwards the thread messages to the main-process inference
// router; HTTP mode falls back to the legacy Go endpoint (for the
// browser demo and Vitest).
export async function prefillApproval(req: {
  threadId: string;
  templateId?: ApprovalTemplate;
}): Promise<PrefillApprovalResponse> {
  const ipc = getElectronAI();
  if (ipc) {
    const messages = await fetchThreadMessages(req.threadId);
    if (messages.length === 0) {
      throw new Error('thread not found');
    }
    return ipc.prefillApproval({
      threadId: req.threadId,
      templateId: req.templateId,
      messages: messages.map((m) => ({
        id: m.id,
        channelId: m.channelId,
        senderId: m.senderId,
        content: m.content,
      })),
    });
  }
  return apiFetch<PrefillApprovalResponse>('/api/kapps/approvals/prefill', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
}

// draftArtifact returns the prompt + sources used to draft an
// artifact section so the renderer can stream the body via
// /api/ai/stream — same single-inference contract as fetchThreadSummary.
export async function draftArtifact(req: {
  threadId: string;
  artifactType: ArtifactKind;
  section?: ArtifactSection;
}): Promise<DraftArtifactResponse> {
  const ipc = getElectronAI();
  if (ipc) {
    const messages = await fetchThreadMessages(req.threadId);
    if (messages.length === 0) {
      throw new Error('thread not found');
    }
    return ipc.draftArtifact({
      threadId: req.threadId,
      artifactType: req.artifactType,
      section: req.section,
      messages: messages.map((m) => ({
        id: m.id,
        channelId: m.channelId,
        senderId: m.senderId,
        content: m.content,
      })),
    });
  }
  return apiFetch<DraftArtifactResponse>('/api/kapps/artifacts/draft', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
}

// ---------- Phase 3: task lifecycle, approval decisions, linked objects ----------

// fetchLinkedObjects returns every KApp card attached to a thread. Used by
// ThreadPanel's "Linked Objects" section.
export async function fetchLinkedObjects(threadId: string): Promise<KAppCard[]> {
  const data = await apiFetch<{ cards: KAppCard[] }>(
    `/api/threads/${encodeURIComponent(threadId)}/linked-objects`,
  );
  return data.cards ?? [];
}

// fetchTasks returns the task cards scoped to a single channel.
export async function fetchTasks(channelId: string): Promise<Task[]> {
  const qs = channelId ? `?channelId=${encodeURIComponent(channelId)}` : '';
  const data = await apiFetch<{ tasks: Task[] }>(`/api/kapps/tasks${qs}`);
  return data.tasks ?? [];
}

export interface CreateTaskPayload {
  channelId: string;
  title: string;
  owner?: string;
  dueDate?: string | null;
  sourceThreadId?: string;
  sourceMessageId?: string;
  status?: TaskStatus;
  aiGenerated?: boolean;
}

// createTask persists a manually-authored or AI-extracted task.
export async function createTask(payload: CreateTaskPayload): Promise<Task> {
  const data = await apiFetch<{ task: Task }>('/api/kapps/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return data.task;
}

export interface UpdateTaskPayload {
  title?: string;
  owner?: string;
  dueDate?: string | null;
  clearDueDate?: boolean;
  status?: TaskStatus;
  note?: string;
}

// updateTask patches a single task's fields. Pass `clearDueDate: true` to
// explicitly remove a due date — JSON cannot distinguish absent from null
// once the request hits Go.
export async function updateTask(taskId: string, payload: UpdateTaskPayload): Promise<Task> {
  const data = await apiFetch<{ task: Task }>(`/api/kapps/tasks/${encodeURIComponent(taskId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return data.task;
}

// updateTaskStatus is a thin wrapper around the dedicated /status endpoint
// for the common transition case.
export async function updateTaskStatus(
  taskId: string,
  status: TaskStatus,
  note?: string,
): Promise<Task> {
  const data = await apiFetch<{ task: Task }>(
    `/api/kapps/tasks/${encodeURIComponent(taskId)}/status`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, note }),
    },
  );
  return data.task;
}

// closeTask removes a task (treated as close/archive in Phase 3).
export async function closeTask(taskId: string): Promise<void> {
  await apiFetch<void>(`/api/kapps/tasks/${encodeURIComponent(taskId)}`, {
    method: 'DELETE',
  });
}

// ---------- Phase 3: approvals submit, artifacts CRUD + versions, forms ----------

export interface CreateApprovalPayload {
  channelId: string;
  templateId?: string;
  title: string;
  requester?: string;
  approvers?: string[];
  fields: ApprovalFields;
  sourceThreadId?: string;
  aiGenerated?: boolean;
}

// createApproval persists a new pending approval card. Used by both the
// manual CreateApprovalForm and the AI ApprovalPrefillCard "Accept" flow.
export async function createApproval(payload: CreateApprovalPayload): Promise<Approval> {
  const data = await apiFetch<{ approval: Approval }>('/api/kapps/approvals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return data.approval;
}

export interface CreateArtifactPayload {
  channelId: string;
  type: ArtifactType;
  title: string;
  templateId?: string;
  sourceThreadId?: string;
  author?: string;
  body?: string;
  summary?: string;
  sourcePins?: ArtifactSourcePin[];
  aiGenerated?: boolean;
}

export async function createArtifact(payload: CreateArtifactPayload): Promise<Artifact> {
  const data = await apiFetch<{ artifact: Artifact }>('/api/kapps/artifacts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return data.artifact;
}

export async function listArtifacts(channelId?: string): Promise<Artifact[]> {
  const qs = channelId ? `?channelId=${encodeURIComponent(channelId)}` : '';
  const data = await apiFetch<{ artifacts: Artifact[] }>(`/api/kapps/artifacts${qs}`);
  return data.artifacts ?? [];
}

export async function getArtifact(id: string): Promise<Artifact> {
  const data = await apiFetch<{ artifact: Artifact }>(
    `/api/kapps/artifacts/${encodeURIComponent(id)}`,
  );
  return data.artifact;
}

export interface UpdateArtifactPayload {
  title?: string;
  status?: ArtifactStatus;
  url?: string;
}

export async function updateArtifact(
  id: string,
  payload: UpdateArtifactPayload,
): Promise<Artifact> {
  const data = await apiFetch<{ artifact: Artifact }>(
    `/api/kapps/artifacts/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );
  return data.artifact;
}

export interface CreateArtifactVersionPayload {
  author?: string;
  summary?: string;
  body: string;
  sourcePins?: ArtifactSourcePin[];
}

export async function createArtifactVersion(
  id: string,
  payload: CreateArtifactVersionPayload,
): Promise<ArtifactVersion> {
  const data = await apiFetch<{ version: ArtifactVersion }>(
    `/api/kapps/artifacts/${encodeURIComponent(id)}/versions`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );
  return data.version;
}

export async function getArtifactVersion(
  id: string,
  version: number,
): Promise<ArtifactVersion> {
  const data = await apiFetch<{ version: ArtifactVersion }>(
    `/api/kapps/artifacts/${encodeURIComponent(id)}/versions/${version}`,
  );
  return data.version;
}

export async function listFormTemplates(): Promise<FormTemplate[]> {
  const data = await apiFetch<{ templates: FormTemplate[] }>(
    '/api/kapps/form-templates',
  );
  return data.templates ?? [];
}

export interface CreateFormPayload {
  channelId: string;
  templateId: string;
  title?: string;
  fields?: Record<string, string>;
  sourceThreadId?: string;
  status?: FormStatus;
  aiGenerated?: boolean;
}

export async function createForm(payload: CreateFormPayload): Promise<Form> {
  const data = await apiFetch<{ form: Form }>('/api/kapps/forms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return data.form;
}

export async function listForms(channelId?: string): Promise<Form[]> {
  const qs = channelId ? `?channelId=${encodeURIComponent(channelId)}` : '';
  const data = await apiFetch<{ forms: Form[] }>(`/api/kapps/forms${qs}`);
  return data.forms ?? [];
}

// submitApprovalDecision appends a decision to the approval's immutable
// decision log and updates the approval's status when the decision is
// approve/reject (comments leave status untouched).
export async function submitApprovalDecision(
  approvalId: string,
  decision: ApprovalDecision,
  note?: string,
): Promise<Approval> {
  const data = await apiFetch<{ approval: Approval }>(
    `/api/kapps/approvals/${encodeURIComponent(approvalId)}/decide`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision, note }),
    },
  );
  return data.approval;
}
