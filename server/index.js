// server/index.js
require('dotenv').config(); // load env first

// Force Node's local timezone to Europe/Lisbon (fallback when env var cannot be set in hosting)
process.env.TZ = process.env.TZ || 'Europe/Lisbon';

const express = require('express');
const cron = require('node-cron');

// ✅ Read ONLY from env
const NOTION_TOKEN = process.env.NOTION_TOKEN;
const ACABAMENTO_DB_ID = process.env.ACABAMENTO_DB_ID;
const ESTOFAGEM_TEMPO_DB_ID = process.env.ESTOFAGEM_TEMPO_DB_ID;
const ESTOFAGEM_ACABAMENTOS_DB_ID = process.env.ESTOFAGEM_ACABAMENTOS_DB_ID;
const COSTURA_DB_ID = process.env.COSTURA_DB_ID;
const PINTURA_DB_ID = process.env.PINTURA_DB_ID;
const PREPARACAO_MADEIRAS_DB_ID = process.env.PREPARACAO_MADEIRAS_DB_ID;
const MONTAGEM_DB_ID = process.env.MONTAGEM_DB_ID;
const PORT = process.env.PORT || 8787;
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || 'https://cifcoelho.github.io';
const KEEPALIVE_URL = process.env.KEEPALIVE_URL || '';
const KEEPALIVE_ENABLED = (process.env.KEEPALIVE_ENABLED || 'true') !== 'false';

const NOTION_DATABASES = {
  acabamento: ACABAMENTO_DB_ID,
  estofagemTempo: ESTOFAGEM_TEMPO_DB_ID,
  estofagemAcabamentos: ESTOFAGEM_ACABAMENTOS_DB_ID,
  costura: COSTURA_DB_ID,
  pintura: PINTURA_DB_ID,
  preparacao: PREPARACAO_MADEIRAS_DB_ID,
  montagem: MONTAGEM_DB_ID
};

const ESTOFAGEM_REGISTOS_PROPS = {
  title: process.env.ESTOFAGEM_REGISTOS_TITLE_PROP || 'Registo Por:',
  data: process.env.ESTOFAGEM_REGISTOS_DATA_PROP || 'Data',
  of: process.env.ESTOFAGEM_REGISTOS_OF_PROP || 'Ordem de Fabrico',
  cru: process.env.ESTOFAGEM_REGISTOS_CRU_PROP || 'Cru Por:',
  tp: process.env.ESTOFAGEM_REGISTOS_TP_PROP || 'TP por:'
};

// Guard rails: fail fast if secrets are missing
if (!NOTION_TOKEN) {
  console.error('❌ Missing NOTION_TOKEN in environment.');
  process.exit(1);
}
if (!ACABAMENTO_DB_ID) {
  console.error('❌ Missing ACABAMENTO_DB_ID in environment.');
  process.exit(1);
}
if (!ESTOFAGEM_TEMPO_DB_ID || !ESTOFAGEM_ACABAMENTOS_DB_ID) {
  console.error('❌ Missing ESTOFAGEM_TEMPO_DB_ID or ESTOFAGEM_ACABAMENTOS_DB_ID in environment.');
  process.exit(1);
}

const headers = {
  'Authorization': `Bearer ${NOTION_TOKEN}`,
  'Notion-Version': '2022-06-28',
  'Content-Type': 'application/json'
};

const app = express();

// CORS: support single origin, wildcard, or comma-separated list
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allow = (ALLOW_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);

  let allowHeader = '';
  if (allow.includes('*')) {
    allowHeader = '*';
  } else if (origin && allow.includes(origin)) {
    allowHeader = origin;
  } else if (allow.length === 1) {
    // Backward compatibility: if one origin configured, expose it
    allowHeader = allow[0];
  }

  if (allowHeader) {
    res.setHeader('Access-Control-Allow-Origin', allowHeader);
  }
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Simple health endpoint
app.get('/health', (req, res) => {
  res.json({ ok: true, allow: ALLOW_ORIGIN });
});

