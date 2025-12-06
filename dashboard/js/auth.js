const AUTH_KEY = 'certoma-auth-session';
const VALID_USER = 'certoma';
const VALID_PASS = 'certomaSRP';

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

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const user = form.username.value;
            const pass = form.password.value;

            if (user === VALID_USER && pass === VALID_PASS) {
                sessionStorage.setItem(AUTH_KEY, 'true');
                overlay.style.display = 'none';
                content.style.display = 'block';
                window.loadDashboard();
            } else {
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
