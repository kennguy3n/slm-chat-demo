import { create } from 'zustand';
import {
  type CreateTaskPayload,
  type UpdateTaskPayload,
  closeTask as apiCloseTask,
  createTask as apiCreateTask,
  fetchTasks as apiFetchTasks,
  updateTask as apiUpdateTask,
  updateTaskStatus as apiUpdateTaskStatus,
} from '../api/kappsApi';
import type { Task, TaskStatus } from '../types/kapps';

export type TasksByChannel = Record<string, Task[]>;

interface KAppsState {
  tasksByChannel: TasksByChannel;
  loading: boolean;
  error: string | null;
  // Phase 3 — first-class Tasks KApp store. Scopes tasks per channel so
  // switching channels does not cause a refetch (TanStack Query is more
  // appropriate when we add cache invalidation; for the demo a plain
  // zustand store keeps the surface minimal and unit-testable).
  fetchTasks: (channelId: string) => Promise<void>;
  createTask: (payload: CreateTaskPayload) => Promise<Task>;
  updateTask: (taskId: string, payload: UpdateTaskPayload) => Promise<Task>;
  updateStatus: (taskId: string, status: TaskStatus, note?: string) => Promise<Task>;
  removeTask: (taskId: string) => Promise<void>;
  // Test helpers — direct reset of state for unit tests.
  _replaceTasks: (channelId: string, tasks: Task[]) => void;
}

function withTask(state: KAppsState, task: Task): TasksByChannel {
  const list = state.tasksByChannel[task.channelId] ?? [];
  const idx = list.findIndex((t) => t.id === task.id);
  const next = idx === -1 ? [...list, task] : list.map((t) => (t.id === task.id ? task : t));
  return { ...state.tasksByChannel, [task.channelId]: next };
}

function withoutTask(state: KAppsState, taskId: string): TasksByChannel {
  const next: TasksByChannel = {};
  for (const [k, list] of Object.entries(state.tasksByChannel)) {
    next[k] = list.filter((t) => t.id !== taskId);
  }
  return next;
}

export const useKAppsStore = create<KAppsState>((set) => ({
  tasksByChannel: {},
  loading: false,
  error: null,
  fetchTasks: async (channelId) => {
    set({ loading: true, error: null });
    try {
      const tasks = await apiFetchTasks(channelId);
      set((state) => ({
        loading: false,
        tasksByChannel: { ...state.tasksByChannel, [channelId]: tasks },
      }));
    } catch (err) {
      set({ loading: false, error: errorMessage(err) });
    }
  },
  createTask: async (payload) => {
    set({ error: null });
    try {
      const task = await apiCreateTask(payload);
      set((state) => ({ tasksByChannel: withTask(state, task) }));
      return task;
    } catch (err) {
      set({ error: errorMessage(err) });
      throw err;
    }
  },
  updateTask: async (taskId, payload) => {
    set({ error: null });
    try {
      const task = await apiUpdateTask(taskId, payload);
      set((state) => ({ tasksByChannel: withTask(state, task) }));
      return task;
    } catch (err) {
      set({ error: errorMessage(err) });
      throw err;
    }
  },
  updateStatus: async (taskId, status, note) => {
    set({ error: null });
    try {
      const task = await apiUpdateTaskStatus(taskId, status, note);
      set((state) => ({ tasksByChannel: withTask(state, task) }));
      return task;
    } catch (err) {
      set({ error: errorMessage(err) });
      throw err;
    }
  },
  removeTask: async (taskId) => {
    set({ error: null });
    try {
      await apiCloseTask(taskId);
      set((state) => ({ tasksByChannel: withoutTask(state, taskId) }));
    } catch (err) {
      set({ error: errorMessage(err) });
      throw err;
    }
  },
  _replaceTasks: (channelId, tasks) =>
    set((state) => ({ tasksByChannel: { ...state.tasksByChannel, [channelId]: tasks } })),
}));

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
