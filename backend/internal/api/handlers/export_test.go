package handlers

// TruncateForPromptForTest exposes the unexported truncateForPrompt helper
// to package-external tests so we can lock in its rune-aware truncation
// behaviour without making the helper itself part of the public API.
func TruncateForPromptForTest(s string, max int) string {
	return truncateForPrompt(s, max)
}
