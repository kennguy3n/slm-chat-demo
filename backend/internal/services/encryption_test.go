package services

import (
	"strconv"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/kennguy3n/slm-chat-demo/backend/internal/store"
)

// TestEncryptionKeyServiceGenerateKeyConcurrencySafe is a regression
// test for an unsynchronised write to EncryptionKeyService.material.
// Two concurrent HTTP requests to the generate or rotate endpoints
// previously raced on the map and triggered Go's fatal `concurrent map
// writes` runtime error, which bypasses chi's middleware.Recoverer
// and crashes the server. Run this under `go test -race` to catch
// regressions; without the lock it also reliably panics under high
// fan-out.
func TestEncryptionKeyServiceGenerateKeyConcurrencySafe(t *testing.T) {
	mem := store.NewMemory()
	svc := NewEncryptionKeyService(mem)

	// Make idGen unique-per-call without depending on time.Now() so we
	// don't lose key rows to colliding ids under heavy concurrency.
	var counter uint64
	svc.idGen = func() string {
		n := atomic.AddUint64(&counter, 1)
		return "key_test_" + strconv.FormatUint(n, 10)
	}

	const goroutines = 32
	const perGoroutine = 8

	var wg sync.WaitGroup
	wg.Add(goroutines)
	for i := 0; i < goroutines; i++ {
		go func() {
			defer wg.Done()
			for j := 0; j < perGoroutine; j++ {
				if _, err := svc.GenerateKey("ws_concurrent"); err != nil {
					t.Errorf("GenerateKey: %v", err)
					return
				}
			}
		}()
	}
	wg.Wait()

	keys := svc.ListKeys("ws_concurrent")
	if len(keys) != goroutines*perGoroutine {
		t.Fatalf("expected %d keys, got %d", goroutines*perGoroutine, len(keys))
	}

	active := 0
	for _, k := range keys {
		if k.Active {
			active++
		}
	}
	if active != 1 {
		t.Fatalf("expected exactly 1 active key after concurrent generate, got %d", active)
	}
}
