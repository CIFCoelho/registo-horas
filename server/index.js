// server/index.js
require('dotenv').config(); // load env first

const express = require('express');
const bodyParser = require('body-parser');
const cron = require('node-cron');

// ✅ Read ONLY from env
const NOTION_TOKEN = process.env.NOTION_TOKEN;
const DATABASE_ID = process.env.ACABAMENTO_DB_ID;
const PORT = process.env.PORT || 8787;
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || 'https://cifcoelho.github.io';

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

// CORS (narrow to site)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', ALLOW_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());

// Simple health endpoint
app.get('/health', (req, res) => {
  res.json({ ok: true, allow: ALLOW_ORIGIN });
});

app.post('/acabamento', async (req, res) => {
  try {
    const raw = req.body?.data;
    if (!raw) throw new Error('Missing data');
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;

    if (!data.acao || !data.funcionario) throw new Error('Dados incompletos');

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
    res.send('OK');
  } catch (err) {
    console.error(err);
    res.status(400).send(err.message);
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

  await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });
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
  const json = await resp.json();
  if (!json.results || !json.results.length) throw new Error('Nenhum turno aberto encontrado');

  const page = json.results[0];
  const endISO = hhmmToTodayISO(data.hora);

  const payload = {
    properties: {
      'Final do Turno': { date: { start: endISO } }
    }
  };

  await fetch(`https://api.notion.com/v1/pages/${page.id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(payload)
  });
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

  await fetch(`https://api.notion.com/v1/pages/${page.id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(payload)
  });
}

async function handleFinishIncomplete(data) {
  const startISO = hhmmToTodayISO(data.hora);
  const note = `Terminou ${data.tipo} iniciado por ${data.iniciou} (${data.minutosRestantes} min)`;

  const payload = {
    parent: { database_id: DATABASE_ID },
    properties: {
      'Colaborador': { title: [{ text: { content: data.funcionario } }] },
      'Início do Turno': { date: { start: startISO } },
      'Notas do Sistema': { rich_text: [{ text: { content: note } }] }
    }
  };

  await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });
}

// Auto-close jobs (at 12:03 and 17:03 Lisbon time)
cron.schedule('3 12 * * *', () => autoClose('12:03'), { timezone: 'Europe/Lisbon' });
cron.schedule('3 17 * * *', () => autoClose('17:03'), { timezone: 'Europe/Lisbon' });

async function autoClose(timeStr) {
  const endISO = hhmmToTodayISO(timeStr);

  const query = {
    filter: { property: 'Final do Turno', date: { is_empty: true } }
  };

  const resp = await fetch(`https://api.notion.com/v1/databases/${DATABASE_ID}/query`, {
    method: 'POST',
    headers,
    body: JSON.stringify(query)
  });
  const json = await resp.json();
  for (const page of json.results || []) {
    const payload = {
      properties: {
        'Final do Turno': { date: { start: endISO } },
        'Notas do Sistema': {
          rich_text: [{ text: { content: `Fechado automaticamente às ${timeStr}` } }]
        }
      }
    };
    await fetch(`https://api.notion.com/v1/pages/${page.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(payload)
    });
  }
}

// 🚀 Start the server
app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});