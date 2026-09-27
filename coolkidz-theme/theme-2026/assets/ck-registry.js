/* Coolkidz Gift Registry.
   One registry across every brand Coolkidz sells. The list itself lives in the
   brand-dashboard API (the same engine as the UPPAbaby registry); this file
   draws it. There are no accounts: the manage token is the way back in, kept
   in this browser and emailed to the parent.

     /pages/gift-registry                 landing: find one, or create one
     /pages/gift-registry?r=SHARE         what family and friends see
     /pages/gift-registry?manage=TOKEN    what the parents see

   Also powers the "Add to gift registry" button on product pages. */
(function () {
  var root = document.querySelector('[data-ck-registry]');
  var apiEl = document.querySelector('[data-ck-registry-api]');
  var API = (root && root.getAttribute('data-api')) || (apiEl && apiEl.getAttribute('data-ck-registry-api')) ||
            'https://marketing.coolkidz.com.au/api/registry';
  var PAGE = '/pages/gift-registry';
  var K_REG = 'ck_registry', K_PENDING = 'ck_registry_pending';

  function read(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function write(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function money(c) { return c == null ? '' : '$' + (c / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function img(u, w) { if (!u) return ''; if (u.indexOf('//') === 0) u = 'https:' + u; return u + (u.indexOf('?') > -1 ? '&' : '?') + 'width=' + (w || 400); }
  function monthName(d) { if (!d) return ''; var p = d.split('-'); return new Date(+p[0], +p[1] - 1, 1).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' }); }
  function names(r) { return [r.ownerName, r.partnerName].filter(Boolean).join(' & '); }

  function api(path, opts) {
    return fetch(API + path, Object.assign({ headers: { 'Content-Type': 'application/json' } }, opts || {}))
      .then(function (r) { return r.json().catch(function () { return { ok: false, error: 'Something went wrong' }; }); })
      .catch(function () { return { ok: false, error: 'Could not reach the registry. Check your connection.' }; });
  }
  var post = function (path, body) { return api(path, { method: 'POST', body: JSON.stringify(Object.assign({ store: 'coolkidz' }, body)) }); };

  /* ---- products ---- */
  var cache = {};
  function product(handle) {
    if (!cache[handle]) cache[handle] = fetch('/products/' + encodeURIComponent(handle) + '.js').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
    return cache[handle];
  }
  function addToRegistry(handle, variantId, manageToken) {
    return product(handle).then(function (p) {
      if (!p) return { ok: false, error: 'That product could not be found' };
      var v = (p.variants || []).filter(function (x) { return String(x.id) === String(variantId); })[0] || p.variants[0];
      return post('/items', {
        manageToken: manageToken, action: 'add',
        variantId: String(v.id), productId: String(p.id), handle: p.handle,
        title: (p.vendor ? p.vendor + ' ' : '') + p.title,
        variantTitle: v.title === 'Default Title' ? null : v.title,
        image: (v.featured_image && v.featured_image.src) || p.featured_image,
        priceCents: v.price
      });
    });
  }

  /* ---- product page button ---- */
  function wireButtons() {
    [].forEach.call(document.querySelectorAll('[data-ck-add-registry]'), function (btn) {
      if (btn._ck) return; btn._ck = 1;
      var msg = btn.parentNode.querySelector('[data-ck-add-msg]');
      btn.addEventListener('click', function () {
        var form = document.querySelector('form[action*="/cart/add"] input[name="id"]');
        var variantId = (form && form.value) || btn.getAttribute('data-variant');
        var handle = btn.getAttribute('data-handle');
        var reg = read(K_REG);
        if (!reg || !reg.manageToken) {
          write(K_PENDING, { handle: handle, variantId: variantId });
          location.href = PAGE + '?start=1#ckr-create';
          return;
        }
        btn.disabled = true; btn.textContent = 'Adding…';
        addToRegistry(handle, variantId, reg.manageToken).then(function (r) {
          btn.disabled = false;
          btn.textContent = 'Add to gift registry';
          if (msg) msg.innerHTML = r.ok ? 'Added to your registry. <a href="' + PAGE + '?manage=' + encodeURIComponent(reg.manageToken) + '">View your list</a>' : esc(r.error || 'Could not add that');
        });
      });
    });
  }
  wireButtons();
  if (!root) return;

  /* ---- registry page ---- */
  var app = root.querySelector('[data-ckr-app]');
  var q = new URLSearchParams(location.search);
  var share = q.get('r'), manage = q.get('manage');
  var saved = read(K_REG);

  function showMarketing(on) { root.classList.toggle('ckr-has-list', !on); }
  function state(html) { app.innerHTML = '<div class="ckr-state">' + html + '</div>'; }

  function progressBar(p) {
    var pct = p.wanted ? Math.round(p.purchased / p.wanted * 100) : 0;
    return '<div class="ckr-progress"><span class="ckr-eyebrow">' + p.purchased + ' of ' + p.wanted + ' gifted</span><div class="ckr-bar"><i style="width:' + pct + '%"></i></div></div>';
  }

  function load(token) {
    state('Loading the registry…');
    showMarketing(false);
    return api('/' + encodeURIComponent(token) + '?store=coolkidz');
  }

  /* guest view */
  function guest(token) {
    load(token).then(function (d) {
      if (!d.ok) { showMarketing(true); state(esc(d.error || 'That registry link isn\'t valid.')); return; }
      var r = d.registry, filter = 'all';
      function draw() {
        var items = d.items.filter(function (i) { return filter === 'all' || i.remaining > 0; });
        app.innerHTML =
          '<div class="ckr-list">' +
          '<div class="ckr-head"><div><span class="ckr-eyebrow">Gift registry</span><h1>' + esc(names(r)) + '</h1>' +
          (r.greeting ? '<p class="ckr-greet">' + esc(r.greeting) + '</p>' : '') + '</div>' +
          '<div class="ckr-meta">' + (r.dueDate ? '<div><span class="ckr-eyebrow">Due</span><b>' + monthName(r.dueDate) + '</b></div>' : '') + ((r.shipSuburb || r.shipState) ? '<div><span class="ckr-eyebrow">Lives in</span><b>' + esc([r.shipSuburb, r.shipState].filter(Boolean).join(', ')) + '</b></div>' : '') + progressBar(d.progress) + '</div></div>' +
          '<div class="ckr-filters"><button class="ckr-chip" data-f="all" aria-pressed="' + (filter === 'all') + '">Everything</button><button class="ckr-chip" data-f="open" aria-pressed="' + (filter === 'open') + '">Still needed</button></div>' +
          (items.length ? '<div class="ckr-grid">' + items.map(function (i) {
            var done = i.remaining <= 0;
            var status = i.purchased >= i.wanted ? 'Gifted' : done ? 'Reserved' : (i.wanted > 1 ? (i.wanted - i.purchased) + ' still needed' : 'Still needed');
            return '<article class="ckr-item' + (done ? ' is-done' : '') + '"><a class="ckr-im" href="/products/' + esc(i.handle) + '"><img src="' + esc(img(i.image, 500)) + '" alt="" loading="lazy"><span class="ckr-st">' + status + '</span></a>' +
              '<div class="ckr-bd"><h3>' + esc(i.title) + '</h3>' + (i.variantTitle ? '<span class="ckr-var">' + esc(i.variantTitle) + '</span>' : '') +
              (i.note ? '<p class="ckr-note">“' + esc(i.note) + '”</p>' : '') +
              '<div class="ckr-ft"><b>' + money(i.priceCents) + '</b>' + (done ? '' : '<button class="ckr-btn" data-buy="' + esc(i.id) + '" data-variant="' + esc(i.variantId) + '">Buy this gift</button>') + '</div></div></article>';
          }).join('') + '</div>' : '<p class="ckr-state">Everything on this list has been gifted. Lucky baby.</p>') +
          '<p class="ckr-fine">Gifts come off the list once bought, so nobody doubles up. At checkout, send your gift straight to the parents or to yourself to give in person. The parents don\'t see who bought what.</p></div>';
      }
      draw();
      app.addEventListener('click', function (e) {
        var f = e.target.closest('[data-f]'); if (f) { filter = f.getAttribute('data-f'); draw(); return; }
        var b = e.target.closest('[data-buy]'); if (!b) return;
        b.disabled = true; b.textContent = 'Adding…';
        var itemId = b.getAttribute('data-buy');
        post('/hold', { shareToken: r.shareToken, itemId: itemId, quantity: 1 }).then(function () {
          return fetch('/cart/add.js', {
            method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ items: [{ id: +b.getAttribute('data-variant'), quantity: 1, properties: { _registry: r.shareToken, _registry_item: itemId, 'Gift for': names(r) } }] })
          });
        }).then(function (res) {
          if (res && res.ok) location.href = '/cart';
          else { b.disabled = false; b.textContent = 'Buy this gift'; alertBox('That gift could not be added to the cart. It may be out of stock.'); }
        });
      });
    });
  }

  /* owner view */
  function owner(token) {
    load(token).then(function (d) {
      if (!d.ok) { showMarketing(true); state(esc(d.error || 'That registry link isn\'t valid.')); return; }
      var r = d.registry;
      write(K_REG, { manageToken: token, shareToken: r.shareToken, ownerName: r.ownerName });
      var shareUrl = location.origin + PAGE + '?r=' + encodeURIComponent(r.shareToken);
      var pending = read(K_PENDING);
      if (pending) {
        write(K_PENDING, null);
        addToRegistry(pending.handle, pending.variantId, token).then(function () { owner(token); });
        return;
      }
      app.innerHTML =
        '<div class="ckr-list">' +
        '<div class="ckr-head"><div><span class="ckr-eyebrow">Your gift registry</span><h1>' + esc(names(r)) + '</h1>' +
        '<p class="ckr-greet">Add anything from any of our brands. Guests see what you still need; bought gifts come off on their own.</p></div>' +
        '<div class="ckr-meta">' + progressBar(d.progress) + '</div></div>' +
        '<div class="ckr-share"><div><span class="ckr-eyebrow">Your link to share</span><input id="ckr-share" readonly value="' + esc(shareUrl) + '"></div>' +
        '<div class="ckr-share-btns"><button class="ckr-btn" data-copy>Copy link</button><a class="ckr-btn ckr-line" href="' + esc(PAGE + '?r=' + encodeURIComponent(r.shareToken)) + '">See it as a guest</a><a class="ckr-btn ckr-line" href="/collections/all">Add products</a></div></div>' +
        (d.items.length ? '<ul class="ckr-rows">' + d.items.map(function (i) {
          return '<li><img src="' + esc(img(i.image, 160)) + '" alt=""><div class="ckr-rt"><b>' + esc(i.title) + '</b>' + (i.variantTitle ? '<span>' + esc(i.variantTitle) + '</span>' : '') +
            '<span>' + money(i.priceCents) + ' · ' + i.purchased + ' of ' + i.wanted + ' gifted</span>' +
            '<input class="ckr-note-in" data-note="' + esc(i.id) + '" placeholder="Add a note for guests (optional)" value="' + esc(i.note || '') + '"></div>' +
            '<div class="ckr-qty"><button data-q="' + esc(i.id) + '" data-d="-1" aria-label="One fewer">−</button><span>' + i.wanted + '</span><button data-q="' + esc(i.id) + '" data-d="1" aria-label="One more">+</button></div>' +
            '<button class="ckr-rm" data-rm="' + esc(i.id) + '">Remove</button></li>';
        }).join('') + '</ul>' : '<div class="ckr-empty"><h2>Your list is empty</h2><p>Browse the shop and press <b>Add to gift registry</b> on anything you love, from any brand.</p><a class="ckr-btn" href="/collections/all">Start adding</a></div>') +
        '<form class="ckr-settings" data-settings><h2>Settings</h2>' +
        '<label>A note for your guests<textarea name="greeting" maxlength="600">' + esc(r.greeting || '') + '</textarea></label>' +
        '<label class="ckr-check"><input type="checkbox" name="listed"' + (r.listed ? ' checked' : '') + '> Let guests find my registry by name</label>' +
        '<button class="ckr-btn" type="submit">Save</button><span class="ckr-saved" data-saved></span></form>' +
        '<p class="ckr-fine">Keep your manage link private: anyone with it can edit your list. We emailed it to ' + esc(r.ownerEmail || 'you') + '.</p></div>';
    });
  }

  function alertBox(t) { var n = document.createElement('div'); n.className = 'ckr-toast'; n.textContent = t; document.body.appendChild(n); setTimeout(function () { n.remove(); }, 4200); }

  /* owner interactions */
  app.addEventListener('click', function (e) {
    if (!manage) return;
    var c = e.target.closest('[data-copy]');
    if (c) {
      var inp = document.getElementById('ckr-share');
      (navigator.clipboard ? navigator.clipboard.writeText(inp.value) : Promise.reject()).then(function () { c.textContent = 'Copied'; }).catch(function () { inp.select(); c.textContent = 'Select and copy'; });
      return;
    }
    var qb = e.target.closest('[data-q]');
    if (qb) {
      var span = qb.parentNode.querySelector('span'); var n = Math.max(1, Math.min(20, +span.textContent + +qb.getAttribute('data-d')));
      span.textContent = n;
      post('/items', { manageToken: manage, action: 'update', itemId: qb.getAttribute('data-q'), wanted: n });
      return;
    }
    var rm = e.target.closest('[data-rm]');
    if (rm) { rm.closest('li').style.opacity = '.4'; post('/items', { manageToken: manage, action: 'remove', itemId: rm.getAttribute('data-rm') }).then(function () { owner(manage); }); }
  });
  app.addEventListener('change', function (e) {
    var n = e.target.closest('[data-note]');
    if (n && manage) post('/items', { manageToken: manage, action: 'update', itemId: n.getAttribute('data-note'), note: n.value });
  });
  app.addEventListener('submit', function (e) {
    var f = e.target.closest('[data-settings]'); if (!f) return;
    e.preventDefault();
    post('/items', { manageToken: manage, action: 'settings', greeting: f.greeting.value, listed: f.listed.checked }).then(function (d) {
      f.querySelector('[data-saved]').textContent = d.ok ? 'Saved' : (d.error || 'Could not save');
    });
  });

  /* landing: find */
  var find = root.querySelector('[data-ckr-find]');
  if (find) find.addEventListener('submit', function (e) {
    e.preventDefault();
    var out = find.querySelector('[data-ckr-results]'); var term = find.q.value.trim();
    if (term.length < 2) { out.textContent = 'Type at least two letters of a name.'; return; }
    out.textContent = 'Searching…';
    api('/search?store=coolkidz&q=' + encodeURIComponent(term)).then(function (d) {
      if (!d.ok) { out.textContent = d.error || 'Search is not available right now.'; return; }
      out.innerHTML = d.results.length ? '<ul>' + d.results.map(function (x) {
        return '<li><a href="' + PAGE + '?r=' + encodeURIComponent(x.shareToken) + '"><b>' + esc(x.names) + '</b>' + (x.dueMonth ? '<span>Due ' + monthName(x.dueMonth + '-01') + '</span>' : '') + '</a></li>';
      }).join('') + '</ul>' : 'No registries found for that name. Parents choose whether their list can be found, so ask them for their link.';
    });
  });

  /* landing: create */
  var create = root.querySelector('[data-ckr-create]');
  if (create) {
    if (read(K_PENDING)) { var hint = create.querySelector('[data-ckr-pending]'); if (hint) hint.hidden = false; }
    create.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = create.querySelector('button[type=submit]'); var err = create.querySelector('[data-ckr-error]');
      btn.disabled = true; err.textContent = '';
      post('/create', {
        ownerName: create.ownerName.value, partnerName: create.partnerName.value, ownerEmail: create.ownerEmail.value,
        dueDate: create.dueDate.value || null, greeting: create.greeting.value,
        shipSuburb: create.shipSuburb.value, shipState: create.shipState.value, listed: create.listed.checked
      }).then(function (d) {
        btn.disabled = false;
        if (!d.ok) { err.textContent = d.error || 'Could not create the registry'; return; }
        write(K_REG, { manageToken: d.manageToken, shareToken: d.shareToken, ownerName: d.ownerName });
        location.href = PAGE + '?manage=' + encodeURIComponent(d.manageToken);
      });
    });
  }

  /* landing: "your registry" shortcut on this device */
  var mine = root.querySelector('[data-ckr-mine]');
  if (mine && saved && saved.manageToken && !share && !manage) {
    mine.hidden = false;
    mine.querySelector('a').href = PAGE + '?manage=' + encodeURIComponent(saved.manageToken);
  }

  if (share) guest(share);
  else if (manage) owner(manage);
})();
