import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";

// Featured image for a blog draft — carried through to the Shopify article
// (its `image` field) when the draft is approved and published.
//
// Uploads go straight from the browser to Supabase Storage on a signed URL
// (init -> PUT -> finish), not through this route's own body — a Vercel
// function request body caps out around 4.5MB, well under what a real phone
// photo often is, and the first version of this route (upload through the
// function) was silently failing on exactly that.
export const revalidate = 0;
const BUCKET = "blog-draft-images";

function canWrite(acc: Awaited<ReturnType<typeof getAccess>>) {
  return acc.role === "admin" || ["alison@coolkidz.com.au"].includes((acc.user?.email ?? "").toLowerCase());
}

export async function POST(req: Request) {
  const acc = await getAccess();
  if (!canWrite(acc)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 }); }
  const action = String(b.action || "");
  const id = String(b.id || "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "Missing draft id" }, { status: 400 });

  const sb = await createClient();

  if (action === "init") {
    const contentType = String(b.contentType || "");
    if (!contentType.startsWith("image/")) return NextResponse.json({ ok: false, error: "Images only" }, { status: 400 });
    const bytes = Number(b.bytes) || 0;
    if (bytes > 15 * 1024 * 1024) return NextResponse.json({ ok: false, error: "Image over 15MB — resize it first" }, { status: 400 });
    await sb.storage.createBucket(BUCKET, { public: true }).catch(() => {});
    const ext = (String(b.fileName || "").split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const path = `${id}/${Date.now()}.${ext}`;
    const { data, error } = await sb.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error || !data) return NextResponse.json({ ok: false, error: error?.message || "Could not start the upload" }, { status: 500 });
    return NextResponse.json({ ok: true, path, token: data.token, signedUrl: data.signedUrl });
  }

  if (action === "finish") {
    const path = String(b.path || "");
    if (!path) return NextResponse.json({ ok: false, error: "Missing path" }, { status: 400 });
    const url = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    const { error } = await sb.from("blog_drafts").update({ image_url: url, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, url });
  }

  return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
}
