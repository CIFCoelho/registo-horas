# Deploy local — mini-PC (CT100 / Proxmox)

> **Authoritative runbook** lives at
> `~/Documents/02_Business/pixel_compile/01_clients/_ACTIVE/Certoma/01_projects/local_server_pve/04_maintenance/runbook.md`
> (outside the repo).
> This file is the quick reference for shipping code changes.

## Onde corre o quê

| Componente | Caminho no mini-PC |
|---|---|
| Código | `/opt/registo-horas` (git checkout de `origin/main`) |
| Serviço | `systemd unit registo-backend` (Node 18+, Express, porta 8787) |
| Reverse proxy + static | nginx em :80 → :8787; serve também `dashboard/` e `frontend/` |
| Logs | `journalctl -u registo-backend` |
| Configuração | `/opt/registo-horas/server/.env` (não versionado) |

Acesso:
- LAN da fábrica: `ssh root@192.168.1.103`
- Tailscale (remoto): `ssh root@100.121.124.108` → `pct exec 100 -- bash`

## Procedimento de deploy

### Do laptop (versão para GitHub)
```bash
git status                              # confirmar o que vai ser enviado
git add <ficheiros>
git commit -m "<mensagem>"
git push origin main
```

### No mini-PC (versão para a produção)
```bash
ssh root@192.168.1.103
cd /opt/registo-horas
git pull origin main
# Só correr o passo seguinte se server/package.json mudou:
# cd server && npm install
systemctl restart registo-backend
```

Atalho one-liner:
```bash
ssh root@192.168.1.103 'cd /opt/registo-horas && git pull origin main && systemctl restart registo-backend'
```

### Verificação rápida
```bash
# No mini-PC:
systemctl status registo-backend --no-pager | head -10
curl -s http://localhost/health
curl -s http://localhost/api/dashboard/summary | jq '.activeWorkers | keys'
journalctl -u registo-backend -n 20 --no-pager

# Do laptop:
curl -s http://192.168.1.103/health
```

## Cache do browser depois de um deploy

O nginx serve `dashboard/*.js` com cabeçalhos de cache habituais. Se o tab "Comparação" (ou qualquer alteração ao dashboard) não aparecer depois do deploy:

1. Cache-buster URL (mais fiável): `http://192.168.1.103/dashboard/?v=AAAAMMDD`
2. DevTools (F12) → Network → ✅ *Disable cache* → recarregar (Ctrl+Shift+R)
3. Verificar service workers em DevTools → Application → Service Workers.

## Quando precisas mesmo de `npm install`

- Só quando `server/package.json` foi alterado no `git pull`.
- Se ficares em dúvida, corre `cd /opt/registo-horas/server && npm install` — é idempotente.

## O que NÃO precisa de `systemctl restart`

- Edições apenas em `dashboard/*` ou `frontend/*` (HTML/CSS/JS estáticos). O nginx serve diretamente do disco; basta um `git pull`.
- O `restart` é necessário para alterações em `server/index.js`, `server/package.json`, ou variáveis de ambiente.

## Rollback de emergência

```bash
ssh root@192.168.1.103
cd /opt/registo-horas
git log --oneline -10        # encontrar o commit anterior estável
git checkout <commit-anterior>
systemctl restart registo-backend
# Depois de resolvido:
git checkout main
```

Para rollback completo do container: Proxmox UI → CT100 → Snapshots → Rollback.

## Frontend Estofagem (caso especial)

Apenas a Estofagem ainda usa o backend em Render + frontend em GitHub Pages.
Mudanças à secção Estofagem **não** vão pelo deploy local — passam pelo deploy normal da Render (auto-deploy de `main`) e GitHub Pages.

Quando a Estofagem for migrada para o mini-PC, basta:
1. Mudar `frontend/JS/config/estofagem.config.js` → `webAppUrl: 'http://192.168.1.103/estofagem'`
2. Servir `frontend/HTML/estofagem.html` pelo nginx local (já está no checkout).
3. Validar que o `.env` do `registo-backend` tem `ESTOFAGEM_TEMPO_DB_ID` e `ESTOFAGEM_ACABAMENTOS_DB_ID` apontados para o mesmo workspace do Notion.
4. Apontar o tablet de Estofagem ao novo URL e reiniciar o kiosk.
