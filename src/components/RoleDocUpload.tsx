"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Upload a role-document version (e.g. a signed copy) as a read-only attachment.
export function RoleDocUpload({ staffId }: { staffId: string }) {
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file) { setErr("Choose a file first."); return; }
    setBusy(true); setErr("");
    try {
      const fd = new FormData();
      fd.set("staff_id", staffId); fd.set("label", label); fd.set("file", file);
      const d = await fetch("/api/scorecards/document", { method: "POST", body: fd }).then(r => r.json());
      if (d.ok) { setLabel(""); if (fileRef.current) fileRef.current.value = ""; router.refresh(); }
      else setErr(d.error || "Upload failed.");
    } catch { setErr("Upload failed — check your connection."); }
    finally { setBusy(false); }
  }

  return (
    <div className="rounded-xl bg-gray-50/70 border border-gray-100 p-3 flex flex-wrap items-center gap-2">
      <input ref={fileRef} type="file" accept=".docx,.doc,.pdf" className="text-sm text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100" />
      <input value={label} onChange={e => setLabel(e.target.value)} placeholder='Version label, e.g. "Signed copy"' className="flex-1 min-w-[180px] text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-400" />
      <button onClick={upload} disabled={busy} className="text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg px-4 py-2 disabled:opacity-60">{busy ? "Uploading…" : "Upload version"}</button>
      {err && <span className="text-sm text-rose-500 w-full">{err}</span>}
    </div>
  );
}
