// PUBLIC document viewer. Documents are complete standalone HTML files (some
// rebuild their own DOM at runtime, which destroys anything injected into
// them), so the shared link serves a thin WRAPPER page we control — email
// gate and view tracking live in the wrapper, the document itself renders
// untouched in a full-screen iframe (?raw=1). ?preview=1 (admin card
// thumbnails) serves the raw document with no gate or tracking.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const DEAD_END = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Link not valid</title></head>
<body style="margin:0;background:#f8fafc;font-family:-apple-system,Segoe UI,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh">
<div style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:40px;max-width:420px;text-align:center">
<p style="font-size:26px;margin:0 0 8px">🔗</p><h1 style="font-size:18px;color:#1e293b;margin:0">This link isn't valid</h1>
<p style="font-size:14px;color:#64748b;line-height:1.6">The document may have been removed or the link revoked. Contact the Coolkidz marketing team for a fresh link.</p>
</div></body></html>`;

const wrapper = (token: string, title: string) => `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title.replace(/</g, "&lt;")}</title>
<style>
  html,body{margin:0;height:100%;background:#0c1421;font-family:-apple-system,'Segoe UI',sans-serif}
  iframe{display:block;width:100%;height:100%;border:0}
  #gate{position:fixed;inset:0;z-index:99999;background:rgba(12,20,33,.94);backdrop-filter:blur(14px);display:flex;align-items:center;justify-content:center}
  #gate .card{background:#fff;border-radius:18px;padding:34px 36px;max-width:380px;width:calc(100% - 48px);text-align:center;box-shadow:0 24px 60px rgba(0,0,0,.4)}
  #gate input[type=email]{border:1.5px solid #e2e8f0;border-radius:10px;padding:11px 14px;font-size:14px;outline:none;text-align:center;width:100%;box-sizing:border-box}
  #gate button{background:#1E9DC2;color:#fff;border:0;border-radius:10px;padding:11px;font-size:14px;font-weight:700;cursor:pointer;width:100%}
  #gate button:disabled{opacity:.5;cursor:not-allowed}
  #gate .agree{display:flex;align-items:flex-start;gap:8px;text-align:left;font-size:12px;color:#64748b;line-height:1.4;cursor:pointer}
  #gate .agree input{margin-top:2px;flex-shrink:0}
</style></head>
<body>
<div id="gate"><div class="card">
  <p style="font-size:26px;margin:0 0 6px">🔒</p>
  <h1 style="font-size:17px;color:#0f172a;margin:0 0 6px;font-weight:700">This document is confidential</h1>
  <p style="font-size:13px;color:#64748b;line-height:1.5;margin:0 0 18px">Enter your email address to view — it identifies your session for the Coolkidz team.</p>
  <form id="gateForm" style="display:flex;flex-direction:column;gap:10px">
    <input id="gateEmail" type="email" required placeholder="you@company.com" autocomplete="email" />
    <label class="agree"><input id="gateAgree" type="checkbox" required /><span>I agree this document is private and confidential and will not be shared outside my organisation.</span></label>
    <button id="gateSubmit" type="submit" disabled>View document →</button>
  </form>
</div></div>
<iframe id="docFrame" title="${title.replace(/"/g, "&quot;").replace(/</g, "&lt;")}" allowfullscreen></iframe>
<script>(function(){
  var session;
  try { session = sessionStorage.getItem("documentSession") || crypto.randomUUID(); sessionStorage.setItem("documentSession", session); }
  catch (e) { session = String(Math.random()).slice(2); }
  function post(extra) {
    try { fetch("/api/documents/track", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({ token: ${JSON.stringify(token)}, session: session }, extra)), keepalive: true }).catch(function(){}); } catch (e) {}
  }
  var gate = document.getElementById("gate");
  function show(email) {
    gate.remove();
    document.getElementById("docFrame").src = ${JSON.stringify(`/doc/${token}?raw=1`)};
    post({ kind: "open", email: email || undefined });
    setInterval(function(){ if (document.visibilityState === "visible") post({ kind: "beat", seconds: 10 }); }, 10000);
  }
  var storageKey = "documentViewerEmail:" + ${JSON.stringify(token)};
  var saved = null;
  try { saved = localStorage.getItem(storageKey); } catch (e) {}
  if (saved) { show(saved); return; }
  var input = document.getElementById("gateEmail");
  var agree = document.getElementById("gateAgree");
  var submitBtn = document.getElementById("gateSubmit");
  setTimeout(function(){ try { input.focus(); } catch (e) {} }, 50);
  function refreshBtn() { submitBtn.disabled = !agree.checked; }
  agree.addEventListener("change", refreshBtn);
  refreshBtn();
  document.getElementById("gateForm").addEventListener("submit", function(ev){
    ev.preventDefault();
    var em = (input.value || "").trim().toLowerCase();
    if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(em)) { input.style.borderColor = "#ef4444"; return; }
    if (!agree.checked) { return; }
    try { localStorage.setItem(storageKey, em); } catch (e) {}
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
  const share = (await fetch(`${sbUrl}/rest/v1/document_shares?token=eq.${token}&select=document_id&limit=1`, { headers: h, cache: "no-store" }).then(r => r.json()).catch(() => []))[0];
  if (!share) return dead();

  if (raw) {
    const doc = (await fetch(`${sbUrl}/rest/v1/documents?id=eq.${share.document_id}&select=html&limit=1`, { headers: h, cache: "no-store" }).then(r => r.json()).catch(() => []))[0];
    if (!doc) return dead();
    return new Response(doc.html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
  }

  const doc = (await fetch(`${sbUrl}/rest/v1/documents?id=eq.${share.document_id}&select=title&limit=1`, { headers: h, cache: "no-store" }).then(r => r.json()).catch(() => []))[0];
  if (!doc) return dead();
  return new Response(wrapper(token, doc.title || "Document"), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
