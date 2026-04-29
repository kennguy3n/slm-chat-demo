import { create } from 'zustand';
import type { ContextMode } from '../types/workspace';

interface WorkspaceState {
  context: ContextMode;
  workspaceId: string | null;
  selectedDomainId: string | null;
  selectedChatId: string | null;
  selectedThreadId: string | null;
  // Phase 3 — expanded domain IDs in the B2B sidebar tree. Domains
  // toggle independently so power users can collapse a noisy domain
  // while keeping a focused one expanded.
  expandedDomainIds: string[];
  setContext: (mode: ContextMode) => void;
  toggleContext: () => void;
  setWorkspaceId: (id: string | null) => void;
  setSelectedDomainId: (id: string | null) => void;
  setSelectedChatId: (id: string | null) => void;
  setSelectedThreadId: (id: string | null) => void;
  toggleDomainExpanded: (id: string) => void;
}

// workspaceStore holds the shell-level selection state that drives the layout:
// which context (B2C vs B2B), which workspace, which domain, which chat, and
// which thread.
export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  context: 'b2c',
  workspaceId: null,
  selectedDomainId: null,
  selectedChatId: null,
  selectedThreadId: null,
  expandedDomainIds: [],
  setContext: (mode) =>
    set((state) =>
      state.context === mode
        ? state
        : {
            ...state,
            context: mode,
            selectedChatId: null,
            selectedThreadId: null,
            selectedDomainId: null,
            expandedDomainIds: [],
            workspaceId: null,
          },
    ),
  toggleContext: () =>
    set((state) => ({
      ...state,
      context: state.context === 'b2c' ? 'b2b' : 'b2c',
      selectedChatId: null,
      selectedThreadId: null,
      selectedDomainId: null,
      expandedDomainIds: [],
      workspaceId: null,
    })),
  setWorkspaceId: (id) => set((state) => ({ ...state, workspaceId: id })),
  setSelectedDomainId: (id) => set((state) => ({ ...state, selectedDomainId: id })),
  setSelectedChatId: (id) => set((state) => ({ ...state, selectedChatId: id, selectedThreadId: null })),
  setSelectedThreadId: (id) => set((state) => ({ ...state, selectedThreadId: id })),
  toggleDomainExpanded: (id) =>
    set((state) => ({
      ...state,
      expandedDomainIds: state.expandedDomainIds.includes(id)
        ? state.expandedDomainIds.filter((x) => x !== id)
        : [...state.expandedDomainIds, id],
    })),
}));
