// Formats a UTF-8 byte count for display in the TopBar / EgressSummaryPanel.
// Values are rendered with at most one fractional digit and use the same
// scale as `formatBytes` in PrivacyStrip so the surfaces agree.
export function formatEgressBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
