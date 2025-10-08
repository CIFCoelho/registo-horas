# 🔄 Guia de Migração para Novo Workspace Notion

## 📊 Visão Geral

Este documento orienta a migração do sistema de registo de produtividade da conta Notion pessoal para o workspace da empresa.

### ⚠️ Pontos Críticos
- **Integration Token** (`NOTION_TOKEN`) - precisa ser regenerado
- **Database IDs** - todas as bases precisam ser recriadas/copiadas
- **Variáveis de ambiente** na Render - precisam ser atualizadas
- **Zero impacto no frontend** - GitHub Pages não precisa alterações

---

## 📋 FASE 1: Preparação no Novo Workspace

### 1.1 Criar a Integração Notion

1. Aceder a https://www.notion.so/my-integrations
2. Clicar em **"+ New integration"**
3. Configurar:
   - **Nome**: `Registo Produtividade Certoma` (ou outro nome apropriado)
   - **Workspace**: Selecionar o workspace da empresa
   - **Type**: Internal integration
   - **Capabilities**:
     - ✅ Read content
     - ✅ Update content
     - ✅ Insert content
4. Clicar em **"Submit"**
5. **COPIAR e GUARDAR** o "Internal Integration Token" (começa com `ntn_` ou `secret_`)
   - ⚠️ **IMPORTANTE**: Este token só é mostrado uma vez!

---

### 1.2 Criar as Bases de Dados

Precisas criar **7 bases de dados** no novo workspace. Aqui está a estrutura de cada uma:

#### 📌 Base 1: **Acabamento**

**Propriedades obrigatórias** (os nomes têm de ser EXATAMENTE estes):

| Nome da Propriedade | Tipo | Notas |
|---------------------|------|-------|
| `Funcionário` | **Title** | Obrigatório (é a coluna principal) |
| `Ordem de Fabrico` | **Number** | |
| `Início do Turno` | **Date** | Incluir hora |
| `Final do Turno` | **Date** | Incluir hora |
| `Notas do Sistema` | **Text** | Para registos automáticos |

**Como criar:**
1. No Notion, criar nova página de Database (Table)
2. Nomear: **"Acabamento"**
3. Renomear a coluna "Name" para **"Funcionário"**
4. Adicionar as outras propriedades usando o tipo correto
5. Confirmar que a coluna **"Funcionário"** está marcada como "Title"

**Nota:** O backend suporta tanto "Funcionário" como "Colaborador" devido a aliases, mas recomenda-se usar "Funcionário" como padrão.

---

#### 📌 Base 2: **Estofagem - Tempo**

**Mesma estrutura que Acabamento:**

| Nome da Propriedade | Tipo |
|---------------------|------|
| `Funcionário` | **Title** |
| `Ordem de Fabrico` | **Number** |
| `Início do Turno` | **Date** (com hora) |
| `Final do Turno` | **Date** (com hora) |
| `Notas do Sistema` | **Text** |

---

#### 📌 Base 3: **Estofagem - Registos Acab.**

| Nome da Propriedade | Tipo |
|---------------------|------|
| `Funcionário` | **Title** |
| `Data` | **Date** |
| `Ordem de Fabrico` | **Number** |
| `Cru:` | **Text** |
| `TP:` | **Text** |

---

#### 📌 Base 4: **Costura**

| Nome da Propriedade | Tipo |
|---------------------|------|
| `Funcionário` | **Title** |
| `Ordem de Fabrico` | **Number** |
| `Início do Turno` | **Date** (com hora) |
| `Final do Turno` | **Date** (com hora) |
| `Notas do Sistema` | **Text** |

---

#### 📌 Base 5: **Pintura**

| Nome da Propriedade | Tipo | Notas |
|---------------------|------|-------|
| `Funcionário` | **Title** |
| `Ordem de Fabrico` | **Number** |
| `Início do Turno` | **Date** (com hora) |
| `Final do Turno` | **Date** (com hora) |
| `Notas do Sistema` | **Text** |
| `Isolante Aplicado (Nº)` | **Number** | Para quantidades |
| `Tapa-Poros Aplicado Nº` | **Number** | |
| `Verniz Aplicado (Nº)` | **Number** | |
| `Aquecimento - Nº de Horas` | **Number** | |

