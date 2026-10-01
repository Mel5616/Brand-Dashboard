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

// Words that are never part of a street name (counts and units: "3 steps", "10 minute drive").
const NOT_NAME = String.raw`(?!(?:minute|minutes?|min|hour|hours?|step|steps|and|the|a|km|kg|cm)\b)`;
const AFTER_TYPE = String.raw`(?=[,.\s]|$|\b[A-Z]{2}\b|\b\d{4}\b)`;
// Street types that are rarely ordinary words: the name may be in any case ("12 smith street").
const ROAD_TYPES = "street|st|road|rd|avenue|ave|crescent|cres|parade|pde|boulevard|blvd";
// Street types that are also everyday words ("lock the 4 wheels in place", "10 seconds one way"):
// only an address when the name is capitalised ("9 Theodore Place", "4 Wattle Way").
const WORD_TYPES = "drive|dr|court|ct|lane|ln|place|pl|way";

// Each kind of customer detail, in the order customerDetailProblem reports them.
const DETAIL_CHECKS: { reason: string; patterns: RegExp[] }[] = [
  { reason: "It contains an email address.", patterns: [/[^\s@]+@[^\s@]+\.[a-z]{2,}/i] },
  // Phone: +61, 0[2-478], (0X), 1300, 1800, 13xx with flexible separators (space, dash, dot, parens).
  // 13xx has a word boundary at the end so dates like "13-10-2026" and model numbers like "1312345" do not match.
  { reason: "It contains a phone number.", patterns: [/(\+?61[\s-]?\d|\b0[2-478])[\d\s.-]{7,11}\d\b|\(\s?0\d\)\s?\d{4}\s?\d{4}|\b1[38]00[\s-]?\d{3}[\s-]?\d{3}|\b13[\s-]?\d{2}[\s-]?\d{2}\b|\b0\d{3}\.\d{3}\.\d{3}\b/] },
  { reason: "It contains a street address.", patterns: [
    new RegExp(String.raw`\b\d{1,5}\s+${NOT_NAME}\w+(\s${NOT_NAME}\w+)?\s(${ROAD_TYPES})${AFTER_TYPE}`, "i"),
    new RegExp(String.raw`\b\d{1,5}\s+[A-Z]\w*(\s[A-Z]\w*)?\s(${WORD_TYPES.split("|").map(t => `[${t[0].toUpperCase()}${t[0]}]${t.slice(1)}`).join("|")})${AFTER_TYPE}`),
    /\bPO\s*Box\s+\d+\b/i,
  ] },
  // Order: order keyword with 4+ digits; #XXXX; or known prefixes (SO, PO, INV, ORD, ORDER, RMA) then a separator and 4+ digits.
  { reason: "It contains an order number.", patterns: [/\border\s*(number|no\.?|#)?\s*#?\s*\d{4,}/i, /#\d{4,}\b/, /\b(SO|PO|INV|ORD|ORDER|RMA)[\s\-#]+\d{4,}\b/i] },
];

// Every customer detail found in the text, with its reason, in DETAIL_CHECKS order.
export function customerDetailMatches(text: string): { reason: string; match: string }[] {
  const out: { reason: string; match: string }[] = [];
  for (const c of DETAIL_CHECKS) {
    for (const p of c.patterns) {
      for (const m of text.matchAll(new RegExp(p.source, p.flags + "g"))) out.push({ reason: c.reason, match: m[0] });
    }
  }
  return out;
}

// Returns a plain reason when text looks like it holds customer details, else null.
export function customerDetailProblem(text: string): string | null {
  return customerDetailMatches(text)[0]?.reason ?? null;
}

// Like customerDetailProblem, but ignores details that are already in `before` (the stored text).
// Used when an approver edits an existing answer: 104 website answers hold Coolkidz's own phone
// number, showroom address or stockist numbers, and keeping those must not block a save. A detail
// counts as already there when the same matched text (case, spacing and edge punctuation ignored)
// is found in `before`. Anything the edit newly brings in is still rejected.
export function newCustomerDetailProblem(after: string, before: string): string | null {
  const key = (s: string) => s.toLowerCase().replace(/\s+/g, " ").replace(/^[^\w+(]+|[^\w)]+$/g, "").trim();
  const had = new Set(customerDetailMatches(before).map(m => key(m.match)));
  return customerDetailMatches(after).find(m => !had.has(key(m.match)))?.reason ?? null;
}
