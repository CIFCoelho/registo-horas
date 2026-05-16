# Próximos passos

> Snapshot de fim de dia — **2026-05-16**.
> Lista do que está em aberto, com contexto suficiente para retomar sem revisitar a conversa.

## 🌿 Como o repositório é deployado (resumo curto)

- **`main`** → mini-PC CT100. Configs `192.168.1.103`. Deploy: `git pull && systemctl restart registo-backend`.
- **`dashboard-dev`** → Render + GitHub Pages. Configs `onrender.com`. Render auto-deploya ao push; Pages publica automaticamente.

Mudanças que afetam ambos (server, dashboard, frontend HTML/CSS) têm de ir aos dois branches. O processo está em `docs/DEPLOY_RENDER.md`.

## ✅ Concluído nesta sessão (16 Maio 2026)

- Auditoria completa da qualidade dos dados do dashboard.
- Correções B1–B5 + cards enganadores:
  - Crédito de unidades passa todo a `unitsAcabamento` (Cru/TP são por natureza acabamento); gráfico de Estofagem mostra agora **OFs distintas** em vez de unidades duplicadas.
  - `/api/dashboard/ofs` filtra `Final do Turno is_not_empty` (turnos em aberto deixaram de poluir a lista de OFs).
  - Helper `resolveDbProps(dbId)` com cache + utilização em `/api/dashboard/employee/:name` (sobrevive a renomeações de colunas Notion).
  - Cartão "Próxima OF Pronta" renomeado para **"Última OF Estofagem fechada"** (label correto para o que o endpoint devolve).
  - Cartão duplicado "Horas desde Janeiro" removido (era igual a "Total Horas (Ano)").
  - Aviso "X funcionários sem custo/hora definido" no cartão de custo total quando aplicável.
  - Turnos Preparação multi-OF: hora atribuída a cada OF é dividida em partes iguais e indicada com `~` + tooltip no detalhe da OF.
  - Favicon partido (`../assets/images/FC_favicon.png`) removido.
- **Nova view "Comparação"**: até 4 funcionários, mês + ano, cartões KPI lado-a-lado, gráfico de horas por secção, gráfico linear de horas por dia, tabela combinada com cor por funcionário.
- Backend: `/api/dashboard/employee/:name` passa a devolver também `units: [{date, of, type, id}]` para o ano.
- Year selector blindado contra desfases de relógio (mostra sempre 2024 → max(thisYear, 2026)).
- Documentação atualizada para refletir o deploy híbrido atual (CT100 + Estofagem em Render).
- Criado `docs/DEPLOY_LOCAL.md` com o procedimento de deploy.

## 🔴 Próxima prioridade — mitigação de turnos duplicados (Acabamento / Lixagem)

**Sintoma:** o tablet de Lixagem cria 2 turnos abertos para o mesmo funcionário quando há ligação intermitente; ao fechar, só um fecha — o mais antigo fica indefinidamente em aberto.

**Causa raíz (já investigada):**
1. Operador toca em Start. Otimismo da UI marca o botão como ativo.
2. Sem rede, o pedido vai para a fila de localStorage. Ao fim de 30 s o aviso "Sem ligação" desaparece.
3. O sincronizador periódico (`GET /acabamento/open` a cada 2 min) não vê o turno no Notion (porque ainda está na fila), e `applySessionsToUI` **apaga** o estado local → o botão deixa de aparecer como ativo.
4. Operador interpreta como "não ficou" e toca outra vez. Cria-se um segundo pedido em paralelo (um já em vôo, outro novo).
5. Ambos chegam ao servidor; `createShiftStart` não verifica duplicados → dois turnos abertos no Notion.

**Plano (a executar):**

