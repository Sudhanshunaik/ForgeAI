/* ==========================================================================
   AgriFresh — storefront application
   Vanilla ES2019+. No frameworks, no build step, no network at runtime
   beyond loading the three files that ship with the site.

   Every inline onclick in index.html is defined on window.AgriFresh at the
   bottom of this file. Nothing else is global.
   ========================================================================== */

/* ==========================================================================
   BRAND CONFIG — rename the store from this one place.
   Changing `name` here updates the header, the footer, the <title>, every
   toast and every WhatsApp message.
   ========================================================================== */
const BRAND = {
  name: "AgriFresh",
  tagline: "Farm to family",
  whatsappNumber: "919999999999",        // placeholder — no message is sent by this site
  currencySymbol: "\u20B9",
  locale: "en-IN",
  deliveryFee: 60,
  freeDeliveryThreshold: 999,
  storageKey: "agrifresh_cart"
};

const PRODUCTS_URL = "data/products.json";

const STAR_SVG =
  '<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">' +
  '<path d="M12 2.6l2.9 5.9 6.5.95-4.7 4.6 1.1 6.5L12 17.5l-5.8 3.05 1.1-6.5-4.7-4.6 6.5-.95z" fill="currentColor"/></svg>';

/* ------------------------------------------------------------------ state */
const state = {
  products: [],
  cart: new Map(),          // product id -> qty
  category: "All",
  search: "",
  sort: "featured",
  activeProductId: null,
  pendingQty: 1,
  lastOrder: null,
  lastFocused: null,
  loaded: false
};

const el = {};

/* ---------------------------------------------------------------- helpers */
function money(value) {
  const n = Number(value) || 0;
  return BRAND.currencySymbol + n.toLocaleString(BRAND.locale, { maximumFractionDigits: 0 });
}

function esc(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function findProduct(id) {
  return state.products.find(function (p) { return p.id === id; }) || null;
}

function clampQty(qty, product) {
  const n = Math.floor(Number(qty));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(n, product.stock);
}

function applyBrand() {
  document.querySelectorAll("[data-brand]").forEach(function (node) {
    node.textContent = BRAND.name;
  });
  document.querySelectorAll("[data-brand-tagline]").forEach(function (node) {
    node.textContent = BRAND.tagline;
  });
  document.title = BRAND.name + " \u2014 Farm-Fresh Grains, Pulses, Spices & Oils, Delivered";
}

/* --------------------------------------------------------------- toasts */
function showToast(message, type, options) {
  const opts = options || {};
  const kind = type === "error" || type === "success" ? type : "info";

  const toast = document.createElement("div");
  toast.className = "toast is-" + kind;
  toast.setAttribute("role", kind === "error" ? "alert" : "status");

  const icon = document.createElement("span");
  icon.className = "toast-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = kind === "error" ? "!" : kind === "success" ? "\u2713" : "i";

  const body = document.createElement("p");
  body.textContent = message;

  if (opts.action) {
    body.appendChild(document.createTextNode(" "));
    const link = document.createElement("a");
    link.href = opts.action.href;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = opts.action.label;
    body.appendChild(link);
  }

  const close = document.createElement("button");
  close.type = "button";
  close.className = "toast-close";
  close.setAttribute("aria-label", "Dismiss notification");
  close.textContent = "\u00D7";
  close.addEventListener("click", function () { remove(); });

  toast.appendChild(icon);
  toast.appendChild(body);
  toast.appendChild(close);
  el.toasts.appendChild(toast);

  /* Keep the stack short: old transient notifications must not pile up over
     the page (a burst of "added to cart" clicks used to cover whole sections). */
  toast.dataset.persist = opts.persist ? "1" : "0";
  while (el.toasts.children.length > 4) {
    const oldest = Array.prototype.find.call(el.toasts.children, function (node) {
      return node.dataset.persist !== "1";
    });
    if (!oldest || oldest === toast) break;
    oldest.remove();
  }

  let timer = null;
  function remove() {
    if (!toast.isConnected) return;
    if (timer) window.clearTimeout(timer);
    toast.classList.add("is-leaving");
    window.setTimeout(function () { toast.remove(); }, 220);
  }
  if (!opts.persist) timer = window.setTimeout(remove, 3600);
  return { remove: remove };
}

/* --------------------------------------------------------------- storage */
function saveCart() {
  try {
    const rows = [];
    state.cart.forEach(function (qty, id) {
      if (qty > 0) rows.push({ id: id, qty: qty });
    });
    window.localStorage.setItem(BRAND.storageKey, JSON.stringify(rows));
  } catch (err) {
    /* private mode / storage disabled — the cart still works for this page view */
  }
}

function restoreCart() {
  let raw = null;
  try {
    raw = window.localStorage.getItem(BRAND.storageKey);
  } catch (err) {
    raw = null;
  }
  state.cart = new Map();
  if (!raw) return;
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    parsed = null;
  }
  if (!Array.isArray(parsed)) return;
  parsed.forEach(function (row) {
    if (!row) return;
    const product = findProduct(row.id);
    if (!product) return;
    const qty = clampQty(row.qty, product);
    if (qty > 0) state.cart.set(product.id, qty);
  });

  /* Clamping / dropping unknown ids makes the stored payload lie about the
     cart — write the normalised version back so a reload cannot resurrect
     a qty the catalogue no longer allows. */
  const before = parsed.filter(function (row) { return row && typeof row === "object"; });
  const after = [];
  state.cart.forEach(function (qty, id) { after.push({ id: id, qty: qty }); });
  if (JSON.stringify(before) !== JSON.stringify(after)) saveCart();
}

