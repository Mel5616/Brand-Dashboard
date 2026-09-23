// Scheduled-job health: the GitHub Actions workflows that feed the dashboard,
// read straight from the GitHub API with the same token the Sync Now button
// dispatches with. Each job carries how often it should run; a job that has
// not completed inside that window (plus slack) is "stale", a failed latest
// run is "failed". Manual-only workflows are listed but never flagged.
export type Job = { file: string; label: string; every: string; expectHours: number | null };
export const JOBS: Job[] = [
  { file: "sync.yml", label: "Dashboard sync (Shopify, Klaviyo, flows, calendar)", every: "every 3 hours", expectHours: 4 },
  { file: "review_rewards.yml", label: "Reviews mirror + $5 rewards", every: "hourly", expectHours: 2.5 },
  { file: "today_alerts.yml", label: "Today alerts", every: "hourly", expectHours: 2.5 },
  { file: "today_digest.yml", label: "Morning digest", every: "daily 7am", expectHours: 26 },
  { file: "build_context_packs.yml", label: "Weekly Command context packs", every: "daily 3am", expectHours: 26 },
  { file: "sync_semrush.yml", label: "Semrush sync", every: "Mondays", expectHours: 24 * 8 },
  { file: "d2c-report.yml", label: "D2C weekly report", every: "Sundays", expectHours: 24 * 8 },
  { file: "ltv.yml", label: "LTV cohorts", every: "monthly", expectHours: 24 * 33 },
  { file: "sync_filecamp_assets.yml", label: "Filecamp assets", every: "manual", expectHours: null },
];
export type JobRun = Job & { status: "ok" | "failed" | "stale" | "running" | "never" | "unknown"; lastRun: string | null; conclusion: string | null; url: string | null };

const REPO = process.env.GITHUB_REPO || "Mel5616/Brand-Dashboard";

export async function jobHealth(): Promise<{ jobs: JobRun[]; source: "github" | "none" }> {
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!token) return { jobs: JOBS.map(j => ({ ...j, status: "unknown", lastRun: null, conclusion: null, url: null })), source: "none" };
  const jobs = await Promise.all(JOBS.map(async (j): Promise<JobRun> => {
    try {
      const res = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${j.file}/runs?per_page=1`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" }, cache: "no-store" });
      if (!res.ok) return { ...j, status: "unknown", lastRun: null, conclusion: null, url: null };
      const run = ((await res.json()).workflow_runs || [])[0];
      if (!run) return { ...j, status: "never", lastRun: null, conclusion: null, url: null };
      const at = run.updated_at || run.created_at;
      const ageH = (Date.now() - Date.parse(at)) / 36e5;
      let status: JobRun["status"] = "ok";
      if (run.status !== "completed") status = "running";
      else if (run.conclusion !== "success") status = "failed";
      else if (j.expectHours != null && ageH > j.expectHours) status = "stale";
      return { ...j, status, lastRun: at, conclusion: run.conclusion, url: run.html_url };
    } catch { return { ...j, status: "unknown", lastRun: null, conclusion: null, url: null }; }
  }));
  return { jobs, source: "github" };
}
