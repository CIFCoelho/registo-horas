require('dotenv').config();
const { Client } = require('@notionhq/client');

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const ESTOFAGEM_TEMPO_DB_ID = process.env.ESTOFAGEM_TEMPO_DB_ID;

(async () => {
  console.log('🔍 Checking Estofagem - Tempo Database Schema\n');

  if (!ESTOFAGEM_TEMPO_DB_ID) {
    console.error('❌ ESTOFAGEM_TEMPO_DB_ID not found in environment!');
    process.exit(1);
  }

  try {
    const meta = await notion.databases.retrieve({ database_id: ESTOFAGEM_TEMPO_DB_ID });

    console.log('✅ Database found');
    console.log(`   Title: ${meta.title?.[0]?.plain_text || '(no title)'}`);
    console.log(`   ID: ${meta.id}`);
    console.log('\n📋 All Properties:\n');

    const props = meta.properties;
    Object.keys(props).forEach(name => {
      const prop = props[name];
      console.log(`   "${name}"`);
      console.log(`      Type: ${prop.type}`);
      console.log(`      ID: ${prop.id}`);
      console.log('');
    });

    console.log('\n🔍 Searching for "Final" property variations:');
    Object.keys(props).forEach(name => {
      if (name.toLowerCase().includes('final')) {
        console.log(`   ✓ Found: "${name}" (type: ${props[name].type})`);
      }
    });

    console.log('\n📊 Expected vs Actual:\n');
    const expected = ['Funcionário', 'Ordem de Fabrico', 'Início do Turno', 'Final do Turno', 'Notas do Sistema'];
    expected.forEach(exp => {
      if (props[exp]) {
        console.log(`   ✅ "${exp}" - FOUND (${props[exp].type})`);
      } else {
        console.log(`   ❌ "${exp}" - MISSING`);
      }
    });

  } catch (e) {
    console.error('❌ Error:', e.message);
    console.error('   Code:', e.code);
    process.exit(1);
  }
})();
