const express = require('express');
const axios = require('axios');
const cors = require('cors');
const NodeCache = require('node-cache');
require('dotenv').config(); // Muat variabel dari file .env

const app = express();
const PORT = 3000;

// Inisialisasi Cache: Simpan data selama 60 detik
const myCache = new NodeCache({ stdTTL: 60 });

// Middleware
app.use(cors()); // Mengizinkan frontend mengakses API ini
app.use(express.json());

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

// Endpoint Admin Login
app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    
    // Cek username (case-insensitive) dan password (trim spasi)
    const adminUser = process.env.ADMIN_USERNAME;
    const adminPass = process.env.ADMIN_PASSWORD;

    if (username && username.trim().toLowerCase() === adminUser.toLowerCase() && password && password.trim() === adminPass) {
        return res.json({ success: true, message: 'Login successful', token: 'admin-authorized-token' });
    } else {
        return res.status(401).json({ success: false, message: 'Username atau Password salah!' });
    }
});

app.listen(PORT, () => {
    console.log(`Server berjalan di http://localhost:${PORT}`);
});