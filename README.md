# 📘 Registo de Produtividade

Sistema leve e modular de registo de produtividade de colaboradores, com foco em ambientes industriais com equipamentos antigos (ex: iPad 2). A primeira versão usava Google Sheets (Apps Script), mas a secção **Acabamento** já envia registos para uma base de dados no Notion através de um pequeno backend Node.js alojado na Render.

Backend atual em produção: `https://registo-horas.onrender.com`

> 🛠 Em produção na secção **Acabamento**. Próximas secções serão migradas para o mesmo backend.

---

## 🚀 Funcionalidades

- Registo de **início e fim de turno** por funcionário e OF (Ordem de Fabrico)
- Compatível com **iPad 2 em modo quiosque (Safari 9.3.5)**
- Funciona **offline até 30 minutos** com fila local (`localStorage`) – implementado na secção **Acabamento**
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
- `POST /estofagem` – regista tempo e acabamentos da secção Estofagem (`start`, `end`, `registerAcabamento`)
- `GET /estofagem/open` – lista turnos em aberto da Estofagem
- `GET /estofagem/options?of=123` – devolve colaboradores de Acabamento atualmente a trabalhar na mesma OF (para sugerir nomes no "Registar Acab.")

Semântica de ações (`POST /acabamento`):
- `start`: cria página com “Colaborador”, “Ordem de Fabrico” e “Início do Turno” (data ISO do dia + hora dada).
- `end`: fecha o turno mais recente em aberto do colaborador, definindo “Final do Turno” (aplica desconto automático de 10 min se o turno atravessar a pausa das 10h00–10h10).
- `cancel`: fecha o turno em aberto e acrescenta “Notas do Sistema: Turno cancelado manualmente”.
- `finishIncomplete`: ajusta “Início do Turno” para a frente em `minutosRestantes` (desconta esse tempo) e acrescenta nota com o tipo e quem iniciou.

Semântica de ações (`POST /estofagem`):
- `start` / `end`: igual ao Acabamento, mas escrevendo na base "Estofagem - Tempo" com o mesmo ajuste automático da pausa da manhã.
- `registerAcabamento`: cria um registo na base "Estofagem - Registos Acab." com OF, quem registou, e os colaboradores selecionados para Cru/Tapa-Poros.
```

---

## 🗂 Estrutura do Repositório

```plaintext
registo-horas/
├── frontend/            # Frontend estático (publicável via GitHub Pages)
│   ├── HTML/            # Páginas por secção (ex.: acabamento.html)
│   ├── JS/
│   │   ├── sections/    # Lógica por secção (ex.: acabamento.js)
│   │   └── config/      # Configuração por secção (ex.: acabamento.config.js)
│   └── CSS/             # Estilos
├── server/              # Backend Node.js (Notion)
├── index.html           # Página inicial (seleção de secções)
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
3. Servir o repositório localmente (qualquer servidor estático). Ex.: `npx http-server .`
4. Abrir `http://localhost:8080/index.html` e escolher uma secção (ex.: Acabamento)
5. Confirmar que:
   - O clique no funcionário ativa o turno
   - O segundo clique regista o fim
   - Com um turno ativo, tocar no círculo da OF permite mudar de ordem: o turno atual fecha e um novo é aberto com a nova OF
   - Opções de **Cancelar** e **Terminar Incompleto** funcionam
   - Os dados são enviados via `POST` para o backend Node.js
   - A lista de turnos em aberto é retornada por `GET /acabamento/open` e a UI sincroniza sozinha após fechos registados noutros dispositivos
   - Na secção **Estofagem**, validar o início/fim do turno e o botão **Registar Acab.** (o modal deve mostrar os colaboradores de Acabamento ativos para a mesma OF)
   - Offline: com o backend parado/desligado, efetuar ações; ao reativar a rede, os pedidos pendentes são enviados automaticamente

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
  - `ESTOFAGEM_TEMPO_DB_ID` – ID da base de dados "Estofagem - Tempo"
  - `ESTOFAGEM_ACABAMENTOS_DB_ID` – ID da base de dados "Estofagem - Registos Acab."
  - `ALLOW_ORIGIN` – domínio(s) válidos apenas (sem caminho). Ex.: `https://cifcoelho.github.io` ou lista separada por vírgulas; `*` permite todos (usar com cuidado). O valor por omissão é `https://cifcoelho.github.io`.
  - `KEEPALIVE_URL` – URL a pingar (ex.: o próprio `/health` via Render)
  - `KEEPALIVE_ENABLED` – `true`/`false` (padrão `true`) para ativar o ping 07:30–17:30, dias úteis
  - (opcional) `ESTOFAGEM_REGISTOS_TITLE_PROP`, `ESTOFAGEM_REGISTOS_DATA_PROP`, `ESTOFAGEM_REGISTOS_OF_PROP`, `ESTOFAGEM_REGISTOS_CRU_PROP`, `ESTOFAGEM_REGISTOS_TP_PROP` – nomes alternativos das propriedades da base "Estofagem - Registos Acab." caso tenham sido personalizados (por omissão utiliza `Registo Por:`, `Data`, `Ordem de Fabrico`, `Cru Por:`, `TP por:`)
  - `PORT` – opcional (Render ignora e usa a sua própria)
