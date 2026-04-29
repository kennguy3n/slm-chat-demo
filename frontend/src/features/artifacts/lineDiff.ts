// Minimal LCS-based line diff implementation. It is intentionally
// simple — the Phase 3 demo only needs to highlight added / removed
// lines side-by-side; a full Myers diff would be overkill for the
// short artifact bodies the demo produces.
//
// Lives in its own file (separate from the React component) so the
// react-refresh / Fast Refresh boundary stays clean: a component file
// must export only components.

export interface DiffLine {
  kind: 'context' | 'added' | 'removed';
  text: string;
}

export function computeLineDiff(from: string, to: string): DiffLine[] {
  const a = from.split('\n');
  const b = to.split('\n');
  const m = a.length;
  const n = b.length;
  const lcs: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (a[i] === b[j]) {
        lcs[i][j] = lcs[i + 1][j + 1] + 1;
      } else {
        lcs[i][j] = Math.max(lcs[i + 1][j], lcs[i][j + 1]);
      }
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      out.push({ kind: 'context', text: a[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ kind: 'removed', text: a[i] });
      i++;
    } else {
      out.push({ kind: 'added', text: b[j] });
      j++;
    }
  }
  while (i < m) {
    out.push({ kind: 'removed', text: a[i++] });
  }
  while (j < n) {
    out.push({ kind: 'added', text: b[j++] });
  }
  return out;
}
