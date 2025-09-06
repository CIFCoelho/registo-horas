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
- `POST /acabamento` – recebe ações do frontend (`start`, `end`, `cancel`, `finishIncomplete`)
- `GET /acabamento/open` – lista turnos em aberto para conciliação do frontend (sincronização de UI)
- `GET /cron/auto-close?time=HH:MM&key=SECRET[&subtract=MIN]` – trigger manual/externo do auto‑fecho (usa‑se com um agendador externo)

Semântica de ações (`POST /acabamento`):
- `start`: cria página com “Colaborador”, “Ordem de Fabrico” e “Início do Turno” (data ISO do dia + hora dada).
- `end`: fecha o turno mais recente em aberto do colaborador, definindo “Final do Turno”.
- `cancel`: fecha o turno em aberto e acrescenta “Notas do Sistema: Turno cancelado manualmente”.
- `finishIncomplete`: ajusta “Início do Turno” para a frente em `minutosRestantes` (desconta esse tempo) e acrescenta nota com o tipo e quem iniciou.
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
   - A lista de turnos em aberto é retornada por `GET /acabamento/open` e a UI sincroniza sozinha após auto‑fecho

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
  - `ALLOW_ORIGIN` – pode ser domínio simples (`https://cifcoelho.github.io`) ou lista separada por vírgulas; `*` permite todos (usar com cuidado)
  - `CRON_SECRET` – secreto para proteger `GET /cron/auto-close`
  - `KEEPALIVE_URL` – URL a pingar (ex.: o próprio `/health` via Render)
  - `KEEPALIVE_ENABLED` – `true`/`false` (padrão `true`) para ativar o ping 07:30–17:30, dias úteis
  - `PORT` – opcional (Render ignora e usa a sua própria)
- Depois do deploy, confirmar:
  - `GET https://registo-horas.onrender.com/health`
  - `GET https://registo-horas.onrender.com/notion/whoami`
  - `GET https://registo-horas.onrender.com/notion/meta`

Config do frontend (Acabamento):
- `frontend/JS/config/acabamento.config.js:1` → `webAppUrl: 'https://registo-horas.onrender.com/acabamento'`
- A página sincroniza periodicamente com `GET <webAppUrl>/open` para atualizar o estado visual (botão ativo) após auto‑fecho

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
  - Tarefas `cron` internas podem falhar adormecido; o serviço inclui:
    - Ping keep‑alive 07:30–17:30 em dias úteis (configurável)
    - Endpoint manual `GET /cron/auto-close` para ser chamado por um agendador externo (recomendado)
  - Mitigações:
    - Agendar um “wake‑up ping” periódico ao endpoint `/health` (ex.: UptimeRobot 10–14 min)
    - Agendar o auto‑fecho externo: `GET /cron/auto-close?time=12:00&subtract=10&key=CRON_SECRET` e `GET /cron/auto-close?time=17:00&key=CRON_SECRET`
    - Opcional: plano pago/sempre ligado se a latência for crítica

### Notion – notas importantes
- O token da integração agora pode começar por `ntn_` (válido). O importante é ser o token da integração ativa e a DB estar partilhada com essa integração.
- Partilhar a DB: abrir DB → menu `…` → Add connections → escolher a integração.
- Propriedades que o backend espera (nomes exatos):
  - “Colaborador” (title)
  - “Ordem de Fabrico” (number)
  - “Início do Turno” (date)
  - “Final do Turno” (date)
  - “Notas do Sistema” (rich_text)

#### Auto‑fecho (Notion)
- 12:00: fecha automaticamente turnos abertos com “Início do Turno” ≤ 12:00, registando “Final do Turno” às 11:50 (−10 min pausa manhã) e anotando em “Notas do Sistema”.
- 17:00: fecha automaticamente turnos abertos com “Início do Turno” ≤ 17:00, registando “Final do Turno” às 17:00 (sem subtração), com nota.
- Segurança: re‑execuções (12:10/12:20 e 17:10/17:20/17:30) aplicam filtros para nunca fechar turnos iniciados após a hora alvo.
- Paginação: o backend percorre todas as páginas de resultados, não apenas as primeiras 100.

#### Sincronização do frontend
- A UI guarda o estado local dos turnos ativos em `localStorage`.
- Um sincronizador leve faz `GET <webAppUrl>/open` no arranque, a cada 2 minutos e quando a página volta a estar visível, limpando/atualizando os botões “ativos” após auto‑fecho.
- Compatibilidade: usa `XMLHttpRequest` para suportar Safari 9 (iPad 2).

#### Fuso horário
- O backend força `Europe/Lisbon` (`process.env.TZ`) para garantir consistência de horários no Notion e nos jobs de cron.

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
