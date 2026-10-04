require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const path = require('path');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const {
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
} = require('./database');

const fs = require('fs');
const app = express();

// Diagnosa: tampilkan isi folder di server saat start (muncul di Deploy Logs)
try {
  console.log('[DIAG] __dirname =', __dirname);
  console.log('[DIAG] isi root   =', fs.readdirSync(__dirname).join(', '));
  const pub = path.join(__dirname, 'public');
  console.log('[DIAG] isi public =', fs.existsSync(pub) ? fs.readdirSync(pub).join(', ') : '(FOLDER public TIDAK ADA)');
} catch (e) { console.error('[DIAG] gagal baca folder:', e.message); }
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

// ---------- Cek konfigurasi sebelum jalan ----------
const PLACEHOLDER_SECRET = 'ganti_dengan_secret_acak_yang_panjang_dan_aman';
let sessionSecret = process.env.SESSION_SECRET;
const secretWeak = !sessionSecret || sessionSecret === PLACEHOLDER_SECRET || sessionSecret.length < 24;

if (secretWeak) {
  if (isProd) {
    console.error('\n❌ SESSION_SECRET belum diatur dengan benar (minimal 24 karakter acak).');
    console.error('   Isi di file .env, lalu jalankan ulang.\n');
    process.exit(1);
  }
  // Mode development: secret acak, login admin akan reset tiap server restart
  sessionSecret = crypto.randomBytes(32).toString('hex');
  console.warn('⚠️  SESSION_SECRET belum diatur, memakai secret sementara (hanya untuk development).');
}

// Di belakang reverse proxy (Nginx, Cloudflare, hosting panel), agar IP & cookie secure terbaca benar
if (isProd) {
  app.set('trust proxy', Number(process.env.TRUST_PROXY || 1));
}
app.disable('x-powered-by');

// Initialize database
initDatabase();

