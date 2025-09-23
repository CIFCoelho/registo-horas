# 📘 Registo de Produtividade

Sistema leve de registo de produtividade desenhado para ambientes industriais com equipamentos antigos (ex.: iPad 2 em modo quiosque). A primeira geração comunicava com Google Sheets através de Apps Script; atualmente a secção **Acabamento** já está ligada a uma base de dados Notion via um backend Node.js alojado na Render.

Backend em produção: `https://registo-horas.onrender.com`

> 🛠 O fluxo moderno está ativo apenas na secção **Acabamento**. As restantes páginas continuam a usar o fluxo legado baseado em Google Sheets até serem migradas.

---

## 🚀 Funcionalidades principais

- Registo de **inicio/fim de turno** por colaborador e Ordem de Fabrico (OF).
- Compatibilidade com **Safari 9.3.5** (iPad 2 em modo quiosque).
- Fila offline com `localStorage` (até ~30 min) para o fluxo de **Acabamento**.
- Integração direta com **Notion** via backend Node.js, com cálculo automático da duração de turnos.
- Ações extra: **Cancelar turno** e **Terminar Incompleto** (ajusta a duração e regista notas).
- Fluxo legado mantém **Google Sheets** via Apps Script para as restantes secções.

---

## 🧱 Arquitetura atual

```plaintext
iPad 2 (Safari 9)
   ↓ (JavaScript puro + fila offline via localStorage)
GitHub Pages (frontend estático em /frontend)
   ↓ (POST application/x-www-form-urlencoded)
Backend Node.js (server/index.js)
   ↓
Notion (base de dados da secção Acabamento)
```

### Endpoints ativos no backend Node.js

- `GET /health` — estado geral e origem permitida.
- `GET /notion/whoami` — valida token e devolve o “bot user”.
- `GET /notion/meta` — devolve propriedades esperadas pela base Notion.
- `POST /acabamento` — recebe ações `start`, `end`, `cancel`, `finishIncomplete`.
- `GET /acabamento/open` — lista turnos em aberto para conciliar a UI offline.
- `GET /cron/auto-close?time=HH:MM&key=SECRET[&subtract=MIN]` — executa auto-fecho manual.

### Semântica das ações (`POST /acabamento`)

| Ação              | Efeito                                                                 |
| ----------------- | ----------------------------------------------------------------------- |
| `start`           | Cria página no Notion com “Colaborador”, “Ordem de Fabrico” e inicio.   |
| `end`             | Fecha o turno mais recente desse colaborador e define “Final do Turno”. |
| `cancel`          | Fecha o turno aberto e adiciona nota “Turno cancelado manualmente”.     |
| `finishIncomplete`| Avança o inicio em `minutosRestantes` e adiciona nota com tipo e autor. |

---

## 🗂 Estrutura do repositório

```plaintext
registo-horas/
├── frontend/            # Frontend estático (publicável via GitHub Pages)
│   ├── HTML/            # Páginas por secção (ex.: acabamento.html)
│   ├── JS/
│   │   ├── sections/    # Lógica por secção (acabamento.js é o fluxo moderno)
│   │   └── config/      # Configurações de cada secção (operadores, cores, URLs)
│   └── CSS/             # Estilos partilhados
├── server/              # Backend Node.js (Notion)
│   ├── index.js         # API Express + cron de auto-fecho
│   └── check-notion.js  # Script utilitário para validar credenciais/metadados
├── docs/REVIEW.md       # Notas de revisão e melhorias planeadas
└── index.html           # Página inicial com seleção de secções
```

---

## 🛠 Configuração e execução local

### 1. Pré-requisitos

- Node.js 18 ou superior.
- Conta Notion com uma base de dados configurada com as propriedades esperadas.

### 2. Backend (Notion)

```bash
cd server
npm install
npm start
```

Configurar variáveis de ambiente (Render ou `.env` local):

| Variável            | Descrição                                                                 |
| ------------------- | ------------------------------------------------------------------------- |
| `NOTION_TOKEN`      | Token da integração Notion (começa por `secret_` ou `ntn_`).              |
| `ACABAMENTO_DB_ID`  | ID da base de dados que armazena os turnos de Acabamento.                 |
| `ALLOW_ORIGIN`      | Domínio(s) autorizados, separados por vírgula (ex.: `https://…github.io`). |
| `CRON_SECRET`       | Segredo para proteger `GET /cron/auto-close`.                             |
| `KEEPALIVE_URL`     | URL a pingar (opcional, usado para manter a Render acordada).             |
| `KEEPALIVE_ENABLED` | `true`/`false` para ativar o ping programado (padrão `true`).             |
| `PORT`              | Porta local (Render ignora).                                              |

