// Pure request validation and row building for /api/kb. No Next or app imports.
import { customerDetailProblem } from "./core.ts";

export const SOURCES = new Set(["website", "confirmed", "help_centre", "helpdesk", "team_reply"]);
export const STATUSES = new Set(["approved", "draft", "needs_review", "retired"]);

type Rec = Record<string, unknown>;
const asRec = (v: unknown): Rec => (v && typeof v === "object" ? (v as Rec) : {});
const noDetails = (reason: string) => `Not saved. ${reason} Answers must not hold customer details.`;

export function buildPatch(p: unknown, email: string): { ok: true; patch: Rec } | { ok: false; error: string } {
  const src = asRec(p);
  const patch: Rec = {
    decided_by: email,
    decided_reason: String(src.decided_reason || "Edited in the Knowledge tab").slice(0, 500),
  };
  for (const f of ["question", "answer", "link", "topic"]) {
    const v = src[f];
    if (typeof v === "string") patch[f] = v.slice(0, 4000);
  }
  if (typeof src.status === "string") {
    if (!STATUSES.has(src.status)) return { ok: false, error: "Unknown status" };
    patch.status = src.status;
  }
  const bad = customerDetailProblem(`${patch.question ?? ""}\n${patch.answer ?? ""}`);
  if (bad) return { ok: false, error: noDetails(bad) };
  patch.checked_at = new Date().toISOString();
  return { ok: true, patch };
}

export function buildNewRow(b: unknown, email: string): { ok: true; row: Rec } | { ok: false; error: string } {
  const s = asRec(b);
  const row = {
    brand: String(s.brand || "uppababy").slice(0, 20),
    topic: String(s.topic || "").slice(0, 80),
    question: String(s.question || "").slice(0, 1000),
    answer: String(s.answer || "").slice(0, 4000),
    link: s.link ? String(s.link).slice(0, 300) : null,
    source: String(s.source || ""),
    source_ref: s.source_ref ? String(s.source_ref).slice(0, 300) : null,
    corrects: s.corrects ? Number(s.corrects) : null,
    ext_key: `manual:${Date.now().toString(36)}`,
    status: "approved",
    decided_by: email,
    decided_reason: "Added in the Knowledge tab",
  };
  if (!row.topic || !row.question || !row.answer || !SOURCES.has(row.source)) {
    return { ok: false, error: "topic, question, answer and source are required" };
  }
  const bad = customerDetailProblem(`${row.question}\n${row.answer}`);
  if (bad) return { ok: false, error: noDetails(bad) };
  return { ok: true, row };
}

export function restoreFromHistory(
  h: { id: number; before: Rec | null } | undefined,
  email: string,
): { ok: true; id: number; patch: Rec } | { ok: false; error: string } {
  if (!h || !h.before) return { ok: false, error: "Nothing to undo" };
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id, created_at, updated_at, ...restore } = h.before;
  return { ok: true, id: Number(id), patch: { ...restore, decided_by: email, decided_reason: `Undo of change ${h.id}` } };
}

// Free-text search as a PostgREST `or=` parameter. PostgREST URL-decodes before parsing, so each
// operand value is double-quoted (backslash and double quote escaped inside) to keep , ( ) . : * in
// the search text from changing the filter, then the whole thing is URL-encoded.
export function buildSearchFilter(q: string): string | null {
  const v = q.trim();
  if (!v) return null;
  const quoted = `"*${v.replace(/[\\"]/g, c => `\\${c}`)}*"`;
  return `or=${encodeURIComponent(`(question.ilike.${quoted},answer.ilike.${quoted})`)}`;
}
