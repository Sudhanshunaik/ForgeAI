// ===== Flipkart-style Clone — App Logic (Polished) =====
let products = [];
let sections = [];
let heroSlides = [];
let promoTiles = [];
let features = [];
let collections = {};
let brands = [];
let cart = JSON.parse(localStorage.getItem('fk-cart') || '[]');
let activeCategory = 'foryou';
let sortBy = 'popularity';
let searchQuery = '';

// Collection card → closest product section mapping
const COLLECTION_CATS = {
  everybody: ['beauty', 'fashion', 'fashion', 'fashion', 'home', 'fashion'],
  trends: ['fashion', 'fashion', 'fashion', 'fashion', 'fashion', 'electronics']
};

// ===== Utilities =====
function inr(n) {
  return '₹' + n.toLocaleString('en-IN');
}

function discountPct(p) {
  return Math.round(((p.mrp - p.price) / p.mrp) * 100);
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function imgFallback(label, w, h) {
  return `https://placehold.co/${w}x${h}/f5f5f5/2874F0?text=${encodeURIComponent(label)}`;
}

// Smooth image fade-in after every render
function enableImgFade(root) {
  (root || document).querySelectorAll('img[data-fade]').forEach(img => {
    if (img.complete && img.naturalWidth > 0) img.classList.add('loaded');
    else {
      img.addEventListener('load', () => img.classList.add('loaded'), { once: true });
      img.addEventListener('error', () => img.classList.add('loaded'), { once: true });
    }
  });
}

// ===== Init with skeleton =====
async function init() {
  const main = document.getElementById('main');
  main.innerHTML = `
    <div class="skeleton-grid">
      ${'<div class="skeleton-card"></div>'.repeat(8)}
    </div>
  `;
  try {
    const res = await fetch('data/products.json');
    const data = await res.json();
    products = data.products;
    sections = data.sections;
    heroSlides = data.heroSlides || [];
    promoTiles = data.promoTiles || [];
    features = data.features || [];
    collections = data.collections || {};
    brands = data.brands || [];
    renderHome();
    renderCart();
    updateCartCount();
    startCarousel();
  } catch (err) {
    console.error('Failed to load products:', err);
    main.innerHTML =
      '<div class="no-results">Failed to load products. Please ensure you are running via a local server.</div>';
  }
}

// ===== Home (For You) =====
function renderHome() {
  activeCategory = 'foryou';
  setActiveCat('foryou');
  searchQuery = '';
  toggleSearchClear();
  const main = document.getElementById('main');

  main.innerHTML = `
    ${heroHTML()}
    ${tilesHTML()}
    ${featureRailHTML()}
    ${collectionHTML('everybody', 'grad-lavender')}
    ${sections.map(sec => sectionHTML(sec)).join('')}
    ${collectionHTML('trends', 'grad-peach')}
    ${brandHTML()}
  `;

  enableImgFade();
  slideIndex = 0;
  goSlide(0);
  startCarousel();
}

// ----- Hero carousel -----
function heroHTML() {
  if (!heroSlides.length) return '';
  return `
    <div class="carousel" id="carousel">
      <div class="carousel-track" id="carousel-track">
        ${heroSlides.map(s => `
          <div class="carousel-slide theme-${s.theme}">
            <div class="slide-text">
              <h2>${esc(s.title)}</h2>
              <p>${esc(s.subtitle)}</p>
              <button class="slide-cta">${esc(s.cta).toUpperCase()}</button>
            </div>
            <div class="slide-art">${s.art}</div>
            <div class="banner-offers">
              ${(s.offers || []).map((o, i) => `<span class="offer-chip${i === 2 ? ' highlight' : ''}">${esc(o)}</span>`).join('')}
            </div>
          </div>
        `).join('')}
      </div>
      <button class="carousel-arrow prev" onclick="prevSlide()" aria-label="Previous">‹</button>
      <button class="carousel-arrow next" onclick="nextSlide()" aria-label="Next">›</button>
      <div class="carousel-dots" id="carousel-dots">
        ${heroSlides.map((_, i) => `<button class="dot${i === 0 ? ' active' : ''}" onclick="goSlide(${i})" aria-label="Slide ${i + 1}"></button>`).join('')}
      </div>
    </div>
  `;
}

// ----- Promo tiles -----
function tilesHTML() {
  if (!promoTiles.length) return '';
  return `
    <div class="tiles-row">
      ${promoTiles.map(t => `
        <div class="promo-tile" onclick="showCategory('${t.category}')">
          <div class="promo-tile-blob">
            <span class="promo-offer-pill">${esc(t.offer)}</span>
            <img src="${t.image}" alt="${esc(t.title)}" data-fade
              onerror="this.src='${imgFallback(t.title, 400, 200)}'">
          </div>
          <div class="promo-tile-info">
            <div class="promo-tile-title">${esc(t.title)}</div>
            <div class="promo-tile-cta">Shop now</div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

// ----- Feature rail -----
function featureRailHTML() {
  if (!features.length) return '';
  return `
    <div class="feature-rail">
      ${features.map(f => `
        <div class="feature-item" onclick="showToast('${esc(f.label)} is not part of this demo')">
          <div class="feature-badge" style="background: ${f.bg}">${f.icon}</div>
          <div class="feature-label">${esc(f.label)}</div>
        </div>
      `).join('')}
    </div>
  `;
}

// ----- Collection section -----
function collectionHTML(key, gradClass) {
  const col = collections[key];
  if (!col) return '';
  return `
    <div class="collection-section ${gradClass}">
      <h3 class="collection-title">${esc(col.title)}</h3>
      <div class="collection-row">
        ${col.cards.map((card, idx) => `
          <div class="collection-card" onclick="collectionClick('${key}', ${idx})">
            <div class="collection-imgs${card.images.length > 1 ? ' duo' : ''}">
              ${card.images.map((img, i) => `
                <img src="${img}" alt="${esc(card.title)}" data-fade loading="lazy"
                  onerror="this.src='${imgFallback(card.title, 150, 150)}'">
              `).join('')}
            </div>
            <div class="collection-info">
              <div class="collection-name">${esc(card.title)}</div>
              <div class="collection-offer">${esc(card.offer)}</div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function collectionClick(key, idx) {
  const map = COLLECTION_CATS[key] || [];
  const cat = map[idx] || 'fashion';
  showCategory(cat);
}

// ----- Brand spotlight -----
function brandHTML() {
  if (!brands.length) return '';
  return `
    <div class="brand-section">
      <h3>Brands in Spotlight</h3>
      <div class="brand-row">
        ${brands.map(b => `
          <div class="brand-card" onclick="brandClick('${esc(b.name)}')">
            <span class="ad-chip">AD</span>
            <div class="brand-img">
              <img src="${b.image}" alt="${esc(b.name)}" data-fade loading="lazy"
                onerror="this.src='${imgFallback(b.name, 300, 150)}'">
            </div>
            <div class="brand-info">
              <div class="brand-name">${esc(b.name)}</div>
              <div class="brand-tag">${esc(b.tag)}</div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function brandClick(name) {
  const inp = document.getElementById('search-input');
  if (!inp) return;
  inp.value = name;
  searchQuery = name;
  toggleSearchClear();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  runSearch();
}

// ----- Product section -----
function sectionHTML(sec) {
  const secProducts = products.filter(p => p.section === sec.id);
  return `
    <div class="section-card">
      <div class="section-head">
        <div class="section-title"><span class="sec-icon">${sec.icon}</span>${esc(sec.title)}</div>
        <button class="view-all" onclick="showCategory('${sec.id}')">VIEW ALL</button>
      </div>
      <div class="product-grid">
        ${secProducts.map(p => productCardHTML(p)).join('')}
      </div>
    </div>
  `;
}

// ===== Carousel controls =====
let slideIndex = 0;
let carouselTimer;

function goSlide(i) {
  const track = document.getElementById('carousel-track');
  if (!track) return;
  const n = heroSlides.length || 1;
  slideIndex = ((i % n) + n) % n;
  track.style.transform = `translateX(-${slideIndex * 100}%)`;
  document.querySelectorAll('#carousel-dots .dot').forEach((d, j) => {
    d.classList.toggle('active', j === slideIndex);
  });
}

function nextSlide() { goSlide(slideIndex + 1); }
function prevSlide() { goSlide(slideIndex - 1); }

function startCarousel() {
  clearInterval(carouselTimer);
  carouselTimer = setInterval(() => {
    if (!document.getElementById('carousel-track')) { clearInterval(carouselTimer); return; }
    goSlide(slideIndex + 1);
  }, 5000);
}

// ===== Product card =====
function productCardHTML(p) {
  const tagClass = p.tag === 'Bestseller' ? 'bestseller' : p.tag === 'Trending' ? 'trending' : 'deal';
  return `
    <div class="product-card">
      <div class="product-img-wrap" onclick="openQuickView(${p.id})">
        ${p.tag ? `<span class="p-tag ${tagClass}">${esc(p.tag)}</span>` : ''}
        <img src="${p.image}" alt="${esc(p.name)}" loading="lazy" data-fade
          onerror="this.src='${imgFallback(p.brand, 300, 300)}'">
      </div>
      <span class="p-brand" onclick="openQuickView(${p.id})">${esc(p.brand)}</span>
      <span class="p-name" onclick="openQuickView(${p.id})">${esc(p.name)}</span>
      <div class="p-rating-row">
        <span class="rating-badge">${p.rating} ★</span>
        <span class="rating-count">(${p.ratingCount.toLocaleString('en-IN')})</span>
      </div>
      <div class="p-price-row">
        <span class="p-price">${inr(p.price)}</span>
        <span class="p-mrp">${inr(p.mrp)}</span>
        <span class="p-discount">${discountPct(p)}% off</span>
      </div>
      <span class="p-highlight">${esc(p.highlight)}</span>
      ${p.assured ? '<span class="p-assured"><span class="check-badge">✓</span>F-Assured</span>' : ''}
      <span class="p-delivery">${esc(p.delivery)}</span>
      <div class="p-actions">
        <button class="btn-card-cart" onclick="event.stopPropagation(); addToCart(${p.id})">ADD TO CART</button>
        <button class="btn-card-buy" onclick="event.stopPropagation(); buyNow(${p.id})">BUY NOW</button>
      </div>
    </div>
  `;
}

// ===== Category strip =====
function catStrip() {
  return [
    { id: 'foryou', icon: '🏠', label: 'For You' },
    { id: 'fashion', icon: '👕', label: 'Fashion' },
    { id: 'electronics', icon: '📱', label: 'Mobiles & Electronics' },
    { id: 'beauty', icon: '🧸', label: 'Beauty & Toys' },
    { id: 'home', icon: '🛋️', label: 'Home & Furniture' },
  ];
}

function setActiveCat(id) {
  document.querySelectorAll('.cat-item').forEach(el => {
    el.classList.toggle('active', el.dataset.cat === id);
  });
}

function showCategory(catId) {
  if (catId === 'foryou') { renderHome(); return; }
  activeCategory = catId;
  setActiveCat(catId);
  searchQuery = '';
  const inp = document.getElementById('search-input');
  if (inp) inp.value = '';
  toggleSearchClear();

  const main = document.getElementById('main');
  const cat = catStrip().find(c => c.id === catId);
  if (!cat) { renderHome(); return; }

  main.innerHTML = `
    <div class="results-toolbar">
      <div class="results-title">${esc(cat.label)}<span id="results-count"></span></div>
      <div class="sort-wrap">
        Sort By
        <select class="sort-select" onchange="setSort(this.value)">
          <option value="popularity">Popularity</option>
          <option value="price-low">Price — Low to High</option>
          <option value="price-high">Price — High to Low</option>
          <option value="rating">Customer Rating</option>
          <option value="discount">Discount</option>
        </select>
      </div>
    </div>
    <div class="results-grid" id="results-grid"></div>
  `;
  renderResults();
}

function renderResults() {
  const grid = document.getElementById('results-grid');
  if (!grid) return;

  let list = products.filter(p => p.section === activeCategory);
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    list = products.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.brand.toLowerCase().includes(q) ||
      p.highlight.toLowerCase().includes(q)
    );
  }

  switch (sortBy) {
    case 'price-low': list.sort((a, b) => a.price - b.price); break;
    case 'price-high': list.sort((a, b) => b.price - a.price); break;
    case 'rating': list.sort((a, b) => b.rating - a.rating); break;
    case 'discount': list.sort((a, b) => discountPct(b) - discountPct(a)); break;
    case 'popularity': list.sort((a, b) => b.ratingCount - a.ratingCount); break;
  }

  const counter = document.getElementById('results-count');
  if (counter) counter.textContent = ` — ${list.length} item${list.length === 1 ? '' : 's'}`;

  if (list.length === 0) {
    grid.innerHTML = '<div class="no-results">No products found. Try a different search. 🔍</div>';
    return;
  }
  grid.innerHTML = list.map(p => productCardHTML(p)).join('');
  enableImgFade(grid);
}

function setSort(v) {
  sortBy = v;
  renderResults();
}

// ===== Search =====
function toggleSearchClear() {
  const btn = document.getElementById('search-clear');
  if (btn) btn.classList.toggle('hidden', !searchQuery);
}

function clearSearch() {
  const inp = document.getElementById('search-input');
  if (inp) inp.value = '';
  searchQuery = '';
  toggleSearchClear();
  if (activeCategory === 'all' || activeCategory === 'foryou') renderHome();
  else renderResults();
}

function runSearch() {
  const isHome = !!document.querySelector('.carousel');
  if (searchQuery) {
    if (isHome) {
      activeCategory = 'all';
      setActiveCat('');
      document.getElementById('main').innerHTML = `
        <div class="results-toolbar">
          <div class="results-title">Search Results<span id="results-count"></span></div>
        </div>
        <div class="results-grid" id="results-grid"></div>
      `;
    }
    if (activeCategory === 'all') {
      const grid = document.getElementById('results-grid');
      const q = searchQuery.toLowerCase();
      const list = products.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.brand.toLowerCase().includes(q) ||
        p.highlight.toLowerCase().includes(q)
      );
      const counter = document.getElementById('results-count');
      if (counter) counter.textContent = ` — ${list.length} item${list.length === 1 ? '' : 's'}`;
      grid.innerHTML = list.length
        ? list.map(p => productCardHTML(p)).join('')
        : '<div class="no-results">No products found. Try a different search. 🔍</div>';
      enableImgFade(grid);
    } else {
      renderResults();
    }
  } else {
    if (activeCategory === 'all' || activeCategory === 'foryou') renderHome();
    else renderResults();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const inp = document.getElementById('search-input');
  if (inp) {
    let debounce;
    inp.addEventListener('input', e => {
      searchQuery = e.target.value.trim();
      toggleSearchClear();
      clearTimeout(debounce);
      debounce = setTimeout(runSearch, 150);
    });
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') runSearch();
    });
  }
});

