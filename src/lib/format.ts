// Shared by the server-rendered page and its client script.
// (Lives here rather than in index.astro frontmatter: the Astro compiler
// misreads `n / 1_000_000).toFixed(1).replace(/\.0$/` as a regex literal
// and then fails to hoist `export const prerender`.)
export function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}
