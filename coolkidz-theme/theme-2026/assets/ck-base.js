/* Coolkidz 2026 theme behaviour. Small and dependency free.
   - bag count + brand dots in the header (the mix-and-save meter in miniature)
   - add to cart without leaving the page, with a nudge towards the next saving
   - "add the set" buttons, brand directory hover, variant picker, mobile menu */
(function () {
  var mix = window.ckMix || { enabled: true, tiers: [0, 0, 5, 10, 15] };
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };

  function brands(cart) {
    var seen = {};
    (cart.items || []).forEach(function (i) { if (i.vendor) seen[i.vendor.toLowerCase().replace(/( wagons)? australia$/, '')] = 1; });
    return Object.keys(seen).length;
  }
  function pct(n) { return mix.tiers[Math.min(n, 4)] || 0; }
  function nudge(n) {
    if (!mix.enabled) return '';
    if (n >= 4) return 'Four brands in your bag: you save ' + pct(4) + '%.';
    if (n === 0) return '';
    return n + ' brand' + (n > 1 ? 's' : '') + ' in your bag' + (n > 1 ? ' (' + pct(n) + '% off)' : '') + '. Add another brand to save ' + pct(n + 1) + '%.';
  }
  function paint(cart) {
    var n = brands(cart);
    $$('[data-ck-count]').forEach(function (el) { el.textContent = cart.item_count; });
    $$('[data-ck-dots] i').forEach(function (i, k) { i.classList.toggle('on', k < n); });
    return n;
  }
  function refresh() { return fetch('/cart.js').then(function (r) { return r.json(); }).then(function (c) { paint(c); return c; }).catch(function () {}); }

  var toastT;
  function toast(html) {
    var t = $('#ck-toast'); if (!t) return;
    t.innerHTML = html; t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, 5200);
  }

  function add(items, label) {
    return fetch('/cart/add.js', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ items: items })
    }).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.description || 'That could not be added'); return j; }); })
      .then(refresh)
      .then(function (cart) {
        var n = cart ? brands(cart) : 0;
        toast('<span>' + (label || 'Added to your bag') + '. ' + nudge(n) + '</span><a href="/cart">View bag</a>');
      })
      .catch(function (e) { toast('<span>' + e.message + '</span>'); });
  }

  /* add-to-cart forms (cards + product page) */
  document.addEventListener('submit', function (e) {
    var f = e.target.closest('form[data-ck-add]'); if (!f) return;
    e.preventDefault();
    var id = f.querySelector('[name="id"]').value;
    var q = f.querySelector('[name="quantity"]');
    var btn = f.querySelector('[type="submit"]'); if (btn) btn.disabled = true;
    add([{ id: +id, quantity: q ? Math.max(1, +q.value || 1) : 1 }], f.getAttribute('data-ck-add') || 'Added to your bag')
      .then(function () { if (btn) btn.disabled = false; });
  });

  /* add a whole set */
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-ck-set]'); if (!b) return;
    var ids = (b.getAttribute('data-ck-set') || '').split(',').filter(Boolean);
    if (!ids.length) return;
    b.disabled = true;
    add(ids.map(function (id) { return { id: +id, quantity: 1 }; }), 'The set is in your bag').then(function () { b.disabled = false; });
  });

  /* qty steppers */
  document.addEventListener('click', function (e) {
    var s = e.target.closest('[data-ck-step]'); if (!s) return;
    var inp = s.parentNode.querySelector('input'); inp.value = Math.max(1, (+inp.value || 1) + +s.getAttribute('data-ck-step'));
  });

  /* mobile menu */
  document.addEventListener('click', function (e) {
    var m = e.target.closest('[data-ck-menu]'); if (!m) { if (e.target.id === 'ck-drawer') close(); return; }
    var d = $('#ck-drawer'); d.hidden ? open() : close();
  });
  function open() { var d = $('#ck-drawer'); d.hidden = false; document.body.classList.add('ck-lock'); $$('.ck-burger').forEach(function (b) { b.setAttribute('aria-expanded', 'true'); }); }
  function close() { var d = $('#ck-drawer'); if (!d) return; d.hidden = true; document.body.classList.remove('ck-lock'); $$('.ck-burger').forEach(function (b) { b.setAttribute('aria-expanded', 'false'); }); }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { close(); shut(); } });

  /* mega menu: hover on desktop, click/tap and keyboard too */
  var mmTimer;
  function shut(except) { $$('[data-ck-mm]').forEach(function (it) { if (it !== except) { it.classList.remove('open'); it.firstElementChild.setAttribute('aria-expanded', 'false'); } }); }
  $$('[data-ck-mm]').forEach(function (it) {
    var a = it.firstElementChild;
    it.addEventListener('mouseenter', function () { clearTimeout(mmTimer); shut(it); it.classList.add('open'); a.setAttribute('aria-expanded', 'true'); });
    it.addEventListener('mouseleave', function () { mmTimer = setTimeout(function () { it.classList.remove('open'); a.setAttribute('aria-expanded', 'false'); }, 160); });
    a.addEventListener('click', function (e) { if (!it.classList.contains('open') && matchMedia('(hover: none)').matches) { e.preventDefault(); shut(it); it.classList.add('open'); a.setAttribute('aria-expanded', 'true'); } });
    a.addEventListener('keydown', function (e) { if (e.key === 'ArrowDown' || e.key === ' ') { e.preventDefault(); shut(it); it.classList.add('open'); a.setAttribute('aria-expanded', 'true'); var f = it.querySelector('.ck-mm-panel a'); if (f) f.focus(); } });
    it.addEventListener('focusout', function (e) { if (!it.contains(e.relatedTarget)) { it.classList.remove('open'); a.setAttribute('aria-expanded', 'false'); } });
  });
  document.addEventListener('click', function (e) { if (!e.target.closest('[data-ck-mm]')) shut(); });

  /* fold the audience strip away once scrolling */
  var ticking = false;
  addEventListener('scroll', function () {
    if (ticking) return; ticking = true;
    requestAnimationFrame(function () { document.body.classList.toggle('ck-scrolled', scrollY > 40); ticking = false; });
  }, { passive: true });

  document.addEventListener('click', function (e) {
    var s = e.target.closest('[data-ck-search]'); if (!s) return;
    e.preventDefault(); var bar = $('#ck-search'); bar.hidden = !bar.hidden; if (!bar.hidden) bar.querySelector('input').focus();
  });

  /* brand directory hover */
  $$('[data-ck-dir]').forEach(function (dir) {
    var imgs = $$('.view img', dir), cap = $('.view .cap', dir);
    function show(k) {
      imgs.forEach(function (i) { i.classList.toggle('on', i.getAttribute('data-k') === k); });
      $$('a.nmrow', dir).forEach(function (a) { a.classList.toggle('on', a.getAttribute('data-k') === k); });
      var a = $('a.nmrow[data-k="' + k + '"] .nm', dir); if (cap && a) cap.textContent = a.textContent;
    }
    $$('a.nmrow', dir).forEach(function (a) { ['mouseenter', 'focus'].forEach(function (ev) { a.addEventListener(ev, function () { show(a.getAttribute('data-k')); }); }); });
    var first = $('a.nmrow', dir); if (first) show(first.getAttribute('data-k'));
  });

  /* variant picker */
  $$('[data-ck-product]').forEach(function (root) {
    var data; try { data = JSON.parse($('script[type="application/json"]', root).textContent); } catch (e) { return; }
    var idInput = $('[name="id"]', root), price = $('[data-ck-price]', root), btn = $('[data-ck-atc]', root), reg = $('[data-ck-add-registry]', root);
    function money(c) { return '$' + (c / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
    root.addEventListener('change', function (e) {
      if (!e.target.closest('.ck-opt')) return;
      var chosen = $$('.ck-opt', root).map(function (fs) { var c = $('input:checked', fs); return c ? c.value : null; });
      var v = data.variants.filter(function (x) { return x.options.every(function (o, i) { return o === chosen[i]; }); })[0];
      if (!v) { btn.disabled = true; btn.textContent = 'Unavailable'; return; }
      idInput.value = v.id; if (reg) reg.setAttribute('data-variant', v.id);
      price.textContent = money(v.price);
      btn.disabled = !v.available; btn.textContent = v.available ? 'Add to bag' : 'Sold out';
      if (history.replaceState) history.replaceState(null, '', '?variant=' + v.id);
      if (v.featured_image) { var g = $('.ck-gallery .g img', root); if (g) g.src = v.featured_image.src + (v.featured_image.src.indexOf('?') > -1 ? '&' : '?') + 'width=1200'; }
    });
  });

  /* phone gallery dots */
  $$('[data-ck-gallery]').forEach(function (g) {
    var dots = g.parentNode.querySelectorAll('[data-ck-gdots] i'); if (!dots.length) return;
    g.addEventListener('scroll', function () {
      var i = Math.round(g.scrollLeft / (g.firstElementChild.offsetWidth + 8));
      [].forEach.call(dots, function (d, k) { d.classList.toggle('on', k === i); });
    }, { passive: true });
  });

  /* sticky add-to-bag bar once the main button scrolls away (phones) */
  $$('[data-ck-product]').forEach(function (root) {
    var bar = $('[data-ck-stickybar]', root), main = $('[data-ck-atc]', root); if (!bar || !main || !('IntersectionObserver' in window)) return;
    new IntersectionObserver(function (es) { var off = !es[0].isIntersecting && es[0].boundingClientRect.top < 0; bar.classList.toggle('show', off); bar.setAttribute('aria-hidden', !off); }).observe(main);
    $('[data-ck-sticky-add]', bar).addEventListener('click', function () { var f = main.closest('form'); if (f.requestSubmit) f.requestSubmit(); else main.click(); });
  });

  /* gentle reveal as sections scroll in (content is visible without JS) */
  if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    var rv = $$('.ck-sec .ck-shead, .ck-sec .ck-grid, .ck-sets, .ck-moments, .ck-mix, .ck-reviews, .ck-tiles, .ck-band, .ck-split, .ck-doors, .ck-steps, .ck-journal, .ck-dir');
    var below = rv.filter(function (el) { return el.getBoundingClientRect().top > innerHeight; });
    if (below.length) {
      document.documentElement.classList.add('ck-reveal-on');
      var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }); }, { rootMargin: '0px 0px -8% 0px' });
      below.forEach(function (el) { el.classList.add('ck-rv'); io.observe(el); });
    }
  }

  refresh();
})();