/* ------------------------------------------------------------ cart maths *
 * ONE shared totals function. The drawer, the checkout summary and the
 * WhatsApp message all read from it, so the arithmetic cannot drift.      */
function getCartRows() {
  const rows = [];
  state.cart.forEach(function (qty, id) {
    const product = findProduct(id);
    if (!product) return;
    const q = clampQty(qty, product);
    if (q <= 0) return;
    rows.push({ product: product, qty: q, lineTotal: product.price * q });
  });
  return rows;
}

function computeTotals(rows) {
  const lines = rows || getCartRows();
  const subtotal = lines.reduce(function (sum, r) { return sum + r.lineTotal; }, 0);
  const count = lines.reduce(function (sum, r) { return sum + r.qty; }, 0);
  const freeDelivery = subtotal >= BRAND.freeDeliveryThreshold;
  const delivery = lines.length === 0 || freeDelivery ? 0 : BRAND.deliveryFee;
  return {
    rows: lines,
    subtotal: subtotal,
    count: count,
    delivery: delivery,
    total: subtotal + delivery,
    freeDelivery: freeDelivery,
    awayFromFree: Math.max(0, BRAND.freeDeliveryThreshold - subtotal)
  };
}

/* ------------------------------------------------------------ rendering */
function getVisibleProducts() {
  const term = state.search.trim().toLowerCase();
  let list = state.products.slice();

  if (state.category !== "All") {
    list = list.filter(function (p) { return p.category === state.category; });
  }

  if (term) {
    list = list.filter(function (p) {
      return (p.name + " " + p.category + " " + p.description).toLowerCase().indexOf(term) !== -1;
    });
  }

  switch (state.sort) {
    case "price-asc":
      list.sort(function (a, b) { return a.price - b.price || a.name.localeCompare(b.name); });
      break;
    case "price-desc":
      list.sort(function (a, b) { return b.price - a.price || a.name.localeCompare(b.name); });
      break;
    case "name-asc":
      list.sort(function (a, b) { return a.name.localeCompare(b.name); });
      break;
    case "rating-desc":
      list.sort(function (a, b) { return b.rating - a.rating || a.name.localeCompare(b.name); });
      break;
    default:
      break;
  }
  return list;
}

function categories() {
  const seen = [];
  state.products.forEach(function (p) {
    if (seen.indexOf(p.category) === -1) seen.push(p.category);
  });
  return seen;
}

function renderChips() {
  const counts = {};
  state.products.forEach(function (p) {
    counts[p.category] = (counts[p.category] || 0) + 1;
  });

  const all = ["All"].concat(categories());
  el.chips.innerHTML = all.map(function (cat) {
    const isActive = state.category === cat;
    const count = cat === "All" ? state.products.length : counts[cat];
    return '<button type="button" class="chip' + (isActive ? " is-active" : "") + '"' +
      ' data-cat="' + esc(cat) + '"' +
      ' aria-pressed="' + isActive + '"' +
      ' onclick="AgriFresh.setCategory(this.dataset.cat)">' +
      esc(cat) + ' <span class="chip-count">' + count + '</span></button>';
  }).join("");
}

function stockBadgeHTML(product) {
  if (product.stock === 0) return '<span class="stock-badge is-out">Out of stock</span>';
  if (product.stock <= 5) return '<span class="stock-badge is-low">Only ' + product.stock + ' left</span>';
  return '<span class="stock-badge">In stock</span>';
}

function productCardHTML(product) {
  const out = product.stock === 0;
  const rating = product.rating.toFixed(1);
  return '' +
    '<article class="product-card' + (out ? " is-out" : "") + '"' +
    ' data-id="' + esc(product.id) + '"' +
    ' data-name="' + esc(product.name) + '"' +
    ' data-price="' + product.price + '"' +
    ' data-rating="' + product.rating + '"' +
    ' data-stock="' + product.stock + '"' +
    ' data-category="' + esc(product.category) + '">' +
      '<button class="card-media" type="button" data-action="open"' +
      ' aria-label="View details for ' + esc(product.name) + '">' +
        '<img src="' + esc(product.image) + '" alt="' + esc(product.name) + '"' +
        ' width="400" height="300" loading="lazy" decoding="async">' +
        '<span class="card-cat">' + esc(product.category) + '</span>' +
        stockBadgeHTML(product) +
      '</button>' +
      '<div class="card-body">' +
        '<h3 class="card-name"><button type="button" data-action="open">' +
          esc(product.name) + '</button></h3>' +
        '<p class="card-meta">' +
          '<span class="rating" aria-label="Rated ' + rating + ' out of 5">' + STAR_SVG + rating + '</span>' +
          '<span class="dot" aria-hidden="true"></span>' +
          '<span>per ' + esc(product.unit) + '</span>' +
        '</p>' +
        '<div class="card-foot">' +
          '<p class="price-line"><span class="price">' + money(product.price) + '</span>' +
          '<span class="price-unit">/ ' + esc(product.unit) + '</span></p>' +
          '<button class="btn btn-primary btn-block" type="button" data-action="add"' + (out ? " disabled" : "") +
          ' aria-label="' + (out ? esc(product.name) + " is out of stock"
            : "Add " + esc(product.name) + " to cart") + '">' +
          (out ? "Out of stock" : "Add to cart") + '</button>' +
        '</div>' +
      '</div>' +
    '</article>';
}

