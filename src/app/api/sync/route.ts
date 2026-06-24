import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// "Sync Now" — triggers the GitHub Actions sync workflow (Vercel has no Python).
// Admin-only. Needs GITHUB_DISPATCH_TOKEN (fine-grained PAT, Actions: write).
const REPO = process.env.GITHUB_REPO || "Mel5616/Brand-Dashboard";
const WORKFLOW = "sync.yml";

export async function POST() {
  if ((await getAccess()).role !== "admin") {
    return NextResponse.json({ ok: false, message: "Admins only" }, { status: 403 });
  }
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!token) {
    return NextResponse.json({ ok: false, message: "Sync not configured yet (missing GitHub token)" }, { status: 500 });
  }
  const res = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref: "main" }),
    cache: "no-store",
  });
  if (res.status === 204) {
    return NextResponse.json({ ok: true, message: "Sync started — data refreshes in ~1–2 min" });
  }
  const detail = await res.text();
  return NextResponse.json({ ok: false, message: "Couldn’t start sync", error: detail.slice(0, 200) }, { status: 502 });
}