// Lightweight Notion DB metadata endpoint to help debugging
app.get('/notion/meta', async (req, res) => {
  try {
    const dbKey = String(req.query.db || 'acabamento');
    const targetDb = NOTION_DATABASES[dbKey] || ACABAMENTO_DB_ID;
    const resp = await fetch(`https://api.notion.com/v1/databases/${targetDb}`, { headers });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Notion meta failed (${resp.status}): ${text}`);
    }
    const json = await resp.json();
    const props = {};
    Object.entries(json.properties || {}).forEach(([name, def]) => (props[name] = def.type));
    res.json({ ok: true, id: json.id, title: json.title?.[0]?.plain_text || '', properties: props });
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e.message || e) });
  }
});

app.get('/notion/whoami', async (req, res) => {
  try {
    const resp = await fetch('https://api.notion.com/v1/users/me', { headers });
    const text = await resp.text();
    if (!resp.ok) throw new Error(`Notion whoami failed (${resp.status}): ${text}`);
    res.setHeader('Content-Type', 'application/json');
    res.send(text);
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e.message || e) });
  }
});

app.post('/acabamento', async (req, res) => {
  try {
    const raw = req.body?.data;
    if (!raw) throw new Error('Missing data');
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;

    if (!data.acao || !data.funcionario) throw new Error('Dados incompletos');

    console.log(`[REQ] /acabamento ->`, data);

    if (data.acao === 'start') {
      await createShiftStart(ACABAMENTO_DB_ID, data);
    } else if (data.acao === 'end') {
      await closeShiftEntry(ACABAMENTO_DB_ID, data);
    } else if (data.acao === 'cancel') {
      await cancelShiftEntry(ACABAMENTO_DB_ID, data);
    } else if (data.acao === 'finishIncomplete') {
      await finishIncompleteEntry(ACABAMENTO_DB_ID, data);
    } else {
      throw new Error('Ação inválida');
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(400).json({ ok: false, error: String(err.message || err) });
  }
});

app.post('/estofagem', async (req, res) => {
  try {
    const raw = req.body?.data;
    if (!raw) throw new Error('Missing data');
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;

    if (!data.acao || !data.funcionario) throw new Error('Dados incompletos');

    console.log(`[REQ] /estofagem ->`, data);

    if (data.acao === 'start') {
      await createShiftStart(ESTOFAGEM_TEMPO_DB_ID, data);
    } else if (data.acao === 'end') {
      await closeShiftEntry(ESTOFAGEM_TEMPO_DB_ID, data);
    } else if (data.acao === 'registerAcabamento') {
      await registerEstofagemAcabamento(data);
    } else {
      throw new Error('Ação inválida');
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(400).json({ ok: false, error: String(err.message || err) });
  }
});

// List open shifts to let the frontend reconcile its local UI state
app.get('/acabamento/open', async (req, res) => {
  try {
    const sessions = await listOpenShifts(ACABAMENTO_DB_ID);
    res.json({ ok: true, sessions });
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e.message || e) });
  }
});

app.get('/estofagem/open', async (req, res) => {
  try {
    const sessions = await listOpenShifts(ESTOFAGEM_TEMPO_DB_ID);
    res.json({ ok: true, sessions });
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e.message || e) });
  }
});

app.get('/estofagem/options', async (req, res) => {
  try {
    const ofNumber = Number(req.query.of || 0) || 0;
    const options = await listAcabamentoOptions(ofNumber);
    res.json({ ok: true, options });
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e.message || e) });
  }
});

function registerBasicShiftSection(route, dbId, label, opts) {
  opts = opts || {};
  if (!dbId) {
    console.warn(`⚠️  Skipping ${route} (${label || 'sem nome'}) – DB ID not configured.`);
    return;
  }

  app.post(route, async (req, res) => {
    try {
      const raw = req.body?.data;
      if (!raw) throw new Error('Missing data');
      const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!data.acao || !data.funcionario) throw new Error('Dados incompletos');

      console.log(`[REQ] ${route} ->`, data);

      if (data.acao === 'start') {
        await createShiftStart(dbId, data);
      } else if (data.acao === 'end') {
        await closeShiftEntry(dbId, data);
      } else if (data.acao === 'cancel') {
        await cancelShiftEntry(dbId, data);
      } else if (data.acao === 'register' && typeof opts.onRegister === 'function') {
        await opts.onRegister(data);
      } else {
        throw new Error('Ação inválida');
      }

      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(400).json({ ok: false, error: String(err.message || err) });
    }
  });

  app.get(`${route}/open`, async (req, res) => {
    try {
      const sessions = await listOpenShifts(dbId);
      res.json({ ok: true, sessions });
    } catch (e) {
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  console.log(`📌 Basic shift section ready: ${label || route} (${route})`);
}

registerBasicShiftSection('/costura', COSTURA_DB_ID, 'Costura');
registerBasicShiftSection('/pintura', PINTURA_DB_ID, 'Pintura', {
  onRegister: async (data) => {
    await registerPinturaQuantities(PINTURA_DB_ID, data);
  }
});
registerBasicShiftSection('/preparacao', PREPARACAO_MADEIRAS_DB_ID, 'Preparação de Madeiras');
registerBasicShiftSection('/montagem', MONTAGEM_DB_ID, 'Montagem');

// --- helpers ---

function hhmmToTodayISO(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  const now = new Date();
  const dt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
  return dt.toISOString();
}

async function listOpenShifts(dbId) {
  let start_cursor = undefined;
  const sessions = [];
  do {
    const query = {
      filter: { property: 'Final do Turno', date: { is_empty: true } },
      sorts: [{ property: 'Início do Turno', direction: 'ascending' }],
      page_size: 100,
      ...(start_cursor ? { start_cursor } : {})
    };

    const resp = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
      method: 'POST',
      headers,
      body: JSON.stringify(query)
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Notion query failed (${resp.status}): ${text}`);
    }

    const json = await resp.json();
    for (const page of json.results || []) {
      const name = (page.properties?.['Colaborador']?.title?.[0]?.plain_text || '').trim();
      const of = page.properties?.['Ordem de Fabrico']?.number || null;
      const start = page.properties?.['Início do Turno']?.date?.start || null;
      if (name) sessions.push({ funcionario: name, of, start, id: page.id });
    }
    start_cursor = json.has_more ? json.next_cursor : undefined;
  } while (start_cursor);

  return sessions;
}

