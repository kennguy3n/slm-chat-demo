import { create } from 'zustand';
import type { ContextMode } from '../types/workspace';

interface WorkspaceState {
  context: ContextMode;
  workspaceId: string | null;
  selectedChatId: string | null;
  selectedThreadId: string | null;
  setContext: (mode: ContextMode) => void;
  toggleContext: () => void;
  setWorkspaceId: (id: string | null) => void;
  setSelectedChatId: (id: string | null) => void;
  setSelectedThreadId: (id: string | null) => void;
}

// workspaceStore holds the shell-level selection state that drives the layout:
// which context (B2C vs B2B), which workspace, which chat, and which thread.
export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  context: 'b2c',
  workspaceId: null,
  selectedChatId: null,
  selectedThreadId: null,
  setContext: (mode) =>
    set((state) =>
      state.context === mode
        ? state
        : { ...state, context: mode, selectedChatId: null, selectedThreadId: null, workspaceId: null },
    ),
  toggleContext: () =>
    set((state) => ({
      ...state,
      context: state.context === 'b2c' ? 'b2b' : 'b2c',
      selectedChatId: null,
      selectedThreadId: null,
      workspaceId: null,
    })),
  setWorkspaceId: (id) => set((state) => ({ ...state, workspaceId: id })),
  setSelectedChatId: (id) => set((state) => ({ ...state, selectedChatId: id, selectedThreadId: null })),
  setSelectedThreadId: (id) => set((state) => ({ ...state, selectedThreadId: id })),
}));