function renderProducts() {
  const list = getVisibleProducts();

  if (list.length === 0) {
    el.grid.innerHTML = "";
    el.emptyState.hidden = false;
    el.emptyText.textContent = state.search.trim()
      ? 'No products match \u201C' + state.search.trim() + '\u201D.'
      : "Nothing in this category yet \u2014 try another.";
  } else {
    el.emptyState.hidden = true;
    el.grid.innerHTML = list.map(productCardHTML).join("");
  }

  el.resultMeta.textContent = state.products.length
    ? "Showing " + list.length + " of " + state.products.length + " products" +
      (state.category !== "All" ? " in " + state.category : "")
    : "";
}

function renderCart() {
  const totals = computeTotals();

  el.cartCount.textContent = String(totals.count);
  el.cartBtn.setAttribute("aria-label",
    "Open cart, " + totals.count + (totals.count === 1 ? " item" : " items"));
  el.cartItemCount.textContent = totals.count + (totals.count === 1 ? " item" : " items");

  if (totals.rows.length === 0) {
    el.cartItems.innerHTML = "";
    el.cartItems.hidden = true;
    el.cartFoot.hidden = true;
    el.cartEmpty.hidden = false;
    el.sumSubtotal.textContent = money(0);
    el.sumDelivery.textContent = money(0);
    el.sumTotal.textContent = money(0);
    el.deliveryHint.textContent = "";
    return;
  }

  el.cartEmpty.hidden = true;
  el.cartItems.hidden = false;
  el.cartFoot.hidden = false;

  el.cartItems.innerHTML = totals.rows.map(function (row) {
    const p = row.product;
    return '' +
      '<div class="cart-line" data-id="' + esc(p.id) + '">' +
        '<img src="' + esc(p.image) + '" alt="' + esc(p.name) + '" width="62" height="62">' +
        '<div class="cart-line-info">' +
          '<span class="cart-line-name">' + esc(p.name) + '</span>' +
          '<span class="cart-line-price">' + money(p.price) + ' / ' + esc(p.unit) + '</span>' +
          '<span class="stepper">' +
            '<button type="button" data-action="step" data-delta="-1"' +
            ' aria-label="Decrease quantity of ' + esc(p.name) + '">&minus;</button>' +
            '<input type="number" min="0" max="' + p.stock + '" value="' + row.qty + '"' +
            ' aria-label="Quantity of ' + esc(p.name) + ' in ' + esc(p.unit) + '"' +
            ' data-action="qty">' +
            '<button type="button" data-action="step" data-delta="1"' +
            ' aria-label="Increase quantity of ' + esc(p.name) + '">+</button>' +
          '</span>' +
        '</div>' +
        '<div class="cart-line-actions">' +
          '<span class="cart-line-total">' + money(row.lineTotal) + '</span>' +
          '<button type="button" class="link-danger" data-action="remove"' +
          ' aria-label="Remove ' + esc(p.name) + ' from cart">Remove</button>' +
        '</div>' +
      '</div>';
  }).join("");

  el.sumSubtotal.textContent = money(totals.subtotal);
  el.sumDelivery.textContent = totals.delivery === 0 ? "Free" : money(totals.delivery);
  el.sumTotal.textContent = money(totals.total);

  el.deliveryHint.textContent = totals.freeDelivery
    ? "Free delivery applied \u2014 you saved " + money(BRAND.deliveryFee) + "."
    : "Add " + money(totals.awayFromFree) + " more for free delivery.";
}

/* --------------------------------------------------------- mutations */
function addToCart(id, qty) {
  const product = findProduct(id);
  if (!product) return;
  const amount = Math.max(1, Math.floor(Number(qty) || 1));

  if (product.stock === 0) {
    showToast(product.name + " is out of stock right now.", "error");
    return;
  }

  const current = state.cart.get(id) || 0;
  const next = Math.min(current + amount, product.stock);

  if (next === current) {
    showToast("Only " + product.stock + " " + product.unit + " of " + product.name + " in stock.", "error");
    return;
  }

  state.cart.set(id, next);
  saveCart();
  renderCart();
  bumpCartBadge();
  showToast("Added " + product.name + " to your cart.", "success");
}

function setCartQty(id, value) {
  const product = findProduct(id);
  if (!product) return;
  const text = String(value == null ? "" : value).trim();
  const n = Number(text);

  /* An emptied field (or junk typed into a number input, which the browser
     normalises to "") is not an instruction to delete the line — put the
     stored quantity back and re-render. */
  if (text === "" || !Number.isFinite(n)) {
    renderCart();
    return;
  }

  const raw = Math.floor(n);

  /* An explicit 0 (or a negative number) does remove the line — with a
     toast, so the change is never silent. */
  if (raw <= 0) { removeFromCart(id, false); return; }

  const clamped = Math.min(raw, product.stock);
  if (clamped !== raw) {
    showToast("Only " + product.stock + " " + product.unit + " of " + product.name + " in stock.", "error");
  }
  state.cart.set(id, clamped);
  saveCart();
  renderCart();
}

