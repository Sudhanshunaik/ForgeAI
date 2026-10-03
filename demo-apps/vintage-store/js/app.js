// ===== Vintage Boutique — Store Logic =====
let items = [];
let cart = JSON.parse(localStorage.getItem('vintage-cart') || '[]');
let activeCategory = 'All';
let activeEra = 'All';
let activeSize = 'All';
let sortBy = 'featured';
let searchQuery = '';
let selectedColor = {};

// ===== Init =====
async function init() {
  try {
    const res = await fetch('data/items.json');
    items = await res.json();
    populateFilters();
    renderProducts();
    renderCart();
    updateCartCount();
  } catch (err) {
    console.error('Failed to load items:', err);
    document.getElementById('product-grid').innerHTML =
      '<div class="no-results">Failed to load items. Please ensure you are running via a local server.</div>';
  }
}

// ===== Filtering & Sorting =====
function getFilteredItems() {
  let filtered = [...items];

  if (activeCategory !== 'All') filtered = filtered.filter(i => i.category === activeCategory);
  if (activeEra !== 'All') filtered = filtered.filter(i => i.era === activeEra);
  if (activeSize !== 'All') filtered = filtered.filter(i => i.size === activeSize);
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(i =>
      i.name.toLowerCase().includes(q) ||
      i.category.toLowerCase().includes(q) ||
      i.description.toLowerCase().includes(q)
    );
  }

  switch (sortBy) {
    case 'price-low': filtered.sort((a, b) => a.price - b.price); break;
    case 'price-high': filtered.sort((a, b) => b.price - a.price); break;
    case 'rating': filtered.sort((a, b) => b.rating - a.rating); break;
    case 'name': filtered.sort((a, b) => a.name.localeCompare(b.name)); break;
  }

  return filtered;
}

// ===== Render Products =====
function renderProducts() {
  const grid = document.getElementById('product-grid');
  const filtered = getFilteredItems();

  document.getElementById('results-count').textContent =
    `${filtered.length} piece${filtered.length === 1 ? '' : 's'} found`;

  if (filtered.length === 0) {
    grid.innerHTML = '<div class="no-results">No pieces match your search.<br>Try adjusting your filters, darling. ✨</div>';
    return;
  }

  grid.innerHTML = filtered.map(i => `
    <div class="product-card">
      <div class="product-image-wrap">
        <img class="product-image" src="${i.image}" alt="${i.name}" loading="lazy"
          onclick="openProduct(${i.id})"
          onerror="this.src='https://via.placeholder.com/400x300/f1e9db/7a6a58?text=${encodeURIComponent(i.name)}'">
        <span class="condition-badge ${i.condition.toLowerCase()}">${i.condition}</span>
        <span class="era-badge">${i.era}</span>
      </div>
      <div class="product-info">
        <span class="product-category">${i.category}</span>
        <h3 class="product-name" onclick="openProduct(${i.id})">${i.name}</h3>
        <div class="product-rating">
          <span class="stars">${getStars(i.rating)}</span>
          <span class="rating-num">${i.rating}</span>
        </div>
        <div class="product-tags">
          <span class="tag">Size ${i.size}</span>
          <span class="tag">${i.stock} left</span>
        </div>
        <div class="product-footer">
          <span class="product-price">$${i.price}</span>
          <button class="btn-add-cart" onclick="addToCart(${i.id})">🛍 Add</button>
        </div>
      </div>
    </div>
  `).join('');
}

function getStars(rating) {
  return '★'.repeat(Math.floor(rating)) + '☆'.repeat(5 - Math.floor(rating));
}

// ===== Filters (element passed explicitly — no reliance on global event) =====
function populateFilters() {
  const categories = [...new Set(items.map(i => i.category))].sort();
  const eras = [...new Set(items.map(i => i.era))].sort();
  const sizes = [...new Set(items.map(i => i.size))];

  document.getElementById('category-filters').innerHTML =
    chip('All', activeCategory === 'All', "setCategory('All', this)") +
    categories.map(c => chip(c, false, `setCategory('${c}', this)`)).join('');

  document.getElementById('era-filters').innerHTML =
    chip('All', activeEra === 'All', "setEra('All', this)") +
    eras.map(e => chip(e, false, `setEra('${e}', this)`)).join('');

  document.getElementById('size-filters').innerHTML =
    chip('All', activeSize === 'All', "setSize('All', this)") +
    sizes.map(s => chip(s, false, `setSize('${s}', this)`)).join('');
}

function chip(label, active, onclick) {
  return `<div class="filter-chip${active ? ' active' : ''}" onclick="${onclick}">${label}</div>`;
}

function setCategory(cat, el) {
  activeCategory = cat;
  highlightChip('#category-filters', cat, el);
  renderProducts();
}

function setEra(era, el) {
  activeEra = era;
  highlightChip('#era-filters', era, el);
  renderProducts();
}

function setSize(size, el) {
  activeSize = size;
  highlightChip('#size-filters', size, el);
  renderProducts();
}

