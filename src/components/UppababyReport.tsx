"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { buildSnapshot, type SnapshotInput } from "@/lib/snapshot";
import { buildUppababy, uppababyHtml, parseUppababyGrid, type UppaRow } from "@/lib/uppababy";

type Props = Omit<SnapshotInput, "brand" | "note"> & {
  brands: { id: number; name: string }[];
  canUpload: boolean;
};

export function UppababyReport({ brands, canUpload, month, monthKeys, monthLabels, fyLabel, ...data }: Props) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const brand = brands.find(b => /uppababy/i.test(b.name)) ?? brands[0];
  const [rows, setRows] = useState<UppaRow[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "needsSetup" | "empty">("loading");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function loadRows() {
    fetch("/api/uppababy-sales").then(r => r.json()).then(d => {
      if (d.needsSetup) setState("needsSetup");
      else { setRows(d.rows ?? []); setState((d.rows ?? []).length ? "ready" : "empty"); }
    }).catch(() => setState("empty"));
  }
  useEffect(() => { loadRows(); }, []);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setBusy(true); setMsg("Reading spreadsheet…");
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const ws = wb.Sheets[wb.SheetNames.find(n => /sales/i.test(n)) ?? wb.SheetNames[0]];
      const grid = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, blankrows: false, defval: "" });
      const parsed = parseUppababyGrid(grid);
      if (!parsed.length) throw new Error("No channel rows found — check the file matches the UPPAbaby sales report format.");
      setMsg(`Parsed ${parsed.length} rows. Saving…`);
      const res = await fetch("/api/uppababy-sales", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows: parsed }) }).then(r => r.json());
      if (!res.ok) throw new Error(res.message || "Save failed");
      setMsg("Saved."); setRows(parsed); setState("ready"); setTimeout(() => setMsg(null), 1500);
    } catch (err: any) { setMsg(`Could not import: ${err.message}`); }
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  const periodLabel = useMemo(() => {
    const [y, mm] = month.split("-").map(Number);
    return new Date(y, (mm || 1) - 1, 1).toLocaleDateString("en-AU", { month: "long", year: "numeric" });
  }, [month]);

  const html = useMemo(() => {
    if (!brand || !rows.length) return "";
    const snap = buildSnapshot({ brand, month, monthKeys, monthLabels, fyLabel, note: "", ...data });
    return uppababyHtml(buildUppababy(rows), snap, periodLabel);
  }, [brand, rows, month, monthKeys, monthLabels, fyLabel, data, periodLabel]);

  function printIt() { const w = frameRef.current?.contentWindow; if (w) { w.focus(); w.print(); } }
  function download() {
    const blob = new Blob([html], { type: "text/html" }); const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `UPPAbaby_${periodLabel.replace(/\s+/g, "_")}_Sales_Report.html`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  const Upload = canUpload ? (
    <>
      <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />
      <button onClick={() => fileRef.current?.click()} disabled={busy} className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-slate-800 hover:bg-slate-900 disabled:opacity-60 rounded-lg px-3.5 py-1.5 transition">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
        {busy ? "Working…" : rows.length ? "Re-upload report" : "Upload UPPAbaby report"}
      </button>
    </>
  ) : null;

  if (state === "needsSetup") return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-400">Run <code className="bg-gray-50 px-1 rounded">supabase/add_uppababy_sales.sql</code> first, then upload the report.</div>;
  if (state === "loading") return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-400">Loading…</div>;
  if (state === "empty") return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
      <div className="text-4xl mb-3">📈</div>
      <p className="text-gray-500 font-medium">No UPPAbaby sales report uploaded yet</p>
      <p className="text-sm text-gray-400 mt-1 mb-4">Upload your monthly “CK - UPPAbaby Sales Report” spreadsheet to generate the document.</p>
      <div className="flex justify-center">{Upload}</div>
      {msg && <p className="text-xs text-gray-500 mt-3">{msg}</p>}
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 no-print">
        <span className="text-xs text-gray-400">{rows.length} data points · {periodLabel}</span>
        <div className="flex items-center gap-2">
          {msg && <span className="text-xs text-gray-500">{msg}</span>}
          {Upload}
          <button onClick={download} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg px-3.5 py-1.5 transition">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" /></svg>
            Download HTML
          </button>
          <button onClick={printIt} className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-slate-800 hover:bg-slate-900 rounded-lg px-3.5 py-1.5 transition shadow-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2z" /></svg>
            Print / PDF
          </button>
        </div>
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <iframe ref={frameRef} title="uppababy-report" srcDoc={html} className="w-full" style={{ height: "1480px", border: 0 }} />
      </div>
    </div>
  );
}