async function listAcabamentoOptions(ofNumber) {
  if (!ofNumber) return [];

  const names = new Set();
  let start_cursor = undefined;

  do {
    const query = {
      filter: {
        and: [
          { property: 'Ordem de Fabrico', number: { equals: ofNumber } },
          { property: 'Final do Turno', date: { is_empty: true } }
        ]
      },
      sorts: [{ property: 'Início do Turno', direction: 'ascending' }],
      page_size: 100,
      ...(start_cursor ? { start_cursor } : {})
    };

    const resp = await fetch(`https://api.notion.com/v1/databases/${ACABAMENTO_DB_ID}/query`, {
      method: 'POST',
      headers,
      body: JSON.stringify(query)
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Notion query failed (${resp.status}): ${text}`);
    }

    const json = await resp.json();
    for (const page of json.results || []) {
      const name = (page.properties?.['Colaborador']?.title?.[0]?.plain_text || '').trim();
      if (name) names.add(name);
    }
    start_cursor = json.has_more ? json.next_cursor : undefined;
  } while (start_cursor);

  return Array.from(names).sort((a, b) => a.localeCompare(b, 'pt-PT'));
}

async function createShiftStart(dbId, data) {
  const startISO = hhmmToTodayISO(data.hora);

  const payload = {
    parent: { database_id: dbId },
    properties: {
      'Colaborador': { title: [{ text: { content: data.funcionario } }] },
      'Ordem de Fabrico': { number: Number(data.of) || null },
      'Início do Turno': { date: { start: startISO } }
    }
  };

  const resp = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Notion create failed (${resp.status}): ${text}`);
  }
}

async function findOpenShiftPage(dbId, funcionario) {
  const query = {
    filter: {
      and: [
        { property: 'Colaborador', title: { equals: funcionario } },
        { property: 'Final do Turno', date: { is_empty: true } }
      ]
    },
    sorts: [{ property: 'Início do Turno', direction: 'descending' }],
    page_size: 1
  };

  const resp = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
    method: 'POST',
    headers,
    body: JSON.stringify(query)
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Notion query failed (${resp.status}): ${text}`);
  }
  const json = await resp.json();
  if (!json.results || !json.results.length) throw new Error('Nenhum turno aberto encontrado');

  return json.results[0];
}

function combineNotes(existingRichText, message) {
  if (!message) return null;
  const existingNotes = (existingRichText || [])
    .map((r) => r.plain_text || (r.text && r.text.content) || '')
    .join(' ')
    .trim();
  return existingNotes ? `${existingNotes} | ${message}` : message;
}

function computeBreakAdjustment(startDate, requestedEndDate) {
  if (!startDate) {
    return { endDate: requestedEndDate, note: null };
  }

  const breakStart = new Date(startDate);
  breakStart.setHours(10, 0, 0, 0);
  const breakEnd = new Date(startDate);
  breakEnd.setHours(10, 10, 0, 0);

  const coversBreak = startDate <= breakStart && requestedEndDate >= breakEnd;

  if (coversBreak) {
    const adjusted = new Date(requestedEndDate.getTime() - 10 * 60_000);
    if (adjusted > startDate) {
      return { endDate: adjusted, note: 'Ajuste automático: pausa manhã (−10 min)' };
    }
  }

  return { endDate: requestedEndDate, note: null };
}

async function closeShiftEntry(dbId, data) {
  const page = await findOpenShiftPage(dbId, data.funcionario);
  const requestedEndISO = hhmmToTodayISO(data.hora);
  const requestedEndDate = new Date(requestedEndISO);

  const startProp = page.properties?.['Início do Turno']?.date?.start;
  const startDate = startProp ? new Date(startProp) : null;

  const adjustment = computeBreakAdjustment(startDate, requestedEndDate);

  const properties = {
    'Final do Turno': { date: { start: adjustment.endDate.toISOString() } }
  };

  if (adjustment.note) {
    const combinedNotes = combineNotes(page.properties?.['Notas do Sistema']?.rich_text, adjustment.note);
    properties['Notas do Sistema'] = { rich_text: [{ text: { content: combinedNotes } }] };
  }

  const resp2 = await fetch(`https://api.notion.com/v1/pages/${page.id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ properties })
  });
  if (!resp2.ok) {
    const text = await resp2.text();
    throw new Error(`Notion update failed (${resp2.status}): ${text}`);
  }
}

