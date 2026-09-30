// Pure logic for the UPPAbaby knowledge base. No imports from the app, so it runs
// under `node --test` as well as inside Next. See docs spec 2026-10-01.
import { createHash } from "node:crypto";

export type KbSource = "website" | "confirmed" | "help_centre" | "helpdesk" | "team_reply";
export type KbStatus = "approved" | "draft" | "needs_review" | "retired";
export type KbEntry = {
  id: number; brand: string; topic: string; models: string[]; question: string; answer: string; link: string | null;
  source: KbSource; source_ref: string | null; ext_key: string; sort_order: number; corrects: number | null;
  status: KbStatus; decided_by: string | null; decided_reason: string | null; updated_at: string;
};
export type FaqItem = { topic: string; q: string; a: string; link?: string | null };

// Higher wins when two approved entries correct the same website answer.
export const PRECEDENCE: Record<KbSource, number> = { confirmed: 4, help_centre: 3, helpdesk: 2, team_reply: 2, website: 1 };

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
export function websiteKey(topic: string, question: string): string {
  return createHash("sha1").update(`${norm(topic)}\n${norm(question)}`).digest("hex").slice(0, 16);
}

// Exactly the chat route's format: "[topic] Q: ...\nA: ..." plus "\nMore: link" when there is a link.
export function formatWrittenAnswers(items: { topic: string; question: string; answer: string; link?: string | null }[]): string {
  return `WRITTEN ANSWERS\n${items.map(i => `[${i.topic}] Q: ${i.question}\nA: ${i.answer}${i.link ? `\nMore: ${i.link}` : ""}`).join("\n\n")}`;
}
export function fileWrittenAnswers(faq: FaqItem[]): string {
  return formatWrittenAnswers(faq.map(f => ({ topic: f.topic, question: f.q, answer: f.a, link: f.link ?? null })));
}

// Approved entries only; a correction takes the place of the website entry it corrects;
// entries without a correction keep their own sort_order (new ones sort after the website ones).
export function chooseEntriesForChat(entries: KbEntry[]): KbEntry[] {
  const approved = entries.filter(e => e.status === "approved");
  const winners = new Map<number, KbEntry>();
  for (const e of approved) {
    if (e.corrects == null) continue;
    const cur = winners.get(e.corrects);
    const better = !cur || PRECEDENCE[e.source] > PRECEDENCE[cur.source] ||
      (PRECEDENCE[e.source] === PRECEDENCE[cur.source] && e.updated_at > cur.updated_at);
    if (better) winners.set(e.corrects, e);
  }
  const out: { e: KbEntry; pos: number }[] = [];
  for (const e of approved) {
    if (e.corrects != null) continue;              // placed below, only if it won
    const fix = winners.get(e.id);
    out.push({ e: fix || e, pos: e.sort_order });
  }
  // A winning correction whose target is missing or not approved still counts as an answer on its own.
  const placed = new Set(out.map(o => o.e.id));
  for (const w of winners.values()) if (!placed.has(w.id)) out.push({ e: w, pos: w.sort_order });
  return out.sort((a, b) => a.pos - b.pos || a.e.id - b.e.id).map(o => o.e);
}

// Returns a plain reason when text looks like it holds customer details, else null.
export function customerDetailProblem(text: string): string | null {
  if (/[^\s@]+@[^\s@]+\.[a-z]{2,}/i.test(text)) return "It contains an email address.";
  if (/(\+?61[\s-]?\d|\b0[2-478])[\d\s-]{7,11}\d\b/.test(text)) return "It contains a phone number.";
  if (/\b\d{1,5}\s+[A-Z][a-z]+(\s[A-Z][a-z]+)?\s(Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Court|Ct|Lane|Ln|Place|Pl|Crescent|Cres|Parade|Pde|Way|Boulevard|Blvd)\b/.test(text)) return "It contains a street address.";
  if (/\border\s*(number|no\.?|#)?\s*#?\s*\d{4,}/i.test(text) || /#\d{4,}\b/.test(text)) return "It contains an order number.";
  return null;
}
