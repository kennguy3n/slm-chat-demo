// Barrel for the Phase 4 recipe registry. Importing this module has a
// side-effect: every canonical recipe self-registers into
// RECIPE_REGISTRY so the IPC handler can look it up by id without
// juggling explicit wiring.

import { registerRecipe } from './registry.js';
import { summarizeRecipe } from './summarize.js';
import { extractTasksRecipe } from './extract-tasks.js';
import { draftPRDRecipe } from './draft-prd.js';
import { draftProposalRecipe } from './draft-proposal.js';
import { createQBRRecipe } from './create-qbr.js';
import { prefillApprovalRecipe } from './prefill-approval.js';

registerRecipe(summarizeRecipe);
registerRecipe(extractTasksRecipe);
registerRecipe(draftPRDRecipe);
registerRecipe(draftProposalRecipe);
registerRecipe(createQBRRecipe);
registerRecipe(prefillApprovalRecipe);

export {
  RECIPE_REGISTRY,
  registerRecipe,
  getRecipe,
  listRecipes,
} from './registry.js';
export type {
  RecipeContext,
  RecipeDefinition,
  RecipeMessage,
  RecipeResult,
} from './registry.js';
export { summarizeRecipe, preferredTierForThread } from './summarize.js';
export { extractTasksRecipe } from './extract-tasks.js';
export { draftPRDRecipe } from './draft-prd.js';
export { draftProposalRecipe } from './draft-proposal.js';
export { createQBRRecipe } from './create-qbr.js';
export { prefillApprovalRecipe } from './prefill-approval.js';
