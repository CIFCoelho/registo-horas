# 📘 Registo de Produtividade

Sistema leve e modular de registo de produtividade de colaboradores, com foco em ambientes industriais com equipamentos antigos (ex: iPad 2). A primeira versão usava Google Sheets (Apps Script), mas a secção **Acabamento** já envia registos para uma base de dados no Notion através de um pequeno backend Node.js alojado na Render.

Backend atual em produção: `https://registo-horas.onrender.com`

> 🛠 Em produção na secção **Acabamento**. Próximas secções serão migradas para o mesmo backend.

---

## 🚀 Funcionalidades

- Registo de **início e fim de turno** por funcionário e OF (Ordem de Fabrico)
- Compatível com **iPad 2 em modo quiosque (Safari 9.3.5)**
- Funciona **offline até 30 minutos** com fila local (`localStorage`)
- Envia registos para uma **Google Sheet** ou **Notion**, consoante a secção (no futuro todos serão enviados para o Notion)
- Integração direta com o **Notion** através de um backend Node.js
- Botão de ações para **cancelar turno** ou **registar acabamento incompleto**
- Cálculo automático de duração dos turnos
- Interface otimizada para ecrãs pequenos (iPad 2) seguindo as cores da Certoma
- Suporte planeado para: quantidades produzidas, dashboards, e integração com ERP

---

## 🧱 Arquitetura

```plaintext
iPad 2 (Safari 9) 
   ↓ (JS puro + fila offline via localStorage)
GitHub Pages (Frontend)
   ↓ (POST com JSON urlencoded)
Node.js Backend (server/index.js)
   ↓
Notion (Base de dados)

Endpoints relevantes (backend):
- `GET /health` – status/CORS configurado
- `GET /notion/whoami` – valida o token (mostra o “bot user”)
- `GET /notion/meta` – lê metadados da base de dados (título e tipos)
- `POST /acabamento` – recebe ações do frontend (start/end/cancel/finishIncomplete)
```

---

## 🗂 Estrutura do Repositório

```plaintext
registo-horas/
├── docs/                # Site para GitHub Pages (html, js, configs)
│   ├── index.html       # Página inicial com escolha de secções
│   ├── JS/              # Lógica de fila, estados e envio
│   ├── config/          # Configuração por secção (ex: acabamento.config.js)
│   └── sections/        # HTML por secção
├── backend/             # Código Google Apps Script (versão original)
├── server/              # Backend Node.js para integração com Notion
├── .github/workflows/   # Action para geração automática de `env.js` (URL do GAS)
└── README.md
```

---

## 📋 Exemplo de Payload

```json
{
  "funcionario": "Carlota",
  "of": "123456",
  "acao": "start",
  "hora": "07:30"
}
```

---

## 📄 Estrutura dos Sheets

### 🏷 "Acabamento", "Estofagem - Tempo", "Pintura", etc:

| Data | Funcionário | OF | Início | Fim | Duração (h) |
|------|-------------|----|--------|-----|--------------|

 - A coluna **Duração (h)** é calculada no Apps Script ou via fórmula.
   Para descontar a pausa das **10h00–10h10**, utilize:
   `=IF(AND(D2<>"";E2<>"");
      ROUND(((TIMEVALUE(E2)-TIMEVALUE(D2))
             -MAX(0;MIN(TIMEVALUE(E2);TIME(10;10;0))
                    -MAX(TIMEVALUE(D2);TIME(10;0;0))))*24;2);
      "")`

### 🧵 "Costura":

Inclui também colunas de quantidades por tipo de peça (Almofadas, Abas, etc.)

### ✅ "Estofagem - Registos Acab.":

Usada para registar quem fez cada tipo de acabamento final (Cru, TP). Permite cruzamento com produtividade de tempo e OF.

---

## 🧪 Como testar localmente (opcional)

1. Clonar este repositório
2. Instalar dependências e arrancar o backend em `server/` com `npm start`
3. Servir a pasta com `npx http-server docs`
4. Abrir `http://localhost:8080/index.html` e escolher uma secção
5. Confirmar que:
   - O clique no funcionário ativa o turno
   - O segundo clique regista o fim
   - Opções de **Cancelar** e **Terminar Incompleto** funcionam
   - Os dados são enviados via `POST` para o backend Node.js

