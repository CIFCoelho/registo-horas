// server/index.js
require('dotenv').config(); // load env first

// Force Node's local timezone to Europe/Lisbon (fallback when env var cannot be set in hosting)
process.env.TZ = process.env.TZ || 'Europe/Lisbon';

const express = require('express');
const cron = require('node-cron');

// ✅ Read ONLY from env
const NOTION_TOKEN = process.env.NOTION_TOKEN;
const DATABASE_ID = process.env.ACABAMENTO_DB_ID;
const PORT = process.env.PORT || 8787;
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || 'https://cifcoelho.github.io';
const KEEPALIVE_URL = process.env.KEEPALIVE_URL || '';
const KEEPALIVE_ENABLED = (process.env.KEEPALIVE_ENABLED || 'true') !== 'false';

// Guard rails: fail fast if secrets are missing
if (!NOTION_TOKEN || !DATABASE_ID) {
  console.error('❌ Missing NOTION_TOKEN or ACABAMENTO_DB_ID in environment.');
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
    const resp = await fetch(`https://api.notion.com/v1/databases/${DATABASE_ID}`, { headers });
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
      await handleStart(data);
    } else if (data.acao === 'end') {
      await handleEnd(data);
    } else if (data.acao === 'cancel') {
      await handleCancel(data);
    } else if (data.acao === 'finishIncomplete') {
      await handleFinishIncomplete(data);
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
    let start_cursor = undefined;
    const sessions = [];
    do {
      const query = {
        filter: { property: 'Final do Turno', date: { is_empty: true } },
        sorts: [{ property: 'Início do Turno', direction: 'ascending' }],
        page_size: 100,
        ...(start_cursor ? { start_cursor } : {})
      };
      const resp = await fetch(`https://api.notion.com/v1/databases/${DATABASE_ID}/query`, {
        method: 'POST', headers, body: JSON.stringify(query)
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

    res.json({ ok: true, sessions });
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e.message || e) });
  }
});

// --- helpers ---

function hhmmToTodayISO(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  const now = new Date();
  const dt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
  return dt.toISOString();
}

async function handleStart(data) {
  const startISO = hhmmToTodayISO(data.hora);

  const payload = {
    parent: { database_id: DATABASE_ID },
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

async function handleEnd(data) {
  // Find most recent open record by this Colaborador (and optionally OF)
  const query = {
    filter: {
      and: [
        { property: 'Colaborador', title: { equals: data.funcionario } },
        { property: 'Final do Turno', date: { is_empty: true } }
      ]
    },
    sorts: [{ property: 'Início do Turno', direction: 'descending' }],
    page_size: 1
  };

  const resp = await fetch(`https://api.notion.com/v1/databases/${DATABASE_ID}/query`, {
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

  const page = json.results[0];
  const requestedEndISO = hhmmToTodayISO(data.hora);
  const requestedEndDate = new Date(requestedEndISO);

  const startProp = page.properties?.['Início do Turno']?.date?.start;
  const startDate = startProp ? new Date(startProp) : null;

  let appliedEndDate = requestedEndDate;
  let noteToAppend = null;

  if (startDate) {
    const breakStart = new Date(startDate);
    breakStart.setHours(10, 0, 0, 0);
    const breakEnd = new Date(startDate);
    breakEnd.setHours(10, 10, 0, 0);

    const coversBreak = startDate <= breakStart && requestedEndDate >= breakEnd;

    if (coversBreak) {
      const adjusted = new Date(requestedEndDate.getTime() - 10 * 60_000);
      if (adjusted > startDate) {
        appliedEndDate = adjusted;
        noteToAppend = 'Ajuste automático: pausa manhã (−10 min)';
      }
    }
  }

  const properties = {
    'Final do Turno': { date: { start: appliedEndDate.toISOString() } }
  };

  if (noteToAppend) {
    const existingNotes = (page.properties?.['Notas do Sistema']?.rich_text || [])
      .map((r) => r.plain_text || (r.text && r.text.content) || '')
      .join(' ')
      .trim();
    const combinedNotes = existingNotes ? `${existingNotes} | ${noteToAppend}` : noteToAppend;
    properties['Notas do Sistema'] = { rich_text: [{ text: { content: combinedNotes } }] };
  }

  const payload = { properties };

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

async function handleCancel(data) {
  const endISO = hhmmToTodayISO(data.hora);

  const query = {
    filter: {
      and: [
        { property: 'Colaborador', title: { equals: data.funcionario } },
        { property: 'Final do Turno', date: { is_empty: true } }
      ]
    },
    sorts: [{ property: 'Início do Turno', direction: 'descending' }],
    page_size: 1
  };

  const resp = await fetch(`https://api.notion.com/v1/databases/${DATABASE_ID}/query`, {
    method: 'POST',
    headers,
    body: JSON.stringify(query)
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Notion query failed (${resp.status}): ${text}`);
  }
  const json = await resp.json();
  if (!json.results || !json.results.length) return;

  const page = json.results[0];
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

async function handleFinishIncomplete(data) {
  if (!data.tipo || !data.iniciou || typeof data.minutosRestantes === 'undefined') {
    throw new Error('Dados incompletos');
  }
  if (String(data.iniciou).trim() === String(data.funcionario).trim()) {
    throw new Error('Escolha outro colaborador');
  }

  // Find the most recent open record for this collaborator
  const query = {
    filter: {
      and: [
        { property: 'Colaborador', title: { equals: data.funcionario } },
        { property: 'Final do Turno', date: { is_empty: true } }
      ]
    },
    sorts: [{ property: 'Início do Turno', direction: 'descending' }],
    page_size: 1
  };

  const resp = await fetch(`https://api.notion.com/v1/databases/${DATABASE_ID}/query`, {
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

  const page = json.results[0];

  // Get current start time, adjust forward by minutosRestantes (subtract from shift)
  const startProp = page.properties?.['Início do Turno']?.date?.start;
  if (!startProp) throw new Error('Início do Turno não encontrado');
  const startDate = new Date(startProp);
  const minutes = Math.max(0, Number(data.minutosRestantes) || 0);
  const adjustedStartISO = new Date(startDate.getTime() + minutes * 60_000).toISOString();

  // Combine notes
  const tipo = String(data.tipo).trim();
  const newNote = `Terminou ${tipo} iniciado por ${data.iniciou} durante ${minutes} min`;
  const existingNotes = (page.properties?.['Notas do Sistema']?.rich_text || [])
    .map((r) => r.plain_text || (r.text && r.text.content) || '')
    .join(' ')
    .trim();
  const combinedNotes = existingNotes ? `${existingNotes} | ${newNote}` : newNote;

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
