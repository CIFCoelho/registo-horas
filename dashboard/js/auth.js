const AUTH_KEY = 'certoma-auth-session';

const Auth = {
    init() {
        const overlay = document.getElementById('auth-overlay');
        const content = document.getElementById('dashboard-content');
        const form = document.getElementById('auth-form');
        const error = document.getElementById('auth-error');
        const logoutBtn = document.getElementById('logout-btn');

        if (this.isAuthenticated()) {
            overlay.style.display = 'none';
            content.style.display = 'block';
            window.loadDashboard(); // Helper trigger
        } else {
            content.style.display = 'none';
            overlay.style.display = 'flex';
        }

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const user = form.username.value;
            const pass = form.password.value;

            try {
                const resp = await fetch(`${API_BASE.replace('/api/dashboard', '')}/api/dashboard/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ user, pass })
                });
                const result = await resp.json();

                if (resp.ok && result.ok) {
                    sessionStorage.setItem(AUTH_KEY, 'true');
                    overlay.style.display = 'none';
                    content.style.display = 'block';
                    window.loadDashboard();
                } else {
                    error.style.display = 'block';
                    form.password.value = '';
                    form.password.focus();
                }
            } catch (err) {
                console.error('Login request failed:', err);
                error.style.display = 'block';
                form.password.value = '';
                form.password.focus();
            }
        });

        logoutBtn.addEventListener('click', () => {
            this.logout();
        });
    },

    isAuthenticated() {
        return sessionStorage.getItem(AUTH_KEY) === 'true';
    },

    logout() {
        sessionStorage.removeItem(AUTH_KEY);
        window.location.reload();
    }
};
