// ===== State =====
let phones = [];
let cart = JSON.parse(localStorage.getItem('cart') || '[]');
let activeBrand = 'All';
let activePrice = 'All';
let sortBy = 'featured';
let searchQuery = '';
let selectedColor = {};

// ===== Init =====
async function init() {
  try {
    const res = await fetch('data/phones.json');
    phones = await res.json();
    renderProducts();
    populateBrandFilter();
    renderCart();
    updateCartCount();
  } catch (err) {
    console.error('Failed to load products:', err);
    document.getElementById('product-grid').innerHTML = '<div class="no-results">Failed to load products. Please ensure you are running via a local server.</div>';
  }
}

// ===== Render Products =====
function getFilteredProducts() {
  let filtered = [...phones];

  if (activeBrand !== 'All') filtered = filtered.filter(p => p.brand === activeBrand);
  if (activePrice !== 'All') {
    const [min, max] = activePrice.split('-').map(Number);
    filtered = filtered.filter(p => p.price >= min && (max ? p.price <= max : true));
  }
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(p =>
      p.name.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q)
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

function renderProducts() {
  const grid = document.getElementById('product-grid');
  const filtered = getFilteredProducts();

  if (filtered.length === 0) {
    grid.innerHTML = '<div class="no-results">No phones match your filters. 🔍</div>';
    return;
  }

  grid.innerHTML = filtered.map(p => `
    <div class="product-card" onclick="openProduct(${p.id})">
      <img class="product-image" src="${p.image}" alt="${p.name}" loading="lazy"
        onerror="this.src='https://via.placeholder.com/400x280/252540/a29bfe?text=${encodeURIComponent(p.name)}'">
      <div class="product-info">
        <span class="product-brand">${p.brand}</span>
        <h3 class="product-name">${p.name}</h3>
        <div class="product-rating">
          <span class="stars">${getStars(p.rating)}</span>
          <span class="rating-num">${p.rating}</span>
        </div>
        <div class="product-specs">
          <span class="spec-tag">${p.specs.screen}</span>
          <span class="spec-tag">${p.specs.ram} RAM</span>
          <span class="spec-tag">${p.specs.storage}</span>
        </div>
        <div class="product-footer">
          <span class="product-price">$${p.price.toLocaleString()}</span>
          <button class="btn-add-cart" onclick="event.stopPropagation(); addToCart(${p.id})">🛒 Add</button>
        </div>
      </div>
    </div>
  `).join('');
}

function getStars(rating) {
  return '★'.repeat(Math.floor(rating)) + '☆'.repeat(5 - Math.floor(rating));
}

// ===== Filters =====
function populateBrandFilter() {
  const brands = [...new Set(phones.map(p => p.brand))].sort();
  const container = document.getElementById('brand-filters');
  container.innerHTML = `<div class="filter-chip active" onclick="setBrand('All', this)">All</div>` +
    brands.map(b => `<div class="filter-chip" onclick="setBrand('${b}', this)">${b}</div>`).join('');
}

function setBrand(brand, el) {
  activeBrand = brand;
  document.querySelectorAll('#brand-filters .filter-chip').forEach(c => c.classList.remove('active'));
  if (el) el.classList.add('active');
  renderProducts();
}

function setPrice(range, el) {
  activePrice = range;
  document.querySelectorAll('#price-filters .filter-chip').forEach(c => c.classList.remove('active'));
  if (el) el.classList.add('active');
  renderProducts();
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
  const phone = phones.find(p => p.id === id);
  if (!phone) return;

  const existing = cart.find(i => i.id === id);
  if (existing) {
    if (existing.qty < phone.stock) existing.qty++;
    else { showToast('Maximum stock reached! ⚠️'); return; }
  } else {
    cart.push({ id, qty: 1 });
  }

  saveCart();
  renderCart();
  updateCartCount();
  showToast(`${phone.name} added to cart! ✅`);
}

function removeFromCart(id) {
  cart = cart.filter(i => i.id !== id);
  saveCart();
  renderCart();
  updateCartCount();
}

function changeQty(id, delta) {
  const item = cart.find(i => i.id === id);
  const phone = phones.find(p => p.id === id);
  if (!item || !phone) return;

  item.qty += delta;
  if (item.qty <= 0) { removeFromCart(id); return; }
  if (item.qty > phone.stock) { item.qty = phone.stock; showToast('Maximum stock reached! ⚠️'); }

  saveCart();
  renderCart();
  updateCartCount();
}

function getCartTotal() {
  return cart.reduce((sum, item) => {
    const phone = phones.find(p => p.id === item.id);
    return sum + (phone ? phone.price * item.qty : 0);
  }, 0);
}

function getCartCount() {
  return cart.reduce((sum, item) => sum + item.qty, 0);
}

function renderCart() {
  const container = document.getElementById('cart-items');
  if (!container) return;

  if (cart.length === 0) {
    container.innerHTML = `<div class="cart-empty"><span class="empty-icon">🛒</span>Your cart is empty.<br>Browse our phones to get started!</div>`;
  } else {
    container.innerHTML = cart.map(item => {
      const phone = phones.find(p => p.id === item.id);
      if (!phone) return '';
      return `
        <div class="cart-item">
          <img src="${phone.image}" alt="${phone.name}" onerror="this.src='https://via.placeholder.com/60x60/252540/a29bfe'">
          <div class="cart-item-info">
            <span class="cart-item-name">${phone.name}</span>
            <span class="cart-item-price">$${(phone.price * item.qty).toLocaleString()}</span>
            <div class="cart-item-controls">
              <button class="qty-btn" onclick="changeQty(${item.id}, -1)">−</button>
              <span class="cart-item-qty">${item.qty}</span>
              <button class="qty-btn" onclick="changeQty(${item.id}, 1)">+</button>
              <button class="cart-item-remove" onclick="removeFromCart(${item.id})">Remove</button>
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
  localStorage.setItem('cart', JSON.stringify(cart));
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
  const phone = phones.find(p => p.id === id);
  if (!phone) return;

  const lowStock = phone.stock <= 10;
  const modal = document.getElementById('modal-overlay');
  modal.innerHTML = `
    <div class="modal" onclick="event.stopPropagation()">
      <button class="modal-close" onclick="closeModal()">✕</button>
      <div class="modal-body">
        <img class="modal-image" src="${phone.image}" alt="${phone.name}"
          onerror="this.src='https://via.placeholder.com/400x350/252540/a29bfe?text=${encodeURIComponent(phone.name)}'">
        <div class="modal-info">
          <span class="brand">${phone.brand}</span>
          <h2>${phone.name}</h2>
          <div class="product-rating">
            <span class="stars">${getStars(phone.rating)}</span>
            <span class="rating-num">${phone.rating} rating</span>
            <span class="stock-badge ${lowStock ? 'low' : ''}">${lowStock ? '⚡' : '✓'} ${phone.stock} in stock</span>
          </div>
          <div class="modal-specs">
            <div class="modal-spec"><div class="spec-key">Screen</div><div class="spec-val">${phone.specs.screen}</div></div>
            <div class="modal-spec"><div class="spec-key">RAM</div><div class="spec-val">${phone.specs.ram}</div></div>
            <div class="modal-spec"><div class="spec-key">Storage</div><div class="spec-val">${phone.specs.storage}</div></div>
            <div class="modal-spec"><div class="spec-key">Battery</div><div class="spec-val">${phone.specs.battery}</div></div>
            <div class="modal-spec"><div class="spec-key">Camera</div><div class="spec-val">${phone.specs.camera}</div></div>
            <div class="modal-spec"><div class="spec-key">Rating</div><div class="spec-val">${phone.rating} / 5</div></div>
          </div>
          <div>
            <div style="font-size: 0.85rem; color: var(--text-dim); margin-bottom: 0.5rem;">Available Colors:</div>
            <div class="color-options" id="color-options-${phone.id}">
              ${phone.colors.map((c, i) => `<div class="color-chip ${i === 0 ? 'selected' : ''}" onclick="selectColor(this, ${phone.id})">${c}</div>`).join('')}
            </div>
          </div>
          <p class="modal-description">${phone.description}</p>
          <div class="modal-footer">
            <span class="modal-price">$${phone.price.toLocaleString()}</span>
            <div class="modal-actions">
              <button class="btn-add-cart" onclick="addToCart(${phone.id}); closeModal();">🛒 Add to Cart</button>
              <button class="btn-add-cart" style="background: var(--success); color: var(--bg);" onclick="addToCart(${phone.id}); closeModal(); openCheckout();">Buy Now</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  modal.classList.add('active');
  document.getElementById('overlay').classList.add('active');
}

function selectColor(el, phoneId) {
  document.querySelectorAll(`#color-options-${phoneId} .color-chip`).forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  selectedColor[phoneId] = el.textContent;
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('active');
  document.getElementById('overlay').classList.remove('active');
}

// ===== Checkout =====
function openCheckout() {
  if (cart.length === 0) { showToast('Your cart is empty! 🛒'); return; }
  toggleCart(false);
  closeModal();

  const modal = document.getElementById('modal-overlay');
  const subtotal = getCartTotal();
  const tax = Math.round(subtotal * 0.08);
  const shipping = subtotal > 1000 ? 0 : 25;
  const total = subtotal + tax + shipping;

  modal.innerHTML = `
    <div class="modal" onclick="event.stopPropagation()">
      <button class="modal-close" onclick="closeModal()">✕</button>
      <div class="checkout-modal">
        <h2>Checkout 🔒</h2>
        <form onsubmit="placeOrder(event)">
          <div class="form-group">
            <label>Full Name</label>
            <input type="text" required placeholder="John Doe" value="">
          </div>
          <div class="form-group">
            <label>Email Address</label>
            <input type="email" required placeholder="john@example.com" value="">
          </div>
          <div class="form-group">
            <label>Shipping Address</label>
            <textarea required rows="2" placeholder="123 Main St, City, State, ZIP"></textarea>
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
              <input type="text" required placeholder="12345" oninput="this.value=this.value.replace(/[^0-9]/g,'')">
            </div>
          </div>
          <div class="checkout-summary">
            <h3>Order Summary</h3>
            ${cart.map(item => {
              const phone = phones.find(p => p.id === item.id);
              return `<div class="summary-row"><span>${phone.name} × ${item.qty}</span><span>$${(phone.price * item.qty).toLocaleString()}</span></div>`;
            }).join('')}
            <div class="summary-row"><span>Subtotal</span><span>$${subtotal.toLocaleString()}</span></div>
            <div class="summary-row"><span>Tax (8%)</span><span>$${tax.toLocaleString()}</span></div>
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
  const orderId = 'PH-' + Math.random().toString(36).substr(2, 8).toUpperCase();

  cart = [];
  saveCart();
  renderCart();
  updateCartCount();

  const modal = document.getElementById('modal-overlay');
  modal.innerHTML = `
    <div class="modal" onclick="event.stopPropagation()">
      <div class="checkout-modal">
        <div class="order-success">
          <div class="success-icon">✅</div>
          <h2>Order Placed Successfully!</h2>
          <p>Thank you for your purchase. A confirmation email has been sent.</p>
          <div class="order-id">Order ID: ${orderId}</div>
          <button class="btn-place-order" onclick="closeModal()">Continue Shopping</button>
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
