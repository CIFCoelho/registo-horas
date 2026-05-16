# Deploy Render + GitHub Pages

Este documento descreve o **lado público / legado** do sistema, mantido para a secção **Estofagem** (e como fallback geral). O lado em produção principal é o mini-PC (CT100) — ver `docs/DEPLOY_LOCAL.md`.

## Convenção de branches

| Branch | Onde é usado | URLs nos configs |
|---|---|---|
| `main` | Mini-PC CT100 (`/opt/registo-horas`) | `http://192.168.1.103/<section>` |
| `dashboard-dev` | Render (backend) + GitHub Pages (frontend) | `https://registo-horas.onrender.com/<section>` |

Os branches **devem ter o mesmo código** em `server/`, `dashboard/`, `frontend/HTML/`, `frontend/CSS/`. **Só** diferem em:

- `frontend/JS/config/*.config.js` (`webAppUrl`)
- `dashboard/js/api.js` (`API_BASE`)

Qualquer outra divergência é um bug.

## Sincronizar `dashboard-dev` a partir de `main`

Sempre que houver melhorias em `main` (correções de servidor, mudanças no dashboard, novas views, etc.), tem de se trazê-las para `dashboard-dev`. O procedimento canónico:

```bash
git fetch origin
git checkout -B dashboard-dev origin/dashboard-dev
git merge origin/main --no-ff -m "Merge main into dashboard-dev"
# (a merge é fast-forwardable normalmente; --no-ff força um merge commit explícito)
```

Agora o tree contém o código de `main`, **com os URLs apontados para 192.168.1.103** (errado para o lado Render). Restaurar:

```bash
# Apontar todos os configs de secção para Render
sed -i.bak "s|http://192.168.1.103/|https://registo-horas.onrender.com/|g" frontend/JS/config/*.config.js
rm frontend/JS/config/*.config.js.bak

# Patch ao dashboard/js/api.js — substituir a deteção de hostname pela versão Render
# Pode editar manualmente OU usar este patch:
# Procurar:
#   if (h === 'localhost' || h === '127.0.0.1') return 'http://localhost:8787/api/dashboard';
#   if (h === '192.168.1.103') return 'http://192.168.1.103/api/dashboard';
#   return window.location.origin + '/api/dashboard';
# Substituir por:
#   if (h === 'localhost' || h === '127.0.0.1') return 'http://localhost:8787/api/dashboard';
#   return 'https://registo-horas.onrender.com/api/dashboard';

git status                       # confirmar apenas os configs + api.js mudaram
git diff frontend/JS/config dashboard/js/api.js

git add frontend/JS/config dashboard/js/api.js
git commit -m "fix(dashboard-dev): point configs and dashboard API base at Render"
git push origin dashboard-dev
```

Render deteta o push e faz redeploy automaticamente (~2-3 min).
GitHub Pages (se estiver a servir `dashboard-dev`) também reflete em ~1-2 min.

## Verificação Render após deploy

```bash
curl -s https://registo-horas.onrender.com/health
curl -s https://registo-horas.onrender.com/notion/whoami
curl -s https://registo-horas.onrender.com/api/dashboard/summary | jq '.activeWorkers | keys'
```

A primeira chamada após >15 min pode demorar 10-60 s (cold start do Render free tier).

## Variáveis de ambiente Render

As variáveis estão no painel da Render (Service → Environment). Mínimos:
- `NOTION_TOKEN`
- `ACABAMENTO_DB_ID`, `ESTOFAGEM_TEMPO_DB_ID`, `ESTOFAGEM_ACABAMENTOS_DB_ID`
- `COSTURA_DB_ID`, `PINTURA_DB_ID`, `PREPARACAO_MADEIRAS_DB_ID`, `MONTAGEM_DB_ID` (todos opcionais; ativam as respetivas rotas)
- `CUSTO_FUNCIONARIOS_DB_ID` (necessário para o dashboard)
- `OFS_DB_ID` (opcional, ativa o CRUD de OFs no dashboard)
- `DASHBOARD_USER`, `DASHBOARD_PASS` (necessário para login do dashboard)
- `ALLOW_ORIGIN` (CORS — incluir `https://cifcoelho.github.io`)
- `KEEPALIVE_URL` apontando para o próprio `/health` (ajuda contra cold starts)

Se uma variável estiver em falta no `.env` local mas presente em Render, deploys diretos do laptop falham. Sempre que se adicionar uma DB nova ou propriedade, atualizar `server/.env.example` para refletir a convenção.

## GitHub Pages

GitHub Pages serve apenas conteúdo estático. Convém estar configurado para servir o branch `dashboard-dev` (Settings → Pages → Source: `dashboard-dev` → `/ (root)`).

URL público: `https://cifcoelho.github.io/registo-horas/`
- Página inicial: `…/index.html`
- Estofagem: `…/frontend/HTML/estofagem.html`
- Dashboard: `…/dashboard/`

## Quando desativar Render

Quando a Estofagem migrar para o mini-PC (ver `docs/NEXT_STEPS.md`):
1. Confirmar que o tablet de Estofagem está a usar `http://192.168.1.103/estofagem` (via `main`).
2. Aguardar 1-2 semanas sem tráfego em Render para confirmar que ninguém depende dele.
3. Suspender o serviço na Render (ou eliminar — atenção a backups de logs).
4. Apontar o repositório GitHub Pages para `main` (ou desativar Pages).
5. Eliminar `dashboard-dev` no GitHub (e localmente).
6. Atualizar `README.md`, `CLAUDE.md` e este documento para refletir o fim do deploy híbrido.