> Dica: executar `node check-notion.js` dentro da pasta `server/` confirma se o token e a base estão acessíveis.

### 3. Frontend

1. Na raiz do repositório, servir os ficheiros estáticos (ex.: `npx http-server .`).
2. Abrir `http://localhost:8080/index.html` (ajuste a porta consoante o servidor estático).
3. Selecionar **Acabamento** e validar inicio/fim/cancelamento de turnos.
4. Verificar que `frontend/JS/config/acabamento.config.js` aponta para o backend (`webAppUrl`).

### 4. Verificações rápidas

- `GET http://localhost:8787/health`
- `GET http://localhost:8787/notion/whoami`
- `GET http://localhost:8787/notion/meta`

---

## 🔄 Sincronização e modo offline (Acabamento)

- A UI usa `localStorage` para guardar o estado dos turnos ativos e uma fila offline.
- Quando a rede falha (`status` 0/429/5xx), as ações são enfileiradas e reenviadas com backoff exponencial (5s → 10s → … → máx. 10 min).
- Pedidos com mais de 30 minutos são descartados; a UI informa “Sem ligação. Guardado para envio automático.”.
- A página sincroniza com `GET <webAppUrl>/open` no arranque, a cada 2 minutos e sempre que o documento volta a estar visível.
- Limitação conhecida: se o utilizador muda de OF offline, um `end` atrasado pode fechar a OF errada (o backend fecha o turno mais recente).

---

## ⏱ Auto-fecho agendado

O backend agenda tarefas (`node-cron`) com timezone `Europe/Lisbon`:

- 12:00 — fecha turnos iniciados até 12:00, regista final às 11:50 (desconta pausa) e adiciona nota.
- 12:10 & 12:20 — reexecuções de segurança para o fecho das 12:00.
- 17:00 — fecha turnos iniciados até 17:00 e regista final às 17:00.
- 17:10, 17:20 & 17:30 — reexecuções de segurança para o fecho das 17:00.

É possível forçar execuções manualmente com `GET /cron/auto-close` usando `CRON_SECRET`.

---

## 🧾 Fluxo legado (Google Sheets)

As secções que ainda não migraram para o backend Node.js usam Apps Script. Estrutura típica das sheets:

| Colunas padrão                | Observações                                                                                  |
| ----------------------------- | -------------------------------------------------------------------------------------------- |
| Data · Funcionário · OF · Inicio · Fim · Duração (h) | Fórmula sugerida para descontar a pausa das 10:00–10:10: `=IF(AND(D2<>"";E2<>""), ROUND(((TIMEVALUE(E2)-TIMEVALUE(D2)) - MAX(0; MIN(TIMEVALUE(E2); TIME(10;10;0)) - MAX(TIMEVALUE(D2); TIME(10;0;0)) ))*24; 2), "")` |
| Campos extra (Costura)        | Quantidades por tipo de peça (Almofadas, Abas, …).                                           |
| Estofagem - Registos Acab.    | Regista quem executou acabamentos Cru e Tapa-Poros para cruzamento com tempos.               |

> A pasta `docs/REVIEW.md` contém propostas para modularizar scripts Apps Script e unificar o frontend legado.

---

## 🧭 Roadmap resumido

- [x] Migrar **Acabamento** para Notion + backend Node.js.
- [ ] Migrar **Estofagem** (tempo + registos de acabamentos) para o backend.
- [ ] Migrar **Costura** e **Pintura** com suporte a quantidades/tempo.
- [ ] Criar dashboard interativo e integração com ERP.

---

## ⚠️ Limitações e notas

- Sem frameworks modernos: apenas **JavaScript puro** para manter compatibilidade com Safari 9.
- As chamadas devem enviar `application/x-www-form-urlencoded` com a carga útil em `data=<JSON>` (compatibilidade Safari).
- Render (plano gratuito) entra em “cold start” após ~15 min de inatividade; considerar pings de keep-alive ou plano pago.
- Partilhe sempre a base Notion com a integração configurada; propriedades obrigatórias: “Colaborador” (title), “Ordem de Fabrico” (number), “Inicio do Turno” (date), “Final do Turno” (date) e “Notas do Sistema” (rich_text).
- Para tablets antigos, testar via GitHub Pages: `https://cifcoelho.github.io/registo-horas/frontend/HTML/acabamento.html`.

---

## 🔒 Próximos passos de segurança

- Manter tokens Notion fora do repositório (`server/.env` está ignorado).
- Atualizar o token imediatamente se ocorrer exposição acidental.
- Considerar adicionar `server/.env.example` para facilitar onboarding local (ainda não existente).