- Depois do deploy, confirmar:
  - `GET https://registo-horas.onrender.com/health`
  - `GET https://registo-horas.onrender.com/notion/whoami`
  - `GET https://registo-horas.onrender.com/notion/meta`

Config do frontend (Acabamento):
- `frontend/JS/config/acabamento.config.js:1` → `webAppUrl: 'https://registo-horas.onrender.com/acabamento'`
- A página sincroniza periodicamente com `GET <webAppUrl>/open` para atualizar o estado visual (botão ativo) após fechos registados noutros dispositivos
 - A secção **Acabamento** inclui uma fila offline mínima (até 30 min) que guarda pedidos quando não há ligação e os reenvia automaticamente com backoff exponencial

Config do frontend (Estofagem):
- `frontend/JS/config/estofagem.config.js` → ajustar `webAppUrl`, lista de colaboradores e (opcionalmente) nomes sugeridos por omissão para o modal de acabamento
- A nova interface sincroniza turnos ativos com `GET /estofagem/open`, suporta fila offline (mesma filosofia do Acabamento) e, ao abrir o modal “Registar Acab.”, consulta `GET /estofagem/options?of=…` para listar os colaboradores atualmente ativos no Acabamento para a mesma OF
- Tal como no Acabamento, tocar no círculo da OF quando há turno ativo fecha a OF corrente e abre uma nova com o número introduzido

### 2. Google Apps Script (legacy)

- Apps Script > Deploy as Web App > Acesso: "Anyone" 
- Copiar URL e adicionar como `WEB_APP_URL` em **GitHub Secrets**

### 3. GitHub Pages

- Ativar GitHub Pages: Source = "Deploy from a branch" → Branch `main` → `/ (root)`.
- O site ficará acessível em `https://<utilizador>.github.io/registo-horas/index.html`.
- Ligações diretas às secções: `frontend/HTML/acabamento.html`, `frontend/HTML/estofagem.html`, etc.
- Conteúdo servido é estático (HTML/CSS/JS em `frontend/` e `index.html`).

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
  - Tarefas `cron` internas podem falhar adormecido; o serviço inclui apenas o ping keep‑alive 07:30–17:30 em dias úteis (configurável)
  - Mitigações:
    - Agendar um “wake‑up ping” periódico ao endpoint `/health` (ex.: UptimeRobot 10–14 min)
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

#### Estofagem – Tempo
- Mesma estrutura do Acabamento: "Colaborador", "Ordem de Fabrico", "Início do Turno", "Final do Turno" e "Notas do Sistema".
- O backend aplica automaticamente a subtração de 10 minutos sempre que o turno abrange a pausa das 10h00–10h10.

#### Estofagem – Registos Acab.
- Propriedades esperadas por omissão (personalizáveis via `ESTOFAGEM_REGISTOS_*`):
  - “Registo Por:” (title)
  - “Data” (date)
  - “Ordem de Fabrico” (number)
  - “Cru Por:” (rich_text)
  - “TP por:” (rich_text)
