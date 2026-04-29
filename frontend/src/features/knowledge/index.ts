// Phase 5 knowledge feature module — source picker, channel-scoped
// connector attachment, permission preview, citation rendering, and
// the workspace knowledge graph panel.
export { SourcePicker } from './SourcePicker';
export { ConnectorPanel } from './ConnectorPanel';
export { PermissionPreview } from './PermissionPreview';
export { CitationChip } from './CitationChip';
export { CitationRenderer, parseCitations } from './CitationRenderer';
export { KnowledgeGraphPanel } from './KnowledgeGraphPanel';
export type { CitationSource } from './CitationChip';
export type {
  Connector,
  ConnectorFile,
  ConnectorKind,
  ConnectorStatus,
  KnowledgeEntity,
  KnowledgeEntityKind,
  KnowledgeEntityStatus,
  RetrievalChunk,
  RetrievalResult,
  RetrievalSourceKind,
  SelectedSource,
  SelectedSourceKind,
  ThreadSummary,
} from '../../types/knowledge';
