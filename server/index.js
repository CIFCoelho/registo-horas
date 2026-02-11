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
const PREPARACAO_MADEIRAS_DB_ID =
  process.env.PREPARACAO_MADEIRAS_DB_ID ||
  process.env.PREPARACAO_DB_ID ||
  null;
const MONTAGEM_DB_ID = process.env.MONTAGEM_DB_ID;
const CUSTO_FUNCIONARIOS_DB_ID = process.env.CUSTO_FUNCIONARIOS_DB_ID;
const OFS_DB_ID = process.env.OFS_DB_ID;
const PINTURA_ISOLANTE_PROP = process.env.PINTURA_ISOLANTE_PROP || 'Isolante Aplicado';
const PINTURA_TAPA_PROP = process.env.PINTURA_TAPA_PROP || 'Tapa-Poros';
const PINTURA_VERNIZ_PROP = process.env.PINTURA_VERNIZ_PROP || 'Verniz Aplicado';
const PINTURA_AQUEC_PROP = process.env.PINTURA_AQUEC_PROP || 'Utilização do Aquecimento';
const DASHBOARD_USER = process.env.DASHBOARD_USER || '';
const DASHBOARD_PASS = process.env.DASHBOARD_PASS || '';
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
  montagem: MONTAGEM_DB_ID,
  custoFuncionarios: CUSTO_FUNCIONARIOS_DB_ID,
  ofs: OFS_DB_ID
};

const ESTOFAGEM_REGISTOS_PROPS = {
  title: process.env.ESTOFAGEM_REGISTOS_TITLE_PROP || 'Funcionário',
  data: process.env.ESTOFAGEM_REGISTOS_DATA_PROP || 'Data',
  of: process.env.ESTOFAGEM_REGISTOS_OF_PROP || 'Ordem de Fabrico',
  cru: process.env.ESTOFAGEM_REGISTOS_CRU_PROP || 'Cru:',
  tp: process.env.ESTOFAGEM_REGISTOS_TP_PROP || 'TP:'
};

// Property name aliases for flexible matching (handles workspace migration variations)
const PROPERTY_ALIASES = {
  funcionario: ['Funcionário', 'Colaborador', 'funcionario', 'colaborador'],
  of: ['Ordem de Fabrico', 'OF', 'Ordem De Fabrico', 'ordem de fabrico'],
  inicioTurno: ['Início do Turno', 'Inicio do Turno', 'Início Do Turno', 'Inicio Do Turno', 'inicio do turno'],
  finalTurno: ['Final do Turno', 'Fim do Turno', 'Final Do Turno', 'Fim Do Turno', 'final do turno', 'fim do turno'],
  notas: ['Notas do Sistema', 'Notas Do Sistema', 'notas do sistema', 'Notas']
};

const PINTURA_PROP_ALIASES = {
  isolante: [PINTURA_ISOLANTE_PROP, 'Isolante Aplicado (Nº)', 'Isolante Aplicado Nº'],
  tapaPoros: [PINTURA_TAPA_PROP, 'Tapa-Poros Aplicado Nº', 'Tapa Poros Aplicado (Nº)', 'Tapa poros aplicado'],
  verniz: [PINTURA_VERNIZ_PROP, 'Verniz Aplicado (Nº)', 'Verniz Aplicado Nº', 'Verniz'],
  aquecimento: [PINTURA_AQUEC_PROP, 'Aquecimento - Nº de Horas', 'Aquecimento Nº Horas', 'Aquecimento Horas']
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

async function notionFetch(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  try {
    const resp = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return resp;
  } catch (e) {
    clearTimeout(timeoutId);
    if (e.name === 'AbortError') {
      throw new Error(`Notion request timed out after 8s: ${url.substring(0, 80)}`);
    }
    throw e;
  }
}

async function batchQueries(queries, batchSize = 2) {
  const results = [];
  for (let i = 0; i < queries.length; i += batchSize) {
    const batch = queries.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(fn => fn()));
    results.push(...batchResults);
  }
  return results;
}

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
    const resp = await notionFetch(`https://api.notion.com/v1/databases/${targetDb}`, { headers });
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
    const resp = await notionFetch('https://api.notion.com/v1/users/me', { headers });
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
  const hasDb = !!dbId;
  if (!hasDb) {
    console.warn(`⚠️  Config missing for ${route} (${label || 'sem nome'}). Requests will return 503.`);
  }

  app.post(route, async (req, res) => {
    try {
      if (!hasDb) throw new Error('Base de dados não configurada para esta secção.');
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
      const status = hasDb ? 400 : 503;
      console.error(err);
      res.status(status).json({ ok: false, error: String(err.message || err) });
    }
  });

  app.get(`${route}/open`, async (req, res) => {
    try {
      if (!hasDb) throw new Error('Base de dados não configurada para esta secção.');
      const sessions = await listOpenShifts(dbId);
      res.json({ ok: true, sessions });
    } catch (e) {
      const status = hasDb ? 400 : 503;
      res.status(status).json({ ok: false, error: String(e.message || e) });
    }
  });

  console.log(`📌 Basic shift section ready: ${label || route} (${route})`);
}

// --- Text-based OF Helper Functions (for Preparação de Madeiras multi-OF support) ---