function stepCart(id, delta) {
  const product = findProduct(id);
  if (!product) return;
  const current = state.cart.get(id) || 0;
  const next = current + delta;

  if (next > product.stock) {
    showToast("Only " + product.stock + " " + product.unit + " of " + product.name + " in stock.", "error");
    return;
  }
  if (next <= 0) { removeFromCart(id, true); return; }

  state.cart.set(id, next);
  saveCart();
  renderCart();
}

function removeFromCart(id, quiet) {
  const product = findProduct(id);
  state.cart.delete(id);
  saveCart();
  renderCart();
  if (!quiet && product) {
    showToast("Removed " + product.name + " from your cart.", "info");
  }
}

function bumpCartBadge() {
  el.cartCount.classList.remove("is-bumped");
  void el.cartCount.offsetWidth;
  el.cartCount.classList.add("is-bumped");
}

/* ------------------------------------------------------- product modal */
function renderProductModal() {
  const product = findProduct(state.activeProductId);
  if (!product) return;
  const out = product.stock === 0;

  el.pmPanel.innerHTML = '' +
    '<button class="icon-btn modal-close" type="button" onclick="AgriFresh.closeProduct()"' +
    ' aria-label="Close product details">&times;</button>' +
    '<div class="pm-grid">' +
      '<div class="pm-media">' +
        '<img src="' + esc(product.image) + '" alt="' + esc(product.name) + '" width="400" height="300">' +
      '</div>' +
      '<div class="pm-body">' +
        '<p class="pm-cat">' + esc(product.category) + '</p>' +
        '<h2>' + esc(product.name) + '</h2>' +
        '<p class="pm-rating">' +
          '<span class="rating" aria-label="Rated ' + product.rating.toFixed(1) + ' out of 5">' +
          STAR_SVG + product.rating.toFixed(1) + '</span>' +
          stockBadgeHTML(product) +
        '</p>' +
        '<p class="pm-desc">' + esc(product.description) + '</p>' +
        '<dl class="pm-specs">' +
          '<div><dt>Origin</dt><dd>' + esc(product.origin) + '</dd></div>' +
          '<div><dt>Pack sizes</dt><dd>' + esc(product.packSizes.join(", ")) + '</dd></div>' +
          '<div><dt>Shelf life</dt><dd>' + esc(product.shelfLife) + '</dd></div>' +
          '<div><dt>Available</dt><dd>' + (out ? "Out of stock" : product.stock + " " + esc(product.unit)) + '</dd></div>' +
        '</dl>' +
        '<div class="pm-buy">' +
          '<p class="price-line"><span class="price">' + money(product.price) + '</span>' +
          '<span class="price-unit">/ ' + esc(product.unit) + '</span></p>' +
          '<span class="stepper">' +
            '<button type="button" onclick="AgriFresh.stepPending(-1)" aria-label="Decrease quantity">&minus;</button>' +
            '<input id="pmQty" type="number" min="1" max="' + Math.max(1, product.stock) + '"' +
            ' value="' + state.pendingQty + '" aria-label="Quantity in ' + esc(product.unit) + '"' +
            ' onchange="AgriFresh.setPendingQty(this.value)"' + (out ? " disabled" : "") + '>' +
            '<button type="button" onclick="AgriFresh.stepPending(1)" aria-label="Increase quantity"' +
            (out ? " disabled" : "") + '>+</button>' +
          '</span>' +
          '<button class="btn btn-primary" type="button" onclick="AgriFresh.addPendingToCart()"' +
          (out ? " disabled" : "") + '>' + (out ? "Out of stock" : "Add to cart") + '</button>' +
        '</div>' +
      '</div>' +
    '</div>';
}

function openProduct(id) {
  const product = findProduct(id);
  if (!product) return;
  state.activeProductId = id;
  state.pendingQty = 1;
  renderProductModal();
  openDialog(el.productModal);
}

function closeProduct() {
  closeDialog(el.productModal);
  state.activeProductId = null;
}

function stepPending(delta) {
  const product = findProduct(state.activeProductId);
  if (!product) return;
  const next = state.pendingQty + delta;
  if (next < 1) return;
  if (next > product.stock) {
    showToast("Only " + product.stock + " " + product.unit + " in stock.", "error");
    return;
  }
  state.pendingQty = next;
  const input = document.getElementById("pmQty");
  if (input) input.value = String(next);
}

function setPendingQty(value) {
  const product = findProduct(state.activeProductId);
  if (!product) return;
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1) {
    state.pendingQty = 1;
  } else if (n > product.stock) {
    state.pendingQty = product.stock;
    showToast("Only " + product.stock + " " + product.unit + " in stock.", "error");
  } else {
    state.pendingQty = n;
  }
  const input = document.getElementById("pmQty");
  if (input) input.value = String(state.pendingQty);
}