function highlightChip(selector, value, el) {
  const chips = document.querySelectorAll(selector + ' .filter-chip');
  chips.forEach(c => c.classList.remove('active'));
  if (el) { el.classList.add('active'); return; }
  chips.forEach(c => { if (c.textContent.trim() === value) c.classList.add('active'); });
}

function setSort(value) {
  sortBy = value;
  renderProducts();
}

// ===== Search =====
document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('input', e => {
      searchQuery = e.target.value.trim();
      renderProducts();
    });
  }
});

// ===== Cart =====
function addToCart(id) {
  const item = items.find(i => i.id === id);
  if (!item) return;

  const existing = cart.find(c => c.id === id);
  if (existing) {
    if (existing.qty < item.stock) existing.qty++;
    else { showToast('This is the last one in stock! ⚠️'); return; }
  } else {
    cart.push({ id, qty: 1 });
  }

  saveCart();
  renderCart();
  updateCartCount();
  showToast(`"${item.name}" added to your bag! 🛍️`);
}

function removeFromCart(id) {
  cart = cart.filter(c => c.id !== id);
  saveCart();
  renderCart();
  updateCartCount();
}

function changeQty(id, delta) {
  const cartItem = cart.find(c => c.id === id);
  const product = items.find(i => i.id === id);
  if (!cartItem || !product) return;

  cartItem.qty += delta;
  if (cartItem.qty <= 0) { removeFromCart(id); return; }
  if (cartItem.qty > product.stock) { cartItem.qty = product.stock; showToast('This is the last one in stock! ⚠️'); }

  saveCart();
  renderCart();
  updateCartCount();
}

function getCartTotal() {
  return cart.reduce((sum, c) => {
    const item = items.find(i => i.id === c.id);
    return sum + (item ? item.price * c.qty : 0);
  }, 0);
}

function getCartCount() {
  return cart.reduce((sum, c) => sum + c.qty, 0);
}

