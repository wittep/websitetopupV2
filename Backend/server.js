const express = require('express');
const axios = require('axios');
const cors = require('cors');
const NodeCache = require('node-cache');
const mysql = require('mysql2/promise'); // Perlu: npm install mysql2
const path = require('path');
require('dotenv').config(); // Muat variabel dari file .env

const app = express();
const PORT = 3000;

// Inisialisasi Cache: Simpan data selama 60 detik
const myCache = new NodeCache({ stdTTL: 60 });

// Middleware
app.use(cors()); // Mengizinkan frontend mengakses API ini
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend'))); // Menyajikan file frontend di localhost:3000

// --- KONEKSI DATABASE (MYSQL) ---
let pool; // Gunakan let agar bisa diinisialisasi setelah database dibuat

// Test koneksi dan buat tabel jika belum ada
(async () => {
    try {
        // 1. Buat koneksi sementara untuk membuat Database jika belum ada
        const dbConfig = {
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
        };
        const dbName = process.env.DB_NAME || 'bakulgaming';

        const tempConnection = await mysql.createConnection(dbConfig);
        await tempConnection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
        await tempConnection.end();

        // 2. Inisialisasi Pool dengan database yang benar
        pool = mysql.createPool({ ...dbConfig, database: dbName, waitForConnections: true, connectionLimit: 10, queueLimit: 0 });

        // 3. Buat Tabel
        const connection = await pool.getConnection();
        console.log('✅ Berhasil terhubung ke MySQL');
        
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS transactions (
                _id INT AUTO_INCREMENT PRIMARY KEY,
                id VARCHAR(50) NOT NULL,
                user_name VARCHAR(255),
                user_email VARCHAR(255),
                game VARCHAR(255),
                item VARCHAR(255),
                price DECIMAL(15, 0),
                status VARCHAR(50) DEFAULT 'Pending',
                date VARCHAR(50),
                username_game VARCHAR(255)
            )
        `);

        // Tambahkan kolom created_at jika belum ada (untuk fitur timer 10 menit)
        try {
            await connection.query("ALTER TABLE transactions ADD COLUMN created_at BIGINT");
        } catch (e) {
            // Abaikan error jika kolom sudah ada
        }

        // Ubah tipe data price agar tidak ada desimal (untuk database yg sudah terlanjur dibuat)
        try {
            await connection.query("ALTER TABLE transactions MODIFY COLUMN price DECIMAL(15, 0)");
        } catch (e) {
        }
        connection.release();
    } catch (err) {
        console.error('❌ Gagal koneksi MySQL:', err);
    }
})();

// Endpoint Verifikasi Roblox
app.post('/api/roblox/verify', async (req, res) => {
    const { username } = req.body;
    const cacheKey = `roblox_user_${username.toLowerCase()}`;

    // 1. Cek cache terlebih dahulu
    const cachedData = myCache.get(cacheKey);
    if (cachedData) {
        return res.json(cachedData);
    }

    if (!username) {
        return res.status(400).json({ success: false, message: 'Username is required' });
    }

    try {
        // Langkah 1: Dapatkan User ID dari Username
        // API Roblox: https://users.roblox.com/v1/usernames/users
        const userResponse = await axios.post('https://users.roblox.com/v1/usernames/users', {
            usernames: [username],
            excludeBannedUsers: true
        });

        const data = userResponse.data.data;

        if (data.length === 0) {
            const notFoundResponse = { success: false, message: 'Username not found' };
            myCache.set(cacheKey, notFoundResponse); // Cache hasil "tidak ditemukan"
            return res.status(404).json(notFoundResponse);
        }

        const user = data[0];
        const userId = user.id;
        const validUsername = user.name; // Nama asli dari Roblox (case-sensitive)
        const displayName = user.displayName;

        // Langkah 2: Dapatkan Avatar Headshot
        // API Roblox: https://thumbnails.roblox.com/v1/users/avatar-headshot
        const avatarResponse = await axios.get(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=true`);
        
        const avatarData = avatarResponse.data.data;
        
        if (avatarData.length === 0 || avatarData[0].state !== 'Completed') {
            // Fallback jika avatar gagal load, tapi user ketemu
            const responseData = { 
                success: true, 
                userId, 
                username: validUsername,
                displayName,
                avatarUrl: null 
            };
            myCache.set(cacheKey, responseData); // Simpan ke cache
            return res.json(responseData);
        }

        const avatarUrl = avatarData[0].imageUrl;

        const successResponse = { success: true, userId, username: validUsername, displayName, avatarUrl };
        myCache.set(cacheKey, successResponse); // Simpan hasil sukses ke cache
        return res.json(successResponse);

    } catch (error) {
        // Jangan cache error server 500, agar bisa dicoba lagi
        console.error('Roblox API Error:', error.message);
        return res.status(500).json({ success: false, message: 'Failed to connect to Roblox API' });
    }
});

// Endpoint Mendapatkan Link Pembuatan Gamepass
app.post('/api/roblox/get-creation-link', async (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ success: false, message: 'User ID required' });

    try {
        // Ambil list game user (biasanya user punya setidaknya 1 game default)
        const response = await axios.get(`https://games.roblox.com/v2/users/${userId}/games?accessFilter=Public&sortOrder=Asc&limit=10`);
        const games = response.data.data;

        if (games && games.length > 0) {
            const universeId = games[0].id;
            // Link dashboard spesifik untuk universe tersebut
            const link = `https://create.roblox.com/dashboard/creations/experiences/${universeId}/monetization/passes`;
            return res.json({ success: true, link });
        } else {
            return res.json({ success: false, message: 'Tidak ada game publik ditemukan pada akun ini.' });
        }
    } catch (error) {
        console.error('Error fetching games:', error.message);
        return res.status(500).json({ success: false, message: 'Gagal mengambil data game.' });
    }
});

