import type { AIEmployeeRecipe } from '../../types/aiEmployee';

// AI_EMPLOYEE_RECIPES is the renderer-side catalogue surfaced in the
// AIEmployeePanel. The authoritative executor list lives in the
// Electron main process (`electron/inference/recipes/`); the renderer
// only needs the display-friendly name + description so the user can
// see what each recipe does when inspecting an employee.
export const AI_EMPLOYEE_RECIPES: Record<string, AIEmployeeRecipe> = {
  summarize: {
    id: 'summarize',
    name: 'Summarize thread',
    description: 'Condense a thread into decisions, open questions, owners, and deadlines.',
  },
  extract_tasks: {
    id: 'extract_tasks',
    name: 'Extract tasks',
    description: 'Pull concrete action items — with owners and due dates — out of a work thread.',
  },
  prefill_approval: {
    id: 'prefill_approval',
    name: 'Prefill approval',
    description: 'Prefill a draft approval request with vendor / amount / justification fields.',
  },
  draft_prd: {
    id: 'draft_prd',
    name: 'Draft PRD',
    description: 'Draft a product requirements document with source pins for human review.',
  },
  draft_proposal: {
    id: 'draft_proposal',
    name: 'Draft proposal',
    description: 'Draft a sales proposal or vendor pitch with source pins for human review.',
  },
  create_qbr: {
    id: 'create_qbr',
    name: 'Create QBR',
    description: 'Draft a quarterly business review — wins, gaps, asks, next-quarter plan — with source pins.',
  },
};
