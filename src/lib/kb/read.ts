import { fileWrittenAnswers, formatWrittenAnswers, chooseEntriesForChat, type KbEntry, type FaqItem } from "./core.ts";

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

// Returns a function giving the WRITTEN ANSWERS block. "db" mode reads approved entries (cached),
// and falls back to the last good result, then to the file, on any failure or slowness.
export function createWrittenAnswers(opts: { mode: string | undefined; faq: FaqItem[]; url?: string; key?: string; brand: string;
  fetcher?: Fetcher; now?: () => number; timeoutMs?: number; ttlMs?: number }) {
  const fileText = fileWrittenAnswers(opts.faq);
  const mode = opts.mode === "db" ? "db" : "file";
  const fetcher = opts.fetcher || ((u, i) => fetch(u, i));
  const now = opts.now || Date.now, timeoutMs = opts.timeoutMs ?? 2500, ttlMs = opts.ttlMs ?? 5 * 60 * 1000;
  let cache: { at: number; text: string } | null = null;

  return async function get(): Promise<{ text: string; from: "file" | "db" | "fallback" }> {
    if (mode === "file") return { text: fileText, from: "file" };
    if (cache && now() - cache.at < ttlMs) return { text: cache.text, from: "db" };
    if (!opts.url || !opts.key) return { text: fileText, from: "fallback" };
    const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetcher(`${opts.url}/rest/v1/kb_entries?select=*&brand=eq.${encodeURIComponent(opts.brand)}&status=eq.approved&order=sort_order.asc,id.asc&limit=5000`,
        { headers: { apikey: opts.key, Authorization: `Bearer ${opts.key}` }, cache: "no-store", signal: ctl.signal });
      if (!res.ok) throw new Error(`kb ${res.status}`);
      const rows = (await res.json()) as KbEntry[];
      const chosen = chooseEntriesForChat(rows);
      if (!chosen.length) throw new Error("kb empty");
      cache = { at: now(), text: formatWrittenAnswers(chosen) };
      return { text: cache.text, from: "db" };
    } catch {
      if (cache) { cache = { at: now(), text: cache.text }; return { text: cache.text, from: "db" }; }
      return { text: fileText, from: "fallback" };
    } finally { clearTimeout(timer); }
  };
}
