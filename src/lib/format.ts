/** Format a byte count into a compact human readable string. */
export function formatBytes(bytes: number | null | undefined): string | null {
  if (bytes === null || bytes === undefined || bytes <= 0) return null;
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)} ${units[unit]}`;
}

/** Format a raw number with thousands separators. */
export function formatCount(n: number | null | undefined): string | null {
  if (n === null || n === undefined || !Number.isFinite(n)) return null;
  return n.toLocaleString("en-US");
}

/** Format a parameter count like 7_000_000_000 -> "7.0B". */
export function formatParams(n: number | null | undefined): string | null {
  if (!n || n <= 0 || !Number.isFinite(n)) return null;
  if (n >= 1e9) return `${(n / 1e9).toFixed(1).replace(/\.0$/, "")}B params`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, "")}M params`;
  return `${n.toLocaleString("en-US")} params`;
}

/** FNV-1a 32-bit hash — stable, dependency free, fine for React keys. */
export function hashString(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/** Strip HTML tags (used for Zenodo descriptions). */
export function stripHtml(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
