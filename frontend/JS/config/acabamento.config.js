const PROD_BACKEND_BASE = 'https://cifcoelho.github.io/registo-horas/frontend/HTML/acabamento.html';
const LOCAL_BACKEND_BASE = 'http://localhost:8787';

const backendBase = (typeof location !== 'undefined' && /github\.io$/i.test(location.hostname))
  ? PROD_BACKEND_BASE
  : LOCAL_BACKEND_BASE;

window.SECTION_CONFIG = {
  section: 'Acabamento',
  webAppUrl: backendBase + '/acabamento',
  names: ['Antónia', 'Cristina', 'Diogo', 'Teresa', 'Pedro']
};
