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