function addPendingToCart() {
  if (!state.activeProductId) return;
  addToCart(state.activeProductId, state.pendingQty);
  closeProduct();
}

/* ------------------------------------------------------ checkout modal */
function buildOrderText(values) {
  const totals = computeTotals();
  const lines = [];
  lines.push("*New order enquiry \u2014 " + BRAND.name + "*");
  lines.push("");
  lines.push("*Items*");
  totals.rows.forEach(function (row, index) {
    lines.push((index + 1) + ". " + row.product.name + " \u2014 " + row.qty + " " + row.product.unit +
      " \u00D7 " + money(row.product.price) + " = " + money(row.lineTotal));
  });
  lines.push("");
  lines.push("*Order summary*");
  lines.push("Subtotal: " + money(totals.subtotal));
  lines.push("Delivery: " + (totals.delivery === 0 ? "Free" : money(totals.delivery)));
  lines.push("Total: " + money(totals.total));
  lines.push("");
  lines.push("*Customer details*");
  lines.push("Name: " + (values.name || "-"));
  lines.push("Phone: " + (values.phone || "-"));
  lines.push("Address: " + String(values.address || "-").replace(/\s*\n+\s*/g, ", ").trim());
  if (values.notes) lines.push("Notes: " + String(values.notes).replace(/\s*\n+\s*/g, " ").trim());
  lines.push("");
  lines.push("Sent from the " + BRAND.name + " website.");
  return lines.join("\n");
}

function buildOrderUrl(text) {
  return "https://wa.me/" + BRAND.whatsappNumber + "?text=" + encodeURIComponent(text);
}

function checkoutValues() {
  return {
    name: el.coName.value.trim(),
    phone: el.coPhone.value.trim(),
    address: el.coAddress.value.trim(),
    notes: el.coNotes.value.trim()
  };
}

function renderCheckoutSummary() {
  const totals = computeTotals();

  if (totals.rows.length === 0) {
    el.coSummaryItems.innerHTML = '<p class="summary-empty">Your cart is empty.</p>';
  } else {
    el.coSummaryItems.innerHTML = totals.rows.map(function (row) {
      return '<div class="summary-item">' +
        '<span>' + esc(row.product.name) + '<small>' + row.qty + ' ' + esc(row.product.unit) +
        ' \u00D7 ' + money(row.product.price) + '</small></span>' +
        '<strong>' + money(row.lineTotal) + '</strong>' +
        '</div>';
    }).join("");
  }

  el.coSubtotal.textContent = money(totals.subtotal);
  el.coDelivery.textContent = totals.delivery === 0 ? "Free" : money(totals.delivery);
  el.coTotal.textContent = money(totals.total);

  syncPlaceOrderLink();
}

/* The "Open the WhatsApp link" anchor stays inert until the form would
   actually pass validation; only placeOrder() publishes a real URL. */
function checkoutIsValid() {
  return Object.keys(checkoutErrors(checkoutValues())).length === 0;
}

function syncPlaceOrderLink() {
  if (checkoutIsValid()) {
    el.placeOrderLink.href = buildOrderUrl(buildOrderText(checkoutValues()));
    el.placeOrderLink.target = "_blank";
    el.placeOrderLink.removeAttribute("aria-disabled");
    el.placeOrderLink.classList.remove("is-disabled");
  } else {
    el.placeOrderLink.removeAttribute("href");
    el.placeOrderLink.removeAttribute("target");
    el.placeOrderLink.setAttribute("aria-disabled", "true");
    el.placeOrderLink.classList.add("is-disabled");
  }
}

function openCheckout() {
  const totals = computeTotals();
  if (totals.rows.length === 0) {
    showToast("Your cart is empty \u2014 add something first.", "error");
    return;
  }
  closeCart();
  renderCheckoutSummary();
  openDialog(el.checkoutModal, el.coName);
}

function closeCheckout() {
  closeDialog(el.checkoutModal);
}

/* ------------------------------------------------------- form validation */
/* Accepts the format the checkout placeholder advertises ("98765 43210")
   as well as a solid 10-digit number and the +91 prefixes. */
