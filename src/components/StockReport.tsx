"use client";

import { useEffect, useMemo, useState } from "react";
import { KlaviyoSendPanel } from "./KlaviyoSend";
import { OOS_REPORT_AUDIENCE } from "@/lib/klaviyoAudience";

// Operations > Stock Report — OOS-style live mirror of the Asana Stock Report
// board: per-brand table sections (brand-coloured bands) with Product / Code /
// Stock Status / Ordering For / Notes columns from Asana custom fields.
// Ticking the circle completes the task in Asana.
type Task = {
  gid: string; name: string; notes: string; due_on: string | null;
  section: string | null; permalink_url: string | null; requested_by?: string | null;
  custom_fields?: Record<string, string> | null;
};
type BrandRef = { name: string; color: string };

// Pull a value from the custom-field map by fuzzy name match.
function field(t: Task, patterns: RegExp[]): string | null {
  const cf = t.custom_fields || {};
  for (const pat of patterns) {
    const key = Object.keys(cf).find(k => pat.test(k));
    if (key && cf[key]) return cf[key];
  }
  return null;
}
const statusCls = (s: string) => {
  const v = s.toLowerCase();
  if (/out/.test(v)) return "bg-rose-50 text-rose-500";
  if (/low/.test(v)) return "bg-amber-50 text-amber-600";
  if (/back|order/.test(v)) return "bg-sky-50 text-sky-600";
  return "bg-slate-50 text-slate-500";
};
const statusColors = (s: string) => {
  const v = s.toLowerCase();
  if (/out/.test(v)) return { bg: "#fee2e2", fg: "#be123c" };
  if (/low/.test(v)) return { bg: "#fef3c7", fg: "#b45309" };
  if (/back|order/.test(v)) return { bg: "#e0f2fe", fg: "#0369a1" };
  return { bg: "#f1f5f9", fg: "#475569" };
};

// Coolkidz Australia's wordmark, already hosted on Klaviyo's own CDN from a
// prior campaign — reusing that URL avoids re-uploading the brand asset.
const COOLKIDZ_LOGO_URL = "https://d3k81ch9hvuctc.cloudfront.net/company/VWb5Lq/images/b46f7ab2-330a-426a-8acb-b4b307fd0b07.jpeg";

