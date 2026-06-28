"use client";
import { useEffect, useState } from "react";

const C = { ink: "#0B1530", navy: "#11224A", cream: "#F5F1E8", paper: "#FBF9F3", sand: "#C9A24B", line: "#E2DBCB", must: "#B43A3A", check: "#B5852A" };

export function BriefingEngine() {
  const [brands, setBrands] = useState<any[]>([]);
  const [brand, setBrand] = useState<any>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [momentId, setMomentId] = useState("");
  const [pillarId, setPillarId] = useState("");
  const [channels, setChannels] = useState<string[]>([]);
  const [focus, setFocus] = useState("");
  const [owner, setOwner] = useState("Mel");
  const [due, setDue] = useState("");
  const [brief, setBrief] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [cleared, setCleared] = useState(false);

  useEffect(() => {
    fetch("/api/briefs/brands").then((r) => r.json()).then((d) => {
      setNeedsSetup(!!d.needsSetup);
      setBrands(d.brands || []);
      if (d.brands?.[0]) selectBrand(d.brands[0]);
    }).catch(() => setError("Could not load brands."));
  }, []);

  function selectBrand(b: any) {
    setBrand(b); setBrief(null); setChannels([]); setCleared(false);
    const m = b.profile.moments[0];
    setMomentId(m.id); setPillarId(m.pillar);
  }
  function pickMoment(id: string) {
    setMomentId(id);
    setPillarId(brand.profile.moments.find((m: any) => m.id === id).pillar);
  }
  const toggleChannel = (id: string) => setChannels((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  async function generate() {
    if (!brand || channels.length === 0) { setError("Pick a moment and at least one channel."); return; }
    setError(""); setLoading(true); setBrief(null); setCleared(false);
    try {
      const res = await fetch("/api/briefs/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandSlug: brand.slug, momentId, pillarId, channels, focus, owner, dueDate: due }),
      });
      const data = await res.json();
      if (data.error) setError(data.detail ? `${data.error}: ${data.detail}` : data.error); else setBrief(data.brief);
    } catch { setError("Generation did not complete. Try again."); }
    finally { setLoading(false); }
  }

  async function clearCompliance(next: boolean) {
    setCleared(next);
    await fetch(`/api/briefs/${brief.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ compliance_cleared: next }) });
  }

  async function approve() {
    const res = await fetch(`/api/briefs/${brief.id}/approve`, { method: "POST" });
    const data = await res.json();
    if (data.error) setError(data.error);
    else { setError(""); setBrief({ ...brief, status: data.pushedTasks?.length ? "pushed" : "approved" }); }
  }

  const profile = brand?.profile;
  const hasMust = (brief?.compliance_flags || []).some((f: any) => f.level === "must");
  const approved = brief && (brief.status === "approved" || brief.status === "pushed");
  const cn = (id: string) => profile?.channels.find((c: any) => c.id === id)?.name || id;
  const cp = (id: string) => profile?.channels.find((c: any) => c.id === id)?.presets || "";

  if (needsSetup) return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
      <p className="text-sm text-gray-500 font-medium">Briefing Engine not set up yet</p>
      <p className="text-xs text-gray-400 mt-1">Run <code className="bg-gray-50 px-1 rounded">supabase/briefing_engine.sql</code>, then add <code className="bg-gray-50 px-1 rounded">ANTHROPIC_API_KEY</code> and <code className="bg-gray-50 px-1 rounded">ASANA_TOKEN</code> to the Vercel project env.</p>
    </div>
  );
  if (!brand) return <div className="p-6 text-sm text-gray-400">Loading brands…</div>;

  const Lbl = ({ children }: any) => <div className="text-[11px] uppercase tracking-widest mb-1.5 opacity-50">{children}</div>;

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: C.paper, color: C.ink }}>
      <div className="grid md:grid-cols-2 gap-8 p-6">
        {/* LEFT: inputs */}
        <div>
          <Lbl>Brand</Lbl>
          <select value={brand.slug} onChange={(e) => selectBrand(brands.find((b) => b.slug === e.target.value))}
            className="w-full mb-4 px-3 py-2 rounded bg-white text-sm" style={{ border: `1px solid ${C.line}` }}>
            {brands.map((b) => <option key={b.slug} value={b.slug}>{b.name} (Tier {b.tier})</option>)}
          </select>

          <Lbl>Campaign moment</Lbl>
          <div className="space-y-1.5 mb-4">
            {profile.moments.map((m: any) => (
              <button key={m.id} onClick={() => pickMoment(m.id)} className="w-full text-left px-3 py-2 rounded text-sm transition"
                style={{ background: momentId === m.id ? C.navy : "#fff", color: momentId === m.id ? C.cream : C.ink, border: `1px solid ${momentId === m.id ? C.navy : C.line}` }}>
                {m.name}
              </button>
            ))}
          </div>

          <Lbl>Channels</Lbl>
          <div className="grid grid-cols-2 gap-1.5 mb-4">
            {profile.channels.map((c: any) => (
              <button key={c.id} onClick={() => toggleChannel(c.id)} className="text-left px-3 py-2 rounded text-xs transition"
                style={{ background: channels.includes(c.id) ? C.cream : "#fff", border: `1px solid ${channels.includes(c.id) ? C.sand : C.line}` }}>
                {c.name}
              </button>
            ))}
          </div>

          <Lbl>Specific focus (optional)</Lbl>
          <input value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="e.g. Pro Camera bundle, expo follow-up"
            className="w-full mb-3 px-3 py-2 rounded bg-white text-sm" style={{ border: `1px solid ${C.line}` }} />
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div><Lbl>Owner</Lbl><input value={owner} onChange={(e) => setOwner(e.target.value)} className="w-full px-3 py-2 rounded bg-white text-sm" style={{ border: `1px solid ${C.line}` }} /></div>
            <div><Lbl>Due date</Lbl><input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="w-full px-3 py-2 rounded bg-white text-sm" style={{ border: `1px solid ${C.line}` }} /></div>
          </div>
          <button onClick={generate} disabled={loading || channels.length === 0} className="w-full py-3 rounded text-sm font-medium"
            style={{ background: C.navy, color: C.cream, opacity: loading || channels.length === 0 ? 0.6 : 1 }}>
            {loading ? <span className="inline-flex items-center gap-2"><span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin motion-reduce:animate-none" />Drafting brief…</span> : "Draft brief"}
          </button>
          {error && <p className="text-xs mt-2" style={{ color: C.must }}>{error}</p>}
        </div>

        {/* RIGHT: output */}
        <div>
          {!brief && !loading && (
            <div className="rounded p-6 text-sm" style={{ border: `1px dashed ${C.line}`, color: C.navy }}>
              <p className="text-lg mb-2" style={{ fontFamily: "Georgia, serif" }}>The brief lands here</p>
              <p className="opacity-70 leading-relaxed">Pick a moment and channels, then draft. The engine pulls the pillar, audience angle, channel specs, mandatory inclusions and the brand compliance flags automatically. You approve before anything ships.</p>
            </div>
          )}
          {loading && (
            <div className="rounded-2xl p-10 flex flex-col items-center justify-center gap-3 bg-white" style={{ border: `1px solid ${C.line}` }}>
              <span className="w-9 h-9 rounded-full border-[3px] border-gray-200 animate-spin motion-reduce:animate-none" style={{ borderTopColor: C.navy }} />
              <p className="text-sm font-medium" style={{ color: C.navy }}>Drafting your brief…</p>
              <p className="text-xs opacity-50 text-center">Pulling the profile, applying guardrails and the live range, writing the direction. This can take a few seconds.</p>
            </div>
          )}

          {brief && (
            <div className="rounded overflow-hidden bg-white" style={{ border: `1px solid ${C.line}` }}>
              <div className="px-5 py-4" style={{ background: C.navy, color: C.cream }}>
                <div className="text-xs uppercase tracking-widest" style={{ color: C.sand }}>{brief.moment}</div>
                <h2 className="text-xl mt-1" style={{ fontFamily: "Georgia, serif" }}>{brief.title}</h2>
                <div className="text-xs mt-2 opacity-80">{brand.name} · Tier {brand.tier} · {brief.pillar}</div>
              </div>
              <div className="px-5 py-4 space-y-4 text-sm">
                <div><Lbl>Concept</Lbl><p>{brief.concept}</p></div>
                <div><Lbl>Key message</Lbl><p>{brief.key_message}</p></div>
                <div><Lbl>Audience angle</Lbl><p>{brief.audience_note}</p></div>
                <div>
                  <Lbl>Channel deliverables</Lbl>
                  {(brief.deliverables || []).map((d: any) => (
                    <div key={d.id} className="rounded-lg p-3.5 mt-2" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
                      <div className="font-medium" style={{ color: C.navy }}>{cn(d.id)}</div>
                      <div className="text-xs opacity-60">{cp(d.id)}</div>
                      <div className="mt-2.5">
                        <div className="opacity-50 text-[11px] uppercase tracking-wide mb-0.5">Copy</div>
                        <p className="leading-relaxed whitespace-pre-line">{(d.copy_direction || "").replace(/\s*\|\s*/g, "\n")}</p>
                      </div>
                      <div className="mt-3">
                        <div className="opacity-50 text-[11px] uppercase tracking-wide mb-0.5">{d.id === "blog" ? "SEO / structure" : "Visual"}</div>
                        <p className="leading-relaxed whitespace-pre-line">{(d.visual_direction || "").replace(/\s*\|\s*/g, "\n")}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div><Lbl>Mandatory inclusions</Lbl><ul className="space-y-1">{(brief.mandatory || []).map((m: string, i: number) => <li key={i} className="flex gap-2"><span style={{ color: C.sand }}>+</span><span>{m}</span></li>)}</ul></div>
                <div className="rounded p-3" style={{ border: `1px solid ${C.must}`, background: "#FBF1F1" }}>
                  <Lbl>Compliance flags</Lbl>
                  {(brief.compliance_flags || []).map((f: any, i: number) => (
                    <div key={i} className="flex gap-2 text-xs mt-1.5">
                      <span className="px-1.5 py-0.5 rounded uppercase shrink-0 h-fit" style={{ background: f.level === "must" ? C.must : C.check, color: "#fff" }}>{f.level}</span>
                      <span>{f.note}</span>
                    </div>
                  ))}
                  {hasMust && !approved && (
                    <label className="flex items-center gap-2 text-xs mt-3 pt-2" style={{ borderTop: `1px solid ${C.line}` }}>
                      <input type="checkbox" checked={cleared} onChange={(e) => clearCompliance(e.target.checked)} />
                      I have reviewed and signed off the MUST flags
                    </label>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={approve} disabled={approved || (hasMust && !cleared)} className="flex-1 py-2 rounded text-xs font-medium"
                    style={{ background: C.navy, color: C.cream, opacity: approved || (hasMust && !cleared) ? 0.5 : 1 }}>
                    {approved ? (brief.status === "pushed" ? "Pushed to team" : "Approved") : "Approve and push to team"}
                  </button>
                  <a href={`/briefs/${brief.id}/print`} target="_blank" rel="noopener noreferrer" className="flex-1 py-2 rounded text-xs font-medium text-center" style={{ background: "#fff", color: C.navy, border: `1px solid ${C.navy}` }}>
                    Print / PDF
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
