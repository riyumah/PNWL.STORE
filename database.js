const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

// Di Railway: pasang Volume lalu set DATA_DIR=/data supaya data tidak hilang tiap deploy
const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
const dbPath = path.join(dataDir, 'db.json');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Default structure
let db = {
  admins: [],
  products: [],
  orders: [],
  order_items: [],
  nextIds: { admins: 1, products: 1, orders: 1, order_items: 1 }
};

function load() {
  try {
    if (fs.existsSync(dbPath)) {
      db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    }
  } catch (e) {
    console.error('Failed to load DB, using fresh one');
  }
}

function save() {
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
}

function now() {
  return new Date().toISOString();
}

function initDatabase() {
  load();

  // Seed admin
  const username = process.env.ADMIN_USERNAME || 'admin';
  let password = (process.env.ADMIN_PASSWORD || '').trim();
  const existing = db.admins.find(a => a.username === username);

  if (!password) {
    if (process.env.NODE_ENV === 'production' && !existing) {
      console.error('❌ ADMIN_PASSWORD belum diisi di Variables Railway.');
      process.exit(1);
    }
    if (!existing) {
      password = require('crypto').randomBytes(9).toString('hex');
      console.log(`[SEED] ADMIN_PASSWORD kosong, password sementara: ${password}`);
    }
  }

  if (!existing) {
    db.admins.push({
      id: db.nextIds.admins++,
      username,
      password_hash: bcrypt.hashSync(password, 12),
      created_at: now()
    });
    console.log(`[SEED] Admin created: ${username}`);
  } else if (password && !bcrypt.compareSync(password, existing.password_hash)) {
    // Password di env berubah -> ikut diperbarui
    existing.password_hash = bcrypt.hashSync(password, 12);
    console.log(`[SEED] Password admin '${username}' diperbarui dari env`);
  }

  // Seed products
  if (db.products.length === 0) {
    const products = [
      { store: 'RGT', name: 'Diamond Lock', description: '1x Diamond Lock - RGT Store', price: 4500, type: 'currency', role_id: null, stock: -1 },
      { store: 'RGT', name: 'Blue Gem Lock', description: '1x Blue Gem Lock - RGT Store', price: 85000, type: 'currency', role_id: null, stock: -1 },
      { store: 'GTPS', name: 'BGL', description: '1x Blue Gem Lock - GTPS Store', price: 85000, type: 'currency', role_id: null, stock: -1 },
      { store: 'GTPS', name: 'BBGL', description: '1x Black Blue Gem Lock - GTPS Store', price: 250000, type: 'currency', role_id: null, stock: -1 },
      { store: 'GTPS', name: 'Custom Item', description: 'Custom Item Request - GTPS Store', price: 10000, type: 'custom_item', role_id: null, stock: -1 },
      { store: 'GTPS', name: 'VIP', description: '#1 VIP Role', price: 15000, type: 'role', role_id: 1, stock: -1 },
      { store: 'GTPS', name: 'Super-VIP', description: '#2 Super-VIP Role', price: 30000, type: 'role', role_id: 2, stock: -1 },
      { store: 'GTPS', name: 'Moderator', description: '#3 Moderator Role', price: 50000, type: 'role', role_id: 3, stock: -1 },
      { store: 'GTPS', name: 'Admin', description: '#4 Admin Role', price: 75000, type: 'role', role_id: 4, stock: -1 },
      { store: 'GTPS', name: 'GUARDIAN', description: '#5 GUARDIAN Role', price: 100000, type: 'role', role_id: 5, stock: -1 },
      { store: 'GTPS', name: 'Community Manager', description: '#6 Community Manager Role', price: 125000, type: 'role', role_id: 6, stock: -1 },
      { store: 'GTPS', name: 'God', description: '#7 God Role', price: 150000, type: 'role', role_id: 7, stock: -1 }
    ];

    for (const p of products) {
      db.products.push({
        id: db.nextIds.products++,
        ...p,
        active: 1,
        created_at: now(),
        updated_at: now()
      });
    }
    console.log(`[SEED] ${products.length} products inserted`);
  }

  save();
}

function getAllActiveProducts() {
  return db.products
    .filter(p => p.active === 1)
    .map(p => ({
      id: p.id, store: p.store, name: p.name, description: p.description,
      price: p.price, type: p.type, role_id: p.role_id, stock: p.stock, active: p.active
    }))
    .sort((a, b) => {
      if (a.store !== b.store) return a.store.localeCompare(b.store);
      if (a.type !== b.type) return a.type.localeCompare(b.type);
      return (a.role_id || 0) - (b.role_id || 0);
    });
}

function getProductById(id) {
  const p = db.products.find(x => x.id === id);
  if (!p) return null;
  return {
    id: p.id, store: p.store, name: p.name, description: p.description,
    price: p.price, type: p.type, role_id: p.role_id, stock: p.stock, active: p.active
  };
}

function getAllProductsAdmin() {
  return db.products
    .slice()
    .sort((a, b) => {
      if (a.store !== b.store) return a.store.localeCompare(b.store);
      if (a.type !== b.type) return a.type.localeCompare(b.type);
      return (a.role_id || 0) - (b.role_id || 0);
    });
}

