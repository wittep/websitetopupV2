document.addEventListener('DOMContentLoaded', () => {

    // --- Load User Avatar in Navbar ---
    const activeUserStr = localStorage.getItem('activeUser');
    if (activeUserStr) {
        const activeUser = JSON.parse(activeUserStr);
        if (activeUser.avatar) {
            document.querySelectorAll('.user-profile').forEach(img => img.src = activeUser.avatar);
        }
        if (activeUser.name) {
            document.querySelectorAll('.user-name').forEach(span => {
                span.textContent = activeUser.name;
                span.style.display = 'block';
            });
        }
    }

    // --- Mobile Menu Toggle ---
    const menuBtn = document.getElementById('mobile-menu-btn');
    const navMenu = document.querySelector('.nav-menu');

    if (menuBtn && navMenu) {
        menuBtn.addEventListener('click', () => {
            menuBtn.classList.toggle('active');
            navMenu.classList.toggle('active');
        });

        // Tutup menu saat link diklik (opsional, bagus untuk UX)
        navMenu.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                menuBtn.classList.remove('active');
                navMenu.classList.remove('active');
            });
        });
    }

    // --- Logika Register User ---
    const registerForm = document.querySelector('form[action="#"]'); // Selector untuk form di register.html
    // Cek apakah kita berada di halaman register dengan mengecek keberadaan elemen input khusus register
    const regNameInput = document.getElementById('reg-name');

    if (registerForm && regNameInput) {
        registerForm.addEventListener('submit', (e) => {
            e.preventDefault();

            const name = document.getElementById('reg-name').value;
            const email = document.getElementById('reg-email').value;
            const password = document.getElementById('reg-password').value;
            const confirm = document.getElementById('reg-confirm').value;

            if (password !== confirm) {
                alert('Konfirmasi password tidak cocok!');
                return;
            }

            // Simpan data user ke localStorage untuk simulasi login nanti
            // Format sederhana: user_EMAIL
            const userData = { name, email, password };
            localStorage.setItem('user_' + email, JSON.stringify(userData));

            // Auto login: Set session user aktif
            localStorage.setItem('activeUser', JSON.stringify(userData));

            alert('Registrasi Berhasil! Selamat datang, ' + name);
            window.location.href = 'index.html';
        });
    }

    // --- Logika Login Global ---
    const loginForm = document.getElementById('mainLoginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const usernameInput = document.getElementById('login-email');
            const passwordInput = document.getElementById('login-password');
            const btn = loginForm.querySelector('button[type="submit"]');
            
            const username = usernameInput.value.trim(); // Hapus spasi tidak sengaja
            const password = passwordInput.value.trim(); // Hapus spasi tidak sengaja
            const originalText = btn.textContent;

            btn.textContent = 'Memproses...';
            btn.disabled = true;

            // --- Cek Login User (LocalStorage) ---
            // Cek apakah ada data user tersimpan di browser
            const storedUser = localStorage.getItem('user_' + username);
            if (storedUser) {
                const userObj = JSON.parse(storedUser);
                if (userObj.password === password) {
                    // Set session user aktif
                    localStorage.setItem('activeUser', JSON.stringify(userObj));
                    
                    alert('Login Berhasil sebagai ' + userObj.name);
                    window.location.href = 'user-dashboard.html'; // Redirect ke Dashboard User
                    return; // Stop eksekusi agar tidak lanjut ke login admin
                }
            }
            // -------------------------------------------

            // --- Cek Login User (Database API) ---
            try {
                const userResp = await fetch('http://localhost:3000/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: username, password })
                });
                const userData = await userResp.json();

                if (userData.success) {
                    localStorage.setItem('activeUser', JSON.stringify(userData.user));
                    alert('Login Berhasil sebagai ' + userData.user.name);
                    window.location.href = 'user-dashboard.html';
                    return; // Stop, jangan lanjut ke admin login
                }
            } catch (e) { console.log('User login check failed, trying admin...', e); }

            // --- Cek Login Admin ---
            try {
                const response = await fetch('http://localhost:3000/api/admin/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });

                const data = await response.json();

                if (data.success) {
                    localStorage.setItem('admin_token', data.token);
                    window.location.href = 'admin-dashboard.html';
                } else {
                    alert(data.message || 'Login gagal. Periksa username/password Anda.');
                }
            } catch (error) {
                console.error('Login Error:', error);
                alert('Gagal terhubung ke server backend.');
            } finally {
                btn.textContent = originalText;
                btn.disabled = false;
            }
        });
    }

    // --- Fitur Show/Hide Password ---
    const toggleBtn = document.getElementById('togglePasswordBtn');
    const passwordInput = document.getElementById('login-password');

    if (toggleBtn && passwordInput) {
        toggleBtn.addEventListener('click', () => {
            const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
            passwordInput.setAttribute('type', type);
            
            // Ganti Icon Mata (Terbuka/Tertutup)
            if (type === 'text') {
                toggleBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width:20px;height:20px;"><path stroke-linecap="round" stroke-linejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>`;
            } else {
                toggleBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width:20px;height:20px;"><path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>`;
            }
        });
    }
});

function showComingSoon() {
    const modal = document.getElementById('comingSoonModal');
    if (modal) {
        modal.classList.add('active');
    }
}

function closeComingSoon() {
    const modal = document.getElementById('comingSoonModal');
    if (modal) {
        modal.classList.remove('active');
    }
}

// Login Modal Functions
function openLoginModal() {
    // Cek apakah user sudah login
    if (localStorage.getItem('activeUser')) {
        window.location.href = 'user-dashboard.html';
        return;
    }
    const modal = document.getElementById('loginModal');
    if (modal) {
        modal.classList.add('active');
    }
}

function closeLoginModal() {
    const modal = document.getElementById('loginModal');
    if (modal) {
        modal.classList.remove('active');
    }
}

// Menutup modal jika area luar diklik
window.onclick = function(event) {
    const modal = document.getElementById('comingSoonModal');
    const loginModal = document.getElementById('loginModal');
    
    if (event.target == modal) {
        closeComingSoon();
    }
    if (event.target == loginModal) {
        closeLoginModal();
    }
}

function generateNextTransactionId() {
    // Cara Cepat & Unik: Gunakan Timestamp + Random (Tidak perlu cek database/localStorage)
    // Contoh hasil: TRX-839201456
    const timestamp = Date.now().toString().slice(-6); 
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `TRX-${timestamp}${random}`;
}

// --- FUNGSI BARU: Panggil ini saat tombol "Bayar" diklik ---
window.buatTransaksiBaru = async function(data) {
    try {
        const response = await fetch('http://localhost:3000/api/transaction/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return await response.json(); // Mengembalikan { success: true/false }
    } catch (error) {
        console.error('Gagal kirim transaksi:', error);
        return { success: false, message: 'Gagal terhubung ke server' };
    }
};