---

## ☁️ Deploy

### 1. Backend Node.js (Render)

- Serviço Web na Render com Root Directory: `server`
- Build: `npm install`
- Start: `npm start`
- Runtime: Node 18+
- Variáveis de ambiente (na Render, não no GitHub Pages):
  - `NOTION_TOKEN` – token da integração Notion (prefixo atual: `ntn_…`)
  - `ACABAMENTO_DB_ID` – ID da base de dados no Notion
  - `ALLOW_ORIGIN` – `https://cifcoelho.github.io`
  - `PORT` – opcional (Render ignora e usa a sua própria)
- Depois do deploy, confirmar:
  - `GET https://registo-horas.onrender.com/health`
  - `GET https://registo-horas.onrender.com/notion/whoami`
  - `GET https://registo-horas.onrender.com/notion/meta`

Config do frontend (Acabamento):
- `frontend/JS/config/acabamento.config.js:1` → `webAppUrl: 'https://registo-horas.onrender.com/acabamento'`

### 2. Google Apps Script (legacy)

- Apps Script > Deploy as Web App > Acesso: "Anyone" 
- Copiar URL e adicionar como `WEB_APP_URL` em **GitHub Secrets**

### 3. GitHub Pages

- O conteúdo de `docs/` é publicado automaticamente via GitHub Actions  
- O ficheiro `env.js` com o URL é gerado dinamicamente no deploy:
  ```js
  window.ENV = { WEB_APP_URL: "https://script.google.com/..." };
  ```

---

## 🧠 Roadmap

- [x] Suporte a Acabamento (tempo por OF)
- [ ] Estofagem - Tempo (corrigir queue offline)
- [ ] Estofagem - Registos Acab. (quantidades)
- [ ] Costura (quantidade + tempo)
- [ ] Pintura (quantidade + tempo)
- [ ] Dashboard interativo com filtros e KPIs
- [ ] Sincronização com ERP

---

## 🔒 Autenticação futura

- O dashboard será protegido por autenticação (a definir)
- O registo de turnos permanecerá público para uso em iPads em modo kiosque

---

## ⚠️ Limitações

- Apenas **JavaScript puro** (sem frameworks) para suportar Safari 9
- Requer que os dados sejam enviados como `application/x-www-form-urlencoded` com `data=<urlencoded JSON>`
- Backend na Render (plano gratuito):
  - Adormece após ~15 min sem tráfego → a primeira chamada sofre “cold start” (10–60s)
  - Tarefas `cron` internas não executam se o serviço estiver a dormir (ex.: auto‑fecho às 12:03/17:03)
  - Mitigações:
    - Agendar um “wake-up ping” periódico ao endpoint `/health` (ex.: UptimeRobot 10–14 min)
    - Criar endpoint de trigger e usar um agendador externo para o auto‑close
    - Opcional: mudar para plano pago/sempre ligado se a latência for crítica

### Notion – notas importantes
- O token da integração agora pode começar por `ntn_` (válido). O importante é ser o token da integração ativa e a DB estar partilhada com essa integração.
- Partilhar a DB: abrir DB → menu `…` → Add connections → escolher a integração.
- Propriedades que o backend espera (nomes exatos):
  - “Colaborador” (title)
  - “Ordem de Fabrico” (number)
  - “Início do Turno” (date)
  - “Final do Turno” (date)
  - “Notas do Sistema” (rich_text)

### Testes em tablets (iPad 2)
- Aceder via GitHub Pages: `https://cifcoelho.github.io/registo-horas/frontend/HTML/acabamento.html`
- Garantir que o backend respondeu recentemente (ou fazer um toque inicial para “acordar”)
- Verificar início/fim/cancelamento e o “Terminar Incompleto”

### Outras secções
- Recomenda‑se reutilizar o mesmo backend com novas rotas (`/estofagem`, `/pintura`, `/costura`) e variáveis `*_DB_ID` por secção.

### Segurança e housekeeping
- O ficheiro `server/.env` não deve ser versionado. Está ignorado em `.gitignore` e foi removido do repositório em favor das variáveis de ambiente na Render.
- Se já houve exposição de tokens, **rode** o token na Notion e atualize na Render.
- Opcional: adicionar `server/.env.example` com placeholders para desenvolvimento local.
