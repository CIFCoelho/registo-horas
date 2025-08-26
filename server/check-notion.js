require('dotenv').config();
const { Client } = require('@notionhq/client');

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const db = process.env.ACABAMENTO_DB_ID;

(async () => {
  try {
    const meta = await notion.databases.retrieve({ database_id: db });
    console.log('✅ Connected to DB:', meta.title?.[0]?.plain_text || '(no title)');
    console.log('ID:', meta.id);
    console.log('\nProperties:');
    Object.entries(meta.properties).forEach(([name, def]) => {
      console.log(`- ${name} : ${def.type}`);
    });
  } catch (e) {
    console.error('❌ Notion error:', e.status, e.code, e.message);
    if (e.body) console.error(e.body);
    process.exit(1);
  }
})();