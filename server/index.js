const express = require('express');
const bodyParser = require('body-parser');
const cron = require('node-cron');

const NOTION_TOKEN = process.env.NOTION_TOKEN || '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';
const DATABASE_ID = process.env.ACABAMENTO_DB_ID || '233faf6b5f21805a9919f41735a1590e';
const PORT = process.env.PORT || 3000;

const headers = {
  'Authorization': `Bearer ${NOTION_TOKEN}`,
  'Notion-Version': '2022-06-28',
  'Content-Type': 'application/json'
};

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));

app.post('/acabamento', async (req, res) => {
  try {
    const raw = req.body.data;
    if (!raw) throw new Error('Missing data');
    const data = JSON.parse(raw);
    if (!data.acao || !data.funcionario) throw new Error('Dados incompletos');

    if (data.acao === 'start') {
      await handleStart(data);
    } else if (data.acao === 'end') {
      await handleEnd(data);
    } else {
      throw new Error('Ação inválida');
    }
    res.send('OK');
  } catch (err) {
    console.error(err);
    res.status(400).send(err.message);
  }
});

async function handleStart(data) {
  const [h, m] = data.hora.split(':').map(Number);
  const start = new Date();
  start.setHours(h, m, 0, 0);

  const payload = {
    parent: { database_id: DATABASE_ID },
    properties: {
      'Colaborador': {
        title: [{ text: { content: data.funcionario } }]
      },
      'Ordem de Fabrico': { number: Number(data.of) || null },
      'Início do Turno': { date: { start: start.toISOString() } }
    }
  };

  await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });
}

async function handleEnd(data) {
  const [h, m] = data.hora.split(':').map(Number);
  let end = new Date();
  end.setHours(h, m, 0, 0);

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
  const startStr = page.properties['Início do Turno'].date.start;
  const start = new Date(startStr);

  const breakStart = new Date(start);
  breakStart.setHours(10, 0, 0, 0);
  const breakEnd = new Date(start);
  breakEnd.setHours(10, 10, 0, 0);

  if (start < breakEnd && end > breakStart) {
    end = new Date(end.getTime() - 10 * 60 * 1000);
  }

  const payload = {
    properties: {
      'Final do Turno': { date: { start: end.toISOString() } }
    }
  };

  await fetch(`https://api.notion.com/v1/pages/${page.id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(payload)
  });
}

cron.schedule('3 12 * * *', () => autoClose('12:03'), { timezone: 'Europe/Lisbon' });
cron.schedule('3 17 * * *', () => autoClose('17:03'), { timezone: 'Europe/Lisbon' });

async function autoClose(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  const end = new Date();
  end.setHours(h, m, 0, 0);

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
        'Final do Turno': { date: { start: end.toISOString() } },
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

app.listen(PORT, () => {
  console.log('Server running on port', PORT);
});