/* Ask Coolkidz chat widget. Conversation lives in sessionStorage for the
   visit; a session id in localStorage lets the team reply from the dashboard. */
(function () {
  var root = document.querySelector('[data-ck-ask]'); if (!root) return;
  var API = root.getAttribute('data-api');
  var panel = root.querySelector('.ck-ask-panel'), log = root.querySelector('[data-ck-ask-log]');
  var form = root.querySelector('[data-ck-ask-form]'), input = form.querySelector('input'), chipsEl = root.querySelector('[data-ck-ask-chips]');
  var openBtn = root.querySelector('[data-ck-ask-open]');
  var K = 'ck_ask_msgs', KS = 'ck_ask_session', KH = 'ck_ask_human';
  function get(store, k, fb) { try { var v = JSON.parse(store.getItem(k)); return v == null ? fb : v; } catch (e) { return fb; } }
  function put(store, k, v) { try { store.setItem(k, JSON.stringify(v)); } catch (e) {} }
  var session = get(localStorage, KS, null);
  if (!session) { session = 'ck-' + Math.random().toString(36).slice(2) + Date.now().toString(36); put(localStorage, KS, session); }
  var msgs = get(sessionStorage, K, []);
  var lastHuman = get(sessionStorage, KH, 0);
  var busy = false, pollT;

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function md(t) {
    var h = esc(t);
    h = h.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
    h = h.replace(/\[([^\]]+)\]\(((?:https?:\/\/|\/)[^)\s]*)\)/g, function (m, label, url) {
      var ext = /^https?:/.test(url) && url.indexOf(location.host) < 0;
      return '<a href="' + url + '"' + (ext ? ' target="_blank" rel="noopener"' : '') + '>' + label + '</a>';
    });
    return h.split(/\n{2,}/).map(function (p) { return '<p>' + p.replace(/\n/g, '<br>') + '</p>'; }).join('');
  }
  function draw() {
    var html = '<div class="m bot"><p>Hi! I can help you choose across UPPAbaby, Nanit, Gaia Baby, WonderFold, Frida and the rest of our brands, or answer questions about sets, the gift registry and delivery.</p></div>';
    html += msgs.map(function (m) { return '<div class="m ' + (m.role === 'user' ? 'me' : m.human ? 'bot human' : 'bot') + '">' + (m.human ? '<small>From the Coolkidz team</small>' : '') + (m.role === 'user' ? '<p>' + esc(m.content) + '</p>' : md(m.content)) + '</div>'; }).join('');
    if (busy) html += '<div class="m bot typing" aria-label="Typing"><i></i><i></i><i></i></div>';
    log.innerHTML = html; log.scrollTop = log.scrollHeight;
    chipsEl.innerHTML = msgs.length ? '' : (root.getAttribute('data-chips') || '').split('|').filter(Boolean).map(function (c) { return '<button type="button">' + esc(c) + '</button>'; }).join('');
  }
  function send(text) {
    text = (text || '').trim(); if (!text || busy) return;
    msgs.push({ role: 'user', content: text }); busy = true; draw(); put(sessionStorage, K, msgs);
    var convo = msgs.filter(function (m) { return !m.human; }).slice(-12).map(function (m) { return { role: m.role, content: m.content }; });
    fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: convo, session: session, page: location.pathname + location.search }) })
      .then(function (r) { return r.json(); })
      .then(function (d) { msgs.push({ role: 'assistant', content: d.ok ? d.reply : (d.error || 'Sorry, something went wrong. Call 1300 722 302.') }); })
      .catch(function () { msgs.push({ role: 'assistant', content: 'I could not connect just now. Try again, or call 1300 722 302.' }); })
      .then(function () { busy = false; put(sessionStorage, K, msgs); draw(); });
  }
  function poll() {
    fetch(API + '?session=' + encodeURIComponent(session) + '&after=' + lastHuman).then(function (r) { return r.json(); }).then(function (d) {
      (d.replies || []).forEach(function (r) { msgs.push({ role: 'assistant', human: true, content: r.answer }); lastHuman = Math.max(lastHuman, r.id); });
      if ((d.replies || []).length) { put(sessionStorage, K, msgs); put(sessionStorage, KH, lastHuman); draw(); }
    }).catch(function () {});
  }
  function open(o) {
    panel.hidden = !o; openBtn.setAttribute('aria-expanded', o); root.classList.toggle('is-open', o);
    clearInterval(pollT);
    if (o) { draw(); setTimeout(function () { input.focus(); }, 50); if (msgs.length) { poll(); pollT = setInterval(poll, 10000); } }
  }
  openBtn.addEventListener('click', function () { open(panel.hidden); });
  root.querySelector('[data-ck-ask-close]').addEventListener('click', function () { open(false); openBtn.focus(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !panel.hidden) open(false); });
  chipsEl.addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) send(b.textContent); });
  form.addEventListener('submit', function (e) { e.preventDefault(); var t = input.value; input.value = ''; send(t); if (!pollT) pollT = setInterval(poll, 10000); });
  if (msgs.length && sessionStorage.getItem('ck_ask_open') === '1') open(true);
  addEventListener('pagehide', function () { try { sessionStorage.setItem('ck_ask_open', panel.hidden ? '0' : '1'); } catch (e) {} });
})();