// Endpoint Verifikasi Gamepass
app.post('/api/roblox/verify-gamepass', async (req, res) => {
    const { userId, price } = req.body;
    if (!userId || !price) return res.status(400).json({ success: false });

    // --- BYPASS MODE (UNTUK TESTING) ---
    // Langsung return sukses agar bisa tes masuk database tanpa bikin gamepass asli
    console.log(`[TESTING] Bypass Gamepass Check untuk UserID: ${userId}, Harga: ${price}`);
    return res.json({ success: true });

    try {
        // 1. Ambil game user
        const response = await axios.get(`https://games.roblox.com/v2/users/${userId}/games?accessFilter=Public&sortOrder=Asc&limit=10`);
        const games = response.data.data;
        
        let found = false;
        if (games) {
            // 2. Cek gamepass di setiap game
            for (const game of games) {
                try {
                    const gpResponse = await axios.get(`https://games.roblox.com/v1/games/${game.id}/game-passes?limit=100&sortOrder=Asc`);
                    const passes = gpResponse.data.data;
                    // Cek apakah ada gamepass dengan harga yang sesuai
                    if (passes.find(p => p.price === parseInt(price))) {
                        found = true;
                        break;
                    }
                } catch (e) {
                    // Lanjut ke game berikutnya jika error
                }
            }
        }

        if (found) {
            return res.json({ success: true });
        } else {
            return res.json({ success: false, message: `Gamepass dengan harga ${price} R$ tidak dapat ditemukan!` });
        }
    } catch (error) {
        console.error('Error verifying gamepass:', error.message);
        return res.status(500).json({ success: false, message: 'Terjadi kesalahan server saat verifikasi.' });
    }
});

// --- API TRANSAKSI (PENGGANTI LOCALSTORAGE) ---

// 1. Simpan Transaksi Baru
app.post('/api/transaction/create', async (req, res) => {
    try {
        if (!pool) {
            throw new Error('Koneksi database belum siap. Pastikan MySQL berjalan dan refresh server.');
        }
        const { user_name, user_email, game, item, price, status, date, username_game } = req.body;
        
        // 1. GENERATE ID URUT (TRX-0001)
        const [lastRow] = await pool.query('SELECT id FROM transactions ORDER BY _id DESC LIMIT 1');
        let newId = 'TRX-0001';
        if (lastRow.length > 0 && lastRow[0].id) {
            const lastId = lastRow[0].id; // Contoh: TRX-0005
            const parts = lastId.split('-');
            if (parts.length === 2) {
                const num = parseInt(parts[1]);
                // Cek: Jika angka < 1.000.000 berarti itu urutan (bukan timestamp/random)
                // Jika angka besar (timestamp), kita reset ke TRX-0001
                if (!isNaN(num) && num < 1000000) newId = `TRX-${String(num + 1).padStart(4, '0')}`;
            }
        }

        const sql = `INSERT INTO transactions (id, user_name, user_email, game, item, price, status, date, username_game, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        // Pastikan tidak ada nilai undefined (ganti dengan null agar MySQL mau menerima)
        const values = [
            newId, 
            user_name || null, 
            user_email || null, 
            game || null, 
            item || null, 
            price || null, 
            status || 'Pending', 
            date || null, 
            username_game || null,
            Date.now() // Simpan waktu pembuatan dalam milidetik
        ];
        
        await pool.execute(sql, values);
        res.json({ success: true, message: 'Transaksi berhasil disimpan', transactionId: newId });
    } catch (error) {
        console.error('❌ Error Transaction:', error);
        res.status(500).json({ success: false, message: 'Gagal menyimpan transaksi: ' + error.message });
    }
});

// 2. Ambil Semua Transaksi (Untuk Admin)
app.get('/api/transactions', async (req, res) => {
    try {
        if (!pool) {
            throw new Error('Koneksi database belum siap.');
        }

        // LOGIKA AUTO GAGAL (Jika Pending > 5 Menit)
        const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
        await pool.query("UPDATE transactions SET status = 'Gagal' WHERE status = 'Pending' AND created_at < ?", [fiveMinutesAgo]);
        
        const { email, id } = req.query;
        let sql = 'SELECT * FROM transactions ORDER BY _id DESC';
        let params = [];

        if (id) {
            // Ambil spesifik 1 transaksi (untuk halaman pembayaran)
            sql = 'SELECT * FROM transactions WHERE id = ?';
            params = [id];
        } else if (email) {
            // Ambil history user
            sql = 'SELECT * FROM transactions WHERE user_email = ? ORDER BY _id DESC';
            params = [email];
        }

        const [rows] = await pool.execute(sql, params);
        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json([]);
    }
});

// 3. Update Status Transaksi (Untuk Admin)
app.post('/api/transaction/update-status', async (req, res) => {
    const { id, status } = req.body;
    try {
        if (!pool) {
            throw new Error('Koneksi database belum siap.');
        }
        await pool.execute('UPDATE transactions SET status = ? WHERE id = ?', [status, id]);
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false });
    }
});

// Endpoint Admin Login
app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    
    // Cek username (case-insensitive) dan password (trim spasi)
    const adminUser = process.env.ADMIN_USERNAME || 'admin';
    const adminPass = process.env.ADMIN_PASSWORD || 'admin123';

    if (username && username.trim().toLowerCase() === adminUser.toLowerCase() && password && password.trim() === adminPass) {
        return res.json({ success: true, message: 'Login successful', token: 'admin-authorized-token' });
    } else {
        return res.status(401).json({ success: false, message: 'Username atau Password salah!' });
    }
});

app.listen(PORT, () => {
    console.log(`Server berjalan di http://localhost:${PORT}`);
});