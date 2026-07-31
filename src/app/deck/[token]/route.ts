// PUBLIC deck viewer. Decks are complete standalone documents (some rebuild
// their own DOM at runtime, which destroys anything injected into them), so
// the shared link serves a thin WRAPPER page we control — email gate, view
// tracking and the PDF button live in the wrapper, and the deck itself renders
// untouched in a full-screen iframe (?raw=1). ?preview=1 (admin card
// thumbnails) serves the raw deck with no gate or tracking.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const DEAD_END = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Link not valid</title></head>
<body style="margin:0;background:#f8fafc;font-family:-apple-system,Segoe UI,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh">
<div style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:40px;max-width:420px;text-align:center">
<p style="font-size:26px;margin:0 0 8px">🔗</p><h1 style="font-size:18px;color:#1e293b;margin:0">This link isn't valid</h1>
<p style="font-size:14px;color:#64748b;line-height:1.6">The deck may have been removed or the link revoked. Contact the Coolkidz marketing team for a fresh link.</p>
</div></body></html>`;

const wrapper = (token: string, title: string, pdfUrl: string | null) => `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title.replace(/</g, "&lt;")}</title>
<style>
  html,body{margin:0;height:100%;background:#0c1421;font-family:-apple-system,'Segoe UI',sans-serif}
  iframe{display:block;width:100%;height:100%;border:0}
  #gate{position:fixed;inset:0;z-index:99999;background:rgba(12,20,33,.94);backdrop-filter:blur(14px);display:flex;align-items:center;justify-content:center}
  #gate .card{background:#fff;border-radius:18px;padding:34px 36px;max-width:380px;width:calc(100% - 48px);text-align:center;box-shadow:0 24px 60px rgba(0,0,0,.4)}
  #gate input{border:1.5px solid #e2e8f0;border-radius:10px;padding:11px 14px;font-size:14px;outline:none;text-align:center;width:100%;box-sizing:border-box}
  #gate button{background:#e2593c;color:#fff;border:0;border-radius:10px;padding:11px;font-size:14px;font-weight:700;cursor:pointer;width:100%}
  #pdfBtn{position:fixed;right:18px;bottom:18px;z-index:9999;background:#e2593c;color:#fff;text-decoration:none;font-size:12.5px;font-weight:700;letter-spacing:.05em;padding:10px 16px;border-radius:999px;box-shadow:0 4px 14px rgba(0,0,0,.3)}
</style></head>
<body>
<div id="gate"><div class="card">
  <p style="font-size:26px;margin:0 0 6px">🔒</p>
  <h1 style="font-size:17px;color:#0f172a;margin:0 0 6px;font-weight:700">This deck is confidential</h1>
  <p style="font-size:13px;color:#64748b;line-height:1.5;margin:0 0 18px">Enter your email address to view — it identifies your session for the Coolkidz team.</p>
  <form id="gateForm" style="display:flex;flex-direction:column;gap:10px">
    <input id="gateEmail" type="email" required placeholder="you@company.com" autocomplete="email" />
    <button type="submit">View deck →</button>
  </form>
</div></div>
${pdfUrl ? `<a id="pdfBtn" href="${pdfUrl}" target="_blank" rel="noopener" hidden>⬇ PDF</a>` : ""}
<iframe id="deckFrame" title="${title.replace(/"/g, "&quot;").replace(/</g, "&lt;")}" allowfullscreen></iframe>
<script>(function(){
  var session;
  try { session = sessionStorage.getItem("deckSession") || crypto.randomUUID(); sessionStorage.setItem("deckSession", session); }
  catch (e) { session = String(Math.random()).slice(2); }
  function post(extra) {
    try { fetch("/api/decks/track", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({ token: ${JSON.stringify(token)}, session: session }, extra)), keepalive: true }).catch(function(){}); } catch (e) {}
  }
  var gate = document.getElementById("gate");
  var pdf = document.getElementById("pdfBtn");
  function show(email) {
    gate.remove();
    document.getElementById("deckFrame").src = ${JSON.stringify(`/deck/${token}?raw=1`)};
    if (pdf) pdf.hidden = false;
    post({ kind: "open", email: email || undefined });
    setInterval(function(){ if (document.visibilityState === "visible") post({ kind: "beat", seconds: 10 }); }, 10000);
  }
  var saved = null;
  try { saved = localStorage.getItem("deckViewerEmail"); } catch (e) {}
  if (saved) { show(saved); return; }
  var input = document.getElementById("gateEmail");
  setTimeout(function(){ try { input.focus(); } catch (e) {} }, 50);
  document.getElementById("gateForm").addEventListener("submit", function(ev){
    ev.preventDefault();
    var em = (input.value || "").trim().toLowerCase();
    if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(em)) { input.style.borderColor = "#ef4444"; return; }
    try { localStorage.setItem("deckViewerEmail", em); } catch (e) {}
    show(em);
  });
})();</script>
</body></html>`;

export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const sp = new URL(req.url).searchParams;
  const raw = sp.get("raw") === "1" || sp.get("preview") === "1";
  const dead = () => new Response(DEAD_END, { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } });
  if (!/^[0-9a-f-]{36}$/.test(token) || !sbUrl || !sbKey) return dead();
  const h = { apikey: sbKey, Authorization: `Bearer ${sbKey}` };
  const share = (await fetch(`${sbUrl}/rest/v1/deck_shares?token=eq.${token}&select=deck_id&limit=1`, { headers: h, cache: "no-store" }).then(r => r.json()).catch(() => []))[0];
  if (!share) return dead();

  if (raw) {
    const deck = (await fetch(`${sbUrl}/rest/v1/decks?id=eq.${share.deck_id}&select=html&limit=1`, { headers: h, cache: "no-store" }).then(r => r.json()).catch(() => []))[0];
    if (!deck) return dead();
    return new Response(deck.html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
  }

  const deck = (await fetch(`${sbUrl}/rest/v1/decks?id=eq.${share.deck_id}&select=title&limit=1`, { headers: h, cache: "no-store" }).then(r => r.json()).catch(() => []))[0];
  if (!deck) return dead();
  // Companion PDF (deck-assets/deck-<id>.pdf) — etag-versioned so a replaced
  // file always busts caches
  const pdfBase = `${sbUrl}/storage/v1/object/public/deck-assets/deck-${share.deck_id}.pdf`;
  const pdfHead = await fetch(pdfBase, { method: "HEAD", cache: "no-store" }).catch(() => null);
  const pdfV = pdfHead?.headers.get("etag")?.replace(/[^a-f0-9]/gi, "").slice(0, 12) ?? "";
  const pdfUrl = pdfHead?.ok ? `${pdfBase}?v=${pdfV}` : null;
  return new Response(wrapper(token, deck.title || "Launch deck", pdfUrl), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
