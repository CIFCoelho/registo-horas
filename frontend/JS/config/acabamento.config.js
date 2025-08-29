// Configure backend URL:
// - When hosted on GitHub Pages, point to your deployed backend (HTTPS).
// - Otherwise, fall back to localhost for local development.
// Replace the placeholder below with your production backend base URL.
const PROD_BACKEND_BASE = 'https://YOUR-BACKEND-DOMAIN'; // e.g., https://api.example.com
const LOCAL_BACKEND_BASE = 'http://localhost:8787';

const backendBase = (typeof location !== 'undefined' && /github\.io$/i.test(location.hostname))
  ? PROD_BACKEND_BASE
  : LOCAL_BACKEND_BASE;

window.SECTION_CONFIG = {
  section: 'Acabamento',
  webAppUrl: backendBase + '/acabamento',
  names: ['Antónia', 'Cristina', 'Diogo', 'Teresa', 'Pedro']
};