const PHONE_RE = /^(\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function setFieldError(input, errorNode, message) {
  if (message) {
    input.setAttribute("aria-invalid", "true");
    errorNode.textContent = message;
    errorNode.hidden = false;
  } else {
    input.removeAttribute("aria-invalid");
    errorNode.textContent = "";
    errorNode.hidden = true;
  }
}

function validateContact() {
  const values = {
    name: el.ctName.value.trim(),
    email: el.ctEmail.value.trim(),
    phone: el.ctPhone.value.trim(),
    message: el.ctMessage.value.trim()
  };
  const errors = {};
  if (values.name.length < 2) errors.ctName = "Please enter your name (at least 2 characters).";
  if (!EMAIL_RE.test(values.email)) errors.ctEmail = "Please enter a valid email address.";
  if (values.phone && !PHONE_RE.test(values.phone)) errors.ctPhone = "Enter a 10-digit Indian mobile number.";
  if (values.message.length < 10) errors.ctMessage = "Please add a little more detail (10+ characters).";

  setFieldError(el.ctName, el.ctNameErr, errors.ctName);
  setFieldError(el.ctEmail, el.ctEmailErr, errors.ctEmail);
  setFieldError(el.ctPhone, el.ctPhoneErr, errors.ctPhone);
  setFieldError(el.ctMessage, el.ctMessageErr, errors.ctMessage);

  return { errors: errors, values: values, ok: Object.keys(errors).length === 0 };
}

/* One source of truth for the checkout rules: validateCheckout() renders
   them, checkoutIsValid() asks whether the wa.me link may go live. */
function checkoutErrors(values) {
  const errors = {};
  if (values.name.length < 2) errors.coName = "Please enter the name for this order.";
  if (!PHONE_RE.test(values.phone)) errors.coPhone = "Enter a 10-digit Indian mobile number.";
  if (values.address.length < 10) errors.coAddress = "Please enter the full delivery address.";
  return errors;
}

function validateCheckout() {
  const values = checkoutValues();
  const errors = checkoutErrors(values);

  setFieldError(el.coName, el.coNameErr, errors.coName);
  setFieldError(el.coPhone, el.coPhoneErr, errors.coPhone);
  setFieldError(el.coAddress, el.coAddressErr, errors.coAddress);

  return { errors: errors, values: values, ok: Object.keys(errors).length === 0 };
}

function submitContact(event) {
  event.preventDefault();
  const result = validateContact();
  if (!result.ok) {
    showToast("Please fix the highlighted fields.", "error");
    const firstId = Object.keys(result.errors)[0];
    const node = document.getElementById(firstId);
    if (node) node.focus();
    return;
  }
  el.contactForm.reset();
  showToast("Thanks " + result.values.name.split(" ")[0] + "! Your message is queued (demo only).", "success");
}

function placeOrder(event) {
  event.preventDefault();
  const result = validateCheckout();

  if (!result.ok) {
    showToast("Please fix the highlighted fields.", "error");
    const firstId = Object.keys(result.errors)[0];
    const node = document.getElementById(firstId);
    if (node) node.focus();
    return;
  }

  const text = buildOrderText(result.values);
  const url = buildOrderUrl(text);

  state.lastOrder = { text: text, url: url, values: result.values, at: new Date().toISOString() };
  el.placeOrderLink.href = url;

  state.cart = new Map();
  saveCart();
  renderCart();
  closeCheckout();

  /* The site itself never calls out to the network — it prepares the
     pre-filled wa.me link and hands it to the customer. */
  showToast("Order summary prepared. Send it to us on WhatsApp and we will confirm stock and freight.", "success", {
    persist: true,
    action: { href: url, label: "Open WhatsApp \u2197" }
  });
}

/* -------------------------------------------------------------- dialogs */
function openDialog(node, focusTarget) {
  state.lastFocused = document.activeElement;
  node.hidden = false;
  node.setAttribute("aria-hidden", "false");
  syncLock();
  /* Focus synchronously. Waiting on requestAnimationFrame would leave the
     dialog inert whenever the page is hidden or frames are throttled. */
  const target = focusTarget || node.querySelector("button, [href], input, select, textarea");
  if (target && typeof target.focus === "function") target.focus();
}

function closeDialog(node) {
  if (node.hidden) return;
  node.hidden = true;
  node.setAttribute("aria-hidden", "true");
  syncLock();
  if (state.lastFocused && typeof state.lastFocused.focus === "function") {
    state.lastFocused.focus();
  }
}

function syncLock() {
  const drawerOpen = el.cartDrawer.classList.contains("is-open");
  const anyOpen = drawerOpen || !el.productModal.hidden || !el.checkoutModal.hidden;
  document.body.classList.toggle("is-locked", !!anyOpen);
  setBackgroundInert(!!anyOpen);
}

/* Everything in <body> except the overlays themselves is background while a
   dialog/drawer is open: `inert` takes it out of the tab order and out of
   the accessibility tree, so focus and AT cannot reach the page behind. */
function backgroundNodes() {
  return Array.prototype.filter.call(document.body.children, function (node) {
    return node.tagName !== "SCRIPT" &&
      node !== el.overlay &&
      node !== el.cartDrawer &&
      node !== el.productModal &&
      node !== el.checkoutModal &&
      node !== el.toasts;
  });
}

function setBackgroundInert(on) {
  backgroundNodes().forEach(function (node) {
    if (on) node.setAttribute("inert", "");
    else node.removeAttribute("inert");
  });
}

function activeContainer() {
  if (!el.checkoutModal.hidden) return el.checkoutModal;
  if (!el.productModal.hidden) return el.productModal;
  if (el.cartDrawer.classList.contains("is-open")) return el.cartDrawer;
  return null;
}

const FOCUSABLE_SEL = 'a[href], button:not([disabled]), input:not([disabled]), ' +
  'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusableIn(container) {
  return Array.prototype.filter.call(container.querySelectorAll(FOCUSABLE_SEL), function (node) {
    return node.getClientRects().length > 0;
  });
}

/* Keep Tab / Shift-Tab inside the open drawer or dialog. */
function trapTab(event) {
  const container = activeContainer();
  if (!container) return;
  const items = focusableIn(container);
  if (items.length === 0) { event.preventDefault(); return; }
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  const inside = container.contains(active);
  if (event.shiftKey) {
    if (!inside || active === first) { event.preventDefault(); last.focus(); }
  } else if (!inside || active === last) {
    event.preventDefault(); first.focus();
  }
}