// ===== Quick view =====
function openQuickView(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;

  const modal = document.getElementById('modal-overlay');
  modal.innerHTML = `
    <div class="modal" style="max-width: 860px;" onclick="event.stopPropagation()">
      <button class="modal-close" onclick="closeModal()">✕</button>
      <div class="qv-body">
        <div class="qv-left">
          <div class="qv-img-frame">
            <img src="${p.image}" alt="${esc(p.name)}"
              onerror="this.src='${imgFallback(p.brand, 300, 300)}'">
          </div>
          <div class="qv-cta-row">
            <button class="btn-add-cart-lg" onclick="addToCart(${p.id}); closeModal();">ADD TO CART</button>
            <button class="btn-buy-now" onclick="buyNow(${p.id})">BUY NOW</button>
          </div>
        </div>
        <div class="qv-right">
          <div class="qv-brand">${esc(p.brand)}</div>
          <h2 class="qv-title">${esc(p.name)}</h2>
          <div class="qv-rating-row">
            <span class="rating-badge">${p.rating} ★</span>
            <span class="rating-count">${p.ratingCount.toLocaleString('en-IN')} Ratings & Reviews</span>
          </div>
          <div class="qv-price-row">
            <span class="qv-price">${inr(p.price)}</span>
            <span class="qv-mrp">${inr(p.mrp)}</span>
            <span class="qv-discount">${discountPct(p)}% off</span>
          </div>
          <div class="qv-highlight"><span class="bullet">•</span><span>${esc(p.highlight)}</span></div>
          ${p.assured ? `
          <div class="qv-assured">
            <span class="check-badge">✓</span>
            <div><b>F-Assured</b><br>Every product is checked for quality</div>
          </div>` : ''}
          <div class="qv-delivery"><b>Delivery:</b> ${esc(p.delivery)}</div>
        </div>
      </div>
    </div>
  `;
  modal.classList.add('active');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('active');
}