// A self-contained, table-based HTML email (inline styles only, one fixed
// branded header + compliant footer every time) so it survives being pasted
// into Klaviyo's HTML editor unchanged, and looks identical whether it's
// copy-pasted or sent as a real campaign via the API.
function buildStockReportHtml(
  sections: [string, Task[]][],
  colorOf: (name: string) => string,
) {
  const today = new Date().toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
  const sectionsHtml = sections.map(([section, list]) => {
    const col = colorOf(section);
    const oos = list.filter(t => /out/i.test(field(t, [/stock.*status/i, /^status$/i]) || "")).length;
    const low = list.filter(t => /low/i.test(field(t, [/stock.*status/i, /^status$/i]) || "")).length;
    const rowsHtml = list.map((t, i) => {
      const code = field(t, [/code/i, /sku/i]);
      const status = field(t, [/stock.*status/i, /^status$/i]);
      const ordering = field(t, [/order/i, /eta/i, /arriv/i, /due/i]) ?? (t.due_on ? new Date(t.due_on + "T00:00:00").toLocaleDateString("en-AU", { month: "long", year: "numeric" }) : null);
      const notes = field(t, [/^notes$/i]) || t.notes?.trim() || null;
      const sc = status ? statusColors(status) : null;
      const bg = i % 2 === 1 ? "#f8fafc" : "#ffffff";
      return `
      <tr>
        <td style="padding:10px 12px;background:${bg};border-bottom:1px solid #eef2f7;font:600 13.5px Arial,Helvetica,sans-serif;color:#334155;">${t.name}</td>
        <td style="padding:10px 12px;background:${bg};border-bottom:1px solid #eef2f7;font:12px 'Courier New',monospace;color:#64748b;white-space:nowrap;">${code ?? "—"}</td>
        <td style="padding:10px 12px;background:${bg};border-bottom:1px solid #eef2f7;white-space:nowrap;">${status ? `<span style="display:inline-block;padding:2px 9px;border-radius:10px;font:bold 11px Arial,Helvetica,sans-serif;background:${sc!.bg};color:${sc!.fg};">${status}</span>` : "—"}</td>
        <td style="padding:10px 12px;background:${bg};border-bottom:1px solid #eef2f7;font:13px Arial,Helvetica,sans-serif;color:#475569;white-space:nowrap;">${ordering ?? "—"}</td>
        <td style="padding:10px 12px;background:${bg};border-bottom:1px solid #eef2f7;font:13px Arial,Helvetica,sans-serif;color:#64748b;">${notes ?? "—"}</td>
      </tr>`;
    }).join("");
    return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:680px;margin:0 auto 22px;border:1px solid #e5e9f0;border-radius:8px;overflow:hidden;">
    <tr>
      <td style="padding:12px 16px;background:${col}14;border-top:3px solid ${col};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="font:bold 15px Arial,Helvetica,sans-serif;color:#0f172a;">${section}<span style="font:11px Arial,Helvetica,sans-serif;color:#94a3b8;font-weight:normal;"> · ${list.length} item${list.length === 1 ? "" : "s"}</span></td>
          <td style="text-align:right;white-space:nowrap;">
            ${oos > 0 ? `<span style="display:inline-block;margin-left:6px;padding:2px 9px;border-radius:10px;font:bold 11px Arial,Helvetica,sans-serif;background:#fee2e2;color:#be123c;">${oos} Out of Stock</span>` : ""}
            ${low > 0 ? `<span style="display:inline-block;margin-left:6px;padding:2px 9px;border-radius:10px;font:bold 11px Arial,Helvetica,sans-serif;background:#fef3c7;color:#b45309;">${low} Low in Stock</span>` : ""}
          </td>
        </tr></table>
      </td>
    </tr>
    <tr><td>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr style="background:#0f172a;">
          <td style="padding:8px 12px;font:bold 10px Arial,Helvetica,sans-serif;color:#ffffff;text-transform:uppercase;letter-spacing:0.06em;">Product</td>
          <td style="padding:8px 12px;font:bold 10px Arial,Helvetica,sans-serif;color:#ffffff;text-transform:uppercase;letter-spacing:0.06em;">Code</td>
          <td style="padding:8px 12px;font:bold 10px Arial,Helvetica,sans-serif;color:#ffffff;text-transform:uppercase;letter-spacing:0.06em;">Stock status</td>
          <td style="padding:8px 12px;font:bold 10px Arial,Helvetica,sans-serif;color:#ffffff;text-transform:uppercase;letter-spacing:0.06em;">Ordering for</td>
          <td style="padding:8px 12px;font:bold 10px Arial,Helvetica,sans-serif;color:#ffffff;text-transform:uppercase;letter-spacing:0.06em;">Notes</td>
        </tr>
        ${rowsHtml}
      </table>
    </td></tr>
  </table>`;
  }).join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f5;padding:32px 16px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:720px;background:#ffffff;border-radius:14px;border:1px solid #e5e9f0;overflow:hidden;font-family:Arial,Helvetica,sans-serif;">

      <!-- Header -->
      <tr><td style="padding:36px 32px 28px;text-align:center;border-bottom:1px solid #eef1f5;">
        <img src="${COOLKIDZ_LOGO_URL}" width="168" alt="Coolkidz Australia" style="display:block;margin:0 auto 22px;border:0;outline:none;height:auto;">
        <p style="margin:0 0 6px;font:bold 11px Arial,Helvetica,sans-serif;color:#94a3b8;text-transform:uppercase;letter-spacing:0.22em;">Wholesale Partner Update</p>
        <p style="margin:0 0 4px;font:bold 26px Arial,Helvetica,sans-serif;color:#0f172a;letter-spacing:-0.01em;">Stock Availability Report</p>
        <p style="margin:0;font:13px Arial,Helvetica,sans-serif;color:#94a3b8;">${today}</p>
      </td></tr>

      <!-- Body -->
      <tr><td style="padding:32px 28px;">
        ${sectionsHtml || `<p style="text-align:center;font:14px Arial,Helvetica,sans-serif;color:#059669;padding:20px 0;">✓ Nothing on the stock report right now.</p>`}
      </td></tr>

      <!-- Footer -->
      <tr><td style="padding:24px 32px 32px;border-top:1px solid #eef1f5;text-align:center;">
        <img src="${COOLKIDZ_LOGO_URL}" width="96" alt="Coolkidz Australia" style="display:block;margin:0 auto 14px;border:0;outline:none;height:auto;opacity:0.85;">
        <p style="margin:0 0 4px;font:bold 12.5px Arial,Helvetica,sans-serif;color:#475569;">Coolkidz Australia</p>
        <p style="margin:0 0 2px;font:11.5px Arial,Helvetica,sans-serif;color:#94a3b8;">1 Beyer Road, Braeside VIC 3195, Australia</p>
        <p style="margin:0 0 14px;font:11.5px Arial,Helvetica,sans-serif;color:#94a3b8;"><a href="mailto:hello@coolkidz.com.au" style="color:#94a3b8;text-decoration:underline;">hello@coolkidz.com.au</a> &nbsp;·&nbsp; <a href="https://coolkidz.com.au" style="color:#94a3b8;text-decoration:underline;">coolkidz.com.au</a></p>
        <p style="margin:0;font:11px Arial,Helvetica,sans-serif;color:#c2c9d3;">You're receiving this as a Coolkidz Australia wholesale partner. <a href="{% unsubscribe_link %}" style="color:#c2c9d3;text-decoration:underline;">Unsubscribe</a></p>
      </td></tr>

    </table>
  </td></tr>
</table>`;
}

export function StockReport({ brands = [], admin }: { brands?: BrandRef[]; admin: boolean }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [asanaWrite, setAsanaWrite] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [af, setAf] = useState({ name: "", due_on: "" });
  const [busy, setBusy] = useState(false);
  const [synced, setSynced] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/content-todo?label=Stock%20Report").then(r => r.json()).then(d => {
      if (d.ok) {
        // Only real stock lines come through — tasks with no custom fields
        // (section headers, "Last Updated" markers) stay in Asana.
        setTasks((d.tasks ?? []).filter((t: any) => t.custom_fields && Object.keys(t.custom_fields).length > 0));
        setAsanaWrite(!!d.asanaWrite);
        const mods = (d.tasks ?? []).map((t: any) => t.modified_at).filter(Boolean).sort();
        setSynced(d.synced ?? (mods[mods.length - 1] ?? null));
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const post = (body: any) => fetch("/api/design", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(r => r.json());
  const color = (name: string) => brands.find(b => b.name.toLowerCase() === (name || "").toLowerCase())?.color ?? "#94a3b8";
  const hasFields = useMemo(() => tasks.some(t => t.custom_fields && Object.keys(t.custom_fields).length > 0), [tasks]);

  const sections = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const t of tasks) m.set(t.section || "General", [...(m.get(t.section || "General") ?? []), t]);
    for (const [k, list] of m) m.set(k, [...list].sort((a, b) => a.name.localeCompare(b.name)));
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  }, [tasks]);

  async function complete(gid: string) {
    const prev = tasks;
    setTasks(p => p.filter(t => t.gid !== gid));
    const d = await post({ action: "task.complete", gid });
    if (!d.ok) { setTasks(prev); setErr(d.error || "Couldn't complete in Asana."); }
  }
  async function createTask() {
    if (!af.name.trim()) { setErr("Item name required."); return; }
    setBusy(true); setErr("");
    const d = await post({ action: "task.create", name: af.name, due_on: af.due_on, project_gid: "1148429855158443", project_label: "Stock Report" });
    setBusy(false);
    if (d.ok) { setTasks(p => [d.item, ...p]); setAf({ name: "", due_on: "" }); setShowAdd(false); }
    else setErr(d.error || "Couldn't create the task.");
  }
  async function copyHtml() {
    const html = buildStockReportHtml(sections, color);
    try {
      await navigator.clipboard.writeText(html);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = html; document.body.appendChild(ta); ta.select();
      document.execCommand("copy"); document.body.removeChild(ta);
    }
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }

  if (loading) return <div className="p-8 text-center text-sm text-gray-400">Loading…</div>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">OOS Report</h1>
          <p className="text-sm text-gray-400">Live mirror of the Asana <strong>Stock Report</strong> board{synced ? ` · last synced ${new Date(synced).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}` : ""} · ticks write back to Asana.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {sections.length > 0 && (
            <button onClick={copyHtml} className="text-sm font-semibold text-slate-600 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg px-4 py-2">
              {copied ? "✓ Copied" : "Copy HTML for Klaviyo"}
            </button>
          )}
          {asanaWrite && admin && <button onClick={() => setShowAdd(v => !v)} className="text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg px-4 py-2">{showAdd ? "Cancel" : "+ Add item"}</button>}
        </div>
      </div>
      {err && <p className="text-sm text-rose-500">{err}</p>}
      {!hasFields && tasks.length > 0 && (
        <p className="text-[12px] text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">Code / stock status columns fill after the next sync (and <code className="bg-white px-1 rounded">add_asana_custom_fields.sql</code> has been run).</p>
      )}
      {showAdd && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 flex flex-wrap gap-2">
          <input value={af.name} onChange={e => setAf({ ...af, name: e.target.value })} placeholder="Product / item" className="text-sm border border-gray-200 rounded-lg px-3 py-2 text-slate-700 flex-1 min-w-[220px] focus:outline-none focus:ring-2 focus:ring-emerald-400" />
          <input type="date" value={af.due_on} onChange={e => setAf({ ...af, due_on: e.target.value })} className="text-sm border border-gray-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400" />
          <button onClick={createTask} disabled={busy} className="text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg px-4 py-2 disabled:opacity-60">{busy ? "Adding…" : "Add to Asana"}</button>
        </div>
      )}
      {tasks.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-400">Nothing on the stock report — it fills from Asana after the next sync.</div>
      )}

      {sections.map(([section, list]) => {
        const col = color(section);
        const oos = list.filter(t => /out/i.test(field(t, [/stock.*status/i, /^status$/i]) || "")).length;
        const low = list.filter(t => /low/i.test(field(t, [/stock.*status/i, /^status$/i]) || "")).length;
        return (
          <div key={section} className="bg-white rounded-[28px] shadow-[0_1px_3px_rgba(15,23,42,0.04),0_10px_24px_-16px_rgba(15,23,42,0.12)] overflow-hidden border border-gray-50">
            <div className="flex items-center gap-3 px-6 py-4" style={{ background: `linear-gradient(135deg, ${col}1a, ${col}08)` }}>
              <span className="w-3 h-3 rounded-full shrink-0" style={{ background: col }} />
              <p className="text-[15px] font-bold text-slate-700">{section}</p>
              <span className="text-[10.5px] font-semibold rounded-full px-2.5 py-0.5" style={{ background: `${col}1f`, color: col }}>{list.length} item{list.length === 1 ? "" : "s"}</span>
              <span className="ml-auto flex gap-1.5">
                {oos > 0 && <span className="text-[10.5px] font-bold rounded-full px-2.5 py-1 bg-rose-50 text-rose-500">{oos} Out of Stock</span>}
                {low > 0 && <span className="text-[10.5px] font-bold rounded-full px-2.5 py-1 bg-amber-50 text-amber-600">{low} Low in Stock</span>}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider" style={{ background: `${col}0d` }}>
                    <th className="text-left px-6 py-3 font-bold" style={{ color: col }}>Product</th>
                    <th className="text-left px-3 py-3 font-bold" style={{ color: col }}>Code</th>
                    <th className="text-left px-3 py-3 font-bold" style={{ color: col }}>Stock status</th>
                    <th className="text-left px-3 py-3 font-bold" style={{ color: col }}>Ordering for</th>
                    <th className="text-left px-3 py-3 font-bold" style={{ color: col }}>Notes</th>
                    <th className="px-3 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {list.map((t, i) => {
                    const code = field(t, [/code/i, /sku/i]);
                    const status = field(t, [/stock.*status/i, /^status$/i]);
                    const ordering = field(t, [/order/i, /eta/i, /arriv/i, /due/i]);
                    return (
                      <tr key={t.gid} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/40 transition-colors" style={i % 2 === 1 ? { background: `${col}06` } : undefined}>
                        <td className="px-6 py-3">
                          <span className="inline-flex items-center gap-3">
                            <button onClick={() => complete(t.gid)} title="Mark resolved (completes in Asana)"
                              className="w-[16px] h-[16px] rounded-full border-2 border-gray-200 hover:border-emerald-400 hover:bg-emerald-50 shrink-0 transition-colors" />
                            <span className="font-medium text-slate-700">{t.name}</span>
                          </span>
                        </td>
                        <td className="px-3 py-3 font-mono text-[12px] text-slate-400">{code ?? "—"}</td>
                        <td className="px-3 py-3">{status ? <span className={`text-[11px] font-bold rounded-full px-2.5 py-1 ${statusCls(status)}`}>{status}</span> : <span className="text-slate-300">—</span>}</td>
                        <td className="px-3 py-3 text-slate-500">{ordering ?? (t.due_on ? new Date(t.due_on + "T00:00:00").toLocaleDateString("en-AU", { month: "long" }) : "—")}</td>
                        <td className="px-3 py-3 text-slate-400 text-[13px] max-w-[280px] truncate" title={field(t, [/^notes$/i]) || t.notes || undefined}>{field(t, [/^notes$/i]) || t.notes?.trim() || "—"}</td>
                        <td className="px-3 py-3 text-right">
                          {t.permalink_url && <a href={t.permalink_url} target="_blank" rel="noreferrer" title="Open in Asana" className="text-gray-300 hover:text-emerald-500">↗</a>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {admin && sections.length > 0 && (
        <KlaviyoSendPanel
          getHtml={() => `<!doctype html><html><head><meta charset="utf-8"></head><body>${buildStockReportHtml(sections, color)}</body></html>`}
          defaultSubject={`Coolkidz Australia — OOS Report, ${new Date().toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}`}
          fixedAudience={OOS_REPORT_AUDIENCE}
        />
      )}
    </div>
  );
}