async function createShiftStartTextOF(dbId, data) {
  const startISO = hhmmToTodayISO(data.hora);

  // Keep OF as text (supports comma-separated values like "123, 456, 789")
  const ofText = data.of !== null && data.of !== undefined ? String(data.of) : '0';

  const payload = {
    parent: { database_id: dbId },
    properties: {
      'Funcionário': { title: [{ text: { content: data.funcionario } }] },
      'Ordem de Fabrico': { rich_text: [{ text: { content: ofText } }] },
      'Início do Turno': { date: { start: startISO } }
    }
  };

  const resp = await notionFetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Notion create failed (${resp.status}): ${text}`);
  }
}

async function findOpenShiftPageTextOF(dbId, funcionario, ofText) {
  // Try multiple property name variations (handles workspace migration)
  const funcionarioVariations = PROPERTY_ALIASES.funcionario;
  const finalTurnoVariations = PROPERTY_ALIASES.finalTurno;
  const inicioTurnoVariations = PROPERTY_ALIASES.inicioTurno;
  const ofVariations = PROPERTY_ALIASES.of;

  // Try each combination until one works
  for (const funcProp of funcionarioVariations) {
    for (const finalProp of finalTurnoVariations) {
      for (const inicioProp of inicioTurnoVariations) {
        for (const ofProp of ofVariations) {
          try {
            const filters = [
              { property: funcProp, title: { equals: funcionario } },
              { property: finalProp, date: { is_empty: true } }
            ];

            // If OF text provided, filter by it (text comparison instead of number)
            if (ofText !== null && ofText !== undefined) {
              filters.push({ property: ofProp, rich_text: { equals: String(ofText) } });
            }

            const query = {
              filter: { and: filters },
              sorts: [{ property: inicioProp, direction: 'descending' }],
              page_size: 1
            };

            const resp = await notionFetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
              method: 'POST',
              headers,
              body: JSON.stringify(query)
            });

            if (resp.ok) {
              const json = await resp.json();
              if (json.results && json.results.length) {
                console.log(`✓ Found shift (text OF) using properties: Funcionário="${funcProp}", Final="${finalProp}"`);
                return json.results[0];
              }
            }
          } catch (e) {
            // Try next variation
            continue;
          }
        }
      }
    }
  }

  const ofMsg = ofText ? ` para OF ${ofText}` : '';
  console.warn(`⚠️  Nenhum turno aberto encontrado para ${funcionario}${ofMsg}`);
  console.warn(`   Tentei todas as variações de propriedades: ${funcionarioVariations.join(', ')}`);
  throw new Error('Nenhum turno aberto encontrado');
}

async function closeShiftEntryTextOF(dbId, data) {
  // Keep OF as text for multi-OF support
  const ofText = data.of !== null && data.of !== undefined ? String(data.of) : null;
  const page = await findOpenShiftPageTextOF(dbId, data.funcionario, ofText);
  const requestedEndISO = hhmmToTodayISO(data.hora);
  const requestedEndDate = new Date(requestedEndISO);

  // Flexible property name resolution (handles workspace migration)
  const inicioTurnoProp = resolveProperty(page, 'inicioTurno');
  const finalTurnoProp = resolveProperty(page, 'finalTurno');
  const notasProp = resolveProperty(page, 'notas');
  const notasType = getPropertyType(page, notasProp);

  const startProp = page.properties?.[inicioTurnoProp]?.date?.start;
  const startDate = startProp ? new Date(startProp) : null;

  const adjustment = computeBreakAdjustment(startDate, requestedEndDate);

  const properties = {
    [finalTurnoProp]: { date: { start: adjustment.endDate.toISOString() } }
  };

  // Only add notes if property is rich_text (some databases use select instead)
  if (adjustment.note && notasType === 'rich_text') {
    const combinedNotes = combineNotes(page.properties?.[notasProp]?.rich_text, adjustment.note);
    properties[notasProp] = { rich_text: [{ text: { content: combinedNotes } }] };
  } else if (adjustment.note && notasType !== 'rich_text') {
    console.warn(`⚠️  Cannot write note: "${notasProp}" is type "${notasType}", expected "rich_text". Skipping note.`);
  }

  console.log(`📝 Closing shift (text OF) for ${data.funcionario} using properties: Início=${inicioTurnoProp}, Final=${finalTurnoProp}`);

  const resp2 = await notionFetch(`https://api.notion.com/v1/pages/${page.id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ properties })
  });
  if (!resp2.ok) {
    const text = await resp2.text();
    throw new Error(`Notion update failed (${resp2.status}): ${text}`);
  }
}

async function cancelShiftEntryTextOF(dbId, data) {
  const endISO = hhmmToTodayISO(data.hora);
  // Keep OF as text for multi-OF support
  const ofText = data.of !== null && data.of !== undefined ? String(data.of) : null;
  const page = await findOpenShiftPageTextOF(dbId, data.funcionario, ofText);

  // Flexible property name resolution
  const finalTurnoProp = resolveProperty(page, 'finalTurno');
  const notasProp = resolveProperty(page, 'notas');
  const notasType = getPropertyType(page, notasProp);

  const properties = {
    [finalTurnoProp]: { date: { start: endISO } }
  };

  // Only add notes if property is rich_text (some databases use select instead)
  if (notasType === 'rich_text') {
    properties[notasProp] = {
      rich_text: [{ text: { content: 'Turno cancelado manualmente' } }]
    };
  } else {
    console.warn(`⚠️  Cannot write cancellation note: "${notasProp}" is type "${notasType}", expected "rich_text". Skipping note.`);
  }

  console.log(`🚫 Cancelling shift (text OF) for ${data.funcionario} using property: Final=${finalTurnoProp}`);

  const resp2 = await notionFetch(`https://api.notion.com/v1/pages/${page.id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ properties })
  });
  if (!resp2.ok) {
    const text = await resp2.text();
    throw new Error(`Notion update failed (${resp2.status}): ${text}`);
  }
}

async function listOpenShiftsTextOF(dbId) {
  let start_cursor = undefined;
  const sessions = [];
  do {
    const query = {
      filter: { property: 'Final do Turno', date: { is_empty: true } },
      sorts: [{ property: 'Início do Turno', direction: 'ascending' }],
      page_size: 100,
      ...(start_cursor ? { start_cursor } : {})
    };

    const resp = await notionFetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
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
      const name = (page.properties?.['Funcionário']?.title?.[0]?.plain_text || '').trim();
      // Read OF as rich_text instead of number
      const ofText = page.properties?.['Ordem de Fabrico']?.rich_text?.[0]?.plain_text || '0';
      const start = page.properties?.['Início do Turno']?.date?.start || null;
      if (name) sessions.push({ funcionario: name, of: ofText, start, id: page.id });
    }
    start_cursor = json.has_more ? json.next_cursor : undefined;
  } while (start_cursor);

  return sessions;
}

// Special handler for Preparação de Madeiras section (supports multi-OF with text property)
function registerPreparacaoSection() {
  const dbId = PREPARACAO_MADEIRAS_DB_ID;
  const hasDb = !!dbId;
  const route = '/preparacao';
  const label = 'Preparação de Madeiras';

  if (!hasDb) {
    console.warn(`⚠️  Config missing for ${route} (${label}). Requests will return 503.`);
  }

  app.post(route, async (req, res) => {
    try {
      if (!hasDb) throw new Error('Base de dados não configurada para esta secção.');
      const raw = req.body?.data;
      if (!raw) throw new Error('Missing data');
      const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!data.acao || !data.funcionario) throw new Error('Dados incompletos');

      console.log(`[REQ] ${route} ->`, data);

      if (data.acao === 'start') {
        await createShiftStartTextOF(dbId, data);
      } else if (data.acao === 'end') {
        await closeShiftEntryTextOF(dbId, data);
      } else if (data.acao === 'cancel') {
        await cancelShiftEntryTextOF(dbId, data);
      } else {
        throw new Error('Ação inválida');
      }

      res.json({ ok: true });
    } catch (err) {
      const status = hasDb ? 400 : 503;
      console.error(err);
      res.status(status).json({ ok: false, error: String(err.message || err) });
    }
  });

  app.get(`${route}/open`, async (req, res) => {
    try {
      if (!hasDb) throw new Error('Base de dados não configurada para esta secção.');
      const sessions = await listOpenShiftsTextOF(dbId);
      res.json({ ok: true, sessions });
    } catch (e) {
      const status = hasDb ? 400 : 503;
      res.status(status).json({ ok: false, error: String(e.message || e) });
    }
  });

  console.log(`📌 Preparação de Madeiras section ready (multi-OF support): ${route}`);
}

registerBasicShiftSection('/costura', COSTURA_DB_ID, 'Costura');
registerBasicShiftSection('/pintura', PINTURA_DB_ID, 'Pintura', {
  onRegister: async (data) => {
    await registerPinturaQuantities(PINTURA_DB_ID, data);
  }
});
registerPreparacaoSection(); // Uses text-based OF property for multi-OF support
registerBasicShiftSection('/montagem', MONTAGEM_DB_ID, 'Montagem');

// --- Dashboard API ---

// Helper to fetch all pages with pagination
async function fetchAllPages(dbId, filter) {
  let results = [];
  let hasMore = true;
  let startCursor = undefined;

  while (hasMore) {
    const payload = {
      page_size: 100,
      filter: filter,
      ...(startCursor && { start_cursor: startCursor }),
    };

    const response = await notionFetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Notion query failed: ${text}`);
    }

    const data = await response.json();
    results = [...results, ...data.results];
    hasMore = data.has_more;
    startCursor = data.next_cursor;
  }
  return results;
}

