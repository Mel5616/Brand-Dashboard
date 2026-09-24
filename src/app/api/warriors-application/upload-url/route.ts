import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { limited, ipOf, clean } from "@/lib/registry";
import { corsWf } from "@/lib/warriorsMail";

// Signed upload URL for a Warriors practitioner letter, straight from the
// family's phone to the PRIVATE warriors-files bucket (same reasoning as the
// Crash Exchange uploads: no 4.5MB function body limit, file never touches our
// compute, and a path grants nothing without a signed read).
export const revalidate = 0;
const BUCKET = "warriors-files";
const ALLOWED = new Set(["image/jpeg", "image/png", "image/heic", "image/heif", "image/webp", "application/pdf"]);

export async function OPTIONS(req: Request) { return new NextResponse(null, { status: 204, headers: corsWf(req.headers.get("origin")) }); }

export async function POST(req: Request) {
  const co = corsWf(req.headers.get("origin"));
  if (limited(ipOf(req), 20, 30 * 60 * 1000)) return NextResponse.json({ ok: false, error: "Too many uploads at once. Give it a minute." }, { status: 429, headers: co });
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400, headers: co }); }
  const name = clean(b.fileName, 180) || "upload", type = clean(b.contentType, 100) || "", bytes = Number(b.bytes) || 0;
  if (!ALLOWED.has(type)) return NextResponse.json({ ok: false, error: "Please upload a photo or a PDF." }, { status: 400, headers: co });
  if (bytes > 20 * 1024 * 1024) return NextResponse.json({ ok: false, error: "That file is over 20MB." }, { status: 400, headers: co });
  const sb = await createClient();
  await sb.storage.createBucket(BUCKET, { public: false }).catch(() => {});
  const safe = name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 100);
  const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${safe}`;
  const { data, error } = await sb.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return NextResponse.json({ ok: false, error: "Could not start the upload" }, { status: 500, headers: co });
  return NextResponse.json({ ok: true, path, token: data.token, signedUrl: data.signedUrl }, { headers: co });
}
