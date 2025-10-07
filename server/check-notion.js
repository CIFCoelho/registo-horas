require('dotenv').config();
const { Client } = require('@notionhq/client');

const notion = new Client({ auth: process.env.NOTION_TOKEN });

const DATABASES = {
  'Acabamento': process.env.ACABAMENTO_DB_ID,
  'Estofagem': process.env.ESTOFAGEM_TEMPO_DB_ID,
  'Registo do Acabamento': process.env.ESTOFAGEM_ACABAMENTOS_DB_ID,
  'Costura': process.env.COSTURA_DB_ID,
  'Pintura': process.env.PINTURA_DB_ID,
  'Preparação de Madeiras': process.env.PREPARACAO_MADEIRAS_DB_ID,
  'Montagem': process.env.MONTAGEM_DB_ID
};

const REQUIRED_PROPS = {
  basic: {
    'Funcionário': 'title',
    'Ordem de Fabrico': 'number',
    'Início do Turno': 'date',
    'Final do Turno': 'date',
    'Notas do Sistema': 'rich_text'
  },
  estofagemRegistos: {
    'Funcionário': 'title',
    'Data': 'date',
    'Ordem de Fabrico': 'number',
    'Cru:': 'rich_text',
    'TP:': 'rich_text'
  },
  pintura: {
    'Funcionário': 'title',
    'Ordem de Fabrico': 'number',
    'Início do Turno': 'date',
    'Final do Turno': 'date',
    'Notas do Sistema': 'rich_text',
    'Isolante Aplicado': 'number',
    'Tapa-Poros': 'number',
    'Verniz Aplicado': 'number',
    'Utilização do Aquecimento': 'number'
  }
};

function getExpectedProps(dbName) {
  if (dbName === 'Registo do Acabamento') return REQUIRED_PROPS.estofagemRegistos;
  if (dbName === 'Pintura') return REQUIRED_PROPS.pintura;
  return REQUIRED_PROPS.basic;
}

async function validateDatabase(name, dbId) {
  if (!dbId) {
    console.log(`\n⚠️  ${name}: DB ID não configurado (opcional para algumas secções)`);
    return { ok: false, optional: true };
  }

  try {
    const meta = await notion.databases.retrieve({ database_id: dbId });
    const title = meta.title?.[0]?.plain_text || '(sem título)';

    console.log(`\n✅ ${name}`);
    console.log(`   Título: ${title}`);
    console.log(`   ID: ${meta.id}`);

    const expectedProps = getExpectedProps(name);
    const actualProps = meta.properties;

    let allPropsOk = true;
    console.log(`   Propriedades:`);

    for (const [propName, expectedType] of Object.entries(expectedProps)) {
      const actual = actualProps[propName];
      if (!actual) {
        console.log(`   ❌ FALTA: "${propName}" (esperado: ${expectedType})`);
        allPropsOk = false;
      } else if (actual.type !== expectedType) {
        console.log(`   ⚠️  "${propName}": tipo ${actual.type} (esperado: ${expectedType})`);
        allPropsOk = false;
      } else {
        console.log(`   ✓ "${propName}": ${actual.type}`);
      }
    }

    return { ok: allPropsOk, title };
  } catch (e) {
    console.log(`\n❌ ${name}: ERRO`);
    console.log(`   Status: ${e.status || 'unknown'}`);
    console.log(`   Code: ${e.code || 'unknown'}`);
    console.log(`   Message: ${e.message || 'unknown'}`);
    return { ok: false, error: e };
  }
}

(async () => {
  console.log('🔍 Validação de Configuração Notion\n');
  console.log('='.repeat(50));

  // Check token
  if (!process.env.NOTION_TOKEN) {
    console.error('\n❌ NOTION_TOKEN não encontrado no ambiente!');
    console.error('   Configurar no ficheiro .env ou nas variáveis de ambiente da Render\n');
    process.exit(1);
  }

  console.log('✅ NOTION_TOKEN encontrado');
  console.log(`   Prefixo: ${process.env.NOTION_TOKEN.substring(0, 8)}...`);

  // Validate all databases
  let allOk = true;
  const results = {};

  for (const [name, dbId] of Object.entries(DATABASES)) {
    const result = await validateDatabase(name, dbId);
    results[name] = result;
    if (!result.ok && !result.optional) {
      allOk = false;
    }
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 Resumo:\n');

  const critical = ['Acabamento', 'Estofagem', 'Registo do Acabamento'];
  const optional = ['Costura', 'Pintura', 'Preparação de Madeiras', 'Montagem'];

  console.log('Bases Críticas (obrigatórias):');
  critical.forEach(name => {
    const status = results[name]?.ok ? '✅' : '❌';
    console.log(`  ${status} ${name}`);
  });

  console.log('\nBases Opcionais:');
  optional.forEach(name => {
    const result = results[name];
    const status = !DATABASES[name] ? '⚠️  (não configurado)' : (result?.ok ? '✅' : '❌');
    console.log(`  ${status} ${name}`);
  });

  if (allOk) {
    console.log('\n🎉 Tudo configurado corretamente!\n');
    process.exit(0);
  } else {
    console.log('\n⚠️  Existem problemas de configuração. Ver detalhes acima.\n');
    process.exit(1);
  }
})();