function updateProduct(id, data) {
  const p = db.products.find(x => x.id === id);
  if (!p) return false;

  if (data.name !== undefined) p.name = data.name;
  if (data.description !== undefined) p.description = data.description;
  if (data.price !== undefined) p.price = data.price;
  if (data.stock !== undefined) p.stock = data.stock;
  if (data.active !== undefined) p.active = data.active ? 1 : 0;
  if (data.store !== undefined) p.store = data.store;
  if (data.type !== undefined) p.type = data.type;
  if (data.role_id !== undefined) p.role_id = data.role_id;
  p.updated_at = now();
  save();
  return true;
}

function createProduct(data) {
  const id = db.nextIds.products++;
  db.products.push({
    id,
    store: data.store,
    name: data.name,
    description: data.description || '',
    price: data.price,
    type: data.type || 'currency',
    role_id: data.role_id || null,
    stock: data.stock !== undefined ? data.stock : -1,
    active: data.active !== undefined ? (data.active ? 1 : 0) : 1,
    created_at: now(),
    updated_at: now()
  });
  save();
  return id;
}

function deleteProduct(id) {
  const p = db.products.find(x => x.id === id);
  if (!p) return false;
  p.active = 0;
  p.updated_at = now();
  save();
  return true;
}

function createOrder({ invoice, player_id, world_name, whatsapp, payment_method, total, items }) {
  const orderId = db.nextIds.orders++;
  db.orders.push({
    id: orderId,
    invoice,
    player_id,
    world_name: world_name || '',
    whatsapp: whatsapp || '',
    payment_method,
    total,
    status: 'PENDING',
    created_at: now(),
    updated_at: now()
  });

  for (const item of items) {
    db.order_items.push({
      id: db.nextIds.order_items++,
      order_id: orderId,
      product_id: item.product_id,
      product_name: item.product_name,
      price: item.price,
      role_id: item.role_id || null,
      quantity: item.quantity
    });

    // Decrease stock if limited
    if (item.stock !== undefined && item.stock >= 0) {
      const prod = db.products.find(p => p.id === item.product_id);
      if (prod && prod.stock > 0) {
        prod.stock = Math.max(0, prod.stock - item.quantity);
        prod.updated_at = now();
      }
    }
  }

  save();
  return orderId;
}

function getOrderByInvoice(invoice) {
  const order = db.orders.find(o => o.invoice === invoice);
  if (!order) return null;

  const items = db.order_items.filter(i => i.order_id === order.id);
  return { ...order, items };
}

function getAllOrders() {
  return db.orders
    .slice()
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .map(o => {
      const items = db.order_items.filter(i => i.order_id === o.id);
      const products = items.map(i => `${i.product_name} x${i.quantity}`).join(', ');
      return { ...o, products };
    });
}

function updateOrderStatus(invoice, status) {
  const allowed = ['PENDING', 'PAID', 'PROCESSING', 'COMPLETED', 'CANCELLED'];
  if (!allowed.includes(status)) return false;

  const order = db.orders.find(o => o.invoice === invoice);
  if (!order) return false;

  const items = db.order_items.filter(i => i.order_id === order.id);

  // Order dibatalkan -> stok dikembalikan (hanya produk berstok terbatas)
  if (status === 'CANCELLED' && order.status !== 'CANCELLED' && !order.stock_restored) {
    for (const it of items) {
      const prod = db.products.find(p => p.id === it.product_id);
      if (prod && prod.stock >= 0) prod.stock += it.quantity;
    }
    order.stock_restored = true;
  } else if (status !== 'CANCELLED' && order.status === 'CANCELLED' && order.stock_restored) {
    // Dibuka lagi dari CANCELLED -> stok dipotong lagi
    for (const it of items) {
      const prod = db.products.find(p => p.id === it.product_id);
      if (prod && prod.stock >= 0) prod.stock = Math.max(0, prod.stock - it.quantity);
    }
    order.stock_restored = false;
  }

  order.status = status;
  order.updated_at = now();
  save();
  return true;
}

function getDashboardStats() {
  const totalOrders = db.orders.length;
  const pendingOrders = db.orders.filter(o => o.status === 'PENDING').length;
  const completedOrders = db.orders.filter(o => o.status === 'COMPLETED').length;
  const totalRevenue = db.orders
    .filter(o => ['PAID', 'PROCESSING', 'COMPLETED'].includes(o.status))
    .reduce((sum, o) => sum + o.total, 0);

  return { totalOrders, pendingOrders, completedOrders, totalRevenue };
}

function getAdminByUsername(username) {
  return db.admins.find(a => a.username === username) || null;
}

module.exports = {
  initDatabase,
  getAllActiveProducts,
  getProductById,
  getAllProductsAdmin,
  updateProduct,
  createProduct,
  deleteProduct,
  createOrder,
  getOrderByInvoice,
  getAllOrders,
  updateOrderStatus,
  getDashboardStats,
  getAdminByUsername
};