---

#### 📌 Base 6: **Preparação de Madeiras**

| Nome da Propriedade | Tipo |
|---------------------|------|
| `Funcionário` | **Title** |
| `Ordem de Fabrico` | **Number** |
| `Início do Turno` | **Date** (com hora) |
| `Final do Turno` | **Date** (com hora) |
| `Notas do Sistema` | **Text** |

---

#### 📌 Base 7: **Montagem**

| Nome da Propriedade | Tipo |
|---------------------|------|
| `Funcionário` | **Title** |
| `Ordem de Fabrico` | **Number** |
| `Início do Turno` | **Date** (com hora) |
| `Final do Turno` | **Date** (com hora) |
| `Notas do Sistema` | **Text** |

---

### 1.3 Partilhar as Bases com a Integração

**Para CADA uma das 7 bases criadas:**

1. Abrir a base de dados no Notion
2. Clicar no menu **"⋯"** (três pontos) no canto superior direito
3. Selecionar **"Add connections"** ou **"Connections"**
4. Procurar e selecionar a integração **"Registo Produtividade Certoma"** (o nome que deste)
5. Confirmar

⚠️ **CRÍTICO**: Se não partilhares, o backend não consegue aceder às bases!

---

### 1.4 Obter os Database IDs

**Para CADA base**, precisas copiar o ID:

1. Abrir a base no Notion (em "full page")
2. Copiar o URL (será algo como):
   ```
   https://www.notion.so/1234567890abcdef1234567890abcdef?v=...
   ```
3. O Database ID é a parte: `1234567890abcdef1234567890abcdef`
   - São 32 caracteres (sem hífens)
   - Fica entre `.so/` e `?v=` no URL

**Guardar num ficheiro de texto temporário** (NÃO commitar ao git):

```
NOTION_TOKEN=ntn_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

ACABAMENTO_DB_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
ESTOFAGEM_TEMPO_DB_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
ESTOFAGEM_ACABAMENTOS_DB_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
COSTURA_DB_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
PINTURA_DB_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
PREPARACAO_MADEIRAS_DB_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
MONTAGEM_DB_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

## 📋 FASE 2: Atualizar as Variáveis na Render

### 2.1 Aceder à Render

1. Login em https://render.com
2. Ir para o serviço **"registo-horas"** (ou o nome que deste)
3. Ir ao separador **"Environment"** (à esquerda)

### 2.2 Atualizar TODAS as Variáveis

**Substituir os valores antigos pelos novos:**

| Variável | Novo Valor |
|----------|------------|
| `NOTION_TOKEN` | O token da nova integração (começa com `ntn_` ou `secret_`) |
| `ACABAMENTO_DB_ID` | O ID da nova base Acabamento |
| `ESTOFAGEM_TEMPO_DB_ID` | O ID da nova base Estofagem - Tempo |
| `ESTOFAGEM_ACABAMENTOS_DB_ID` | O ID da nova base Estofagem - Registos Acab. |
| `COSTURA_DB_ID` | O ID da nova base Costura |
| `PINTURA_DB_ID` | O ID da nova base Pintura |
| `PREPARACAO_MADEIRAS_DB_ID` | O ID da nova base Preparação de Madeiras |
| `MONTAGEM_DB_ID` | O ID da nova base Montagem |

**Não alterar:**
- `ALLOW_ORIGIN`
- `KEEPALIVE_URL`
- `KEEPALIVE_ENABLED`
- `PORT`
- Outras variáveis de configuração

### 2.3 Reiniciar o Serviço

1. Clicar em **"Manual Deploy"** > **"Deploy latest commit"**
2. Aguardar que o deploy complete (~2-3 minutos)

---

## 📋 FASE 3: Validação

### 3.1 Testes Automáticos

Usar o script de validação (vou criar a seguir):

```bash
cd server
node check-notion.js
```

Deve mostrar:
- ✅ Token válido
- ✅ Todas as 7 bases acessíveis
- ✅ Propriedades corretas em cada base

### 3.2 Testes Manuais (endpoints)

**1. Health check:**
```bash
curl https://registo-horas.onrender.com/health
```
Esperado: `{"ok":true,"allow":"https://cifcoelho.github.io"}`

**2. Validar token:**
```bash
curl https://registo-horas.onrender.com/notion/whoami
```
Esperado: Informação do bot user da integração

**3. Validar estrutura da base Acabamento:**
```bash
curl "https://registo-horas.onrender.com/notion/meta?db=acabamento"
```
Esperado: Lista das propriedades (Colaborador, Ordem de Fabrico, etc.)

**4. Testar início de turno:**
```bash
curl -X POST https://registo-horas.onrender.com/acabamento \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d 'data={"funcionario":"Teste","of":"999","acao":"start","hora":"14:30"}'
```
Esperado: `{"ok":true}`

**5. Verificar no Notion:**
- Abrir a base Acabamento
- Confirmar que apareceu um registo de "Teste"

**6. Fechar turno:**
```bash
curl -X POST https://registo-horas.onrender.com/acabamento \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d 'data={"funcionario":"Teste","acao":"end","hora":"15:00"}'
```

**7. Verificar no Notion:**
- O registo deve ter agora "Final do Turno" preenchido

---

## 📋 FASE 4: Testes nos iPads

### 4.1 Teste em Produção

1. Aceder a: `https://cifcoelho.github.io/registo-horas/frontend/HTML/acabamento.html`
2. Tocar num nome de funcionário
3. Introduzir uma OF de teste (ex: 888)
4. Confirmar que aparece o indicador ativo
5. Tocar novamente no mesmo funcionário para terminar
6. **Verificar no Notion** que o registo foi criado corretamente

