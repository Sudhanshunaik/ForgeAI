/* ==========================================================================
   MobiVerse — storefront app
   Vanilla JS. No build step, no network beyond its own data/products.json.
   All interactive handlers are delegated from data-action attributes, so
   there is no inline onclick that can drift out of sync with the JS.
   ========================================================================== */
(function () {
  'use strict';

  /* ---------------------------------------------------------------------- */
  /* CONFIG — rename the shop from this ONE block                           */
  /* ---------------------------------------------------------------------- */
  var CONFIG = {
    brand: 'MobiVerse',
    tagline: 'Smartphones, honestly sold.',
    whatsappNumber: '919999999999',   // placeholder — nothing is sent by this site
    phoneDisplay: '+91 99999 99999',
    email: 'hello@mobiverse.in',
    address: 'MobiVerse Retail LLP, 2nd Floor, Garuda Mall Road, Ashok Nagar, Bengaluru, Karnataka 560025',
    deliveryFee: 149,
    freeDeliveryThreshold: 20000,     // delivery FREE when subtotal >= this
    maxToasts: 4,                     // visible toast cap
    toastMs: 3600,
    cartKey: 'mobiverse_cart',
    dataUrl: 'data/products.json',
    currencyLocale: 'en-IN'
  };

  /* ---------------------------------------------------------------------- */
  /* state                                                                  */
  /* ---------------------------------------------------------------------- */
  var state = {
    products: [],
    cart: [],            // [{ id, qty }]
    brand: 'All',
    query: '',
    sort: 'featured',
    detailId: null,
    detailQty: 1,
    lastOrderUrl: ''
  };

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  /* ---------------------------------------------------------------------- */
  /* helpers                                                                */
  /* ---------------------------------------------------------------------- */
  var inrFormat = new Intl.NumberFormat(CONFIG.currencyLocale, { maximumFractionDigits: 0 });

  function money(n) { return '\u20B9' + inrFormat.format(Math.round(Number(n) || 0)); }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function stars(rating) {
    var full = Math.round(rating);
    var out = '';
    for (var i = 0; i < 5; i++) { out += i < full ? '\u2605' : '\u2606'; }
    return out;
  }

  function productById(id) {
    for (var i = 0; i < state.products.length; i++) {
      if (state.products[i].id === id) { return state.products[i]; }
    }
    return null;
  }

  function emi(price) { return Math.round(price / 12); }

  function stockLabel(p) {
    if (p.stock <= 0) { return { cls: 'stock-out', text: 'Out of stock' }; }
    if (p.stock <= 3) { return { cls: 'stock-low', text: 'Only ' + p.stock + ' left in stock' }; }
    return { cls: 'stock-ok', text: 'In stock \u00b7 ' + p.stock + ' available' };
  }

  /* ---------------------------------------------------------------------- */
  /* toasts — capped stack, persistent order confirmation protected         */
  /* ---------------------------------------------------------------------- */
  var toastIcons = { ok: '\u2713', info: 'i', warn: '!', err: '\u2715' };

  function dismissToast(el, immediate) {
    if (!el || !el.parentNode) { return; }
    if (immediate) { el.parentNode.removeChild(el); return; }
    el.classList.add('leaving');
    window.setTimeout(function () { if (el.parentNode) { el.parentNode.removeChild(el); } }, 210);
  }

  function trimToasts() {
    var box = $('#toast-container');
    if (!box) { return; }
    var kids = $$('.toast', box);
    var excess = kids.length - CONFIG.maxToasts;
    for (var i = 0; i < kids.length && excess > 0; i++) {
      if (kids[i].dataset.persist === 'true') { continue; }   // never drop a persistent toast
      dismissToast(kids[i], true);
      excess--;
    }
  }

  function toast(opts) {
    opts = opts || {};
    var box = $('#toast-container');
    if (!box) { return null; }
    var type = opts.type || 'info';
    var persist = !!opts.persist;

    var el = document.createElement('div');
    el.className = 'toast toast-' + type + (persist ? ' persist' : '');
    if (persist) { el.dataset.persist = 'true'; }
    el.setAttribute('role', type === 'err' ? 'alert' : 'status');

    var ico = document.createElement('span');
    ico.className = 'toast-ico';
    ico.setAttribute('aria-hidden', 'true');
    ico.textContent = toastIcons[type] || toastIcons.info;

    var msg = document.createElement('div');
    msg.className = 'toast-msg';
    var strong = document.createElement('b');
    strong.textContent = opts.title || '';
    msg.appendChild(strong);
    if (opts.message) {
      var span = document.createElement('span');
      span.textContent = opts.message;
      msg.appendChild(span);
    }

    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'toast-close';
    close.setAttribute('aria-label', 'Dismiss notification');
    close.textContent = '\u00d7';
    close.addEventListener('click', function () { dismissToast(el, false); });

    el.appendChild(ico);
    el.appendChild(msg);
    el.appendChild(close);
    box.appendChild(el);

    trimToasts();
    if (!persist) {
      window.setTimeout(function () { dismissToast(el, false); }, opts.timeout || CONFIG.toastMs);
    }
    return el;
  }

  /* ---------------------------------------------------------------------- */
  /* THE shared totals function — drawer and checkout both render from this  */
  /* ---------------------------------------------------------------------- */
  function cartTotals() {
    var lines = [];
    var subtotal = 0;
    var count = 0;

    state.cart.forEach(function (l) {
      var p = productById(l.id);
      if (!p) { return; }
      var line = p.price * l.qty;
      lines.push({ id: p.id, name: p.name, brand: p.brand, price: p.price, qty: l.qty, lineTotal: line });
      subtotal += line;
      count += l.qty;
    });

    var delivery = 0;
    if (count > 0) {
      delivery = subtotal >= CONFIG.freeDeliveryThreshold ? 0 : CONFIG.deliveryFee;
    }

    return {
      lines: lines,
      count: count,
      subtotal: subtotal,
      delivery: delivery,
      total: subtotal + delivery,
      freeDelivery: count > 0 && delivery === 0,
      shortfall: Math.max(0, CONFIG.freeDeliveryThreshold - subtotal)
    };
  }

  /* ---------------------------------------------------------------------- */
  /* persistence                                                            */
  /* ---------------------------------------------------------------------- */
  function loadCart() {
    var raw = null;
    try { raw = window.localStorage.getItem(CONFIG.cartKey); } catch (e) { raw = null; }
    if (!raw) { state.cart = []; return; }
    var parsed;
    try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
    if (!Array.isArray(parsed)) { state.cart = []; return; }

    var clean = [];
    parsed.forEach(function (row) {
      if (!row || typeof row.id !== 'string') { return; }
      var p = productById(row.id);
      if (!p || p.stock <= 0) { return; }
      var q = parseInt(row.qty, 10);
      if (isNaN(q) || q < 1) { return; }
      clean.push({ id: p.id, qty: Math.min(q, p.stock) });
    });
    state.cart = clean;
  }

  function persistCart() {
    try { window.localStorage.setItem(CONFIG.cartKey, JSON.stringify(state.cart)); } catch (e) { /* quota / private mode */ }
  }

  /* ---------------------------------------------------------------------- */
  /* catalog: filter + sort                                                 */
  /* ---------------------------------------------------------------------- */
  function visibleProducts() {
    var q = state.query.trim().toLowerCase();

    var list = state.products.filter(function (p) {
      if (state.brand !== 'All' && p.brand !== state.brand) { return false; }
      if (!q) { return true; }
      var hay = (p.name + ' ' + p.brand + ' ' + p.tier).toLowerCase();
      return hay.indexOf(q) !== -1;
    });

    var s = state.sort;
    list.sort(function (a, b) {
      if (s === 'price-asc') { return a.price - b.price || a.name.localeCompare(b.name); }
      if (s === 'price-desc') { return b.price - a.price || a.name.localeCompare(b.name); }
      if (s === 'name-asc') { return a.name.localeCompare(b.name); }
      if (s === 'rating-desc') { return b.rating - a.rating || a.price - b.price; }
      return 0;   // 'featured' keeps catalogue order
    });

    return list;
  }

  function brandCounts() {
    var map = {};
    state.products.forEach(function (p) { map[p.brand] = (map[p.brand] || 0) + 1; });
    var names = Object.keys(map).sort();
    return { map: map, names: names };
  }

  /* ---------------------------------------------------------------------- */
  /* render: chips, grid                                                    */
  /* ---------------------------------------------------------------------- */
  function renderChips() {
    var host = $('#brand-chips');
    if (!host) { return; }
    var bc = brandCounts();
    var html = '<button class="chip" type="button" data-action="filter-brand" data-brand="All" ' +
      'aria-pressed="' + (state.brand === 'All') + '">All <span class="chip-n">' + state.products.length + '</span></button>';

    bc.names.forEach(function (b) {
      html += '<button class="chip" type="button" data-action="filter-brand" data-brand="' + esc(b) + '" ' +
        'aria-pressed="' + (state.brand === b) + '">' + esc(b) +
        ' <span class="chip-n">' + bc.map[b] + '</span></button>';
    });
    host.innerHTML = html;
    syncChips();
  }

  /* Toggle pressed state in place — rebuilding the chip list would blow away
     the keyboard focus ring of the chip the user just activated. */
  function syncChips() {
    $$('#brand-chips .chip').forEach(function (el) {
      el.setAttribute('aria-pressed', String(el.getAttribute('data-brand') === state.brand));
    });
  }

  function cardHtml(p) {
    var st = stockLabel(p);
    var oos = p.stock <= 0;
    return '' +
      '<article class="card' + (oos ? ' is-out' : '') + '" data-id="' + esc(p.id) + '">' +
        '<button class="card-media" type="button" data-action="open-detail" data-id="' + esc(p.id) + '" ' +
          'aria-label="View details for ' + esc(p.name) + '">' +
          '<img src="' + esc(p.image) + '" alt="' + esc(p.name + ' \u2014 ' + p.brand + ' ' + p.tier + ' smartphone') + '" loading="lazy" width="400" height="520">' +
          '<span class="badge-brand">' + esc(p.brand) + '</span>' +
          '<span class="badge-tier" data-tier="' + esc(p.tier) + '">' + esc(p.tier) + '</span>' +
        '</button>' +
        '<div class="card-body">' +
          '<h3><button class="card-name" type="button" data-action="open-detail" data-id="' + esc(p.id) + '">' + esc(p.name) + '</button></h3>' +
          '<div class="rating" aria-label="Rated ' + p.rating + ' out of 5">' +
            '<span class="stars" aria-hidden="true">' + stars(p.rating) + '</span>' +
            '<span>' + p.rating.toFixed(1) + '</span>' +
          '</div>' +
          '<div class="price-row">' +
            '<span class="price">' + money(p.price) + '</span>' +
            '<span class="emi">EMI from <b>' + money(emi(p.price)) + '</b>/mo</span>' +
          '</div>' +
          '<p class="stock ' + st.cls + '">' + esc(st.text) + '</p>' +
          '<div class="card-actions">' +
            '<button class="btn btn-primary' + (oos ? '' : '') + '" type="button" data-action="add-to-cart" data-id="' + esc(p.id) + '"' +
              (oos ? ' disabled aria-disabled="true"' : '') + '>' + (oos ? 'Out of stock' : 'Add to cart') + '</button>' +
            '<button class="btn btn-view" type="button" data-action="open-detail" data-id="' + esc(p.id) + '" ' +
              'aria-label="View details for ' + esc(p.name) + '">Details</button>' +
          '</div>' +
        '</div>' +
      '</article>';
  }

  function renderGrid() {
    var host = $('#products-grid');
    if (!host) { return; }
    var list = visibleProducts();

    host.innerHTML = list.map(cardHtml).join('');

    var empty = $('#shop-empty');
    if (empty) {
      empty.hidden = list.length !== 0;
      if (list.length === 0) {
        var msg = $('#shop-empty-msg');
        if (msg) {
          var bits = [];
          if (state.query.trim()) { bits.push('search \u201c' + state.query.trim() + '\u201d'); }
          if (state.brand !== 'All') { bits.push('brand ' + state.brand); }
          msg.textContent = bits.length
            ? 'Nothing matches ' + bits.join(' + ') + '. Try a different model or reset the filters.'
            : 'Try a different model name or clear the brand filter.';
        }
      }
    }

    var note = $('#result-count');
    if (note) {
      note.textContent = list.length === state.products.length
        ? state.products.length + ' phones available'
        : list.length + ' of ' + state.products.length + ' phones';
    }

    var clearBtn = $('.search-clear');
    if (clearBtn) { clearBtn.hidden = state.query.length === 0; }
  }

  /* ---------------------------------------------------------------------- */
  /* render: cart drawer + checkout summary (both fed by cartTotals)         */
  /* ---------------------------------------------------------------------- */
  function cartLineHtml(l) {
    var atMax = l.qty >= (productById(l.id) || {}).stock;
    return '' +
      '<div class="cart-line" data-id="' + esc(l.id) + '">' +
        '<img src="' + esc((productById(l.id) || {}).image) + '" alt="' + esc(l.name) + '">' +
        '<div>' +
          '<p class="cart-line-name">' + esc(l.name) + '</p>' +
          '<p class="cart-line-brand">' + esc(l.brand) + '</p>' +
          '<div class="qty" role="group" aria-label="Quantity for ' + esc(l.name) + '">' +
            '<button type="button" data-action="cart-dec" data-id="' + esc(l.id) + '" aria-label="Decrease quantity of ' + esc(l.name) + '">\u2212</button>' +
            '<span aria-live="polite">' + l.qty + '</span>' +
            '<button type="button" data-action="cart-inc" data-id="' + esc(l.id) + '" aria-label="Increase quantity of ' + esc(l.name) + '"' +
              (atMax ? ' aria-disabled="true"' : '') + '>+</button>' +
          '</div>' +
        '</div>' +
        '<div class="cart-line-right">' +
          '<span class="cart-line-price">' + money(l.lineTotal) + '</span>' +
          '<button class="remove-btn" type="button" data-action="cart-remove" data-id="' + esc(l.id) + '" ' +
            'aria-label="Remove ' + esc(l.name) + ' from cart">Remove</button>' +
        '</div>' +
      '</div>';
  }

  function paintTotals(t) {
    // drawer
    var elS = $('#cart-subtotal'), elD = $('#cart-delivery'), elT = $('#cart-total');
    if (elS) { elS.textContent = money(t.subtotal); }
    if (elT) { elT.textContent = money(t.total); }
    if (elD) {
      elD.textContent = t.freeDelivery ? 'FREE' : money(t.delivery);
      elD.classList.toggle('free', t.freeDelivery);
    }
    var hint = $('#ship-hint');
    if (hint) {
      if (t.count === 0) { hint.textContent = ''; hint.className = 'ship-hint'; }
      else if (t.freeDelivery) { hint.textContent = 'Free delivery applied on this order.'; hint.className = 'ship-hint hit'; }
      else { hint.textContent = 'Add ' + money(t.shortfall) + ' more for free delivery.'; hint.className = 'ship-hint'; }
    }
    // checkout — same numbers, same source
    var cS = $('#co-subtotal'), cD = $('#co-delivery'), cT = $('#co-total');
    if (cS) { cS.textContent = money(t.subtotal); }
    if (cT) { cT.textContent = money(t.total); }
    if (cD) {
      cD.textContent = t.freeDelivery ? 'FREE' : money(t.delivery);
      cD.classList.toggle('free', t.freeDelivery);
    }
  }

  function renderCart() {
    var t = cartTotals();
    var host = $('#cart-items');
    if (host) { host.innerHTML = t.lines.map(cartLineHtml).join(''); }

    var emptyEl = $('#cart-empty');
    var foot = $('#cart-foot');
    var isEmpty = t.lines.length === 0;
    if (emptyEl) { emptyEl.hidden = !isEmpty; }
    if (foot) { foot.hidden = isEmpty; }

    var lbl = $('#cart-count-label');
    if (lbl) { lbl.textContent = '(' + t.count + ')'; }

    var badge = $('#cart-badge');
    if (badge) {
      badge.textContent = String(t.count);
      badge.dataset.count = String(t.count);
      badge.hidden = t.count === 0;
    }

    paintTotals(t);
    return t;
  }

  function renderCheckoutSummary() {
    var t = cartTotals();
    var host = $('#checkout-items');
    if (host) {
      host.innerHTML = t.lines.map(function (l) {
        return '<div class="sum-line"><span>' + esc(l.name) + ' <span class="q">\u00d7 ' + l.qty + '</span></span>' +
               '<b>' + money(l.lineTotal) + '</b></div>';
      }).join('');
    }
    paintTotals(t);
    return t;
  }

  /* ---------------------------------------------------------------------- */
  /* cart mutations                                                         */
  /* ---------------------------------------------------------------------- */
  function cartQty(id) {
    for (var i = 0; i < state.cart.length; i++) {
      if (state.cart[i].id === id) { return state.cart[i].qty; }
    }
    return 0;
  }

  function addToCart(id, qty) {
    var p = productById(id);
    if (!p) { return; }
    qty = Math.max(1, parseInt(qty, 10) || 1);

    if (p.stock <= 0) {
      toast({ type: 'warn', title: 'Out of stock', message: p.name + ' is not available right now.' });
      return;
    }

    var current = cartQty(id);
    var next = current + qty;
    if (next > p.stock) {
      next = p.stock;
      toast({
        type: 'warn',
        title: 'Stock limit reached',
        message: 'Only ' + p.stock + ' unit' + (p.stock === 1 ? '' : 's') + ' of ' + p.name + ' available.'
      });
      if (next === current) { return; }
    } else {
      toast({ type: 'ok', title: 'Added to cart', message: p.name + ' \u00b7 ' + money(p.price) });
    }

    var found = false;
    state.cart.forEach(function (l) { if (l.id === id) { l.qty = next; found = true; } });
    if (!found) { state.cart.push({ id: id, qty: next }); }

    persistCart();
    renderCart();
  }

  function changeQty(id, delta) {
    var p = productById(id);
    if (!p) { return; }
    var idx = -1;
    for (var i = 0; i < state.cart.length; i++) { if (state.cart[i].id === id) { idx = i; } }
    if (idx < 0) { return; }

    var next = state.cart[idx].qty + delta;

    if (next > p.stock) {
      toast({
        type: 'warn',
        title: 'Stock limit reached',
        message: 'Only ' + p.stock + ' unit' + (p.stock === 1 ? '' : 's') + ' of ' + p.name + ' available.'
      });
      return;
    }

    if (next <= 0) {
      state.cart.splice(idx, 1);
      toast({ type: 'info', title: 'Removed from cart', message: p.name + ' was removed.' });
    } else {
      state.cart[idx].qty = next;
    }
    persistCart();
    renderCart();
  }

  function removeLine(id) {
    var p = productById(id);
    state.cart = state.cart.filter(function (l) { return l.id !== id; });
    persistCart();
    renderCart();
    if (p) { toast({ type: 'info', title: 'Removed from cart', message: p.name + ' was removed.' }); }
  }

  /* ---------------------------------------------------------------------- */
  /* drawer                                                                 */
  /* ---------------------------------------------------------------------- */
  var lastFocus = null;

  function openCart() {
    var drawer = $('#cart-drawer'), overlay = $('#cart-overlay');
    if (!drawer) { return; }
    lastFocus = document.activeElement;
    if (overlay) { overlay.hidden = false; }
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    document.body.classList.add('no-scroll');
    var btn = $('.drawer-head .icon-btn', drawer);
    if (btn) { btn.focus(); }
  }

  function closeCart() {
    var drawer = $('#cart-drawer'), overlay = $('#cart-overlay');
    if (!drawer || !drawer.classList.contains('open')) { return; }
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    if (overlay) { overlay.hidden = true; }
    document.body.classList.remove('no-scroll');
    if (lastFocus && lastFocus.focus) { lastFocus.focus(); }
  }

  /* ---------------------------------------------------------------------- */
  /* product detail dialog                                                  */
  /* ---------------------------------------------------------------------- */
  function openDetail(id) {
    var p = productById(id);
    if (!p) { return; }
    state.detailId = id;
    state.detailQty = 1;

    var st = stockLabel(p);
    var oos = p.stock <= 0;
    var body = $('#detail-body');
    if (body) {
      body.innerHTML = '' +
        '<div class="detail-media"><img src="' + esc(p.image) + '" alt="' + esc(p.name + ' \u2014 ' + p.brand + ' ' + p.tier + ' smartphone') + '" width="400" height="520"></div>' +
        '<div class="detail-info">' +
          '<div class="detail-badges">' +
            '<span class="pill pill-brand">' + esc(p.brand) + '</span>' +
            '<span class="pill" data-tier="' + esc(p.tier) + '">' + esc(p.tier) + '</span>' +
            '<span class="pill">' + esc(p.warranty) + '</span>' +
          '</div>' +
          '<h2 id="detail-title">' + esc(p.name) + '</h2>' +
          '<div class="rating" aria-label="Rated ' + p.rating + ' out of 5">' +
            '<span class="stars" aria-hidden="true">' + stars(p.rating) + '</span><span>' + p.rating.toFixed(1) + ' / 5</span>' +
          '</div>' +
          '<div class="detail-price-row">' +
            '<span class="detail-price">' + money(p.price) + '</span>' +
            '<span class="emi">EMI from <b>' + money(emi(p.price)) + '</b>/mo for 12 months</span>' +
          '</div>' +
          '<p class="stock ' + st.cls + '">' + esc(st.text) + '</p>' +
          '<p class="detail-desc">' + esc(p.description) + '</p>' +
          '<table class="spec-table"><caption class="sr-only">Technical specifications for ' + esc(p.name) + '</caption><tbody>' +
            '<tr><th scope="row">Display</th><td>' + esc(p.specs.display) + '</td></tr>' +
            '<tr><th scope="row">Chipset</th><td>' + esc(p.specs.chipset) + '</td></tr>' +
            '<tr><th scope="row">Camera</th><td>' + esc(p.specs.camera) + '</td></tr>' +
            '<tr><th scope="row">Battery</th><td>' + esc(p.specs.battery) + '</td></tr>' +
            '<tr><th scope="row">Storage</th><td>' + esc(p.specs.storage) + '</td></tr>' +
            '<tr><th scope="row">Colours</th><td>' + esc(p.specs.colours) + '</td></tr>' +
            '<tr><th scope="row">Warranty</th><td>' + esc(p.warranty) + '</td></tr>' +
          '</tbody></table>' +
          '<div class="detail-buy">' +
            '<div class="qty" role="group" aria-label="Quantity">' +
              '<button type="button" data-action="detail-dec" aria-label="Decrease quantity"' + (state.detailQty <= 1 ? ' disabled' : '') + '>\u2212</button>' +
              '<span id="detail-qty" aria-live="polite">' + state.detailQty + '</span>' +
              '<button type="button" data-action="detail-inc" aria-label="Increase quantity">+</button>' +
            '</div>' +
            '<button class="btn btn-primary btn-lg" type="button" data-action="detail-add" data-id="' + esc(p.id) + '"' +
              (oos ? ' disabled aria-disabled="true"' : '') + '>' + (oos ? 'Out of stock' : 'Add to cart') + '</button>' +
            '<p class="buy-note">' + (oos ? 'Notify us on WhatsApp and we will hold the next batch for you.' : 'Free delivery over ' + money(CONFIG.freeDeliveryThreshold) + ' \u00b7 1-year warranty \u00b7 GST invoice.') + '</p>' +
          '</div>' +
        '</div>';
    }

    var dlg = $('#detail-modal');
    if (dlg && !dlg.open) {
      if (typeof dlg.showModal === 'function') { dlg.showModal(); }
      else { dlg.setAttribute('open', ''); }
    }
  }

  function closeDetail() {
    var dlg = $('#detail-modal');
    if (dlg && dlg.open) { dlg.close(); }
  }

  function setDetailQty(q) {
    var p = productById(state.detailId);
    if (!p) { return; }
    if (q < 1) { q = 1; }
    if (q > p.stock) {
      q = p.stock;
      toast({
        type: 'warn',
        title: 'Stock limit reached',
        message: 'Only ' + p.stock + ' unit' + (p.stock === 1 ? '' : 's') + ' of ' + p.name + ' available.'
      });
    }
    state.detailQty = q;
    var el = $('#detail-qty');
    if (el) { el.textContent = String(q); }
    var dec = $('[data-action="detail-dec"]');
    if (dec) { dec.disabled = q <= 1; }
  }

  /* ---------------------------------------------------------------------- */
  /* checkout                                                               */
  /* ---------------------------------------------------------------------- */
  function openCheckout() {
    var t = cartTotals();
    if (t.lines.length === 0) {
      toast({ type: 'warn', title: 'Your cart is empty', message: 'Add a phone before checking out.' });
      closeCart();
      return;
    }
    closeCart();
    renderCheckoutSummary();
    var dlg = $('#checkout-modal');
    if (dlg && !dlg.open) {
      if (typeof dlg.showModal === 'function') { dlg.showModal(); }
      else { dlg.setAttribute('open', ''); }
      var nameInput = $('#co-name');
      if (nameInput) { window.setTimeout(function () { nameInput.focus(); }, 60); }
    }
  }

  function closeCheckout() {
    var dlg = $('#checkout-modal');
    if (dlg && dlg.open) { dlg.close(); }
  }

  var RULES = {
    'co-name': function (v) { return v.trim().length >= 2 ? '' : 'Please enter your full name.'; },
    'co-phone': function (v) {
      var digits = v.replace(/\D/g, '');
      if (!digits) { return 'Please enter your mobile number.'; }
      if (!/^[6-9]\d{9}$/.test(digits)) { return 'Enter a valid 10-digit Indian mobile number.'; }
      return '';
    },
    'co-address': function (v) { return v.trim().length >= 10 ? '' : 'Please enter a full delivery address (at least 10 characters).'; },
    'c-name': function (v) { return v.trim().length >= 2 ? '' : 'Please enter your name.'; },
    'c-phone': function (v) {
      var digits = v.replace(/\D/g, '');
      if (!digits) { return 'Please enter your mobile number.'; }
      if (!/^[6-9]\d{9}$/.test(digits)) { return 'Enter a valid 10-digit Indian mobile number.'; }
      return '';
    },
    'c-msg': function (v) { return v.trim().length >= 4 ? '' : 'Tell us a little about what you need.'; }
  };

  function showFieldError(id, msg) {
    var input = document.getElementById(id);
    var err = document.getElementById(id + '-err');
    if (input) {
      var wrap = input.closest('.field');
      if (wrap) { wrap.classList.toggle('invalid', !!msg); }
      input.setAttribute('aria-invalid', msg ? 'true' : 'false');
      if (msg) { input.setAttribute('aria-describedby', id + '-err'); }
      else { input.removeAttribute('aria-describedby'); }
    }
    if (err) {
      err.textContent = msg || '';
      err.hidden = !msg;
    }
  }

  function validateForm(ids) {
    var firstBad = null;
    ids.forEach(function (id) {
      var input = document.getElementById(id);
      if (!input || !RULES[id]) { return; }
      var msg = RULES[id](input.value);
      showFieldError(id, msg);
      if (msg && !firstBad) { firstBad = input; }
    });
    return firstBad;
  }

  function orderText(t, customer) {
    var lines = t.lines.map(function (l, i) {
      return (i + 1) + '. ' + l.name + ' (' + l.brand + ') x ' + l.qty + ' = ' + money(l.lineTotal);
    });
    var out = [];
    out.push('*' + CONFIG.brand + ' \u2014 Order Enquiry*');
    out.push('');
    out.push.apply(out, lines);
    out.push('');
    out.push('Subtotal: ' + money(t.subtotal));
    out.push('Delivery: ' + (t.freeDelivery ? 'FREE' : money(t.delivery)));
    out.push('*Total payable: ' + money(t.total) + '*');
    out.push('');
    out.push('--- Customer details ---');
    out.push('Name: ' + customer.name);
    out.push('Mobile: ' + customer.phone);
    out.push('Address: ' + customer.address.replace(/\s*\n\s*/g, ', '));
    if (customer.notes) { out.push('Notes: ' + customer.notes); }
    out.push('');
    out.push('(Sent from the ' + CONFIG.brand + ' website)');
    return out.join('\n');
  }

  function buildWhatsAppUrl(text) {
    return 'https://wa.me/' + CONFIG.whatsappNumber + '?text=' + encodeURIComponent(text);
  }

  function submitCheckout(e) {
    e.preventDefault();
    var t = cartTotals();
    if (t.lines.length === 0) {
      toast({ type: 'warn', title: 'Your cart is empty', message: 'Add a phone before checking out.' });
      closeCheckout();
      return;
    }
    var bad = validateForm(['co-name', 'co-phone', 'co-address']);
    if (bad) {
      toast({ type: 'err', title: 'Check the form', message: 'Some required details are missing.' });
      bad.focus();
      return;
    }

    var customer = {
      name: $('#co-name').value.trim(),
      phone: $('#co-phone').value.trim().replace(/\D/g, ''),
      address: $('#co-address').value.trim(),
      notes: ($('#co-notes').value || '').trim()
    };

    var url = buildWhatsAppUrl(orderText(t, customer));
    state.lastOrderUrl = url;

    var itemCount = t.count;
    var total = money(t.total);
    var ref = 'MV' + String(Date.now()).slice(-6);

    window.open(url, '_blank', 'noopener,noreferrer');

    // clear the order
    state.cart = [];
    persistCart();
    renderCart();

    closeCheckout();
    var form = $('#checkout-form');
    if (form) { form.reset(); }
    ['co-name', 'co-phone', 'co-address'].forEach(function (id) { showFieldError(id, ''); });

    toast({
      type: 'ok',
      persist: true,
      title: 'Order sent on WhatsApp',
      message: 'Ref ' + ref + ' \u00b7 ' + itemCount + ' phone' + (itemCount === 1 ? '' : 's') + ' \u00b7 ' + total + '. We reply within minutes, 10am\u20138pm IST.'
    });
  }

  function submitContact(e) {
    e.preventDefault();
    var bad = validateForm(['c-name', 'c-phone', 'c-msg']);
    if (bad) {
      toast({ type: 'err', title: 'Check the form', message: 'Please fix the highlighted fields.' });
      bad.focus();
      return;
    }
    var name = $('#c-name').value.trim();
    var form = $('#contact-form');
    if (form) { form.reset(); }
    ['c-name', 'c-phone', 'c-msg'].forEach(function (id) { showFieldError(id, ''); });
    toast({ type: 'ok', title: 'Thanks, ' + name + '!', message: 'This is a demo form \u2014 nothing was transmitted. Reach us on WhatsApp for a real reply.' });
  }

  /* ---------------------------------------------------------------------- */
  /* delegated actions                                                      */
  /* ---------------------------------------------------------------------- */
  var actions = {
    'scroll-top': function () { window.scrollTo({ top: 0, behavior: 'smooth' }); },
    'scroll-shop': function () { scrollToId('shop'); },
    'scroll-contact': function () { scrollToId('contact'); },
    'toggle-nav': function (el) {
      var nav = $('#mobile-nav');
      if (!nav) { return; }
      var open = nav.hidden;
      nav.hidden = !open;
      nav.classList.toggle('open', open);
      el.setAttribute('aria-expanded', String(open));
    },
    'close-nav': function () {
      var nav = $('#mobile-nav');
      var btn = $('.menu-btn');
      if (nav) { nav.hidden = true; nav.classList.remove('open'); }
      if (btn) { btn.setAttribute('aria-expanded', 'false'); }
    },
    'clear-search': function () {
      var input = $('#search-input');
      if (input) { input.value = ''; }
      state.query = '';
      renderGrid();
      if (input) { input.focus(); }
    },
    'reset-filters': function () {
      state.brand = 'All';
      state.query = '';
      var input = $('#search-input');
      if (input) { input.value = ''; }
      renderChips();
      renderGrid();
      toast({ type: 'info', title: 'Filters cleared', message: 'Showing every phone in the catalogue.' });
    },
    'filter-brand': function (el) {
      state.brand = el.getAttribute('data-brand') || 'All';
      syncChips();
      renderGrid();
    },
    'open-cart': function () { openCart(); },
    'close-cart': function () { closeCart(); },
    'open-detail': function (el) { openDetail(el.getAttribute('data-id')); },
    'close-detail': function () { closeDetail(); },
    'detail-inc': function () { setDetailQty(state.detailQty + 1); },
    'detail-dec': function () { setDetailQty(state.detailQty - 1); },
    'detail-add': function (el) {
      var id = el.getAttribute('data-id');
      addToCart(id, state.detailQty);
      var p = productById(id);
      if (p && p.stock > 0) { closeDetail(); openCart(); }
    },
    'add-to-cart': function (el) {
      addToCart(el.getAttribute('data-id'), 1);
      openCart();
    },
    'cart-inc': function (el) { changeQty(el.getAttribute('data-id'), 1); },
    'cart-dec': function (el) { changeQty(el.getAttribute('data-id'), -1); },
    'cart-remove': function (el) { removeLine(el.getAttribute('data-id')); },
    'open-checkout': function () { openCheckout(); },
    'close-checkout': function () { closeCheckout(); }
  };

  function scrollToId(id) {
    var el = document.getElementById(id);
    if (!el) { return; }
    var top = el.getBoundingClientRect().top + window.pageYOffset - 74;
    window.scrollTo({ top: top, behavior: 'smooth' });
  }

  function onDocumentClick(e) {
    var el = e.target.closest ? e.target.closest('[data-action]') : null;
    if (!el) { return; }
    var name = el.getAttribute('data-action');
    var fn = actions[name];
    if (typeof fn === 'function') {
      fn(el, e);
    } else {
      // A missing handler is the classic bug class here — say it loudly, never silently.
      toast({ type: 'err', title: 'Nothing happened', message: 'Unknown action: ' + name });
    }
  }

  function onDocumentChange(e) {
    var t = e.target;
    if (!t) { return; }
    if (t.id === 'sort-select') {
      state.sort = t.value;
      renderGrid();
    }
  }

  function onSearchInput(e) {
    if (!e.target || e.target.id !== 'search-input') { return; }
    state.query = e.target.value || '';
    renderGrid();
  }

  function onKeydown(e) {
    if (e.key !== 'Escape') { return; }
    var drawer = $('#cart-drawer');
    if (drawer && drawer.classList.contains('open')) {
      closeCart();
      e.preventDefault();
      return;
    }
    var nav = $('#mobile-nav');
    if (nav && !nav.hidden) {
      actions['close-nav']();
    }
  }

  /* ---------------------------------------------------------------------- */
  /* boot                                                                   */
  /* ---------------------------------------------------------------------- */
  function applyBrand() {
    $$('[data-brand-text]').forEach(function (el) { el.textContent = CONFIG.brand; });
    document.title = CONFIG.brand + ' \u2014 Buy Smartphones Online in India';
  }

  function wire() {
    document.addEventListener('click', onDocumentClick);
    document.addEventListener('change', onDocumentChange);
    document.addEventListener('input', onSearchInput);
    document.addEventListener('keydown', onKeydown);

    var y = $('#year');
    if (y) { y.textContent = String(new Date().getFullYear()); }

    var cf = $('#contact-form');
    if (cf) { cf.addEventListener('submit', submitContact); }
    var chf = $('#checkout-form');
    if (chf) { chf.addEventListener('submit', submitCheckout); }

    // native <dialog> Esc / backdrop closes
    ['#detail-modal', '#checkout-modal'].forEach(function (sel) {
      var dlg = $(sel);
      if (!dlg) { return; }
      dlg.addEventListener('click', function (ev) {
        if (ev.target === dlg) { dlg.close(); }   // click outside the panel
      });
    });

    $$('#co-name, #co-phone, #co-address, #c-name, #c-phone, #c-msg').forEach(function (input) {
      input.addEventListener('blur', function () {
        if (RULES[input.id]) { showFieldError(input.id, RULES[input.id](input.value)); }
      });
    });
  }

  function fail(message) {
    var grid = $('#products-grid');
    if (grid) {
      grid.innerHTML = '';
    }
    var empty = $('#shop-empty');
    if (empty) {
      empty.hidden = false;
      var h = empty.querySelector('h3');
      if (h) { h.textContent = 'Catalogue unavailable'; }
      var p = empty.querySelector('p');
      if (p) { p.textContent = message; }
    }
    var note = $('#result-count');
    if (note) { note.textContent = 'Catalogue unavailable'; }
  }

  function init() {
    applyBrand();
    wire();

    fetch(CONFIG.dataUrl, { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) { throw new Error('HTTP ' + res.status); }
        return res.json();
      })
      .then(function (data) {
        if (!Array.isArray(data) || data.length === 0) { throw new Error('Empty catalogue'); }
        state.products = data;
        loadCart();
        renderChips();
        renderGrid();
        renderCart();
        renderCheckoutSummary();
      })
      .catch(function (err) {
        fail('We could not load the phone catalogue (' + err.message + '). Please refresh the page.');
        toast({ type: 'err', title: 'Catalogue failed to load', message: String(err.message || err) });
      });
  }

  // expose a tiny surface for debugging / automated checks
  window.app = {
    state: state,
    CONFIG: CONFIG,
    money: money,
    totals: cartTotals,
    visible: visibleProducts,
    addToCart: addToCart,
    changeQty: changeQty,
    lastOrderUrl: function () { return state.lastOrderUrl; }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
