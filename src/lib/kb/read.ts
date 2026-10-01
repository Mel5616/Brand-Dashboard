import { fileWrittenAnswers, formatWrittenAnswers, chooseEntriesForChat, type KbEntry, type FaqItem } from "./core.ts";

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

type Result = { text: string; from: "file" | "db" | "fallback" };

// Returns a function giving the WRITTEN ANSWERS block. "db" mode reads approved entries (cached),
// and falls back to the last good result, then to the file, on any failure or slowness.
// With no good result yet, a failure is remembered for retryAfterMs so a database outage does not
// add the timeout to every chat; concurrent callers share one in-flight fetch.
export function createWrittenAnswers(opts: { mode: string | undefined; faq: FaqItem[]; url?: string; key?: string; brand: string;
  fetcher?: Fetcher; now?: () => number; timeoutMs?: number; ttlMs?: number; retryAfterMs?: number }) {
  const fileText = fileWrittenAnswers(opts.faq);
  const mode = opts.mode === "db" ? "db" : "file";
  const fetcher = opts.fetcher || ((u, i) => fetch(u, i));
  const now = opts.now || Date.now, timeoutMs = opts.timeoutMs ?? 2500, ttlMs = opts.ttlMs ?? 5 * 60 * 1000;
  const retryAfterMs = opts.retryAfterMs ?? 30_000;
  let cache: { at: number; text: string } | null = null;
  let failedAt: number | null = null;
  let inflight: Promise<Result> | null = null;

  async function load(): Promise<Result> {
    const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetcher(`${opts.url}/rest/v1/kb_entries?select=*&brand=eq.${encodeURIComponent(opts.brand)}&status=eq.approved&order=sort_order.asc,id.asc&limit=5000`,
        { headers: { apikey: opts.key as string, Authorization: `Bearer ${opts.key}` }, cache: "no-store", signal: ctl.signal });
      if (!res.ok) throw new Error(`kb ${res.status}`);
      const rows = (await res.json()) as KbEntry[];
      const chosen = chooseEntriesForChat(rows);
      if (!chosen.length) throw new Error("kb empty");
      cache = { at: now(), text: formatWrittenAnswers(chosen) };
      failedAt = null;
      return { text: cache.text, from: "db" };
    } catch {
      if (cache) { cache = { at: now(), text: cache.text }; return { text: cache.text, from: "db" }; }
      failedAt = now();
      return { text: fileText, from: "fallback" };
    } finally { clearTimeout(timer); }
  }

  return async function get(): Promise<Result> {
    if (mode === "file") return { text: fileText, from: "file" };
    if (cache && now() - cache.at < ttlMs) return { text: cache.text, from: "db" };
    if (!opts.url || !opts.key) return { text: fileText, from: "fallback" };
    if (!cache && failedAt !== null && now() - failedAt < retryAfterMs) return { text: fileText, from: "fallback" };
    if (!inflight) inflight = load().finally(() => { inflight = null; });
    return inflight;
  };
}
