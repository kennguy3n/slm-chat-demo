// AI Employee types — Phase 4. Mirrors backend/internal/models/ai_employee.go.
// AI Employees are workspace-scoped personas pinned to a role, an
// allow-list of channels, and the set of recipes they are authorised
// to run.

export type AIEmployeeRole = 'ops' | 'pm' | 'sales';

export type AIEmployeeMode = 'auto' | 'inline';

export interface AIEmployeeBudget {
  maxTokensPerDay: number;
  usedTokensToday: number;
}

export interface AIEmployee {
  id: string;
  name: string;
  role: AIEmployeeRole;
  avatarColor: string;
  description: string;
  allowedChannelIds: string[];
  recipes: string[];
  budget: AIEmployeeBudget;
  mode: AIEmployeeMode;
  createdAt: string;
}

// AIEmployeeRecipe describes a recipe the user can inspect in the
// right-rail panel. The renderer uses a small static catalogue for
// display (label + description) while the actual executor lives in
// `electron/inference/recipes/`.
export interface AIEmployeeRecipe {
  id: string;
  name: string;
  description: string;
}