async function cancelShiftEntry(dbId, data) {
  const endISO = hhmmToTodayISO(data.hora);
  const page = await findOpenShiftPage(dbId, data.funcionario);

  const payload = {
    properties: {
      'Final do Turno': { date: { start: endISO } },
      'Notas do Sistema': {
        rich_text: [{ text: { content: 'Turno cancelado manualmente' } }]
      }
    }
  };

  const resp2 = await fetch(`https://api.notion.com/v1/pages/${page.id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(payload)
  });
  if (!resp2.ok) {
    const text = await resp2.text();
    throw new Error(`Notion update failed (${resp2.status}): ${text}`);
  }
}

async function registerPinturaQuantities(dbId, data) {
  if (!dbId) throw new Error('DB não configurada');
  const page = await findOpenShiftPage(dbId, data.funcionario);

  const isolante = Number(data.isolante) || 0;
  const tapaPoros = Number(data.tapaPoros) || 0;
  const verniz = Number(data.verniz) || 0;
  const aquecimento = Number(data.aquecimento) || 0;

  const properties = {
    'Isolante Aplicado (Nº)': { number: isolante },
    'Tapa-Poros Aplicado Nº': { number: tapaPoros },
    'Verniz Aplicado (Nº)': { number: verniz },
    'Aquecimento - Nº de Horas': { number: aquecimento }
  };

  const resp = await fetch(`https://api.notion.com/v1/pages/${page.id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ properties })
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Notion update failed (${resp.status}): ${text}`);
  }
}

async function finishIncompleteEntry(dbId, data) {
  if (!data.tipo || !data.iniciou || typeof data.minutosRestantes === 'undefined') {
    throw new Error('Dados incompletos');
  }
  if (String(data.iniciou).trim() === String(data.funcionario).trim()) {
    throw new Error('Escolha outro colaborador');
  }

  const page = await findOpenShiftPage(dbId, data.funcionario);

  const startProp = page.properties?.['Início do Turno']?.date?.start;
  if (!startProp) throw new Error('Início do Turno não encontrado');
  const startDate = new Date(startProp);
  const minutes = Math.max(0, Number(data.minutosRestantes) || 0);
  const adjustedStartISO = new Date(startDate.getTime() + minutes * 60_000).toISOString();

  const tipo = String(data.tipo).trim();
  const newNote = `Terminou ${tipo} iniciado por ${data.iniciou} durante ${minutes} min`;
  const combinedNotes = combineNotes(page.properties?.['Notas do Sistema']?.rich_text, newNote);

  const payload = {
    properties: {
      'Início do Turno': { date: { start: adjustedStartISO } },
      'Notas do Sistema': { rich_text: [{ text: { content: combinedNotes } }] }
    }
  };

  const resp2 = await fetch(`https://api.notion.com/v1/pages/${page.id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(payload)
  });
  if (!resp2.ok) {
    const text = await resp2.text();
    throw new Error(`Notion update failed (${resp2.status}): ${text}`);
  }
}