### 4.2 Teste de Todas as Secções

Repetir para:
- ✅ Acabamento: `/acabamento.html`
- ✅ Estofagem: `/estofagem.html`
- ✅ Costura: `/costura.html`
- ✅ Pintura: `/pintura.html`
- ✅ Preparação: `/preparacao.html`

---

## 🔒 FASE 5: Segurança Pós-Migração

### 5.1 Revogar Token Antigo

1. Aceder a https://www.notion.so/my-integrations
2. Encontrar a integração antiga (conta pessoal)
3. Clicar em **"Delete integration"** ou desativar

### 5.2 Confirmar que NÃO existem tokens no código

```bash
# No diretório do projeto
grep -r "secret_" .
grep -r "ntn_" .
```

Não deve aparecer nada (exceto em `node_modules` ou `.git`)

---

## ✅ Checklist Final

- [ ] Integração criada no workspace da empresa
- [ ] Token guardado em local seguro
- [ ] 7 bases de dados criadas com nomes e propriedades corretos
- [ ] Bases partilhadas com a integração
- [ ] Database IDs copiados
- [ ] Variáveis atualizadas na Render
- [ ] Deploy na Render concluído
- [ ] `/health` a responder OK
- [ ] `/notion/whoami` a retornar info correta
- [ ] `/notion/meta` a mostrar propriedades corretas
- [ ] Teste de POST (start/end) bem-sucedido
- [ ] Registo visível no Notion
- [ ] Teste no iPad em todas as secções
- [ ] Token antigo revogado
- [ ] Sem tokens no código fonte

---

## 🆘 Troubleshooting

### Erro: "object_not_found" ou "Couldn't find database"
- Confirmar que o Database ID está correto
- Confirmar que a base foi partilhada com a integração

### Erro: "unauthorized" ou "invalid_request"
- Token incorreto ou expirado
- Regenerar token e atualizar na Render

### Erro: "property_not_found" ou "validation_error"
- Nome de propriedade incorreto (case-sensitive!)
- Verificar que os nomes são EXATAMENTE:
  - `Funcionário` (e não "funcionario" ou "Colaborador", embora aliases existam)
  - `Ordem de Fabrico` (com espaço)
  - `Início do Turno` / `Final do Turno`

### Backend não responde (cold start)
- Normal após 15 min de inatividade (plano gratuito Render)
- Primeiro request pode demorar 30-60s
- Configurar UptimeRobot ou similar para keep-alive

---

## 📞 Suporte

Se encontrares problemas:
1. Verificar logs na Render (separador "Logs")
2. Testar endpoints individuais (usar `curl`)
3. Confirmar estrutura das bases no Notion
4. Verificar que o token tem permissões corretas
