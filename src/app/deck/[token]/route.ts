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
  post({ kind: "open" });
  setInterval(function(){ if (document.visibilityState === "visible") post({ kind: "beat", seconds: 10 }); }, 10000);
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
    const pdfOk = await fetch(pdfUrl, { method: "HEAD", cache: "no-store" }).then(r => r.ok).catch(() => false);
    if (pdfOk) {
      t += `<a href="${pdfUrl}" target="_blank" rel="noopener" style="position:fixed;right:18px;bottom:18px;z-index:99999;background:#e2593c;color:#fff;text-decoration:none;font-family:-apple-system,'Segoe UI',sans-serif;font-size:12.5px;font-weight:700;letter-spacing:.05em;padding:10px 16px;border-radius:999px;box-shadow:0 4px 14px rgba(0,0,0,.3)">⬇ PDF</a>`;
    }
    html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${t}</body>`) : html + t;
  }
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