// Dashboard Login — validates credentials from environment variables
app.post('/api/dashboard/login', (req, res) => {
  const startTime = Date.now();
  const { user, pass } = req.body || {};
  if (!DASHBOARD_USER || !DASHBOARD_PASS) {
    res.status(503).json({ ok: false, error: 'Dashboard credentials not configured on server.' });
    console.log(`[dashboard/login] completed in ${Date.now() - startTime}ms`);
    return;
  }
  if (user === DASHBOARD_USER && pass === DASHBOARD_PASS) {
    res.json({ ok: true });
    console.log(`[dashboard/login] completed in ${Date.now() - startTime}ms`);
    return;
  }
  res.status(401).json({ ok: false, error: 'Invalid credentials.' });
  console.log(`[dashboard/login] completed in ${Date.now() - startTime}ms`);
});

// 1. Dashboard Summary
app.get('/api/dashboard/summary', async (req, res) => {
  const startTime = Date.now();
  try {
    const queries = [
      () => listOpenShifts(ACABAMENTO_DB_ID).catch(() => []),
      () => listOpenShifts(ESTOFAGEM_TEMPO_DB_ID).catch(() => []),
      () => PINTURA_DB_ID ? listOpenShifts(PINTURA_DB_ID).catch(() => []) : Promise.resolve([]),
      () => PREPARACAO_MADEIRAS_DB_ID ? listOpenShiftsTextOF(PREPARACAO_MADEIRAS_DB_ID).catch(() => []) : Promise.resolve([]),
      () => MONTAGEM_DB_ID ? listOpenShifts(MONTAGEM_DB_ID).catch(() => []) : Promise.resolve([])
    ];

    const [activeAcabamento, activeEstofagem, activePintura, activePreparacao, activeMontagem] = await batchQueries(queries, 2);

    // Fetch latest OF from Estofagem
    let latestEstofagemOF = null;
    try {
      const latestResp = await notionFetch(`https://api.notion.com/v1/databases/${ESTOFAGEM_TEMPO_DB_ID}/query`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sorts: [{ property: 'Início do Turno', direction: 'descending' }],
          page_size: 1,
          filter: { property: 'Final do Turno', date: { is_not_empty: true } }
        })
      });
      if (latestResp.ok) {
        const latestJson = await latestResp.json();
        const page = latestJson.results?.[0];
        if (page) {
          latestEstofagemOF = page.properties?.['Ordem de Fabrico']?.number || null;
        }
      }
    } catch (e) {
      console.warn('Failed to get latest Estofagem OF:', e.message);
    }

    res.json({
      ok: true,
      activeWorkers: {
        acabamento: activeAcabamento,
        estofagem: activeEstofagem,
        pintura: activePintura,
        preparacao: activePreparacao,
        montagem: activeMontagem
      },
      latestEstofagemOF
    });
    console.log(`[dashboard/summary] completed in ${Date.now() - startTime}ms`);
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// 2. Employee Performance (Yearly/Monthly)
app.get('/api/dashboard/employees', async (req, res) => {
  const startTime = Date.now();
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const startOfYear = new Date(year, 0, 1).toISOString();
    const endOfYear = new Date(year + 1, 0, 1).toISOString();

    const dateFilter = {
      and: [
        { property: 'Data', date: { on_or_after: startOfYear } },
        { property: 'Data', date: { before: endOfYear } }
      ]
    };

    // For shifts, we filter by 'Início do Turno'
    const shiftFilter = {
      and: [
        { property: 'Início do Turno', date: { on_or_after: startOfYear } },
        { property: 'Início do Turno', date: { before: endOfYear } },
        { property: 'Final do Turno', date: { is_not_empty: true } } // Completed shifts only
      ]
    };

    const [acabamentoShifts, estofagemShifts, units] = await Promise.all([
      fetchAllPages(ACABAMENTO_DB_ID, shiftFilter),
      fetchAllPages(ESTOFAGEM_TEMPO_DB_ID, shiftFilter),
      fetchAllPages(ESTOFAGEM_ACABAMENTOS_DB_ID, dateFilter) // Units often use 'Data'
    ]);

    const fetchSafe = async (dbId, f) => {
      if (!dbId) return [];
      try { return await fetchAllPages(dbId, f); } catch (e) {
        console.warn('[dashboard/employees] failed:', e.message);
        return [];
      }
    };

    const [pinturaShifts, preparacaoShifts, montagemShifts] = await Promise.all([
      fetchSafe(PINTURA_DB_ID, shiftFilter),
      fetchSafe(PREPARACAO_MADEIRAS_DB_ID, shiftFilter),
      fetchSafe(MONTAGEM_DB_ID, shiftFilter)
    ]);

    // Process data into summary stats
    const employeeStats = {};

    const processShift = (page, section) => {
      const name = page.properties?.['Funcionário']?.title?.[0]?.plain_text?.trim();
      if (!name) return;

      const start = new Date(page.properties?.['Início do Turno']?.date?.start);
      const end = new Date(page.properties?.['Final do Turno']?.date?.start);
      const hours = (end - start) / (1000 * 60 * 60);

      if (!employeeStats[name]) employeeStats[name] = { name, hours: 0, units: 0, cost: 0, section: {} };
      employeeStats[name].hours += hours;
      employeeStats[name].section[section] = (employeeStats[name].section[section] || 0) + hours;
    };

    acabamentoShifts.forEach(p => processShift(p, 'Acabamento'));
    estofagemShifts.forEach(p => processShift(p, 'Estofagem'));
    pinturaShifts.forEach(p => processShift(p, 'Pintura'));
    preparacaoShifts.forEach(p => processShift(p, 'Preparação'));
    montagemShifts.forEach(p => processShift(p, 'Montagem'));

    units.forEach(page => {
      const cru = page.properties?.['Cru Por:']?.rich_text?.[0]?.plain_text || '';
      const tp = page.properties?.['TP por:']?.rich_text?.[0]?.plain_text || '';

      // Split comma separated names
      const creditUnit = (field) => {
        if (!field) return;
        field.split(',').forEach(rawName => {
          const name = rawName.trim();
          if (!name) return;
          if (!employeeStats[name]) employeeStats[name] = {
            name, hours: 0, units: 0,
            unitsAcabamento: 0, unitsEstofagem: 0,
            cost: 0, section: {}
          };
          employeeStats[name].units += 1;

          // Credit to section based on where the employee primarily works (or has hours)
          if (employeeStats[name].section?.['Acabamento'] > 0) {
            employeeStats[name].unitsAcabamento += 1;
          }
          if (employeeStats[name].section?.['Estofagem'] > 0) {
            employeeStats[name].unitsEstofagem += 1;
          }
        });
      };

      creditUnit(cru);
      creditUnit(tp);
    });

    // Calculate monthly breakdown for trend charts
    const monthlyStats = Array(12).fill(null).map(() => ({ hours: 0, units: 0 }));

    const processMonthlyShift = (page) => {
      const start = page.properties?.['Início do Turno']?.date?.start;
      const end = page.properties?.['Final do Turno']?.date?.start;
      if (!start || !end) return;

      const month = new Date(start).getMonth();
      const hours = (new Date(end) - new Date(start)) / (1000 * 60 * 60);
      monthlyStats[month].hours += hours;
    };

    acabamentoShifts.forEach(processMonthlyShift);
    estofagemShifts.forEach(processMonthlyShift);
    pinturaShifts.forEach(processMonthlyShift);
    preparacaoShifts.forEach(processMonthlyShift);
    montagemShifts.forEach(processMonthlyShift);

    // Add units per month
    units.forEach(page => {
      const dataDate = page.properties?.['Data']?.date?.start;
      if (!dataDate) return;
      const month = new Date(dataDate).getMonth();
      // Count each record as units (Cru + TP entries)
      // Count 1 unit per record (Estofagem Acabamentos DB represents units produced)
      monthlyStats[month].units += 1;
    });

    res.json({
      ok: true,
      data: Object.values(employeeStats),
      monthly: monthlyStats
    });
    console.log(`[dashboard/employees] completed in ${Date.now() - startTime}ms`);
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// 3. OF Performance
app.get('/api/dashboard/ofs', async (req, res) => {
  const startTime = Date.now();
  try {
    // Ideally we filter by status, but for now lets fetch recent ones
    // Or fetch all from current year
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const startOfYear = new Date(year, 0, 1).toISOString();
    const endOfYear = new Date(year + 1, 0, 1).toISOString();

    const filter = {
      and: [
        { property: 'Início do Turno', date: { on_or_after: startOfYear } },
        { property: 'Início do Turno', date: { before: endOfYear } }
      ]
    };

    const [acabamentoShifts, estofagemShifts] = await Promise.all([
      fetchAllPages(ACABAMENTO_DB_ID, filter),
      fetchAllPages(ESTOFAGEM_TEMPO_DB_ID, filter)
    ]);

    const fetchSafe = async (dbId, f) => {
      if (!dbId) return [];
      try { return await fetchAllPages(dbId, f); } catch (e) {
        console.warn('[dashboard/ofs] failed:', e.message);
        return [];
      }
    };

    const [pinturaShifts, montagemShifts, preparacaoShifts] = await Promise.all([
      fetchSafe(PINTURA_DB_ID, filter),
      fetchSafe(MONTAGEM_DB_ID, filter),
      fetchSafe(PREPARACAO_MADEIRAS_DB_ID, filter)
    ]);

    const ofStats = {};

    const ensureOf = (of) => {
      if (!ofStats[of]) ofStats[of] = {
        of, totalHours: 0,
        acabamentoHours: 0, estofagemHours: 0,
        pinturaHours: 0, preparacaoHours: 0, montagemHours: 0
      };
    };

    const processShift = (page, section) => {
      const of = page.properties?.['Ordem de Fabrico']?.number;
      if (!of && of !== 0) return; // Skip if no OF

      const start = page.properties?.['Início do Turno']?.date?.start;
      const end = page.properties?.['Final do Turno']?.date?.start;

      let duration = 0;
      if (start && end) {
        duration = (new Date(end) - new Date(start)) / (1000 * 60 * 60);
      }

      ensureOf(of);
      ofStats[of].totalHours += duration;
      if (section === 'acabamento') ofStats[of].acabamentoHours += duration;
      if (section === 'estofagem') ofStats[of].estofagemHours += duration;
      if (section === 'pintura') ofStats[of].pinturaHours += duration;
      if (section === 'montagem') ofStats[of].montagemHours += duration;
    };

    acabamentoShifts.forEach(p => processShift(p, 'acabamento'));
    estofagemShifts.forEach(p => processShift(p, 'estofagem'));
    pinturaShifts.forEach(p => processShift(p, 'pintura'));
    montagemShifts.forEach(p => processShift(p, 'montagem'));

    // Preparação: OF is rich_text and may contain multiple OFs ("123, 456")
    preparacaoShifts.forEach(page => {
      const ofText = page.properties?.['Ordem de Fabrico']?.rich_text?.[0]?.plain_text || '';
      if (!ofText) return;

      const start = page.properties?.['Início do Turno']?.date?.start;
      const end = page.properties?.['Final do Turno']?.date?.start;

      let duration = 0;
      if (start && end) {
        duration = (new Date(end) - new Date(start)) / (1000 * 60 * 60);
      }

      // Split by comma and credit full hours to each OF
      const ofNumbers = ofText.split(',')
        .map(s => parseInt(s.trim(), 10))
        .filter(n => !isNaN(n));

      const splitDuration = ofNumbers.length > 0 ? duration / ofNumbers.length : duration;

      ofNumbers.forEach(of => {
        ensureOf(of);
        ofStats[of].totalHours += splitDuration;
        ofStats[of].preparacaoHours += splitDuration;
      });
    });

    res.json({ ok: true, data: Object.values(ofStats).sort((a, b) => b.of - a.of) });
    console.log(`[dashboard/ofs] completed in ${Date.now() - startTime}ms`);
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// 4. Employee Costs Management
app.get('/api/dashboard/costs', async (req, res) => {
  const startTime = Date.now();
  try {
    if (!CUSTO_FUNCIONARIOS_DB_ID) throw new Error('CUSTO_FUNCIONARIOS_DB_ID not configured');
    const pages = await fetchAllPages(CUSTO_FUNCIONARIOS_DB_ID, undefined);

    const costs = pages.map(p => ({
      id: p.id,
      name: p.properties?.['Funcionário']?.title?.[0]?.plain_text || 'Sem Nome',
      cost: p.properties?.['Custo do Funcionário (€/h)']?.number || 0
    }));

    res.json({ ok: true, data: costs });
    console.log(`[dashboard/costs] completed in ${Date.now() - startTime}ms`);
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

app.post('/api/dashboard/employee-cost', async (req, res) => {
  const startTime = Date.now();
  try {
    if (!CUSTO_FUNCIONARIOS_DB_ID) throw new Error('CUSTO_FUNCIONARIOS_DB_ID not configured');
    const { name, cost, id } = req.body;

    if (id) {
      // Update
      await notionFetch(`https://api.notion.com/v1/pages/${id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          properties: {
            'Custo do Funcionário (€/h)': { number: Number(cost) }
          }
        })
      });
    } else {
      // Create
      await notionFetch('https://api.notion.com/v1/pages', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          parent: { database_id: CUSTO_FUNCIONARIOS_DB_ID },
          properties: {
            'Funcionário': { title: [{ text: { content: name } }] },
            'Custo do Funcionário (€/h)': { number: Number(cost) }
          }
        })
      });
    }
    res.json({ ok: true });
    console.log(`[dashboard/employee-cost] completed in ${Date.now() - startTime}ms`);
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// 5. Detailed OF View
app.get('/api/dashboard/of/:ofNumber', async (req, res) => {
  const startTime = Date.now();
  try {
    const ofNumber = parseInt(req.params.ofNumber);
    if (isNaN(ofNumber)) throw new Error('Invalid OF Number');

    // Filter by OF Number
    const filter = {
      property: 'Ordem de Fabrico',
      number: { equals: ofNumber }
    };

    const [acabamentoShifts, estofagemShifts, units] = await Promise.all([
      fetchAllPages(ACABAMENTO_DB_ID, filter),
      fetchAllPages(ESTOFAGEM_TEMPO_DB_ID, filter),
      fetchAllPages(ESTOFAGEM_ACABAMENTOS_DB_ID, filter)
    ]);

    const fetchSafe = async (dbId, f) => {
      if (!dbId) return [];
      try { return await fetchAllPages(dbId, f); } catch (e) {
        console.warn('[dashboard/of] failed:', e.message);
        return [];
      }
    };

    // Preparação uses rich_text for OF, so needs a different filter
    const preparacaoFilter = {
      property: 'Ordem de Fabrico',
      rich_text: { contains: String(ofNumber) }
    };

    const [pinturaShifts, montagemShifts, preparacaoShifts] = await Promise.all([
      fetchSafe(PINTURA_DB_ID, filter),
      fetchSafe(MONTAGEM_DB_ID, filter),
      fetchSafe(PREPARACAO_MADEIRAS_DB_ID, preparacaoFilter)
    ]);

    const mapShift = (p) => ({
      id: p.id,
      funcionario: p.properties?.['Funcionário']?.title?.[0]?.plain_text,
      start: p.properties?.['Início do Turno']?.date?.start,
      end: p.properties?.['Final do Turno']?.date?.start,
    });

    res.json({
      ok: true,
      data: {
        of: ofNumber,
        acabamento: acabamentoShifts.map(mapShift),
        estofagem: estofagemShifts.map(mapShift),
        pintura: pinturaShifts.map(mapShift),
        preparacao: preparacaoShifts.map(mapShift),
        montagem: montagemShifts.map(mapShift),
        units: units.map(p => ({
          id: p.id,
          cru: p.properties?.['Cru Por:']?.rich_text?.[0]?.plain_text,
          tp: p.properties?.['TP por:']?.rich_text?.[0]?.plain_text,
          date: p.properties?.['Data']?.date?.start
        }))
      }
    });
    console.log(`[dashboard/of] completed in ${Date.now() - startTime}ms`);

  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// 6. Detailed Employee View
app.get('/api/dashboard/employee/:name', async (req, res) => {
  const startTime = Date.now();
  try {
    const name = req.params.name;
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const startOfYear = new Date(year, 0, 1).toISOString();
    const endOfYear = new Date(year + 1, 0, 1).toISOString();

    const filter = {
      and: [
        { property: 'Funcionário', title: { equals: name } },
        { property: 'Início do Turno', date: { on_or_after: startOfYear } },
        { property: 'Início do Turno', date: { before: endOfYear } }
      ]
    };

    // Note: Units database structure usually has 'Cru Por:' and 'TP por:' as rich text with multiple names
    // Filtering by exact match on those fields is hard with Notion API if they are comma separated string.
    // For now we will return shift data which is the most reliable "Work History".
    // Pulling all unit records just for one employee might be expensive if we can't filter server side easily.
    // We'll skip unit details for this specific endpoint for now, or fetch all and filter (expensive).
    // Let's stick to Shift History.

    const [acabamentoShifts, estofagemShifts] = await Promise.all([
      fetchAllPages(ACABAMENTO_DB_ID, filter),
      fetchAllPages(ESTOFAGEM_TEMPO_DB_ID, filter)
    ]);

    const fetchSafe = async (dbId, f) => {
      if (!dbId) return [];
      try { return await fetchAllPages(dbId, f); } catch (e) {
        console.warn('[dashboard/employee] failed:', e.message);
        return [];
      }
    };

    const [pinturaShifts, preparacaoShifts, montagemShifts] = await Promise.all([
      fetchSafe(PINTURA_DB_ID, filter),
      fetchSafe(PREPARACAO_MADEIRAS_DB_ID, filter),
      fetchSafe(MONTAGEM_DB_ID, filter)
    ]);

    const formatShift = (p, section) => ({
      id: p.id,
      of: p.properties?.['Ordem de Fabrico']?.number,
      start: p.properties?.['Início do Turno']?.date?.start,
      end: p.properties?.['Final do Turno']?.date?.start,
      section
    });

    const formatShiftTextOF = (p, section) => ({
      id: p.id,
      of: p.properties?.['Ordem de Fabrico']?.rich_text?.[0]?.plain_text || null,
      start: p.properties?.['Início do Turno']?.date?.start,
      end: p.properties?.['Final do Turno']?.date?.start,
      section
    });

    const shiftHistory = [
      ...acabamentoShifts.map(p => formatShift(p, 'Acabamento')),
      ...estofagemShifts.map(p => formatShift(p, 'Estofagem')),
      ...pinturaShifts.map(p => formatShift(p, 'Pintura')),
      ...preparacaoShifts.map(p => formatShiftTextOF(p, 'Preparação')),
      ...montagemShifts.map(p => formatShift(p, 'Montagem'))
    ].sort((a, b) => new Date(b.start) - new Date(a.start));

    res.json({
      ok: true,
      data: {
        name,
        history: shiftHistory
      }
    });
    console.log(`[dashboard/employee] completed in ${Date.now() - startTime}ms`);

  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

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

    const resp = await notionFetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
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
      const name = (page.properties?.['Funcionário']?.title?.[0]?.plain_text || '').trim();
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

    const resp = await notionFetch(`https://api.notion.com/v1/databases/${ACABAMENTO_DB_ID}/query`, {
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
      const name = (page.properties?.['Funcionário']?.title?.[0]?.plain_text || '').trim();
      if (name) names.add(name);
    }
    start_cursor = json.has_more ? json.next_cursor : undefined;
  } while (start_cursor);

  return Array.from(names).sort((a, b) => a.localeCompare(b, 'pt-PT'));
}

async function createShiftStart(dbId, data) {
  const startISO = hhmmToTodayISO(data.hora);

  // Handle OF=0 explicitly (general work) - don't convert to null
  const ofNumber = data.of !== null && data.of !== undefined ? Number(data.of) : null;

  const payload = {
    parent: { database_id: dbId },
    properties: {
      'Funcionário': { title: [{ text: { content: data.funcionario } }] },
      'Ordem de Fabrico': { number: ofNumber },
      'Início do Turno': { date: { start: startISO } }
    }
  };

  const resp = await notionFetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Notion create failed (${resp.status}): ${text}`);
  }
}

async function findOpenShiftPage(dbId, funcionario, ofNumber) {
  // Try multiple property name variations (handles workspace migration)
  const funcionarioVariations = PROPERTY_ALIASES.funcionario;
  const finalTurnoVariations = PROPERTY_ALIASES.finalTurno;
  const inicioTurnoVariations = PROPERTY_ALIASES.inicioTurno;
  const ofVariations = PROPERTY_ALIASES.of;

  // Try each combination until one works
  for (const funcProp of funcionarioVariations) {
    for (const finalProp of finalTurnoVariations) {
      for (const inicioProp of inicioTurnoVariations) {
        for (const ofProp of ofVariations) {
          try {
            const filters = [
              { property: funcProp, title: { equals: funcionario } },
              { property: finalProp, date: { is_empty: true } }
            ];

            // If OF number provided, filter by it to avoid closing wrong shift
            if (ofNumber !== null && ofNumber !== undefined) {
              filters.push({ property: ofProp, number: { equals: Number(ofNumber) } });
            }

            const query = {
              filter: { and: filters },
              sorts: [{ property: inicioProp, direction: 'descending' }],
              page_size: 1
            };

            const resp = await notionFetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
              method: 'POST',
              headers,
              body: JSON.stringify(query)
            });

            if (resp.ok) {
              const json = await resp.json();
              if (json.results && json.results.length) {
                console.log(`✓ Found shift using properties: Funcionário="${funcProp}", Final="${finalProp}"`);
                return json.results[0];
              }
            }
          } catch (e) {
            // Try next variation
            continue;
          }
        }
      }
    }
  }

  const ofMsg = ofNumber ? ` para OF ${ofNumber}` : '';
  console.warn(`⚠️  Nenhum turno aberto encontrado para ${funcionario}${ofMsg}`);
  console.warn(`   Tentei todas as variações de propriedades: ${funcionarioVariations.join(', ')}`);
  throw new Error('Nenhum turno aberto encontrado');
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
  // Pass OF number to ensure we close the correct shift (prevents race condition)
  const ofNumber = data.of !== null && data.of !== undefined ? Number(data.of) : null;
  const page = await findOpenShiftPage(dbId, data.funcionario, ofNumber);
  const requestedEndISO = hhmmToTodayISO(data.hora);
  const requestedEndDate = new Date(requestedEndISO);

  // Flexible property name resolution (handles workspace migration)
  const inicioTurnoProp = resolveProperty(page, 'inicioTurno');
  const finalTurnoProp = resolveProperty(page, 'finalTurno');
  const notasProp = resolveProperty(page, 'notas');
  const notasType = getPropertyType(page, notasProp);

  const startProp = page.properties?.[inicioTurnoProp]?.date?.start;
  const startDate = startProp ? new Date(startProp) : null;

  const adjustment = computeBreakAdjustment(startDate, requestedEndDate);

  const properties = {
    [finalTurnoProp]: { date: { start: adjustment.endDate.toISOString() } }
  };

  // Only add notes if property is rich_text (some databases use select instead)
  if (adjustment.note && notasType === 'rich_text') {
    const combinedNotes = combineNotes(page.properties?.[notasProp]?.rich_text, adjustment.note);
    properties[notasProp] = { rich_text: [{ text: { content: combinedNotes } }] };
  } else if (adjustment.note && notasType !== 'rich_text') {
    console.warn(`⚠️  Cannot write note: "${notasProp}" is type "${notasType}", expected "rich_text". Skipping note.`);
  }

  console.log(`📝 Closing shift for ${data.funcionario} using properties: Início=${inicioTurnoProp}, Final=${finalTurnoProp}`);

  const resp2 = await notionFetch(`https://api.notion.com/v1/pages/${page.id}`, {
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
  // Pass OF number to ensure we cancel the correct shift
  const ofNumber = data.of !== null && data.of !== undefined ? Number(data.of) : null;
  const page = await findOpenShiftPage(dbId, data.funcionario, ofNumber);

  // Flexible property name resolution
  const finalTurnoProp = resolveProperty(page, 'finalTurno');
  const notasProp = resolveProperty(page, 'notas');
  const notasType = getPropertyType(page, notasProp);

  const properties = {
    [finalTurnoProp]: { date: { start: endISO } }
  };

  // Only add notes if property is rich_text (some databases use select instead)
  if (notasType === 'rich_text') {
    properties[notasProp] = {
      rich_text: [{ text: { content: 'Turno cancelado manualmente' } }]
    };
  } else {
    console.warn(`⚠️  Cannot write cancellation note: "${notasProp}" is type "${notasType}", expected "rich_text". Skipping note.`);
  }

  console.log(`🚫 Cancelling shift for ${data.funcionario} using property: Final=${finalTurnoProp}`);

  const resp2 = await notionFetch(`https://api.notion.com/v1/pages/${page.id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ properties })
  });
  if (!resp2.ok) {
    const text = await resp2.text();
    throw new Error(`Notion update failed (${resp2.status}): ${text}`);
  }
}

async function registerPinturaQuantities(dbId, data) {
  if (!dbId) throw new Error('DB não configurada');
  // Pass OF to ensure we register quantities on the correct shift
  const ofNumber = data.of !== null && data.of !== undefined ? Number(data.of) : null;
  const page = await findOpenShiftPage(dbId, data.funcionario, ofNumber);

  const isolante = Number(data.isolante) || 0;
  const tapaPoros = Number(data.tapaPoros) || 0;
  const verniz = Number(data.verniz) || 0;
  const aquecimento = Number(data.aquecimento) || 0;

  const properties = {};
  const propIsolante = resolvePinturaProperty(page, 'isolante');
  const propTapa = resolvePinturaProperty(page, 'tapaPoros');
  const propVerniz = resolvePinturaProperty(page, 'verniz');
  const propAquec = resolvePinturaProperty(page, 'aquecimento');

  properties[propIsolante] = { number: isolante };
  properties[propTapa] = { number: tapaPoros };
  properties[propVerniz] = { number: verniz };
  properties[propAquec] = { number: aquecimento };

  const resp = await notionFetch(`https://api.notion.com/v1/pages/${page.id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ properties })
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Notion update failed (${resp.status}): ${text}`);
  }
}

function resolvePinturaProperty(page, key) {
  const candidates = (PINTURA_PROP_ALIASES[key] || []).filter(Boolean);
  if (!candidates.length) throw new Error('Configuração incompleta para propriedade Pintura: ' + key);
  const props = page?.properties || {};
  const lookup = {};
  Object.keys(props).forEach((name) => {
    lookup[normalizeKey(name)] = name;
  });
  for (const candidate of candidates) {
    const actual = lookup[normalizeKey(candidate)];
    if (actual) return actual;
  }
  throw new Error(
    `Propriedade "${candidates[0]}" não encontrada na base Pintura. ` +
    'Atualize os nomes nas variáveis PINTURA_*_PROP ou alinhe os títulos das propriedades.'
  );
}

function normalizeKey(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

// Flexible property name resolver - tries multiple variations
function resolveProperty(page, aliasKey) {
  const candidates = PROPERTY_ALIASES[aliasKey] || [];
  if (!candidates.length) {
    console.warn(`⚠️  No aliases defined for key: ${aliasKey}`);
    return null;
  }

  const props = page?.properties || {};
  const lookup = {};
  Object.keys(props).forEach((name) => {
    lookup[normalizeKey(name)] = name;
  });

  for (const candidate of candidates) {
    const actual = lookup[normalizeKey(candidate)];
    if (actual) {
      return actual;
    }
  }

  console.warn(`⚠️  Property not found. Tried: ${candidates.join(', ')}`);
  console.warn(`   Available: ${Object.keys(props).join(', ')}`);
  // Return first candidate as fallback
  return candidates[0];
}

// Get property type from page
function getPropertyType(page, propName) {
  if (!page || !page.properties || !propName) return null;
  const prop = page.properties[propName];
  return prop ? prop.type : null;
}

async function finishIncompleteEntry(dbId, data) {
  if (!data.tipo || !data.iniciou || typeof data.minutosRestantes === 'undefined') {
    throw new Error('Dados incompletos');
  }
  if (String(data.iniciou).trim() === String(data.funcionario).trim()) {
    throw new Error('Escolha outro colaborador');
  }

  // Don't pass OF filter here - we want the most recent open shift regardless of OF
  const page = await findOpenShiftPage(dbId, data.funcionario, null);

  // Flexible property name resolution
  const inicioTurnoProp = resolveProperty(page, 'inicioTurno');
  const notasProp = resolveProperty(page, 'notas');
  const notasType = getPropertyType(page, notasProp);

  const startProp = page.properties?.[inicioTurnoProp]?.date?.start;
  if (!startProp) throw new Error('Início do Turno não encontrado');
  const startDate = new Date(startProp);
  const minutes = Math.max(0, Number(data.minutosRestantes) || 0);
  const adjustedStartISO = new Date(startDate.getTime() + minutes * 60_000).toISOString();

  const properties = {
    [inicioTurnoProp]: { date: { start: adjustedStartISO } }
  };

  // Only add notes if property is rich_text (some databases use select instead)
  if (notasType === 'rich_text') {
    const tipo = String(data.tipo).trim();
    const newNote = `Terminou ${tipo} iniciado por ${data.iniciou} durante ${minutes} min`;
    const combinedNotes = combineNotes(page.properties?.[notasProp]?.rich_text, newNote);
    properties[notasProp] = { rich_text: [{ text: { content: combinedNotes } }] };
  } else {
    console.warn(`⚠️  Cannot write incomplete finish note: "${notasProp}" is type "${notasType}", expected "rich_text". Skipping note.`);
  }

  const payload = {
    properties
  };

  const resp2 = await notionFetch(`https://api.notion.com/v1/pages/${page.id}`, {
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

  const resp = await notionFetch('https://api.notion.com/v1/pages', {
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

// Check if we're in the critical morning window (7:50-8:15)
function isInMorningRush(now = new Date()) {
  const dow = now.getDay();
  if (dow === 0 || dow === 6) return false;
  const h = now.getHours();
  const m = now.getMinutes();
  // Between 7:50 and 8:15 on weekdays
  if (h === 7 && m >= 50) return true;
  if (h === 8 && m <= 15) return true;
  return false;
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

// Standard ping: every 5 minutes within 07:30–17:30, Mon–Fri
cron.schedule(
  '*/5 7-17 * * 1-5',
  async () => {
    try { await keepAlivePing(); } catch (_) { }
  },
  { timezone: 'Europe/Lisbon' }
);

// Aggressive morning ping: every 3 minutes from 7:50-8:15 to ensure service is warm
// Note: This internal cron helps but external keep-alive (UptimeRobot) is still recommended
cron.schedule(
  '*/3 7-8 * * 1-5',
  async () => {
    if (isInMorningRush()) {
      try { await keepAlivePing(); } catch (_) { }
    }
  },
  { timezone: 'Europe/Lisbon' }
);

// Kick an immediate ping on boot if within the window
(async () => { try { await keepAlivePing(); } catch (_) { } })();

// 5. OF Management Endpoints (CRUD)
app.get('/api/dashboard/ofs-list', async (req, res) => {
  const startTime = Date.now();
  try {
    if (!OFS_DB_ID) return res.json({ ok: true, data: [], configured: false });
    const pages = await fetchAllPages(OFS_DB_ID, undefined);
    const ofs = pages.map(p => ({
      id: p.id,
      numero: p.properties?.['Número OF']?.number || p.properties?.['OF']?.title?.[0]?.plain_text || null,
      cliente: p.properties?.['Cliente']?.rich_text?.[0]?.plain_text || p.properties?.['Cliente']?.select?.name || '',
      descricao: p.properties?.['Descrição']?.rich_text?.[0]?.plain_text || p.properties?.['Produto']?.rich_text?.[0]?.plain_text || '',
      estado: p.properties?.['Estado']?.select?.name || '',
      dataEntrada: p.properties?.['Data de Entrada']?.date?.start || null,
      notas: p.properties?.['Notas']?.rich_text?.[0]?.plain_text || ''
    }));
    res.json({ ok: true, data: ofs, configured: true });
    console.log(`[dashboard/ofs-list] completed in ${Date.now() - startTime}ms`);
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

app.post('/api/dashboard/of-manage', async (req, res) => {
  const startTime = Date.now();
  try {
    if (!OFS_DB_ID) throw new Error('OFS_DB_ID not configured');
    const { id, numero, cliente, descricao, estado, dataEntrada, notas } = req.body;

    const properties = {};
    if (numero !== undefined) properties['Número OF'] = { number: Number(numero) };
    if (cliente !== undefined) properties['Cliente'] = { rich_text: [{ text: { content: String(cliente) } }] };
    if (descricao !== undefined) properties['Descrição'] = { rich_text: [{ text: { content: String(descricao) } }] };
    if (estado !== undefined) properties['Estado'] = { select: { name: String(estado) } };
    if (dataEntrada) properties['Data de Entrada'] = { date: { start: dataEntrada } };
    if (notas !== undefined) properties['Notas'] = { rich_text: [{ text: { content: String(notas) } }] };

    if (id) {
      await notionFetch(`https://api.notion.com/v1/pages/${id}`, {
        method: 'PATCH', headers,
        body: JSON.stringify({ properties })
      });
    } else {
      if (!properties['Número OF']) throw new Error('Número OF é obrigatório');
      // Assume "Número OF" is a number property. If it is the title, structure is different.
      // Based on usual certoma schema, let's stick to the plan.
      await notionFetch('https://api.notion.com/v1/pages', {
        method: 'POST', headers,
        body: JSON.stringify({
          parent: { database_id: OFS_DB_ID },
          properties
        })
      });
    }
    res.json({ ok: true });
    console.log(`[dashboard/of-manage] completed in ${Date.now() - startTime}ms`);
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// 6. Aquecimento (Heating) Tracking
app.get('/api/dashboard/aquecimento', async (req, res) => {
  const startTime = Date.now();
  try {
    if (!PINTURA_DB_ID) return res.json({ ok: true, data: { total: 0, monthly: [] }, configured: false });

    const year = parseInt(req.query.year) || new Date().getFullYear();
    const startOfYear = new Date(year, 0, 1).toISOString();
    const endOfYear = new Date(year + 1, 0, 1).toISOString();

    const filter = {
      and: [
        { property: 'Início do Turno', date: { on_or_after: startOfYear } },
        { property: 'Início do Turno', date: { before: endOfYear } }
      ]
    };

    const pages = await fetchAllPages(PINTURA_DB_ID, filter);

    let totalAquecimento = 0;
    const monthlyAquecimento = Array(12).fill(0);

    pages.forEach(page => {
      const aquecAliases = PINTURA_PROP_ALIASES.aquecimento || ['Utilização do Aquecimento'];
      let aquecValue = 0;
      for (const alias of aquecAliases) {
        const prop = page.properties?.[alias];
        if (prop && prop.type === 'number' && prop.number !== null) {
          aquecValue = prop.number;
          break;
        }
      }

      if (aquecValue > 0) {
        totalAquecimento += aquecValue;
        const startDate = page.properties?.['Início do Turno']?.date?.start;
        if (startDate) {
          const month = new Date(startDate).getMonth();
          monthlyAquecimento[month] += aquecValue;
        }
      }
    });

    res.json({
      ok: true,
      configured: true,
      data: {
        total: totalAquecimento,
        monthly: monthlyAquecimento
      }
    });
    console.log(`[dashboard/aquecimento] completed in ${Date.now() - startTime}ms`);
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// 7. Delete Employee Cost (archive Notion page)
app.delete('/api/dashboard/employee-cost/:id', async (req, res) => {
  const startTime = Date.now();
  try {
    await notionFetch(`https://api.notion.com/v1/pages/${req.params.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ archived: true })
    });
    res.json({ ok: true });
    console.log(`[dashboard/employee-cost:delete] completed in ${Date.now() - startTime}ms`);
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// 🚀 Start the server
app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