function openCart() {
  state.lastFocused = document.activeElement;
  el.cartDrawer.hidden = false;
  el.overlay.hidden = false;
  /* Flush styles so the off-screen transform is a real transition start
     point, then move to the open state synchronously. */
  void el.cartDrawer.offsetWidth;
  el.overlay.classList.add("is-visible");
  el.cartDrawer.classList.add("is-open");
  el.cartDrawer.setAttribute("aria-hidden", "false");
  syncLock();
  const focusTarget = el.cartDrawer.querySelector(".icon-btn");
  if (focusTarget) focusTarget.focus();
}

function closeCart() {
  const wasOpen = el.cartDrawer.classList.contains("is-open");
  el.overlay.classList.remove("is-visible");
  el.cartDrawer.classList.remove("is-open");
  el.cartDrawer.setAttribute("aria-hidden", "true");
  syncLock();
  window.setTimeout(function () {
    if (!el.cartDrawer.classList.contains("is-open")) {
      el.cartDrawer.hidden = true;
      el.overlay.hidden = true;
    }
    syncLock();
    /* Hand focus back to whatever opened the drawer — but never steal it
       from a dialog that opened on top of it. */
    const dialogOpen = !el.productModal.hidden || !el.checkoutModal.hidden;
    if (wasOpen && !dialogOpen && state.lastFocused && typeof state.lastFocused.focus === "function") {
      state.lastFocused.focus();
    }
  }, 300);
}

function closeAll() {
  if (!el.checkoutModal.hidden) closeCheckout();
  if (!el.productModal.hidden) closeProduct();
  closeCart();
  el.mainNav.classList.remove("is-open");
  el.navToggle.setAttribute("aria-expanded", "false");
}

/* ------------------------------------------------------------------- ui */
function setCategory(category) {
  state.category = category;
  renderChips();
  renderProducts();
}

function onSearchInput() {
  state.search = el.searchInput.value;
  el.searchClear.hidden = state.search.length === 0;
  renderProducts();
}

function clearSearch() {
  state.search = "";
  el.searchInput.value = "";
  el.searchClear.hidden = true;
  renderProducts();
  el.searchInput.focus();
}

function clearFilters() {
  state.category = "All";
  state.sort = "featured";
  state.search = "";
  el.searchInput.value = "";
  el.searchClear.hidden = true;
  el.sortSelect.value = "featured";
  renderChips();
  renderProducts();
}

function toggleNav() {
  const open = el.mainNav.classList.toggle("is-open");
  el.navToggle.setAttribute("aria-expanded", String(open));
}