async function registerEstofagemAcabamento(data) {
  if (!data.of || !data.cru || !data.tp || !data.funcionario) {
    throw new Error('Dados incompletos');
  }

  const today = new Date();
  const dateOnly = today.toISOString().split('T')[0];

  const properties = {
    [ESTOFAGEM_REGISTOS_PROPS.title]: { title: [{ text: { content: data.funcionario } }] },
    [ESTOFAGEM_REGISTOS_PROPS.data]: { date: { start: dateOnly } },
    [ESTOFAGEM_REGISTOS_PROPS.of]: { number: Number(data.of) || null },
    [ESTOFAGEM_REGISTOS_PROPS.cru]: { rich_text: [{ text: { content: String(data.cru) } }] },
    [ESTOFAGEM_REGISTOS_PROPS.tp]: { rich_text: [{ text: { content: String(data.tp) } }] }
  };

  const payload = {
    parent: { database_id: ESTOFAGEM_ACABAMENTOS_DB_ID },
    properties
  };

  const resp = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Notion create failed (${resp.status}): ${text}`);
  }
}

// Keep-alive during work hours (Mon-Fri 07:30–17:30 Lisbon).
function isWithinWorkWindow(now = new Date()) {
  const dow = now.getDay(); // 0=Sun, 1=Mon ... 6=Sat
  if (dow === 0 || dow === 6) return false; // weekends
  const h = now.getHours();
  const m = now.getMinutes();
  if (h < 7 || h > 17) return false;
  if (h === 7 && m < 30) return false;
  if (h === 17 && m > 30) return false;
  return true;
}

async function keepAlivePing() {
  if (!KEEPALIVE_ENABLED) return;
  if (!isWithinWorkWindow()) return;
  const url = KEEPALIVE_URL || `http://localhost:${PORT}/health`;
  try {
    const resp = await fetch(url, { method: 'GET', redirect: 'manual', headers: { 'User-Agent': 'keepalive-ping' } });
    console.log(`[KEEPALIVE] Ping ${url} -> ${resp.status}`);
  } catch (e) {
    console.warn('[KEEPALIVE] Ping failed:', e.message || e);
  }
}

// Ping every 5 minutes within 07:30–17:30, Mon–Fri
cron.schedule(
  '*/5 7-17 * * 1-5',
  async () => {
    try { await keepAlivePing(); } catch (_) {}
  },
  { timezone: 'Europe/Lisbon' }
);

// Kick an immediate ping on boot if within the window
(async () => { try { await keepAlivePing(); } catch (_) {} })();

// 🚀 Start the server
app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
