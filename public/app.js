/* PNWL.STORE - Frontend */
(function () {
  'use strict';

  // State
  let products = [];
  let cart = JSON.parse(localStorage.getItem('gt_cart') || '[]');
  let selectedRole = null;
  let lastInvoice = null;

  // DOM
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // ========== INIT ==========
  async function init() {
    setupNavigation();
    setupCart();
    setupModals();
    setupSearch();
    setupStoreCards();
    await loadProducts();
    renderCart();
    updateCartCount();
  }

  // ========== API ==========
  async function api(url, options = {}) {
    try {
      const res = await fetch(url, {
        headers: { 'Content-Type': 'application/json' },
        ...options
      });
      const data = await res.json();
      return data;
    } catch (err) {
      console.error(err);
      return { success: false, message: 'Koneksi gagal' };
    }
  }

  async function loadProducts() {
    const res = await api('/api/products');
    if (res.success) {
      products = res.data;
      renderHomeProducts();
      renderStoreProducts('RGT', 'rgtProducts');
      renderStoreProducts('GTPS', 'gtpsProducts');
    } else {
      $('#homeProducts').innerHTML = '<div class="loading">Gagal memuat produk</div>';
    }
  }

  // ========== NAVIGATION ==========
  function setupNavigation() {
    $$('.nav-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const page = link.dataset.page;
        showPage(page);
        $$('.nav-link').forEach(l => l.classList.remove('active'));
        link.classList.add('active');
        $('#mainNav').classList.remove('open');
      });
    });

    $('#menuToggle').addEventListener('click', () => {
      $('#mainNav').classList.toggle('open');
    });

    $('#btnBeliSekarang').addEventListener('click', () => {
      showPage('rgt');
      $$('.nav-link').forEach(l => l.classList.remove('active'));
      $$('.nav-link[data-page="rgt"]').forEach(l => l.classList.add('active'));
    });
  }

  function showPage(page) {
    ['home', 'rgt', 'gtps', 'status'].forEach(p => {
      const el = $(`#page-${p}`);
      if (el) el.style.display = p === page ? 'block' : 'none';
    });
    window.scrollTo(0, 0);
  }

  // ========== STORE CARDS ==========
  function setupStoreCards() {
    $$('.store-card').forEach(card => {
      card.addEventListener('click', () => {
        const store = card.dataset.store;
        if (store === 'RGT') {
          showPage('rgt');
          $$('.nav-link').forEach(l => l.classList.remove('active'));
          $$('.nav-link[data-page="rgt"]').forEach(l => l.classList.add('active'));
        } else {
          showPage('gtps');
          $$('.nav-link').forEach(l => l.classList.remove('active'));
          $$('.nav-link[data-page="gtps"]').forEach(l => l.classList.add('active'));
        }
      });
    });
  }

  // ========== RENDER PRODUCTS ==========
  function formatPrice(n) {
    return 'Rp' + Number(n).toLocaleString('id-ID');
  }

  function getProductIcon(p) {
    if (p.type === 'role') return '👑';
    if (p.name.toLowerCase().includes('diamond')) return '💎';
    if (p.name.toLowerCase().includes('blue') || p.name === 'BGL') return '🔵';
    if (p.name === 'BBGL') return '🖤';
    if (p.type === 'custom_item') return '🎁';
    return '⭐';
  }

  function createProductCard(p) {
    const soldOut = p.stock === 0;
    const stockText = p.stock === -1
      ? 'Unlimited'
      : p.stock === 0
        ? ''
        : `Stok: ${p.stock}`;

    return `
      <div class="product-card" data-id="${p.id}">
        <div class="product-icon">${getProductIcon(p)}</div>
        <h4>${escapeHtml(p.name)}</h4>
        <div class="desc">${escapeHtml(p.description || '')}</div>
        <div class="price">${formatPrice(p.price)}</div>
        ${soldOut
          ? '<div class="sold-out">SOLD OUT</div>'
          : `<div class="stock ${p.stock > 0 && p.stock <= 5 ? 'low' : ''}">${stockText}</div>
             <button class="btn btn-primary btn-sm btn-buy" data-id="${p.id}" style="margin-top:6px;width:100%;">
               ${p.type === 'role' ? 'PILIH ROLE' : 'BELI'}
             </button>`
        }
      </div>
    `;
  }

  function renderHomeProducts(filter = '') {
    const container = $('#homeProducts');
    let list = products;

    if (filter) {
      const q = filter.toLowerCase();
      list = products.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q) ||
        p.store.toLowerCase().includes(q)
      );
    }

    if (list.length === 0) {
      container.innerHTML = '<div class="loading">Tidak ada produk ditemukan</div>';
      return;
    }

    // Group by store
    const rgt = list.filter(p => p.store === 'RGT');
    const gtps = list.filter(p => p.store === 'GTPS' && p.type !== 'role');
    const roles = list.filter(p => p.type === 'role');

    let html = '';
    if (rgt.length) {
      html += `<h2 class="section-title">RGT Store</h2><div class="product-grid">${rgt.map(createProductCard).join('')}</div>`;
    }
    if (gtps.length) {
      html += `<h2 class="section-title">GTPS Store</h2><div class="product-grid">${gtps.map(createProductCard).join('')}</div>`;
    }
    if (roles.length) {
      html += `<h2 class="section-title">Roles</h2><div class="product-grid">${roles.map(createProductCard).join('')}</div>`;
    }

    container.innerHTML = html || '<div class="loading">Tidak ada produk</div>';
    bindBuyButtons(container);
  }

  function renderStoreProducts(store, containerId, filter = '') {
    const container = $(`#${containerId}`);
    let list = products.filter(p => p.store === store);

    if (filter) {
      const q = filter.toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q)
      );
    }

    // Separate roles for GTPS
    if (store === 'GTPS') {
      const items = list.filter(p => p.type !== 'role');
      const roles = list.filter(p => p.type === 'role');

      let html = '';
      if (items.length) {
        html += `<div class="product-grid">${items.map(createProductCard).join('')}</div>`;
      }
      if (roles.length) {
        html += `<h2 class="section-title" style="margin-top:24px;">Roles</h2>
                 <div class="product-grid">${roles.map(createProductCard).join('')}</div>`;
      }
      container.innerHTML = html || '<div class="loading">Tidak ada produk</div>';
    } else {
      container.innerHTML = list.length
        ? `<div class="product-grid">${list.map(createProductCard).join('')}</div>`
        : '<div class="loading">Tidak ada produk</div>';
    }

    bindBuyButtons(container);
  }

  function bindBuyButtons(container) {
    container.querySelectorAll('.btn-buy').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.id, 10);
        const product = products.find(p => p.id === id);
        if (!product) return;

        if (product.type === 'role') {
          openRoleModal();
        } else {
          addToCart(product, 1);
        }
      });
    });
  }

  // ========== ROLE MODAL ==========
  function openRoleModal() {
    selectedRole = null;
    const roles = products
      .filter(p => p.type === 'role' && p.active)
      .sort((a, b) => (b.role_id || 0) - (a.role_id || 0));

    const list = $('#roleList');
    list.innerHTML = roles.map(r => `
      <div class="role-item" data-id="${r.id}">
        <span class="role-name">#${r.role_id} ${escapeHtml(r.name)}</span>
        <span class="role-price">${formatPrice(r.price)}</span>
      </div>
    `).join('');

    list.querySelectorAll('.role-item').forEach(item => {
      item.addEventListener('click', () => {
        list.querySelectorAll('.role-item').forEach(i => i.classList.remove('selected'));
        item.classList.add('selected');
        selectedRole = products.find(p => p.id === parseInt(item.dataset.id, 10));
        $('#btnAddRole').disabled = false;
      });
    });

    $('#btnAddRole').disabled = true;
    openModal('roleModal');
  }

  $('#btnAddRole').addEventListener('click', () => {
    if (selectedRole) {
      addToCart(selectedRole, 1);
      closeModal('roleModal');
    }
  });

  // ========== CART ==========
  function setupCart() {
    $('#cartBtn').addEventListener('click', () => {
      $('#cartOverlay').classList.add('open');
    });
    $('#cartClose').addEventListener('click', () => {
      $('#cartOverlay').classList.remove('open');
    });
    $('#cartOverlay').addEventListener('click', (e) => {
      if (e.target === $('#cartOverlay')) {
        $('#cartOverlay').classList.remove('open');
      }
    });
    $('#btnCheckout').addEventListener('click', openCheckout);
  }

  function saveCart() {
    localStorage.setItem('gt_cart', JSON.stringify(cart));
  }

  function addToCart(product, qty) {
    if (product.stock === 0) {
      showToast('Produk sudah SOLD OUT', 'error');
      return;
    }

    const existing = cart.find(c => c.product_id === product.id);
    if (existing) {
      const newQty = existing.quantity + qty;
      if (product.stock > 0 && newQty > product.stock) {
        showToast(`Stok hanya ${product.stock}`, 'error');
        return;
      }
      existing.quantity = newQty;
    } else {
      cart.push({
        product_id: product.id,
        name: product.name,
        price: product.price,
        quantity: qty,
        type: product.type,
        role_id: product.role_id
      });
    }

    saveCart();
    renderCart();
    updateCartCount();
    showToast(`${product.name} ditambahkan ke cart`);
  }

  function updateCartQty(productId, delta) {
    const item = cart.find(c => c.product_id === productId);
    if (!item) return;

    const product = products.find(p => p.id === productId);
    const newQty = item.quantity + delta;

    if (newQty <= 0) {
      cart = cart.filter(c => c.product_id !== productId);
    } else {
      if (product && product.stock > 0 && newQty > product.stock) {
        showToast(`Stok hanya ${product.stock}`, 'error');
        return;
      }
      item.quantity = newQty;
    }

    saveCart();
    renderCart();
    updateCartCount();
  }

  function removeFromCart(productId) {
    cart = cart.filter(c => c.product_id !== productId);
    saveCart();
    renderCart();
    updateCartCount();
  }

  function renderCart() {
    const body = $('#cartBody');
    if (cart.length === 0) {
      body.innerHTML = '<div class="cart-empty">Keranjang masih kosong</div>';
      $('#cartTotal').textContent = 'Rp0';
      $('#btnCheckout').disabled = true;
      return;
    }

    let total = 0;
    body.innerHTML = cart.map(item => {
      const sub = item.price * item.quantity;
      total += sub;
      return `
        <div class="cart-item">
          <div class="cart-item-info">
            <h5>${escapeHtml(item.name)}</h5>
            <div class="price">${formatPrice(item.price)} × ${item.quantity}</div>
          </div>
          <div class="cart-qty">
            <button data-action="minus" data-id="${item.product_id}">−</button>
            <span>${item.quantity}</span>
            <button data-action="plus" data-id="${item.product_id}">+</button>
          </div>
          <button class="cart-remove" data-id="${item.product_id}">🗑</button>
        </div>
      `;
    }).join('');

    body.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.id, 10);
        const delta = btn.dataset.action === 'plus' ? 1 : -1;
        updateCartQty(id, delta);
      });
    });

    body.querySelectorAll('.cart-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        removeFromCart(parseInt(btn.dataset.id, 10));
      });
    });

    $('#cartTotal').textContent = formatPrice(total);
    $('#btnCheckout').disabled = false;
  }

  function updateCartCount() {
    const count = cart.reduce((s, i) => s + i.quantity, 0);
    $('#cartCount').textContent = count;
  }

  // ========== CHECKOUT ==========
  function openCheckout() {
    if (cart.length === 0) return;

    let total = 0;
    const summary = cart.map(item => {
      const sub = item.price * item.quantity;
      total += sub;
      return `<div class="row"><span class="label">${escapeHtml(item.name)} ×${item.quantity}</span><span class="value">${formatPrice(sub)}</span></div>`;
    }).join('');

    $('#checkoutSummary').innerHTML = summary +
      `<div class="row" style="margin-top:8px;font-weight:700;"><span class="label">Total</span><span class="value" style="color:var(--accent)">${formatPrice(total)}</span></div>`;

    $('#playerId').value = '';
    $('#whatsapp').value = '';
    $('#paymentMethod').value = 'QRIS';

    $('#cartOverlay').classList.remove('open');
    openModal('checkoutModal');
  }

  $('#btnConfirmOrder').addEventListener('click', async () => {
    const playerId = $('#playerId').value.trim();
    const whatsapp = $('#whatsapp').value.trim();
    const paymentMethod = $('#paymentMethod').value;

    if (!playerId || playerId.length < 2) {
      showToast('GrowID / Player ID wajib diisi', 'error');
      return;
    }

    const btn = $('#btnConfirmOrder');
    btn.disabled = true;
    btn.textContent = 'Memproses...';

    const payload = {
      player_id: playerId,
      whatsapp,
      payment_method: paymentMethod,
      items: cart.map(c => ({
        product_id: c.product_id,
        quantity: c.quantity
      }))
    };

    const res = await api('/api/orders', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    btn.disabled = false;
    btn.textContent = 'Buat Order';

    if (!res.success) {
      showToast(res.message || 'Gagal membuat order', 'error');
      return;
    }

    // Clear cart
    cart = [];
    saveCart();
    renderCart();
    updateCartCount();

    lastInvoice = res.data.invoice;
    showSuccess(res.data);
    closeModal('checkoutModal');
  });

  // ========== PEMBAYARAN ==========
  function paymentHtml(p) {
    if (!p) return '';

    const rows = (p.lines || []).map(l => `
      <div class="row">
        <span class="label">${escapeHtml(l.label)}</span>
        <span class="value">
          ${escapeHtml(l.value)}
          ${l.copy ? `<button type="button" class="pay-copy-btn" data-copy="${escapeHtml(l.value)}">Salin</button>` : ''}
        </span>
      </div>`).join('');

    const qris = p.image
      ? `<img class="pay-qris" src="${escapeHtml(p.image)}" alt="QRIS pembayaran">`
      : '';

    const warn = p.configured
      ? ''
      : '<p class="pay-warn">Detail pembayaran belum diatur oleh toko. Silakan hubungi admin lewat WhatsApp.</p>';

    const wa = p.wa_link
      ? `<a class="btn btn-primary pay-wa" href="${escapeHtml(p.wa_link)}" target="_blank" rel="noopener">Kirim Bukti Bayar via WhatsApp</a>`
      : '';

    return `
      <div class="pay-box">
        <h4>Cara Pembayaran &middot; ${escapeHtml(p.method)}</h4>
        ${qris}
        <div class="invoice-detail pay-detail">
          ${rows}
          <div class="row"><span class="label">Total Bayar</span><span class="value" style="color:var(--accent)">${formatPrice(p.total)}</span></div>
        </div>
        ${warn}
        <p class="pay-warn"><strong>Jangan lupa di-screenshot ya!</strong> ${p.is_lock ? 'Screenshot saat kamu drop lock (nama world dan GrowID harus terlihat) sebagai bukti.' : 'Simpan bukti pembayaran untuk dikirim ke admin.'}</p>
        <ol class="pay-steps">
          <li>${p.is_lock ? 'Masuk ke world di atas, lalu drop lock sesuai jumlah bayar.' : 'Bayar sesuai total di atas.'}</li>
          <li>${p.is_lock ? 'Screenshot saat drop lock (terlihat nama world dan GrowID kamu).' : 'Simpan bukti pembayaran (screenshot).'}</li>
          <li>Kirim bukti beserta nomor invoice <strong>${escapeHtml(p.invoice)}</strong> ke admin.</li>
          <li>Order diproses setelah pembayaran dikonfirmasi admin.</li>
        </ol>
        ${wa}
      </div>`;
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.pay-copy-btn');
    if (!btn) return;
    const text = btn.dataset.copy || '';
    const done = () => {
      btn.textContent = 'Tersalin';
      setTimeout(() => { btn.textContent = 'Salin'; }, 1500);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => showToast('Gagal menyalin', 'error'));
    } else {
      showToast('Salin manual: ' + text);
    }
  });

  function showSuccess(data) {
    const itemsHtml = data.items.map(i =>
      `<div class="row"><span class="label">${escapeHtml(i.name)} ×${i.quantity}</span><span class="value">${formatPrice(i.subtotal)}</span></div>`
    ).join('');

    $('#successContent').innerHTML = `
      <div class="success-icon">✅</div>
      <h3>ORDER BERHASIL</h3>
      <div class="invoice-detail">
        <div class="row"><span class="label">Invoice</span><span class="value">${data.invoice}</span></div>
        <div class="row"><span class="label">Player ID</span><span class="value">${escapeHtml(data.player_id)}</span></div>
        ${itemsHtml}
        <div class="row"><span class="label">Total</span><span class="value" style="color:var(--accent)">${formatPrice(data.total)}</span></div>
        <div class="row"><span class="label">Status</span><span class="value"><span class="badge badge-pending">PENDING</span></span></div>
      </div>
      ${paymentHtml(data.payment)}
      <p style="color:var(--text-muted);font-size:0.85rem;">Simpan nomor invoice untuk cek status order.</p>
    `;

    openModal('successModal');
  }

  $('#btnLihatStatus').addEventListener('click', () => {
    closeModal('successModal');
    showPage('status');
    $$('.nav-link').forEach(l => l.classList.remove('active'));
    $$('.nav-link[data-page="status"]').forEach(l => l.classList.add('active'));
    if (lastInvoice) {
      $('#invoiceInput').value = lastInvoice;
      checkStatus();
    }
  });

  $('#btnKembaliStore').addEventListener('click', () => {
    closeModal('successModal');
    showPage('home');
    $$('.nav-link').forEach(l => l.classList.remove('active'));
    $$('.nav-link[data-page="home"]').forEach(l => l.classList.add('active'));
  });

  // ========== ORDER STATUS ==========
  $('#btnCekStatus').addEventListener('click', checkStatus);
  $('#invoiceInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') checkStatus();
  });

  async function checkStatus() {
    const invoice = $('#invoiceInput').value.trim().toUpperCase();
    if (!invoice) {
      showToast('Masukkan nomor invoice', 'error');
      return;
    }

    const res = await api(`/api/orders/${invoice}`);
    const result = $('#statusResult');

    if (!res.success) {
      result.classList.add('show');
      result.innerHTML = `<p style="color:var(--danger);text-align:center;">${res.message || 'Invoice tidak ditemukan'}</p>`;
      return;
    }

    const o = res.data;
    const statusClass = {
      PENDING: 'badge-pending',
      PAID: 'badge-paid',
      PROCESSING: 'badge-processing',
      COMPLETED: 'badge-completed',
      CANCELLED: 'badge-cancelled'
    }[o.status] || 'badge-pending';

    const itemsHtml = (o.items || []).map(i =>
      `<div class="row"><span class="label">${escapeHtml(i.product_name)} ×${i.quantity}</span><span class="value">${formatPrice(i.price * i.quantity)}</span></div>`
    ).join('');

    result.classList.add('show');
    result.innerHTML = `
      <div class="invoice-detail">
        <div class="row"><span class="label">Invoice</span><span class="value">${o.invoice}</span></div>
        <div class="row"><span class="label">Player ID</span><span class="value">${escapeHtml(o.player_id)}</span></div>
        <div class="row"><span class="label">WhatsApp</span><span class="value">${escapeHtml(o.whatsapp || '-')}</span></div>
        <div class="row"><span class="label">Pembayaran</span><span class="value">${o.payment_method}</span></div>
        ${itemsHtml}
        <div class="row"><span class="label">Total</span><span class="value" style="color:var(--accent)">${formatPrice(o.total)}</span></div>
        <div class="row"><span class="label">Status</span><span class="value"><span class="badge ${statusClass}">${o.status}</span></span></div>
        <div class="row"><span class="label">Tanggal</span><span class="value">${formatDate(o.created_at)}</span></div>
      </div>
      ${paymentHtml(o.payment)}
    `;
  }

  // ========== SEARCH ==========
  function setupSearch() {
    $('#searchInput').addEventListener('input', (e) => {
      renderHomeProducts(e.target.value.trim());
    });
    $('#searchRgt').addEventListener('input', (e) => {
      renderStoreProducts('RGT', 'rgtProducts', e.target.value.trim());
    });
    $('#searchGtps').addEventListener('input', (e) => {
      renderStoreProducts('GTPS', 'gtpsProducts', e.target.value.trim());
    });
  }

  // ========== MODALS ==========
  function setupModals() {
    $$('[data-close]').forEach(btn => {
      btn.addEventListener('click', () => {
        closeModal(btn.dataset.close);
      });
    });

    $$('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          overlay.classList.remove('open');
        }
      });
    });
  }

  function openModal(id) {
    $(`#${id}`).classList.add('open');
  }

  function closeModal(id) {
    $(`#${id}`).classList.remove('open');
  }

  // ========== UTILS ==========
  function showToast(msg, type = 'success') {
    const toast = $('#toast');
    toast.textContent = msg;
    toast.className = 'toast show ' + type;
    setTimeout(() => toast.classList.remove('show'), 2800);
  }

  function escapeHtml(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function formatDate(str) {
    if (!str) return '-';
    try {
      const d = new Date(str + (str.includes('Z') ? '' : 'Z'));
      return d.toLocaleString('id-ID', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    } catch {
      return str;
    }
  }

  // Start
  init();
})();