// ===== Cart =====
function addToCart(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  const item = cart.find(c => c.id === id);
  if (item) { item.qty++; } else { cart.push({ id, qty: 1 }); }
  saveCart();
  renderCart();
  updateCartCount();
  showToast(`"${p.brand} ${p.name.slice(0, 28)}..." added to cart 🛒`);
}

function buyNow(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  if (!cart.find(c => c.id === id)) {
    cart.push({ id, qty: 1 });
    saveCart();
    renderCart();
    updateCartCount();
  }
  closeModal();
  openCheckout();
}

function changeQty(id, delta) {
  const item = cart.find(c => c.id === id);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) {
    cart = cart.filter(c => c.id !== id);
  }
  if (item.qty > 10) { item.qty = 10; showToast('Max 10 units per item'); }
  saveCart();
  renderCart();
  updateCartCount();
}

function removeFromCart(id) {
  cart = cart.filter(c => c.id !== id);
  saveCart();
  renderCart();
  updateCartCount();
}

function cartTotals() {
  let price = 0;
  let current = 0;
  cart.forEach(c => {
    const p = products.find(x => x.id === c.id);
    if (p) { price += p.mrp * c.qty; current += p.price * c.qty; }
  });
  const discount = price - current;
  const delivery = current > 500 ? 0 : 40;
  const total = current + delivery;
  return { price, discount, delivery, total, count: cart.reduce((s, c) => s + c.qty, 0), current };
}

