package models

// RetrievalSourceKind tags whether a retrieval chunk was derived from
// a chat message or from a connector file.
type RetrievalSourceKind string

const (
	RetrievalSourceKindMessage RetrievalSourceKind = "message"
	RetrievalSourceKindFile    RetrievalSourceKind = "file"
)

// RetrievalChunk is one indexable unit (a message body or the excerpt
// of a connector file) for a single channel. Phase 5 keeps the index
// in-memory and uses keyword/term-overlap scoring rather than a real
// embedding model — `Embedding` is reserved for a future phase that
// swaps in on-device vector embeddings without changing the schema.
type RetrievalChunk struct {
	ID         string              `json:"id"`
	ChannelID  string              `json:"channelId"`
	SourceKind RetrievalSourceKind `json:"sourceKind"`
	SourceID   string              `json:"sourceId"`
	Content    string              `json:"content"`
	Embedding  []float32           `json:"embedding,omitempty"`
}

// RetrievalResult is one ranked hit returned by a search call. The
// renderer renders these as citations + tooltips and the inference
// router optionally feeds the top-K back as additional prompt context.
type RetrievalResult struct {
	Chunk RetrievalChunk `json:"chunk"`
	Score float64        `json:"score"`
}