- Cada registo é criado quando o operador de Estofagem seleciona quem fez o **Cru** e o **Tapa-Poros** para uma OF.

#### Ajuste automático da pausa da manhã
- Sempre que um turno começa antes das 10h00 e termina depois das 10h10, o backend subtrai automaticamente 10 minutos ao “Final do Turno” quando processa a ação `end`.
- É adicionada a nota “Ajuste automático: pausa manhã (−10 min)” ao registo para manter histórico sem sobrescrever anotações anteriores.
- O comportamento aplica-se a pedidos vindos dos tablets e também a terminações lançadas manualmente via API.

#### Sincronização do frontend
- A UI guarda o estado local dos turnos ativos em `localStorage`.
- Um sincronizador leve faz `GET <webAppUrl>/open` no arranque, a cada 2 minutos e quando a página volta a estar visível, limpando/atualizando os botões “ativos” após fechamentos registados noutros dispositivos.
- Compatibilidade: usa `XMLHttpRequest` para suportar Safari 9 (iPad 2). A hora (`hora`) é formatada em `HH:MM` via um fallback compatível, em vez de depender de `toLocaleTimeString` em navegadores antigos.

#### Fila Offline – Acabamento
- As ações `start`, `end`, `cancel`, `finishIncomplete` são enfileiradas em `localStorage` quando a rede falha (status 0/429/5xx) e reenviadas automaticamente.
- Backoff exponencial: 5s, 10s, 20s, … até 10 min, com tentativa periódica a cada ~20s e também quando a página volta a estar visível/online.
- Expiração: itens com mais de 30 minutos são descartados.
- UI: mostra “Sem ligação. Guardado para envio automático.” quando um pedido é enfileirado.
- Limitação conhecida: ao trocar de OF em modo offline, o pedido `start` pode chegar antes do `end` anterior; como o backend fecha “o turno mais recente” do colaborador, um `end` tardio pode fechar a OF mais recente. Mitigação futura: fechar por OF específica no backend.

#### Fuso horário
- O backend força `Europe/Lisbon` (`process.env.TZ`) para garantir consistência de horários no Notion e nos jobs de cron.

### Testes em tablets (iPad 2)
- Aceder via GitHub Pages: `https://cifcoelho.github.io/registo-horas/frontend/HTML/acabamento.html`
- Garantir que o backend respondeu recentemente (ou fazer um toque inicial para “acordar”)
- Verificar início/fim/cancelamento e o “Terminar Incompleto”
- Testar offline: desligar rede, efetuar ações, voltar a ligar e confirmar envio automático

### Outras secções
- O backend já expõe um fluxo genérico (`shift-basic.js`) para secções baseadas em turnos. Configure as variáveis de ambiente opcionais `COSTURA_DB_ID`, `PINTURA_DB_ID`, `PREPARACAO_MADEIRAS_DB_ID` e `MONTAGEM_DB_ID` para ativar as rotas `/costura`, `/pintura`, `/preparacao` e `/montagem`.
- Para ajustar nomes de colunas na base de Pintura, utilize `PINTURA_ISOLANTE_PROP`, `PINTURA_TAPA_PROP`, `PINTURA_VERNIZ_PROP` e `PINTURA_AQUEC_PROP` (por omissão: "Isolante Aplicado (Nº)", "Tapa-Poros Aplicado Nº", "Verniz Aplicado (Nº)", "Aquecimento - Nº de Horas").
- A secção **Preparação de Madeiras** replica o fluxo do Acabamento (início/fim/cancelamento e troca de OF) e envia dados para `https://registo-horas.onrender.com/preparacao`. Operadores apresentados: Cristina, Diogo, João e Pedro.

### Segurança e housekeeping
- O ficheiro `server/.env` não deve ser versionado. Está ignorado em `.gitignore` e foi removido do repositório em favor das variáveis de ambiente na Render.
- Se já houve exposição de tokens, **rode** o token na Notion e atualize na Render.
- Opcional: adicionar `server/.env.example` com placeholders para desenvolvimento local.