A. **Servidor (fix definitivo)** — em `createShiftStart` (`server/index.js`), antes de criar:
```js
const existing = await findOpenShiftPage(dbId, data.funcionario, ofNumber).catch(() => null);
if (existing) {
  console.log(`⚠️  createShiftStart: open shift already exists for ${data.funcionario} OF ${ofNumber}, ignoring duplicate`);
  return; // idempotente, devolve 2xx
}
```
Aplicar o mesmo em `createShiftStartTextOF` (Preparação multi-OF).
Custo: +1 query Notion por `start`. Benefício: dois turnos abertos para o mesmo funcionário+OF deixam de poder existir.

B. **Cliente (UX, evita o segundo toque)** — em `applySessionsToUI` (`frontend/JS/sections/acabamento.js`, `shift-basic.js`, `estofagem.js`):
```js
// Antes de apagar uma sessão local ausente do servidor, ver se há um 'start' pendente
const pendingStarts = {};
loadQueue().forEach(q => {
  if (q.data?.acao === 'start') pendingStarts[q.data.funcionario] = String(q.data.of || '');
});
for (const localName in activeSessions) {
  if (!serverMap[localName] && !pendingStarts[localName]) {
    delete activeSessions[localName];
  }
}
```
Tem de ser ES5 (Safari 9 no iPad 2).

C. **Limpeza de órfãos atuais** — script `server/cleanup-orphans.js`:
- Listar todas as páginas com `Final do Turno is_empty` há mais de 24 h.
- Agrupar por funcionário+OF.
- Para cada grupo com >1 elemento: manter o mais recente, fechar os outros (`Final do Turno` = `Início do Turno` + nota "Fechado automaticamente — duplicado detetado em $data").
- Correr com `--dry-run` primeiro.

D. **Bónus (opcional)** — badge persistente "⌛ a sincronizar" no botão do funcionário quando há um `start` na fila para esse nome.

## 🟠 Em segundo plano

### Refactor: `resolveDbProps` para os restantes endpoints
Hoje só `/api/dashboard/employee/:name` usa o helper. Aplicar em:
- `/api/dashboard/employees`
- `/api/dashboard/ofs`
- `/api/dashboard/of/:ofNumber`

Mesmo padrão: construir o filtro com `props.funcionario`, `props.inicioTurno`, `props.finalTurno`, `props.of` em vez dos nomes literais. Hygiene — só interessa se alguém renomear colunas no Notion.

### Migração Estofagem para o mini-PC
Único componente ainda em Render. Quando se fizer:
1. Atualizar `frontend/JS/config/estofagem.config.js`: `webAppUrl: 'http://192.168.1.103/estofagem'`.
2. Confirmar que o tablet de Estofagem carrega a página servida pelo nginx local.
3. Render pode ser desativado depois de duas semanas sem tráfego.

### Pequenas inconsistências de UX da Visão Geral
- O filtro de Secção no topo só afeta as views Funcionários e OFs; os gráficos top-10 ficam sempre em Acabamento/Estofagem. Decidir se queremos: (a) deixar como está (são os "principais"), (b) mostrar o gráfico só da secção escolhida quando ≠ Todas, ou (c) sempre mostrar todas as secções num único gráfico.
- O cartão "Produtividade" no detalhe de OF e de Funcionário usa `units / hours`, mas `units` é só Estofagem-finishing — induz em erro em OFs principalmente de Pintura/Preparação. Considerar mover a métrica só para Acabamento, ou renomeá-la "Acab. unidades/h".

## ⚠️ Notas operacionais a ter em mente

- **Falha 6–16 Maio 2026:** o mini-PC ficou desligado ~10 dias depois de uma falha de luz e ninguém notou. Adicionar um watchdog (`systemctl enable registo-backend` com `Restart=always` + heartbeat para Tailscale/email/whatsapp) é um candidato a melhoria operacional.
- **Cache do dashboard:** TTL de 5 min para `/employees` e `/ofs`. Para validar uma alteração imediatamente, usar `?refresh=true` em qualquer endpoint da API ou clicar no botão "Atualizar" da Visão Geral.
- **Estofagem em Render:** continua a funcionar; o cold start pode demorar 10–60 s na primeira chamada do dia se o keep-alive falhar.
