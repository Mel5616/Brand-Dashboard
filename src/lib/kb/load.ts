import { websiteKey, customerDetailProblem, type FaqItem } from "./core.ts";

export type Row = {
  brand: string; topic: string; models: string[]; question: string; answer: string; link: string | null;
  source: string; source_ref: string | null; ext_key: string; sort_order: number; status: string;
  decided_by: string; decided_reason: string; corrects_key?: string | null;
};
export type SeedEntry = {
  ext_key: string; topic: string; models?: string[]; question: string; answer: string; link?: string | null;
  source: "confirmed" | "help_centre"; source_ref: string; corrects_question?: { topic: string; q: string } | null;
  status: "approved" | "needs_review"; decided_by: string; decided_reason: string;
};

// Website answers exactly as the knowledge file has them (no trimming: parity depends on it).
export function websiteRows(brand: string, faq: FaqItem[]): Row[] {
  return faq.map((f, i) => ({
    brand, topic: f.topic, models: [], question: f.q, answer: f.a, link: f.link ? f.link : null,
    source: "website", source_ref: f.link || null, ext_key: websiteKey(f.topic, f.q), sort_order: i,
    status: "approved", decided_by: "claude", decided_reason: "From the uppababy.com.au knowledge file",
  }));
}

export function seedRows(brand: string, seeds: SeedEntry[], keyToSort: Map<string, number>): { rows: Row[]; problems: string[] } {
  const rows: Row[] = [], problems: string[] = [];
  for (const s of seeds) {
    const bad = customerDetailProblem(`${s.question}\n${s.answer}`);
    if (bad) { problems.push(`${s.ext_key}: ${bad}`); continue; }
    const ck = s.corrects_question ? websiteKey(s.corrects_question.topic, s.corrects_question.q) : null;
    rows.push({
      brand, topic: s.topic, models: s.models || [], question: s.question, answer: s.answer, link: s.link || null,
      source: s.source, source_ref: s.source_ref, ext_key: s.ext_key,
      sort_order: ck && keyToSort.has(ck) ? keyToSort.get(ck)! : 100000,
      status: s.status, decided_by: s.decided_by, decided_reason: s.decided_reason, corrects_key: ck,
    });
  }
  return { rows, problems };
}

// Postgres dollar-quoted literal that holds the text byte-for-byte. The tag is chosen so the first
// closing tag after the opening one is the final one (covers text containing "$kb$" or ending in "$kb").
export function sqlLiteral(s: string | null): string {
  if (s == null) return "NULL";
  let tag = "$kb$";
  for (let n = 1; (s + tag).indexOf(tag) !== s.length; n++) tag = `$kb${n}$`;
  return `${tag}${s}${tag}`;
}
export function sqlTextArray(a: string[]): string {
  return a.length ? `array[${a.map(sqlLiteral).join(", ")}]::text[]` : "'{}'::text[]";
}

const INSERT_COLS = ["brand", "topic", "models", "question", "answer", "link", "source", "source_ref", "ext_key", "sort_order", "status", "decided_by", "decided_reason"] as const;
// One upsert statement for a batch of rows (corrects is set separately, by sqlCorrects).
export function sqlUpsert(rows: Row[]): string {
  const values = rows.map(r => `(${[sqlLiteral(r.brand), sqlLiteral(r.topic), sqlTextArray(r.models), sqlLiteral(r.question), sqlLiteral(r.answer),
    sqlLiteral(r.link), sqlLiteral(r.source), sqlLiteral(r.source_ref), sqlLiteral(r.ext_key), String(r.sort_order), sqlLiteral(r.status),
    sqlLiteral(r.decided_by), sqlLiteral(r.decided_reason)].join(", ")})`);
  const updates = INSERT_COLS.filter(c => c !== "brand" && c !== "ext_key").map(c => `${c} = excluded.${c}`).join(", ");
  return `insert into public.kb_entries (${INSERT_COLS.join(", ")}) values\n${values.join(",\n")}\non conflict (brand, ext_key) do update set ${updates};\n`;
}
// Points each correction at the website entry it corrects (decided_by/decided_reason re-set for the audit trigger).
export function sqlCorrects(brand: string, rows: Row[]): string {
  const pairs = rows.filter(r => r.corrects_key).map(r => `(${sqlLiteral(r.ext_key)}, ${sqlLiteral(r.corrects_key!)})`);
  if (!pairs.length) return "";
  return `update public.kb_entries s set corrects = w.id, decided_by = s.decided_by, decided_reason = s.decided_reason\n` +
    `from (values\n${pairs.join(",\n")}\n) as v(seed_key, target_key)\njoin public.kb_entries w on w.brand = ${sqlLiteral(brand)} and w.ext_key = v.target_key\n` +
    `where s.brand = ${sqlLiteral(brand)} and s.ext_key = v.seed_key;\n`;
}
