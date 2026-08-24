"use client";

import { useState } from "react";

type Product = { id: string; name: string; image_url: string | null; description: string | null };
type PriceRow = { id: string; sku: string | null; product_name: string; rrp: number | null; wholesale_price: number | null; moq: number | null };
type Question = { id: string; question: string; options: { text: string }[] };
type Kit = {
  token: string; title: string; tagline: string | null; hero_image_url: string | null; overview: string | null; order_info: string | null;
  brand_name: string; brand_color: string; brand_logo: string | null;
  products: Product[]; priceRows: PriceRow[]; questions: Question[];
};

const money = (n: number | null) => n == null ? "—" : `$${n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function KitViewer({ kit }: { kit: Kit }) {
  const sections = [
    { id: "overview", label: "Overview" },
    { id: "products", label: "Products" },
    { id: "pricing", label: "Price list" },
    { id: "order", label: "Order info" },
    { id: "training", label: "Training" },
  ] as const;
  const [tab, setTab] = useState<typeof sections[number]["id"]>("overview");
  const accent = kit.brand_color || "#132741";

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="text-white" style={{ background: accent }}>
        <div className="max-w-5xl mx-auto px-6 py-10 flex items-center gap-5">
          {kit.brand_logo && <img src={kit.brand_logo} alt={kit.brand_name} className="h-12 max-w-[160px] object-contain bg-white/95 rounded-lg p-2" />}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/70">{kit.brand_name} · Retailer kit</p>
            <h1 className="text-3xl font-extrabold mt-1">{kit.title}</h1>
            {kit.tagline && <p className="text-white/85 mt-1">{kit.tagline}</p>}
          </div>
        </div>
      </header>

      <nav className="sticky top-0 z-20 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-6 flex gap-1 overflow-x-auto">
          {sections.map(s => (
            <button key={s.id} onClick={() => setTab(s.id)}
              className="px-4 py-3 text-sm font-semibold whitespace-nowrap border-b-2 transition"
              style={tab === s.id ? { borderColor: accent, color: accent } : { borderColor: "transparent", color: "#94a3b8" }}>
              {s.label}
            </button>
          ))}
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-6 py-10">
        {tab === "overview" && (
          <div className="space-y-6">
            {kit.hero_image_url && <img src={kit.hero_image_url} alt="" className="w-full max-h-[380px] object-cover rounded-2xl" />}
            {kit.overview ? (
              <p className="text-[15px] text-slate-700 leading-relaxed whitespace-pre-line">{kit.overview}</p>
            ) : (
              <p className="text-sm text-gray-400">No overview added yet.</p>
            )}
          </div>
        )}

        {tab === "products" && (
          kit.products.length ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {kit.products.map(p => (
                <div key={p.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  {p.image_url && <img src={p.image_url} alt={p.name} className="w-full h-40 object-cover" />}
                  <div className="p-4">
                    <p className="font-bold text-slate-800">{p.name}</p>
                    {p.description && <p className="text-sm text-gray-500 mt-1 whitespace-pre-line">{p.description}</p>}
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-gray-400">No products added yet.</p>
        )}

        {tab === "pricing" && (
          kit.priceRows.length ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-[11px] font-bold uppercase tracking-wide text-gray-400">
                    <th className="px-4 py-3">SKU</th><th className="px-4 py-3">Product</th><th className="px-4 py-3 text-right">RRP</th><th className="px-4 py-3 text-right">Wholesale</th><th className="px-4 py-3 text-right">MOQ</th>
                  </tr>
                </thead>
                <tbody>
                  {kit.priceRows.map(r => (
                    <tr key={r.id} className="border-b border-gray-50 last:border-0">
                      <td className="px-4 py-2.5 text-gray-400 font-mono text-xs">{r.sku || "—"}</td>
                      <td className="px-4 py-2.5 font-semibold text-slate-700">{r.product_name}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{money(r.rrp)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{money(r.wholesale_price)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">{r.moq ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="text-sm text-gray-400">No price list added yet.</p>
        )}

        {tab === "order" && (
          kit.order_info ? (
            <p className="text-[15px] text-slate-700 leading-relaxed whitespace-pre-line">{kit.order_info}</p>
          ) : <p className="text-sm text-gray-400">No order information added yet.</p>
        )}

        {tab === "training" && <Training kit={kit} accent={accent} />}
      </main>
    </div>
  );
}

function Training({ kit, accent }: { kit: Kit; accent: string }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<{ score: number; total: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  if (!kit.questions.length) return <p className="text-sm text-gray-400">No training quiz added yet.</p>;

  async function submit() {
    if (!name.trim() || Object.keys(answers).length < kit.questions.length) { setErr("Please add your name and answer every question."); return; }
    setBusy(true); setErr("");
    const d = await fetch("/api/kit-quiz", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: kit.token, respondent_name: name, respondent_email: email || null, respondent_company: company || null,
        answers: Object.entries(answers).map(([question_id, selected]) => ({ question_id, selected })),
      }),
    }).then(r => r.json()).catch(() => null);
    setBusy(false);
    if (d?.ok) setResult({ score: d.score, total: d.total });
    else setErr("Couldn't submit — please try again.");
  }

  if (result) {
    const pct = Math.round((result.score / result.total) * 100);
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center max-w-md mx-auto">
        <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400">Training complete</p>
        <p className="text-4xl font-extrabold mt-2" style={{ color: accent }}>{result.score}/{result.total}</p>
        <p className="text-sm text-gray-500 mt-1">{pct}% correct{pct >= 80 ? " — nice work!" : ""}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <p className="text-sm text-gray-500">Answer every question, then submit for your score.</p>
      <div className="grid sm:grid-cols-3 gap-3">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Your name" className="text-sm border border-gray-200 rounded-lg px-3 py-2" />
        <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email (optional)" className="text-sm border border-gray-200 rounded-lg px-3 py-2" />
        <input value={company} onChange={e => setCompany(e.target.value)} placeholder="Store / company (optional)" className="text-sm border border-gray-200 rounded-lg px-3 py-2" />
      </div>
      {kit.questions.map((q, i) => (
        <div key={q.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="font-semibold text-slate-800">{i + 1}. {q.question}</p>
          <div className="mt-3 space-y-2">
            {q.options.map((o, oi) => (
              <label key={oi} className="flex items-center gap-2.5 text-sm text-slate-600 cursor-pointer">
                <input type="radio" name={q.id} checked={answers[q.id] === oi} onChange={() => setAnswers(p => ({ ...p, [q.id]: oi }))} />
                {o.text}
              </label>
            ))}
          </div>
        </div>
      ))}
      {err && <p className="text-xs text-rose-500">{err}</p>}
      <button onClick={submit} disabled={busy} className="text-sm font-semibold text-white rounded-lg px-5 py-2.5 disabled:opacity-50" style={{ background: accent }}>{busy ? "Submitting…" : "Submit answers"}</button>
    </div>
  );
}
