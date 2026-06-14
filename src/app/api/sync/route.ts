import { NextResponse } from "next/server";
import { exec } from "child_process";
import path from "path";

// POST /api/sync — triggers the Python sync script.
// Protected by CRON_SECRET so only Vercel cron (and manual calls with the header) can trigger it.
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");

  // Allow calls with the secret header, OR calls with no auth from localhost (dev)
  const isVercelCron = authHeader === `Bearer ${secret}`;
  const isLocal = !secret; // no secret set in dev
  if (secret && !isVercelCron) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const scriptPath = path.join(process.cwd(), "scripts", "sync.py");

  return new Promise<NextResponse>((resolve) => {
    exec(`python3 "${scriptPath}"`, { timeout: 300_000 }, (err, stdout, stderr) => {
      if (err) {
        console.error("Sync error:", stderr);
        resolve(NextResponse.json({ ok: false, message: "Sync failed — check server logs", error: stderr }, { status: 500 }));
      } else {
        resolve(NextResponse.json({ ok: true, message: "Sync complete", output: stdout.slice(-500) }));
      }
    });
  });
}

// GET /api/sync — Vercel cron hits this (cron jobs use GET by default)
export async function GET(req: Request) {
  return POST(req);
}