function renderCart() {
  const container = document.getElementById('cart-items');
  if (!container) return;
  const t = cartTotals();

  if (cart.length === 0) {
    container.innerHTML = `
      <div class="cart-empty">
        <span class="empty-icon">🛒</span>
        Your cart is empty!<br>Add items to get started.
      </div>`;
  } else {
    container.innerHTML = cart.map(c => {
      const p = products.find(x => x.id === c.id);
      if (!p) return '';
      return `
        <div class="cart-item">
          <div class="cart-item-img">
            <img src="${p.image}" alt="${esc(p.name)}"
              onerror="this.src='${imgFallback('IMG', 70, 70)}'">
          </div>
          <div class="cart-item-info">
            <div class="cart-item-name">${esc(p.brand)} ${esc(p.name)}</div>
            <div class="cart-item-price">
              ${inr(p.price * c.qty)}
              <span class="mrp">${inr(p.mrp * c.qty)}</span>
              <span class="disc">${discountPct(p)}% off</span>
            </div>
            <div class="cart-qty-row">
              <button class="qty-btn" onclick="changeQty(${p.id}, -1)">−</button>
              <span class="qty-val">${c.qty}</span>
              <button class="qty-btn" onclick="changeQty(${p.id}, 1)">+</button>
              <button class="cart-remove" onclick="removeFromCart(${p.id})">Remove</button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  document.getElementById('pd-price').textContent = inr(t.price);
  document.getElementById('pd-discount').textContent = '− ' + inr(t.discount);
  document.getElementById('pd-delivery').innerHTML = t.delivery === 0 ? '<span class="free">Free</span>' : inr(t.delivery);
  document.getElementById('pd-total').textContent = inr(t.total);
  document.getElementById('pd-items-label').textContent = `PRICE DETAILS (${t.count} item${t.count === 1 ? '' : 's'})`;
  document.getElementById('btn-place-order').disabled = cart.length === 0;

  // Free delivery nudge
  const hint = document.getElementById('free-delivery-hint');
  if (hint) {
    if (cart.length > 0 && t.current <= 500) {
      hint.innerHTML = `🚚 Add <b>${inr(501 - t.current)}</b> more for <b>FREE delivery</b>`;
      hint.classList.add('show');
    } else {
      hint.classList.remove('show');
    }
  }
}

function updateCartCount() {
  const count = cart.reduce((s, c) => s + c.qty, 0);
  const badge = document.getElementById('cart-badge');
  badge.textContent = count;
  badge.classList.toggle('hidden', count === 0);
}

function saveCart() {
  localStorage.setItem('fk-cart', JSON.stringify(cart));
}

function toggleCart(open) {
  document.getElementById('cart-drawer').classList.toggle('open', open);
  document.getElementById('overlay').classList.toggle('active', open);
}

function closeAll() {
  toggleCart(false);
  closeModal();
}

// ===== Checkout =====
function openCheckout() {
  if (cart.length === 0) { showToast('Your cart is empty!'); return; }
  toggleCart(false);
  const t = cartTotals();

  const modal = document.getElementById('modal-overlay');
  modal.innerHTML = `
    <div class="modal" style="max-width: 640px;" onclick="event.stopPropagation()">
      <button class="modal-close" onclick="closeModal()">✕</button>
      <div class="checkout-wrap">
        <div class="checkout-steps">
          <div class="step active">1. DELIVERY ADDRESS</div>
          <div class="step">2. PAYMENT</div>
          <div class="step">3. CONFIRMATION</div>
        </div>

        <div class="co-section">
          <h3>Delivery Address</h3>
          <div class="form-row">
            <div class="form-field"><label>Full Name</label><input id="co-name" type="text" placeholder="Full Name" required></div>
            <div class="form-field"><label>Phone Number</label><input id="co-phone" type="tel" maxlength="10" placeholder="10-digit mobile number"></div>
          </div>
          <div class="form-row">
            <div class="form-field"><label>Pincode</label><input id="co-pin" type="text" maxlength="6" placeholder="Pincode"></div>
            <div class="form-field" style="flex:2;"><label>Locality / Area</label><input id="co-area" type="text" placeholder="Locality, Landmark"></div>
          </div>
          <div class="form-row">
            <div class="form-field" style="flex:1 1 100%;"><label>Address (Area and Street)</label><textarea id="co-addr" rows="2" placeholder="Flat, House no., Building, Company, Apartment"></textarea></div>
          </div>
          <div class="form-row">
            <div class="form-field"><label>City / District / Town</label><input id="co-city" type="text" placeholder="City"></div>
            <div class="form-field"><label>State</label><input id="co-state" type="text" placeholder="State"></div>
          </div>
          <div class="form-row">
            <div class="form-field">
              <label>Address Type</label>
              <div style="display:flex; gap:16px; padding-top:6px;">
                <label style="display:flex; align-items:center; gap:6px; font-size:13.5px; color:var(--fk-text);"><input type="radio" name="addr-type" checked> Home</label>
                <label style="display:flex; align-items:center; gap:6px; font-size:13.5px; color:var(--fk-text);"><input type="radio" name="addr-type"> Work</label>
              </div>
            </div>
          </div>
        </div>

        <div class="co-section">
          <h3>Payment Options</h3>
          <div class="pay-options" id="pay-options">
            <label class="pay-option selected" onclick="selectPay(this)">
              <input type="radio" name="pay" value="upi" checked>
              <span class="pay-icon">📲</span>
              <div><div class="pay-label">UPI</div><div class="pay-desc">Pay by any UPI app — GPay, PhonePe, Paytm</div></div>
            </label>
            <label class="pay-option" onclick="selectPay(this)">
              <input type="radio" name="pay" value="card">
              <span class="pay-icon">💳</span>
              <div><div class="pay-label">Credit / Debit Card</div><div class="pay-desc">Visa, Mastercard, RuPay accepted</div></div>
            </label>
            <label class="pay-option" onclick="selectPay(this)">
              <input type="radio" name="pay" value="nb">
              <span class="pay-icon">🏦</span>
              <div><div class="pay-label">Net Banking</div><div class="pay-desc">All major banks supported</div></div>
            </label>
            <label class="pay-option" onclick="selectPay(this)">
              <input type="radio" name="pay" value="cod">
              <span class="pay-icon">💵</span>
              <div><div class="pay-label">Cash on Delivery</div><div class="pay-desc">Pay when your order arrives</div></div>
            </label>
          </div>
        </div>

        <div class="checkout-summary">
          <div class="pd-row"><span>Price (${t.count} item${t.count === 1 ? '' : 's'})</span><span>${inr(t.price)}</span></div>
          <div class="pd-row discount"><span>Discount</span><span>− ${inr(t.discount)}</span></div>
          <div class="pd-row"><span>Delivery Charges</span><span>${t.delivery === 0 ? '<span class="free">Free</span>' : inr(t.delivery)}</span></div>
          <div class="pd-row total"><span>Total Payable</span><span>${inr(t.total)}</span></div>
        </div>

        <button class="btn-confirm-order" onclick="placeOrder()">CONFIRM ORDER — ${inr(t.total)}</button>
      </div>
    </div>
  `;
  modal.classList.add('active');
}

function selectPay(el) {
  document.querySelectorAll('.pay-option').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
}

function placeOrder() {
  const name = document.getElementById('co-name')?.value.trim();
  const phone = document.getElementById('co-phone')?.value.trim();
  const pin = document.getElementById('co-pin')?.value.trim();
  const addr = document.getElementById('co-addr')?.value.trim();
  const city = document.getElementById('co-city')?.value.trim();

  if (!name || !phone || !pin || !addr || !city) {
    showToast('Please fill in all delivery address fields');
    return;
  }
  if (!/^[0-9]{10}$/.test(phone)) { showToast('Please enter a valid 10-digit phone number'); return; }
  if (!/^[0-9]{6}$/.test(pin)) { showToast('Please enter a valid 6-digit pincode'); return; }

  const t = cartTotals();
  const orderId = 'OD' + Date.now().toString().slice(-10) + Math.floor(Math.random() * 90 + 10);
  const payMethod = document.querySelector('input[name="pay"]:checked')?.value || 'cod';

  cart = [];
  saveCart();
  renderCart();
  updateCartCount();

  const modal = document.getElementById('modal-overlay');
  modal.innerHTML = `
    <div class="modal" style="max-width: 560px;" onclick="event.stopPropagation()">
      <div class="order-success">
        <div class="success-check">✓</div>
        <h2>Order Confirmed!</h2>
        <p>Thank you, ${esc(name)}! Your order of ${t.count} item${t.count === 1 ? '' : 's'} worth <b>${inr(t.total)}</b> has been placed.<br>
        ${payMethod === 'cod' ? 'Pay on delivery.' : 'Paid via ' + payMethod.toUpperCase() + '.'}</p>
        <div class="order-id-chip">Order ID: ${orderId}</div><br>
        <button class="btn-confirm-order" style="max-width:280px;" onclick="closeModal()">CONTINUE SHOPPING</button>
      </div>
    </div>
  `;
}

// ===== More menu =====
function toggleMoreMenu(e) {
  e.stopPropagation();
  document.getElementById('more-menu').classList.toggle('open');
}

document.addEventListener('click', () => {
  const m = document.getElementById('more-menu');
  if (m) m.classList.remove('open');
});

// ===== Scroll behaviours =====
function updateScrollState() {
  const y = window.scrollY;
  const header = document.getElementById('header');
  if (header) {
    header.classList.toggle('scrolled', y > 60);
    header.classList.toggle('compact', y > 220);
  }
  const btn = document.getElementById('scroll-top');
  if (btn) btn.classList.toggle('visible', y > 600);
}

window.addEventListener('scroll', updateScrollState, { passive: true });

// Safety net: some environments (headless browsers, programmatic scrolling)
// don't emit scroll events reliably. Cheap poll, only acts when the value changed.
let _lastScrollY = -1;
setInterval(() => {
  const y = window.scrollY;
  if (y !== _lastScrollY) {
    _lastScrollY = y;
    updateScrollState();
  }
}, 300);

function scrollTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ===== Keyboard =====
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeAll();
});

// ===== Toast =====
let toastTimer;
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

// ===== Start =====
init();