function renderCart() {
  const container = document.getElementById('cart-items');
  if (!container) return;

  if (cart.length === 0) {
    container.innerHTML = `<div class="cart-empty"><span class="empty-icon">🛍️</span>Your bag is empty.<br>Every great wardrobe starts with one vintage piece.</div>`;
  } else {
    container.innerHTML = cart.map(c => {
      const item = items.find(i => i.id === c.id);
      if (!item) return '';
      return `
        <div class="cart-item">
          <img src="${item.image}" alt="${item.name}" onerror="this.src='https://via.placeholder.com/64x64/f1e9db/7a6a58'">
          <div class="cart-item-info">
            <span class="cart-item-name">${item.name}</span>
            <span class="cart-item-price">$${(item.price * c.qty).toLocaleString()}</span>
            <div class="cart-item-controls">
              <button class="qty-btn" onclick="changeQty(${c.id}, -1)">−</button>
              <span class="cart-item-qty">${c.qty}</span>
              <button class="qty-btn" onclick="changeQty(${c.id}, 1)">+</button>
              <button class="cart-item-remove" onclick="removeFromCart(${c.id})">Remove</button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  document.getElementById('cart-total').textContent = `$${getCartTotal().toLocaleString()}`;
}

function updateCartCount() {
  const count = getCartCount();
  const badge = document.getElementById('cart-count');
  badge.textContent = count;
  badge.classList.toggle('hidden', count === 0);
}

function saveCart() {
  localStorage.setItem('vintage-cart', JSON.stringify(cart));
}

function toggleCart(open) {
  document.getElementById('cart-drawer').classList.toggle('open', open);
  document.getElementById('overlay').classList.toggle('active', open);
}

function closeAll() {
  toggleCart(false);
  closeModal();
}

// ===== Product Modal =====
function openProduct(id) {
  const item = items.find(i => i.id === id);
  if (!item) return;

  const modal = document.getElementById('modal-overlay');
  modal.innerHTML = `
    <div class="modal" onclick="event.stopPropagation()">
      <button class="modal-close" onclick="closeModal()">✕</button>
      <div class="modal-body">
        <img class="modal-image" src="${item.image}" alt="${item.name}"
          onerror="this.src='https://via.placeholder.com/340x420/f1e9db/7a6a58?text=${encodeURIComponent(item.name)}'">
        <div class="modal-info">
          <span class="category">${item.category} · ${item.era}</span>
          <h2>${item.name}</h2>
          <div class="product-rating">
            <span class="stars">${getStars(item.rating)}</span>
            <span class="rating-num">${item.rating} rating</span>
          </div>
          <div class="modal-specs">
            <div class="modal-spec"><div class="spec-key">Size</div><div class="spec-val">${item.size}</div></div>
            <div class="modal-spec"><div class="spec-key">Condition</div><div class="spec-val">${item.condition}</div></div>
            <div class="modal-spec"><div class="spec-key">In Stock</div><div class="spec-val">${item.stock}</div></div>
          </div>
          <div>
            <div style="font-size: 0.78rem; text-transform: uppercase; letter-spacing: 1.5px; color: var(--brown-light); margin-bottom: 0.4rem;">Available Variants:</div>
            <div class="color-options" id="color-options-${item.id}">
              ${item.colors.map((c, idx) => `<div class="color-chip ${idx === 0 ? 'selected' : ''}" onclick="selectColor(this, ${item.id})">${c}</div>`).join('')}
            </div>
          </div>
          <p class="modal-description">${item.description}</p>
          <div class="modal-footer">
            <span class="modal-price">$${item.price}</span>
            <div class="modal-actions">
              <button class="btn-add-cart" onclick="addToCart(${item.id}); closeModal();">🛍 Add to Bag</button>
              <button class="btn-add-cart" style="background: var(--green);" onclick="addToCart(${item.id}); closeModal(); openCheckout();">Buy Now</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  modal.classList.add('active');
  document.getElementById('overlay').classList.add('active');
}

function selectColor(el, itemId) {
  document.querySelectorAll(`#color-options-${itemId} .color-chip`).forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  selectedColor[itemId] = el.textContent;
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('active');
  document.getElementById('overlay').classList.remove('active');
}

// ===== Checkout =====
function openCheckout() {
  if (cart.length === 0) { showToast('Your bag is empty! 🛍️'); return; }
  toggleCart(false);
  closeModal();

  const modal = document.getElementById('modal-overlay');
  const subtotal = getCartTotal();
  const tax = Math.round(subtotal * 0.07 * 100) / 100;
  const shipping = subtotal > 150 ? 0 : 12;
  const total = subtotal + tax + shipping;

  modal.innerHTML = `
    <div class="modal" onclick="event.stopPropagation()" style="max-width: 560px;">
      <button class="modal-close" onclick="closeModal()">✕</button>
      <div class="checkout-modal">
        <h2>Checkout</h2>
        <p class="checkout-subtitle">Secure checkout — every piece ships with love 📦</p>
        <form onsubmit="placeOrder(event)">
          <div class="form-group">
            <label>Full Name</label>
            <input type="text" required placeholder="Jane Doe">
          </div>
          <div class="form-group">
            <label>Email Address</label>
            <input type="email" required placeholder="jane@example.com">
          </div>
          <div class="form-group">
            <label>Shipping Address</label>
            <textarea required rows="2" placeholder="456 Vintage Ave, Brooklyn, NY 11201"></textarea>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Card Number</label>
              <input type="text" required placeholder="4242 4242 4242 4242" maxlength="19" oninput="formatCard(this)">
            </div>
            <div class="form-group">
              <label>CVC</label>
              <input type="text" required placeholder="123" maxlength="4" oninput="this.value=this.value.replace(/[^0-9]/g,'')">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Expiry</label>
              <input type="text" required placeholder="MM/YY" maxlength="5" oninput="formatExpiry(this)">
            </div>
            <div class="form-group">
              <label>ZIP Code</label>
              <input type="text" required placeholder="11201" oninput="this.value=this.value.replace(/[^0-9]/g,'')">
            </div>
          </div>
          <div class="checkout-summary">
            <h3>Order Summary</h3>
            ${cart.map(c => {
              const item = items.find(i => i.id === c.id);
              return `<div class="summary-row"><span>${item.name} × ${c.qty}</span><span>$${(item.price * c.qty).toLocaleString()}</span></div>`;
            }).join('')}
            <div class="summary-row"><span>Subtotal</span><span>$${subtotal.toLocaleString()}</span></div>
            <div class="summary-row"><span>Tax (7%)</span><span>$${tax.toLocaleString()}</span></div>
            <div class="summary-row"><span>Shipping</span><span>${shipping === 0 ? 'FREE' : '$' + shipping}</span></div>
            <div class="summary-row total"><span>Total</span><span class="amount">$${total.toLocaleString()}</span></div>
          </div>
          <button type="submit" class="btn-place-order">Place Order — $${total.toLocaleString()}</button>
        </form>
      </div>
    </div>
  `;
  modal.classList.add('active');
  document.getElementById('overlay').classList.add('active');
}

function formatCard(input) {
  let v = input.value.replace(/[^0-9]/g, '');
  v = v.match(/.{1,4}/g)?.join(' ') || '';
  input.value = v;
}

function formatExpiry(input) {
  let v = input.value.replace(/[^0-9]/g, '');
  if (v.length >= 3) v = v.slice(0, 2) + '/' + v.slice(2, 4);
  input.value = v;
}

function placeOrder(e) {
  e.preventDefault();
  const orderId = 'VTG-' + Math.random().toString(36).substr(2, 8).toUpperCase();

  cart = [];
  saveCart();
  renderCart();
  updateCartCount();

  const modal = document.getElementById('modal-overlay');
  modal.innerHTML = `
    <div class="modal" onclick="event.stopPropagation()" style="max-width: 560px;">
      <div class="checkout-modal">
        <div class="order-success">
          <span class="success-icon">✉️</span>
          <h2>Order Confirmed!</h2>
          <p>Your vintage pieces are being lovingly packed.<br>A confirmation email is on its way.</p>
          <div class="order-id">Order ID: ${orderId}</div>
          <button class="btn-place-order" onclick="closeModal()">Continue Browsing</button>
        </div>
      </div>
    </div>
  `;
}

// ===== Toast =====
let toastTimer;
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2500);
}

// ===== Start =====
init();
