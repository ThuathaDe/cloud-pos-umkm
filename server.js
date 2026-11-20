const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Koneksi ke Cloud Database melalui Environment Variable DATABASE_URL
const useSSL = process.env.DATABASE_URL &&
  !process.env.DATABASE_URL.includes('localhost') &&
  !process.env.DATABASE_URL.includes('.railway.internal');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSSL ? { rejectUnauthorized: false } : false
});

// Inisialisasi tabel & data simulasi otomatis saat server pertama kali aktif
async function initDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS produk (
        id SERIAL PRIMARY KEY,
        nama VARCHAR(100) NOT NULL,
        harga INTEGER NOT NULL,
        stok INTEGER NOT NULL
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS transaksi (
        id SERIAL PRIMARY KEY,
        nama_produk VARCHAR(100) NOT NULL,
        jumlah INTEGER NOT NULL,
        total_harga INTEGER NOT NULL,
        waktu TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Isi 3 data simulasi awal jika tabel masih kosong (aman, tanpa data pribadi)
    const cekData = await pool.query('SELECT COUNT(*) FROM produk');
    if (parseInt(cekData.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO produk (nama, harga, stok) VALUES
        ('Kopi Bubuk Lokal 250g', 35000, 20),
        ('Keripik Ikan 200g', 25000, 30),
        ('Madu Hutan Kemasan 300ml', 65000, 15);
      `);
    }
    console.log('Database cloud siap digunakan.');
  } catch (err) {
    console.error('Gagal inisialisasi database:', err.message);
  }
}

// API: Ambil semua produk
app.get('/api/produk', async (req, res) => {
  const result = await pool.query('SELECT * FROM produk ORDER BY id ASC');
  res.json(result.rows);
});

// API: Tambah produk baru
app.post('/api/produk', async (req, res) => {
  const { nama, harga, stok } = req.body;
  await pool.query(
    'INSERT INTO produk (nama, harga, stok) VALUES ($1, $2, $3)',
    [nama, parseInt(harga), parseInt(stok)]
  );
  res.json({ message: 'Produk berhasil ditambahkan' });
});

// API: Catat transaksi penjualan & kurangi stok otomatis
app.post('/api/transaksi', async (req, res) => {
  const { produk_id, jumlah } = req.body;
  const qty = parseInt(jumlah);

  const prodRes = await pool.query('SELECT * FROM produk WHERE id = $1', [produk_id]);
  if (prodRes.rows.length === 0) return res.status(404).json({ error: 'Produk tidak ditemukan' });

  const produk = prodRes.rows[0];
  if (produk.stok < qty) return res.status(400).json({ error: 'Stok tidak mencukupi' });

  const totalHarga = produk.harga * qty;

  await pool.query('UPDATE produk SET stok = stok - $1 WHERE id = $2', [qty, produk_id]);
  await pool.query(
    'INSERT INTO transaksi (nama_produk, jumlah, total_harga) VALUES ($1, $2, $3)',
    [produk.nama, qty, totalHarga]
  );

  res.json({ message: 'Transaksi berhasil dicatat' });
});

// API: Ambil riwayat transaksi terbaru
app.get('/api/transaksi', async (req, res) => {
  const result = await pool.query('SELECT * FROM transaksi ORDER BY id DESC LIMIT 10');
  res.json(result.rows);
});

app.listen(PORT, async () => {
  console.log(`Server berjalan pada port ${PORT}`);
  await initDatabase();
});