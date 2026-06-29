// Parse human-typed counts like "67.6K", "1.1K", "2M", "45,000", "45000" → number.
export function parseCount(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Math.round(v);
  const s = String(v).trim().replace(/,/g, "");
  const m = s.match(/^(\d+(?:\.\d+)?)\s*([kKmMbB]?)/);
  if (!m) return null;
  let n = parseFloat(m[1]);
  const suf = m[2].toLowerCase();
  if (suf === "k") n *= 1e3; else if (suf === "m") n *= 1e6; else if (suf === "b") n *= 1e9;
  return Math.round(n);
}

// Compact display: 1100 → "1.1K", 45000 → "45K", 67600 → "67.6K", 2_000_000 → "2M".
export function compactNum(n: number | null | undefined): string {
  if (n == null) return "—";
  const a = Math.abs(n);
  if (a >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (a >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}
