package handlers_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/kennguy3n/slm-chat-demo/backend/internal/api"
	"github.com/kennguy3n/slm-chat-demo/backend/internal/inference"
	"github.com/kennguy3n/slm-chat-demo/backend/internal/services"
	"github.com/kennguy3n/slm-chat-demo/backend/internal/store"
)

// fakeStatusProvider returns a canned ModelStatus and counts hits.
type fakeStatusProvider struct {
	st   inference.ModelStatus
	hits int
	err  error
}

func (f *fakeStatusProvider) Status(_ context.Context) (inference.ModelStatus, error) {
	f.hits++
	return f.st, f.err
}

// fakeLoader records load/unload calls.
type fakeLoader struct {
	loads, unloads int
	loadModel      string
	unloadModel    string
	err            error
}

func (f *fakeLoader) Load(_ context.Context, model string) error {
	f.loads++
	f.loadModel = model
	return f.err
}
func (f *fakeLoader) Unload(_ context.Context, model string) error {
	f.unloads++
	f.unloadModel = model
	return f.err
}

func newServerWithModelDeps(t *testing.T, sp inference.StatusProvider, ld inference.Loader) http.Handler {
	t.Helper()
	mem := store.NewMemory()
	store.Seed(mem)
	mock := inference.NewMockAdapter()
	router := inference.NewInferenceRouter(mock, mock, mock)
	return api.NewRouter(api.Deps{
		Identity:     services.NewIdentity(mem, "user_alice"),
		Workspaces:   services.NewWorkspace(mem),
		Chat:         services.NewChat(mem),
		KApps:        services.NewKApps(mem),
		Inference:    router,
		ModelStatus:  sp,
		ModelLoader:  ld,
		DefaultModel: "gemma-4-e2b",
		DefaultQuant: "q4_k_m",
	})
}

func TestModelStatusReturnsStubWhenNoProvider(t *testing.T) {
	h := newServerWithModelDeps(t, nil, nil)
	rec := doGet(t, h, "/api/model/status", "user_alice")
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var st inference.ModelStatus
	if err := json.Unmarshal(rec.Body.Bytes(), &st); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if st.Loaded {
		t.Errorf("expected loaded=false in stub")
	}
	if st.Sidecar != "unstarted" {
		t.Errorf("expected sidecar=unstarted, got %q", st.Sidecar)
	}
	if st.Model != "gemma-4-e2b" {
		t.Errorf("expected default model, got %q", st.Model)
	}
}

func TestModelStatusReturnsLiveDataFromProvider(t *testing.T) {
	sp := &fakeStatusProvider{st: inference.ModelStatus{
		Loaded: true, Model: "gemma-4-e2b", Quant: "q4_k_m", RAMUsageMB: 1234, Sidecar: "running",
	}}
	h := newServerWithModelDeps(t, sp, nil)
	rec := doGet(t, h, "/api/model/status", "user_alice")
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	if sp.hits != 1 {
		t.Errorf("expected provider hit once, got %d", sp.hits)
	}
	var st inference.ModelStatus
	_ = json.Unmarshal(rec.Body.Bytes(), &st)
	if !st.Loaded {
		t.Errorf("expected loaded=true")
	}
	if st.RAMUsageMB != 1234 {
		t.Errorf("expected ramUsageMB=1234, got %d", st.RAMUsageMB)
	}
	if st.Sidecar != "running" {
		t.Errorf("expected sidecar=running, got %q", st.Sidecar)
	}
}

func TestModelLoadCallsLoaderWhenConfigured(t *testing.T) {
	ld := &fakeLoader{}
	h := newServerWithModelDeps(t, nil, ld)
	rec := doPost(t, h, "/api/model/load", map[string]any{"model": "gemma-4-e2b"})
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if ld.loads != 1 || ld.loadModel != "gemma-4-e2b" {
		t.Errorf("expected loader to be called with gemma-4-e2b, got %+v", ld)
	}
}

func TestModelLoadDefaultsToConfiguredModel(t *testing.T) {
	ld := &fakeLoader{}
	h := newServerWithModelDeps(t, nil, ld)
	rec := doPost(t, h, "/api/model/load", map[string]any{})
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	if ld.loadModel != "gemma-4-e2b" {
		t.Errorf("expected default model, got %q", ld.loadModel)
	}
}

func TestModelLoadReturns503WithoutLoader(t *testing.T) {
	h := newServerWithModelDeps(t, nil, nil)
	req := httptest.NewRequest("POST", "/api/model/load", nil)
	req.Header.Set("X-User-ID", "user_alice")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusServiceUnavailable {
		t.Errorf("expected 503, got %d", rec.Code)
	}
}

func TestModelUnloadCallsLoaderUnload(t *testing.T) {
	ld := &fakeLoader{}
	h := newServerWithModelDeps(t, nil, ld)
	rec := doPost(t, h, "/api/model/unload", map[string]any{"model": "gemma-4-e2b"})
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if ld.unloads != 1 || ld.unloadModel != "gemma-4-e2b" {
		t.Errorf("expected unload called with gemma-4-e2b, got %+v", ld)
	}
}
