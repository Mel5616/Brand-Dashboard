// PUBLIC deck viewer — serves the shared deck's HTML raw (decks are complete
// standalone documents; rendering through React caused hydration errors).
// A small vanilla tracking script is injected before </body>: logs the open,
// then heartbeats +10s while the tab is actually visible. ?preview=1 (admin
// card thumbnails) skips tracking entirely.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const DEAD_END = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Link not valid</title></head>
<body style="margin:0;background:#f8fafc;font-family:-apple-system,Segoe UI,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh">
<div style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:40px;max-width:420px;text-align:center">
<p style="font-size:26px;margin:0 0 8px">🔗</p><h1 style="font-size:18px;color:#1e293b;margin:0">This link isn't valid</h1>
<p style="font-size:14px;color:#64748b;line-height:1.6">The deck may have been removed or the link revoked. Contact the Coolkidz marketing team for a fresh link.</p>
</div></body></html>`;

const tracker = (token: string) => `<script>(function(){
  var session;
  try { session = sessionStorage.getItem("deckSession") || crypto.randomUUID(); sessionStorage.setItem("deckSession", session); }
  catch (e) { session = String(Math.random()).slice(2); }
  function post(extra) {
    try { fetch("/api/decks/track", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({ token: ${JSON.stringify(token)}, session: session }, extra)), keepalive: true }).catch(function(){}); } catch (e) {}
  }
  function start(email) {
    post({ kind: "open", email: email || undefined });
    setInterval(function(){ if (document.visibilityState === "visible") post({ kind: "beat", seconds: 10 }); }, 10000);
  }
  // Email gate: viewers identify themselves once per browser before the deck
  // shows, so opens are attributable even when a link gets forwarded.
  var saved = null;
  try { saved = localStorage.getItem("deckViewerEmail"); } catch (e) {}
  if (saved) { start(saved); return; }
  var ov = document.createElement("div");
  ov.style.cssText = "position:fixed;inset:0;z-index:2147483647;background:rgba(12,20,33,.92);backdrop-filter:blur(14px);display:flex;align-items:center;justify-content:center;font-family:-apple-system,'Segoe UI',sans-serif";
  ov.innerHTML = '<div style="background:#fff;border-radius:18px;padding:34px 36px;max-width:380px;width:calc(100% - 48px);text-align:center;box-shadow:0 24px 60px rgba(0,0,0,.4)">'
    + '<p style="font-size:26px;margin:0 0 6px">&#128274;</p>'
    + '<h1 style="font-size:17px;color:#0f172a;margin:0 0 6px;font-weight:700">This deck is confidential</h1>'
    + '<p style="font-size:13px;color:#64748b;line-height:1.5;margin:0 0 18px">Enter your email address to view &mdash; it identifies your session for the Coolkidz team.</p>'
    + '<form id="deckGateForm" style="display:flex;flex-direction:column;gap:10px">'
    + '<input id="deckGateEmail" type="email" required placeholder="you@company.com" style="border:1.5px solid #e2e8f0;border-radius:10px;padding:11px 14px;font-size:14px;outline:none;text-align:center" />'
    + '<button type="submit" style="background:#e2593c;color:#fff;border:0;border-radius:10px;padding:11px;font-size:14px;font-weight:700;cursor:pointer">View deck &rarr;</button>'
    + '</form></div>';
  function mount() {
    document.body.appendChild(ov);
    document.body.style.overflow = "hidden";
    var form = document.getElementById("deckGateForm");
    var input = document.getElementById("deckGateEmail");
    setTimeout(function(){ try { input.focus(); } catch (e) {} }, 50);
    form.addEventListener("submit", function(ev){
      ev.preventDefault();
      var em = (input.value || "").trim().toLowerCase();
      if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(em)) { input.style.borderColor = "#ef4444"; return; }
      try { localStorage.setItem("deckViewerEmail", em); } catch (e) {}
      ov.remove();
      document.body.style.overflow = "";
      start(em);
    });
  }
  if (document.body) mount(); else document.addEventListener("DOMContentLoaded", mount);
})();</script>`;

export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const preview = new URL(req.url).searchParams.get("preview") === "1";
  const dead = () => new Response(DEAD_END, { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } });
  if (!/^[0-9a-f-]{36}$/.test(token) || !sbUrl || !sbKey) return dead();
  const h = { apikey: sbKey, Authorization: `Bearer ${sbKey}` };
  const share = (await fetch(`${sbUrl}/rest/v1/deck_shares?token=eq.${token}&select=deck_id&limit=1`, { headers: h, cache: "no-store" }).then(r => r.json()).catch(() => []))[0];
  if (!share) return dead();
  const deck = (await fetch(`${sbUrl}/rest/v1/decks?id=eq.${share.deck_id}&select=html&limit=1`, { headers: h, cache: "no-store" }).then(r => r.json()).catch(() => []))[0];
  if (!deck) return dead();

  let html: string = deck.html;
  if (!preview) {
    let t = tracker(token);
    // If a companion PDF exists for this deck (deck-assets/deck-<id>.pdf),
    // float a small Download PDF button — the print path for paged decks.
    const pdfUrl = `${sbUrl}/storage/v1/object/public/deck-assets/deck-${share.deck_id}.pdf`;
    const pdfHead = await fetch(pdfUrl, { method: "HEAD", cache: "no-store" }).catch(() => null);
    const pdfOk = !!pdfHead?.ok;
    // version the link with the file's etag so a replaced PDF always busts caches
    const pdfV = pdfHead?.headers.get("etag")?.replace(/[^a-f0-9]/gi, "").slice(0, 12) ?? "";
    if (pdfOk) {
      t += `<a href="${pdfUrl}?v=${pdfV}" target="_blank" rel="noopener" style="position:fixed;right:18px;bottom:18px;z-index:99999;background:#e2593c;color:#fff;text-decoration:none;font-family:-apple-system,'Segoe UI',sans-serif;font-size:12.5px;font-weight:700;letter-spacing:.05em;padding:10px 16px;border-radius:999px;box-shadow:0 4px 14px rgba(0,0,0,.3)">⬇ PDF</a>`;
    }
    html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${t}</body>`) : html + t;
  }
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