function scrollToShop() {
  const shop = document.getElementById("shop");
  if (shop) shop.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ------------------------------------------- generated-content delegation */
/* Product cards and cart lines are rendered from the catalogue. They carry
   data-id / data-action and are handled by delegation, so no product id is
   ever interpolated into an inline handler string. */
function actionContext(node, container) {
  if (!node || typeof node.closest !== "function") return null;
  const actionNode = node.closest("[data-action]");
  if (!actionNode || !container.contains(actionNode)) return null;
  const holder = actionNode.closest("[data-id]");
  if (!holder || !container.contains(holder)) return null;
  return { action: actionNode.dataset.action, id: holder.dataset.id, node: actionNode };
}

function onGridClick(event) {
  const ctx = actionContext(event.target, el.grid);
  if (!ctx) return;
  if (ctx.action === "open") openProduct(ctx.id);
  else if (ctx.action === "add") addToCart(ctx.id);
}

function onCartClick(event) {
  const ctx = actionContext(event.target, el.cartItems);
  if (!ctx) return;
  if (ctx.action === "step") stepCart(ctx.id, Number(ctx.node.dataset.delta) || 0);
  else if (ctx.action === "remove") removeFromCart(ctx.id);
}

function onCartChange(event) {
  const ctx = actionContext(event.target, el.cartItems);
  if (!ctx || ctx.action !== "qty") return;
  setCartQty(ctx.id, ctx.node.value);
}

/* ------------------------------------------------------------------ init */
function cacheElements() {
  el.header = document.getElementById("siteHeader");
  el.navToggle = document.getElementById("navToggle");
  el.mainNav = document.getElementById("mainNav");
  el.searchInput = document.getElementById("searchInput");
  el.searchClear = document.getElementById("searchClear");
  el.cartBtn = document.getElementById("cartBtn");
  el.cartCount = document.getElementById("cartCount");
  el.sortSelect = document.getElementById("sortSelect");
  el.chips = document.getElementById("categoryChips");
  el.resultMeta = document.getElementById("resultMeta");
  el.grid = document.getElementById("productGrid");
  el.emptyState = document.getElementById("emptyState");
  el.emptyText = document.getElementById("emptyText");

  el.overlay = document.getElementById("overlay");
  el.cartDrawer = document.getElementById("cartDrawer");
  el.cartItems = document.getElementById("cartItems");
  el.cartEmpty = document.getElementById("cartEmpty");
  el.cartFoot = document.getElementById("cartFoot");
  el.cartItemCount = document.getElementById("cartItemCount");
  el.sumSubtotal = document.getElementById("sumSubtotal");
  el.sumDelivery = document.getElementById("sumDelivery");
  el.sumTotal = document.getElementById("sumTotal");
  el.deliveryHint = document.getElementById("deliveryHint");

  el.productModal = document.getElementById("productModal");
  el.pmPanel = document.getElementById("pmPanel");
  el.checkoutModal = document.getElementById("checkoutModal");
  el.coSummaryItems = document.getElementById("coSummaryItems");
  el.coSubtotal = document.getElementById("coSubtotal");
  el.coDelivery = document.getElementById("coDelivery");
  el.coTotal = document.getElementById("coTotal");
  el.placeOrderLink = document.getElementById("placeOrderLink");

  el.coName = document.getElementById("coName");
  el.coPhone = document.getElementById("coPhone");
  el.coAddress = document.getElementById("coAddress");
  el.coNotes = document.getElementById("coNotes");
  el.coNameErr = document.getElementById("coNameErr");
  el.coPhoneErr = document.getElementById("coPhoneErr");
  el.coAddressErr = document.getElementById("coAddressErr");

  el.contactForm = document.getElementById("contactForm");
  el.ctName = document.getElementById("ctName");
  el.ctEmail = document.getElementById("ctEmail");
  el.ctPhone = document.getElementById("ctPhone");
  el.ctMessage = document.getElementById("ctMessage");
  el.ctNameErr = document.getElementById("ctNameErr");
  el.ctEmailErr = document.getElementById("ctEmailErr");
  el.ctPhoneErr = document.getElementById("ctPhoneErr");
  el.ctMessageErr = document.getElementById("ctMessageErr");

  el.toasts = document.getElementById("toastContainer");
  el.year = document.getElementById("year");
}

function bindEvents() {
  el.searchInput.addEventListener("input", onSearchInput);
  el.grid.addEventListener("click", onGridClick);
  el.cartItems.addEventListener("click", onCartClick);
  el.cartItems.addEventListener("change", onCartChange);
  el.sortSelect.addEventListener("change", function () {
    state.sort = el.sortSelect.value;
    renderProducts();
  });

  [el.coName, el.coPhone, el.coAddress, el.coNotes].forEach(function (input) {
    input.addEventListener("input", renderCheckoutSummary);
  });

  window.addEventListener("scroll", function () {
    el.header.classList.toggle("is-stuck", window.scrollY > 8);
  }, { passive: true });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Tab") { trapTab(event); return; }
    if (event.key !== "Escape") return;
    if (!el.checkoutModal.hidden) { closeCheckout(); return; }
    if (!el.productModal.hidden) { closeProduct(); return; }
    if (el.cartDrawer.classList.contains("is-open")) { closeCart(); return; }
    if (el.mainNav.classList.contains("is-open")) {
      el.mainNav.classList.remove("is-open");
      el.navToggle.setAttribute("aria-expanded", "false");
    }
  });

  /* Smooth-scroll for in-page nav without leaving a hash in the URL. */
  document.querySelectorAll('a[href^="#"]').forEach(function (link) {
    link.addEventListener("click", function (event) {
      const id = link.getAttribute("href").slice(1);
      const target = id ? document.getElementById(id) : null;
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      if (el.mainNav.classList.contains("is-open")) {
        el.mainNav.classList.remove("is-open");
        el.navToggle.setAttribute("aria-expanded", "false");
      }
    });
  });
}

async function init() {
  cacheElements();
  applyBrand();
  el.year.textContent = String(new Date().getFullYear());
  bindEvents();

  try {
    const response = await fetch(PRODUCTS_URL, { cache: "no-store" });
    if (!response.ok) throw new Error("HTTP " + response.status + " for " + PRODUCTS_URL);
    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) throw new Error("products.json did not contain a product list");
    state.products = data;
  } catch (err) {
    el.resultMeta.textContent = "Could not load products.json \u2014 " + err.message;
    showToast("We could not load the product catalogue.", "error");
    return;
  }

  state.loaded = true;
  restoreCart();
  renderChips();
  renderProducts();
  renderCart();
}

/* --------------------------------------------------------- public API */
window.AgriFresh = {
  BRAND: BRAND,
  state: state,
  money: money,
  computeTotals: computeTotals,
  buildOrderText: buildOrderText,
  buildOrderUrl: buildOrderUrl,
  getVisibleProducts: getVisibleProducts,
  getCategories: categories,

  openProduct: openProduct,
  closeProduct: closeProduct,
  stepPending: stepPending,
  setPendingQty: setPendingQty,
  addPendingToCart: addPendingToCart,

  addToCart: addToCart,
  setCartQty: setCartQty,
  stepCart: stepCart,
  removeFromCart: removeFromCart,
  openCart: openCart,
  closeCart: closeCart,
  openCheckout: openCheckout,
  closeCheckout: closeCheckout,
  placeOrder: placeOrder,
  closeAll: closeAll,

  setCategory: setCategory,
  clearSearch: clearSearch,
  clearFilters: clearFilters,
  scrollToShop: scrollToShop,
  toggleNav: toggleNav,
  submitContact: submitContact,
  showToast: showToast,
  getLastOrder: function () { return state.lastOrder; }
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