// Security headers sederhana
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Middleware
app.use(express.json({ limit: '50kb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

// Health check (buat cek server hidup di Railway)
app.get('/health', (req, res) => res.json({ ok: true }));

// Session
app.use(session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Rate limiter for login
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: { success: false, message: 'Terlalu banyak percobaan login. Coba lagi nanti.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Rate limiter untuk pembuatan order (cegah spam order)
const orderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Terlalu banyak order dalam waktu singkat. Coba lagi beberapa menit lagi.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Rate limiter untuk cek invoice (cegah tebak-tebakan nomor invoice)
const lookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  message: { success: false, message: 'Terlalu banyak pengecekan. Coba lagi nanti.' },
  standardHeaders: true,
  legacyHeaders: false
});

// ---------- Info pembayaran (diatur lewat .env) ----------
function buildPayment(method, total, invoice) {
  const e = process.env;
  const clean = (v) => (v || '').trim();
  let lines = [];
  let image = '';

  if (method === 'QRIS') {
    image = clean(e.PAY_QRIS_IMAGE);
  } else if (method === 'DANA' || method === 'OVO' || method === 'GoPay') {
    const key = method.toUpperCase();
    lines = [
      { label: 'Nomor ' + method, value: clean(e['PAY_' + key + '_NUMBER']), copy: true },
      { label: 'Atas Nama', value: clean(e['PAY_' + key + '_NAME']) }
    ];
  } else if (method === 'Transfer Bank') {
    lines = [
      { label: 'Bank', value: clean(e.PAY_BANK_NAME) },
      { label: 'No. Rekening', value: clean(e.PAY_BANK_NUMBER), copy: true },
      { label: 'Atas Nama', value: clean(e.PAY_BANK_HOLDER) }
    ];
  }

  lines = lines.filter(l => l.value);
  const configured = method === 'QRIS' ? !!image : lines.some(l => l.copy);

  // Link WhatsApp admin untuk kirim bukti bayar
  const waNumber = clean(e.ADMIN_WHATSAPP).replace(/\D/g, '');
  let waLink = '';
  if (waNumber) {
    const text = `Halo admin, saya sudah bayar untuk invoice ${invoice} (total Rp${Number(total).toLocaleString('id-ID')}) via ${method}. Berikut bukti pembayarannya.`;
    waLink = `https://wa.me/${waNumber}?text=${encodeURIComponent(text)}`;
  }

  return { method, total, invoice, configured, image, lines, wa_link: waLink };
}

// Auth middleware
function requireAdmin(req, res, next) {
  if (req.session && req.session.adminId) {
    return next();
  }
  return res.status(401).json({ success: false, message: 'Unauthorized' });
}

// ==================== PUBLIC API ====================

// Get all active products
app.get('/api/products', (req, res) => {
  try {
    const products = getAllActiveProducts();
    res.json({ success: true, data: products });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get product by ID
app.get('/api/products/:id', (req, res) => {
  try {
    const product = getProductById(parseInt(req.params.id, 10));
    if (!product || !product.active) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    res.json({ success: true, data: product });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Create order
app.post('/api/orders', orderLimiter, (req, res) => {
  try {
    const { items, player_id, whatsapp, payment_method } = req.body;

    // Validation
    if (!player_id || typeof player_id !== 'string' || player_id.trim().length < 2) {
      return res.status(400).json({ success: false, message: 'Player ID / GrowID wajib diisi (min 2 karakter)' });
    }

    if (!payment_method || !['QRIS', 'DANA', 'OVO', 'GoPay', 'Transfer Bank'].includes(payment_method)) {
      return res.status(400).json({ success: false, message: 'Metode pembayaran tidak valid' });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Cart kosong' });
    }

    const orderItems = [];
    let total = 0;

    for (const item of items) {
      const productId = parseInt(item.product_id, 10);
      const quantity = parseInt(item.quantity, 10);

      if (!productId || isNaN(productId)) {
        return res.status(400).json({ success: false, message: 'Product ID tidak valid' });
      }

      if (!quantity || quantity <= 0 || quantity > 100) {
        return res.status(400).json({ success: false, message: 'Quantity tidak valid (1-100)' });
      }

      const product = getProductById(productId);

      if (!product || !product.active) {
        return res.status(400).json({ success: false, message: `Produk tidak ditemukan atau nonaktif (ID: ${productId})` });
      }

      // Stock check
      if (product.stock === 0) {
        return res.status(400).json({ success: false, message: `${product.name} sudah SOLD OUT` });
      }

      if (product.stock > 0 && product.stock < quantity) {
        return res.status(400).json({ success: false, message: `Stok ${product.name} tidak cukup (tersisa ${product.stock})` });
      }

      // CRITICAL: Price from DATABASE only
      const itemTotal = product.price * quantity;
      total += itemTotal;

      orderItems.push({
        product_id: product.id,
        product_name: product.name,
        price: product.price, // from DB
        role_id: product.role_id,
        quantity,
        stock: product.stock
      });
    }

    // Generate unique invoice
    const invoice = 'PNWL-' + uuidv4().replace(/-/g, '').substring(0, 8).toUpperCase();

    createOrder({
      invoice,
      player_id: player_id.trim(),
      whatsapp: (whatsapp || '').trim(),
      payment_method,
      total,
      items: orderItems
    });

    res.json({
      success: true,
      data: {
        invoice,
        player_id: player_id.trim(),
        total,
        items: orderItems.map(i => ({
          name: i.product_name,
          price: i.price,
          quantity: i.quantity,
          subtotal: i.price * i.quantity
        })),
        status: 'PENDING',
        payment: buildPayment(payment_method, total, invoice)
      }
    });
  } catch (err) {
    if (err && err.code === 'STOCK_INSUFFICIENT') {
      return res.status(400).json({ success: false, message: `Stok ${err.productName} tidak cukup, silakan kurangi jumlah atau coba lagi nanti` });
    }
    console.error(err);
    res.status(500).json({ success: false, message: 'Gagal membuat order' });
  }
});

// Get order by invoice
app.get('/api/orders/:invoice', lookupLimiter, (req, res) => {
  try {
    const order = getOrderByInvoice(req.params.invoice.toUpperCase());
    if (!order) {
      return res.status(404).json({ success: false, message: 'Invoice tidak ditemukan' });
    }
    // Hanya tampilkan cara bayar kalau order masih menunggu pembayaran
    if (order.status === 'PENDING') {
      order.payment = buildPayment(order.payment_method, order.total, order.invoice);
    }
    res.json({ success: true, data: order });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ==================== ADMIN AUTH ====================

app.post('/api/admin/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username dan password wajib diisi' });
    }

    const admin = getAdminByUsername(username.trim());
    if (!admin) {
      return res.status(401).json({ success: false, message: 'Username atau password salah' });
    }

    const match = await bcrypt.compare(password, admin.password_hash);
    if (!match) {
      return res.status(401).json({ success: false, message: 'Username atau password salah' });
    }

    req.session.adminId = admin.id;
    req.session.adminUsername = admin.username;

    res.json({
      success: true,
      data: { username: admin.username }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Logout gagal' });
    }
    res.clearCookie('connect.sid');
    res.json({ success: true, message: 'Logged out' });
  });
});

app.get('/api/admin/me', (req, res) => {
  if (req.session && req.session.adminId) {
    return res.json({
      success: true,
      data: { username: req.session.adminUsername }
    });
  }
  res.status(401).json({ success: false, message: 'Not authenticated' });
});

// ==================== ADMIN API (Protected) ====================

app.get('/api/admin/dashboard', requireAdmin, (req, res) => {
  try {
    const stats = getDashboardStats();
    res.json({ success: true, data: stats });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.get('/api/admin/products', requireAdmin, (req, res) => {
  try {
    const products = getAllProductsAdmin();
    res.json({ success: true, data: products });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.post('/api/admin/products', requireAdmin, (req, res) => {
  try {
    const { store, name, description, price, type, role_id, stock, active } = req.body;

    if (!store || !name || price === undefined) {
      return res.status(400).json({ success: false, message: 'Store, name, dan price wajib diisi' });
    }

    if (!['RGT', 'GTPS'].includes(store)) {
      return res.status(400).json({ success: false, message: 'Store harus RGT atau GTPS' });
    }

    const priceNum = parseInt(price, 10);
    if (isNaN(priceNum) || priceNum < 0) {
      return res.status(400).json({ success: false, message: 'Harga tidak valid' });
    }

    const id = createProduct({
      store,
      name: name.trim(),
      description: (description || '').trim(),
      price: priceNum,
      type: type || 'currency',
      role_id: role_id || null,
      stock: stock !== undefined ? parseInt(stock, 10) : -1,
      active: active !== undefined ? active : true
    });

    res.json({ success: true, data: { id } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Gagal menambah produk' });
  }
});

app.put('/api/admin/products/:id', requireAdmin, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const data = req.body;

    if (data.store !== undefined && !['RGT', 'GTPS'].includes(data.store)) {
      return res.status(400).json({ success: false, message: 'Store harus RGT atau GTPS' });
    }

    if (data.price !== undefined) {
      const priceNum = parseInt(data.price, 10);
      if (isNaN(priceNum) || priceNum < 0) {
        return res.status(400).json({ success: false, message: 'Harga tidak valid' });
      }
      data.price = priceNum;
    }

    if (data.stock !== undefined) {
      data.stock = parseInt(data.stock, 10);
    }

    const updated = updateProduct(id, data);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Produk tidak ditemukan' });
    }

    res.json({ success: true, message: 'Produk berhasil diupdate' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Gagal update produk' });
  }
});

app.delete('/api/admin/products/:id', requireAdmin, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const deleted = deleteProduct(id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Produk tidak ditemukan' });
    }
    res.json({ success: true, message: 'Produk dinonaktifkan' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Gagal menghapus produk' });
  }
});

app.get('/api/admin/orders', requireAdmin, (req, res) => {
  try {
    const orders = getAllOrders();
    res.json({ success: true, data: orders });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.put('/api/admin/orders/:invoice/status', requireAdmin, (req, res) => {
  try {
    const { status } = req.body;
    const invoice = req.params.invoice.toUpperCase();

    const allowed = ['PENDING', 'PAID', 'PROCESSING', 'COMPLETED', 'CANCELLED'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, message: 'Status tidak valid' });
    }

    const updated = updateOrderStatus(invoice, status);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Order tidak ditemukan' });
    }

    res.json({ success: true, message: 'Status berhasil diubah' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Gagal update status' });
  }
});

// Serve frontend (pakai root + callback supaya error-nya jelas di log)
function sendPage(file) {
  return (req, res, next) => {
    res.sendFile(file, { root: path.join(__dirname, 'public') }, (err) => {
      if (err) {
        console.error(`[PAGE ERROR] ${req.method} ${req.originalUrl} -> ${file}:`, err.code || '', err.message);
        if (!res.headersSent) {
          res.status(err.code === 'ENOENT' ? 404 : 500).send(
            err.code === 'ENOENT' ? `File public/${file} tidak ditemukan di server` : 'Gagal memuat halaman'
          );
        }
      }
    });
  };
}

app.get('/', sendPage('index.html'));
app.get('/admin', sendPage('admin.html'));
app.get('/admin/', sendPage('admin.html'));

// 404
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(`[ERROR] ${req.method} ${req.originalUrl}:`, err && err.stack ? err.stack : err);
  if (res.headersSent) return next(err);
  res.status(err && err.status ? err.status : 500).json({ success: false, message: 'Internal server error' });
});

process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e));
process.on('uncaughtException', (e) => console.error('[uncaughtException]', e));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 PNWL.STORE running at http://localhost:${PORT}`);
  console.log(`📱 Admin panel: http://localhost:${PORT}/admin`);
  if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD === 'ganti_password_admin_yang_kuat') {
    console.log('⚠️  ADMIN_PASSWORD belum diatur di .env (lihat password sementara di atas jika admin baru dibuat)\n');
  }
});
