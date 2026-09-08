import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { cors, limited, ipOf, clean } from "@/lib/registry";

// Hands the browser a short-lived signed URL so a receipt or a photograph goes
// straight from the customer's phone to Supabase Storage.
//
// Uploading through this route instead would put every file through a Vercel
// function, which caps a request body at 4.5MB. A single modern phone photo can
// exceed that, and a claim asks for several. Going direct has no such ceiling,
// and the file never touches our compute.
//
// The bucket is private. A path is not a URL and grants nothing on its own; the
// dashboard signs a read when Mel opens the claim.
export const revalidate = 0;
const BUCKET = "claim-files";
const ALLOWED = new Set(["image/jpeg", "image/png", "image/heic", "image/heif", "image/webp", "application/pdf"]);

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: cors(req.headers.get("origin"), "POST, OPTIONS") });
}

export async function POST(req: Request) {
  const co = cors(req.headers.get("origin"), "POST, OPTIONS");
  if (limited(ipOf(req), 40, 30 * 60 * 1000)) {
    return NextResponse.json({ ok: false, error: "Too many uploads at once. Give it a minute." }, { status: 429, headers: co });
  }

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400, headers: co }); }

  const name = clean(b.fileName, 180) || "upload";
  const type = clean(b.contentType, 100) || "";
  const bytes = Number(b.bytes) || 0;

  if (!ALLOWED.has(type)) {
    return NextResponse.json({ ok: false, error: "Please upload a photo or a PDF." }, { status: 400, headers: co });
  }
  if (bytes > 20 * 1024 * 1024) {
    return NextResponse.json({ ok: false, error: "That file is over 20MB. Try a photo rather than a scan." }, { status: 400, headers: co });
  }

  const sb = await createClient();
  // Only creates it if it is genuinely absent, and private when it does.
  await sb.storage.createBucket(BUCKET, { public: false }).catch(() => {});

  const safe = name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 100);
  const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${safe}`;

  const { data, error } = await sb.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    return NextResponse.json(
      { ok: false, error: /not found/i.test(error?.message || "") ? "Create the claim-files bucket first" : "Could not start the upload" },
      { status: 500, headers: co },
    );
  }

  return NextResponse.json({ ok: true, path, token: data.token, signedUrl: data.signedUrl }, { headers: co });
}
