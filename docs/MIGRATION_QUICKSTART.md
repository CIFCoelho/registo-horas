# ⚡ Quick Start - Migração Workspace Notion

## 🎯 Resumo Ultra-Rápido

1. **Criar integração** → Copiar token
2. **Criar 7 bases** → Copiar IDs
3. **Partilhar bases** com integração
4. **Atualizar Render** → Variáveis de ambiente
5. **Validar** → `node check-notion.js`
6. **Testar** → iPad

---

## 📝 Checklist Rápida

### No Notion (novo workspace):

- [ ] Criar integração em https://www.notion.so/my-integrations
- [ ] Guardar token (começa com `ntn_` ou `secret_`)
- [ ] Criar 7 bases (ver estruturas abaixo)
- [ ] Partilhar TODAS as bases com a integração (menu ⋯ → Connections)
- [ ] Copiar Database ID de cada base (do URL: parte entre `.so/` e `?v=`)

### Na Render:

- [ ] Environment → Atualizar `NOTION_TOKEN`
- [ ] Atualizar todos os `*_DB_ID`
- [ ] Manual Deploy → Deploy latest commit
- [ ] Aguardar conclusão (~2 min)

### Validação:

- [ ] `curl https://registo-horas.onrender.com/health` → `{"ok":true}`
- [ ] `curl https://registo-horas.onrender.com/notion/whoami` → info do bot
- [ ] Localmente: `cd server && node check-notion.js` → tudo ✅
- [ ] Teste iPad → registar turno → confirmar no Notion

---

## 🗂️ Estruturas das Bases (copy-paste)

### Bases com estrutura BÁSICA:
**Acabamento, Estofagem - Tempo, Costura, Preparação de Madeiras, Montagem**

Propriedades:
- `Colaborador` → **Title**
- `Ordem de Fabrico` → **Number**
- `Início do Turno` → **Date** (incluir hora)
- `Final do Turno` → **Date** (incluir hora)
- `Notas do Sistema` → **Text**

---

### Base ESTOFAGEM - Registos Acab.

Propriedades:
- `Registo Por:` → **Title**
- `Data` → **Date**
- `Ordem de Fabrico` → **Number**
- `Cru Por:` → **Text**
- `TP por:` → **Text**

---

### Base PINTURA

Propriedades:
- `Colaborador` → **Title**
- `Ordem de Fabrico` → **Number**
- `Início do Turno` → **Date** (incluir hora)
- `Final do Turno` → **Date** (incluir hora)
- `Notas do Sistema` → **Text**
- `Isolante Aplicado (Nº)` → **Number**
- `Tapa-Poros Aplicado Nº` → **Number**
- `Verniz Aplicado (Nº)` → **Number**
- `Aquecimento - Nº de Horas` → **Number**

---

## 🔧 Comandos de Teste

```bash
# Health check
curl https://registo-horas.onrender.com/health

# Validar token
curl https://registo-horas.onrender.com/notion/whoami

# Testar estrutura
curl "https://registo-horas.onrender.com/notion/meta?db=acabamento"

# Teste completo (local)
cd server
node check-notion.js
```

---

## 🚨 Troubleshooting Rápido

**Erro: "object_not_found"**
→ Database ID errado OU base não partilhada com integração

**Erro: "unauthorized"**
→ Token errado (verificar cópia do token)

**Erro: "property_not_found"**
→ Nome de propriedade errado (case-sensitive!)
→ Verificar que `Colaborador` é **Title** (não Text)

**Backend não responde**
→ Cold start (normal após 15 min). Esperar 30s e repetir

---

## 📚 Documentação Completa

Ver: `docs/MIGRACAO_WORKSPACE.md` para detalhes completos e explicações.
