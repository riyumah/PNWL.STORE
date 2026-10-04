/* PNWL.STORE - Admin Panel */
(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  let currentPanel = 'dashboard';

  // ========== API ==========
  async function api(url, options = {}) {
    try {
      const res = await fetch(url, {
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        ...options
      });
      return await res.json();
    } catch (err) {
      console.error(err);
      return { success: false, message: 'Koneksi gagal' };
    }
  }

  // ========== INIT ==========
  async function init() {
    const me = await api('/api/admin/me');
    if (me.success) {
      showDashboard(me.data.username);
    } else {
      showLogin();
    }
    setupEvents();
  }

  function showLogin() {
    $('#loginPage').style.display = 'flex';
    $('#dashboardPage').style.display = 'none';
  }

  function showDashboard(username) {
    $('#loginPage').style.display = 'none';
    $('#dashboardPage').style.display = 'flex';
    $('#adminUsername').textContent = username;
    $('#settingsUsername').textContent = username;
    loadDashboard();
  }

  // ========== EVENTS ==========
  function setupEvents() {
    // Login
    $('#btnLogin').addEventListener('click', doLogin);
    $('#loginPassword').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doLogin();
    });
    $('#loginUsername').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') $('#loginPassword').focus();
    });

    // Logout
    $('#btnLogout').addEventListener('click', doLogout);

    // Sidebar nav
    $$('.admin-nav a[data-panel]').forEach(link => {
      link.addEventListener('click', () => {
        const panel = link.dataset.panel;
        switchPanel(panel);
        $$('.admin-nav a').forEach(a => a.classList.remove('active'));
        link.classList.add('active');
        $('#adminSidebar').classList.remove('open');
      });
    });

    // Mobile menu
    $('#adminMenuToggle').addEventListener('click', () => {
      $('#adminSidebar').classList.toggle('open');
    });

    // Product modal
    $('#btnAddProduct').addEventListener('click', () => openProductModal());
    $('#btnSaveProduct').addEventListener('click', saveProduct);
    $('#prodType').addEventListener('change', () => {
      $('#roleIdGroup').style.display = $('#prodType').value === 'role' ? 'block' : 'none';
    });

    // Role price
    $('#btnSaveRolePrice').addEventListener('click', saveRolePrice);

    // Order status
    $('#btnSaveOrderStatus').addEventListener('click', saveOrderStatus);

    // Modal close
    $$('[data-close]').forEach(btn => {
      btn.addEventListener('click', () => {
        $(`#${btn.dataset.close}`).classList.remove('open');
      });
    });

    $$('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.classList.remove('open');
      });
    });
  }

  // ========== AUTH ==========
  async function doLogin() {
    const username = $('#loginUsername').value.trim();
    const password = $('#loginPassword').value;
    const errEl = $('#loginError');

    if (!username || !password) {
      errEl.textContent = 'Username dan password wajib diisi';
      errEl.style.display = 'block';
      return;
    }

    const btn = $('#btnLogin');
    btn.disabled = true;
    btn.textContent = 'Login...';

    const res = await api('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });

    btn.disabled = false;
    btn.textContent = 'Login';

    if (!res.success) {
      errEl.textContent = res.message || 'Login gagal';
      errEl.style.display = 'block';
      return;
    }

    errEl.style.display = 'none';
    showDashboard(res.data.username);
  }

  async function doLogout() {
    await api('/api/admin/logout', { method: 'POST' });
    showLogin();
    $('#loginUsername').value = '';
    $('#loginPassword').value = '';
  }

  // ========== PANELS ==========
  function switchPanel(panel) {
    currentPanel = panel;
    $$('.admin-panel').forEach(p => p.classList.remove('active'));
    $(`#panel-${panel}`).classList.add('active');

    const titles = {
      dashboard: 'Dashboard',
      products: 'Products',
      roles: 'Roles',
      orders: 'Orders',
      settings: 'Settings'
    };
    $('#panelTitle').textContent = titles[panel] || panel;

    if (panel === 'dashboard') loadDashboard();
    if (panel === 'products') loadProducts();
    if (panel === 'roles') loadRoles();
    if (panel === 'orders') loadOrders();
  }

  // ========== DASHBOARD ==========
  async function loadDashboard() {
    const res = await api('/api/admin/dashboard');
    if (!res.success) return;

    const d = res.data;
    $('#statTotal').textContent = d.totalOrders;
    $('#statPending').textContent = d.pendingOrders;
    $('#statCompleted').textContent = d.completedOrders;
    $('#statRevenue').textContent = formatPrice(d.totalRevenue);
  }

  // ========== PRODUCTS ==========
  async function loadProducts() {
    const res = await api('/api/admin/products');
    const tbody = $('#productsTableBody');

    if (!res.success) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Gagal memuat</td></tr>';
      return;
    }

    // Exclude pure roles from products list (they have own panel)
    const list = res.data.filter(p => p.type !== 'role');

    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Belum ada produk</td></tr>';
      return;
    }

    tbody.innerHTML = list.map(p => `
      <tr>
        <td>${p.id}</td>
        <td>${p.store}</td>
        <td>${escapeHtml(p.name)}</td>
        <td>${formatPrice(p.price)}</td>
        <td>${p.stock === -1 ? '∞' : p.stock}</td>
        <td><span class="badge ${p.active ? 'badge-completed' : 'badge-cancelled'}">${p.active ? 'ACTIVE' : 'OFF'}</span></td>
        <td>
          <button class="btn btn-secondary btn-sm btn-edit-prod" data-id="${p.id}">Edit</button>
          <button class="btn btn-danger btn-sm btn-toggle-prod" data-id="${p.id}" data-active="${p.active}">
            ${p.active ? 'Disable' : 'Enable'}
          </button>
        </td>
      </tr>
    `).join('');

    tbody.querySelectorAll('.btn-edit-prod').forEach(btn => {
      btn.addEventListener('click', () => {
        const prod = res.data.find(p => p.id === parseInt(btn.dataset.id, 10));
        if (prod) openProductModal(prod);
      });
    });

    tbody.querySelectorAll('.btn-toggle-prod').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = parseInt(btn.dataset.id, 10);
        const currentlyActive = btn.dataset.active === '1' || btn.dataset.active === 'true';
        const res2 = await api(`/api/admin/products/${id}`, {
          method: 'PUT',
          body: JSON.stringify({ active: !currentlyActive })
        });
        if (res2.success) {
          showToast(currentlyActive ? 'Produk dinonaktifkan' : 'Produk diaktifkan');
          loadProducts();
        } else {
          showToast(res2.message || 'Gagal', 'error');
        }
      });
    });
  }

  function openProductModal(prod = null) {
    if (prod) {
      $('#productModalTitle').textContent = 'Edit Produk';
      $('#editProductId').value = prod.id;
      $('#prodStore').value = prod.store;
      $('#prodName').value = prod.name;
      $('#prodDesc').value = prod.description || '';
      $('#prodPrice').value = prod.price;
      $('#prodType').value = prod.type;
      $('#prodRoleId').value = prod.role_id || '';
      $('#prodStock').value = prod.stock;
      $('#prodActive').value = prod.active ? '1' : '0';
      $('#roleIdGroup').style.display = prod.type === 'role' ? 'block' : 'none';
    } else {
      $('#productModalTitle').textContent = 'Tambah Produk';
      $('#editProductId').value = '';
      $('#prodStore').value = 'RGT';
      $('#prodName').value = '';
      $('#prodDesc').value = '';
      $('#prodPrice').value = '';
      $('#prodType').value = 'currency';
      $('#prodRoleId').value = '';
      $('#prodStock').value = '-1';
      $('#prodActive').value = '1';
      $('#roleIdGroup').style.display = 'none';
    }
    $('#productModal').classList.add('open');
  }

  async function saveProduct() {
    const id = $('#editProductId').value;
    const data = {
      store: $('#prodStore').value,
      name: $('#prodName').value.trim(),
      description: $('#prodDesc').value.trim(),
      price: parseInt($('#prodPrice').value, 10),
      type: $('#prodType').value,
      role_id: $('#prodType').value === 'role' ? parseInt($('#prodRoleId').value, 10) || null : null,
      stock: parseInt($('#prodStock').value, 10),
      active: $('#prodActive').value === '1'
    };

    if (!data.name || isNaN(data.price) || data.price < 0) {
      showToast('Nama dan harga wajib diisi', 'error');
      return;
    }

    let res;
    if (id) {
      res = await api(`/api/admin/products/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      });
    } else {
      res = await api('/api/admin/products', {
        method: 'POST',
        body: JSON.stringify(data)
      });
    }

    if (res.success) {
      showToast(id ? 'Produk diupdate' : 'Produk ditambahkan');
      $('#productModal').classList.remove('open');
      loadProducts();
    } else {
      showToast(res.message || 'Gagal menyimpan', 'error');
    }
  }

  // ========== ROLES ==========
  async function loadRoles() {
    const res = await api('/api/admin/products');
    const tbody = $('#rolesTableBody');

    if (!res.success) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Gagal memuat</td></tr>';
      return;
    }

    const roles = res.data
      .filter(p => p.type === 'role')
      .sort((a, b) => (a.role_id || 0) - (b.role_id || 0));

    if (roles.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Belum ada role</td></tr>';
      return;
    }

    tbody.innerHTML = roles.map(r => `
      <tr>
        <td>#${r.role_id}</td>
        <td>${escapeHtml(r.name)}</td>
        <td>${formatPrice(r.price)}</td>
        <td>
          <button class="btn btn-secondary btn-sm btn-edit-role" data-id="${r.id}">Ubah Harga</button>
        </td>
      </tr>
    `).join('');

    tbody.querySelectorAll('.btn-edit-role').forEach(btn => {
      btn.addEventListener('click', () => {
        const role = roles.find(r => r.id === parseInt(btn.dataset.id, 10));
        if (role) {
          $('#editRoleId').value = role.id;
          $('#editRoleName').value = `#${role.role_id} ${role.name}`;
          $('#editRolePrice').value = role.price;
          $('#rolePriceModal').classList.add('open');
        }
      });
    });
  }

  async function saveRolePrice() {
    const id = parseInt($('#editRoleId').value, 10);
    const price = parseInt($('#editRolePrice').value, 10);

    if (isNaN(price) || price < 0) {
      showToast('Harga tidak valid', 'error');
      return;
    }

    const res = await api(`/api/admin/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ price })
    });

    if (res.success) {
      showToast('Harga role berhasil diubah');
      $('#rolePriceModal').classList.remove('open');
      loadRoles();
    } else {
      showToast(res.message || 'Gagal', 'error');
    }
  }

  // ========== ORDERS ==========
  async function loadOrders() {
    const res = await api('/api/admin/orders');
    const tbody = $('#ordersTableBody');

    if (!res.success) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Gagal memuat</td></tr>';
      return;
    }

    if (res.data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Belum ada order</td></tr>';
      return;
    }

    const statusClass = {
      PENDING: 'badge-pending',
      PAID: 'badge-paid',
      PROCESSING: 'badge-processing',
      COMPLETED: 'badge-completed',
      CANCELLED: 'badge-cancelled'
    };

    tbody.innerHTML = res.data.map(o => `
      <tr>
        <td><strong>${o.invoice}</strong></td>
        <td>${escapeHtml(o.player_id)}</td>
        <td style="max-width:150px;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(o.products || '-')}</td>
        <td>${formatPrice(o.total)}</td>
        <td>${o.payment_method}</td>
        <td><span class="badge ${statusClass[o.status] || ''}">${o.status}</span></td>
        <td>${formatDate(o.created_at)}</td>
        <td>
          <button class="btn btn-secondary btn-sm btn-edit-order" data-invoice="${o.invoice}" data-status="${o.status}">Status</button>
        </td>
      </tr>
    `).join('');

    tbody.querySelectorAll('.btn-edit-order').forEach(btn => {
      btn.addEventListener('click', () => {
        $('#editOrderInvoice').value = btn.dataset.invoice;
        $('#editOrderInvoiceDisplay').value = btn.dataset.invoice;
        $('#editOrderStatus').value = btn.dataset.status;
        $('#orderStatusModal').classList.add('open');
      });
    });
  }

  async function saveOrderStatus() {
    const invoice = $('#editOrderInvoice').value;
    const status = $('#editOrderStatus').value;

    const res = await api(`/api/admin/orders/${invoice}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status })
    });

    if (res.success) {
      showToast('Status berhasil diubah');
      $('#orderStatusModal').classList.remove('open');
      loadOrders();
      if (currentPanel === 'dashboard') loadDashboard();
    } else {
      showToast(res.message || 'Gagal', 'error');
    }
  }

  // ========== UTILS ==========
  function formatPrice(n) {
    return 'Rp' + Number(n).toLocaleString('id-ID');
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

  function escapeHtml(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function showToast(msg, type = 'success') {
    const toast = $('#toast');
    toast.textContent = msg;
    toast.className = 'toast show ' + type;
    setTimeout(() => toast.classList.remove('show'), 2800);
  }

  // Start
  init();
})();
