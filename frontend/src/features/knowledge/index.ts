// Phase 5 knowledge feature module — exposes the SourcePicker used
// by the AI Employee launch flow to scope what an AI Employee is
// allowed to read from before a recipe runs.
export { SourcePicker } from './SourcePicker';
export type {
  SelectedSource,
  SelectedSourceKind,
  ThreadSummary,
} from '../../types/knowledge';
