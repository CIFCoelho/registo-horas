# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Registo de Produtividade** is a lightweight, modular productivity tracking system for industrial environments optimized for legacy devices (iPad 2 with Safari 9.3.5). The system tracks employee shifts by section and work order (OF - Ordem de Fabrico), with data persisting to Notion databases via a Node.js backend.

### Production deployment (as of May 2026)

**Most of the system runs locally** in Proxmox container CT100 on the mini-PC at `192.168.1.103`:
- Backend: `systemd unit registo-backend` (Node 18+, Express), code at `/opt/registo-horas`, listens on 8787.
- nginx fronts the box on port 80 and serves the tablet frontends + `/dashboard/` static files.
- **Estofagem is the exception** — its tablet still POSTs to `https://registo-horas.onrender.com/estofagem` (Render legacy). Its frontend is still served by GitHub Pages. The Estofagem migration is the only remaining backend item.
- Notion is the single source of truth for both deployments, so the dashboard sees all sections regardless of which backend handled the write.

Deploy workflow: see `docs/DEPLOY_LOCAL.md` (mini-PC) and `docs/DEPLOY_RENDER.md` (Render + Pages). The external runbook at `~/Documents/02_Business/pixel_compile/01_clients/_ACTIVE/Certoma/01_projects/local_server_pve/04_maintenance/runbook.md` is the authoritative version for the local side.

### Branches: `main` vs `dashboard-dev`

Two branches feed two deployments:

- **`main`** → mini-PC CT100. Section configs in `frontend/JS/config/*.config.js` point to `http://192.168.1.103/<section>`. `dashboard/js/api.js` resolves to the same host.
- **`dashboard-dev`** → Render (backend) + GitHub Pages (frontend). The same files point to `https://registo-horas.onrender.com/<section>`.

Both branches must carry **identical** code in `server/`, `dashboard/`, `frontend/HTML/`, `frontend/CSS/`. Only the URL-pointing files differ. After every meaningful change on `main`, sync `dashboard-dev`:

```bash
git fetch origin
git checkout -B dashboard-dev origin/dashboard-dev
git merge origin/main --no-ff -m "Merge main into dashboard-dev"
sed -i.bak "s|http://192.168.1.103/|https://registo-horas.onrender.com/|g" frontend/JS/config/*.config.js
rm frontend/JS/config/*.config.js.bak
# Then manually patch dashboard/js/api.js (replace the 192.168.1.103 branch with a Render fallback)
git add frontend/JS/config dashboard/js/api.js
git commit -m "fix(dashboard-dev): point configs and dashboard API at Render"
git push origin dashboard-dev
```

Render auto-redeploys; GitHub Pages re-publishes if configured to serve `dashboard-dev`. See `docs/DEPLOY_RENDER.md` for the verification steps.

### Architecture

```
Factory tablets (iPad 2, Android 7")
  ├─ Acabamento, Pintura, Preparação, Montagem → nginx on 192.168.1.103
  └─ Estofagem                                 → GitHub Pages
                      ↓
   Node.js Backend (server/index.js, Express)
  ├─ CT100 mini-PC: systemd + nginx :80 → :8787 (most sections + dashboard API)
  └─ Render                                    (only /estofagem)
                      ↓
                   Notion API (shared databases)
```

### Key Constraints
- **Safari 9 compatibility required**: No modern JS features (no `fetch`, no `const`/`let`, limited ES5)
- **Vanilla JavaScript only**: No frameworks or transpilers
- **Offline resilience**: Queue system with localStorage for up to 30 minutes
- **Form encoding**: Requests sent as `application/x-www-form-urlencoded` with `data=<urlencoded JSON>`
- **Render free tier**: Backend cold starts (~10-60s) after 15min inactivity

## Development Commands

### Backend (server/)

```bash
# Install dependencies
cd server
npm install

# Start server locally
npm start

# Check Notion connection
node check-notion.js

# Check Estofagem database structure
node check-estofagem.js
```

### Frontend Testing

Serve the repository with any static server:
```bash
npx http-server .
# Then visit: http://localhost:8080/index.html
```

Or test directly via GitHub Pages:
```
https://cifcoelho.github.io/registo-horas/frontend/HTML/acabamento.html
```

## Code Architecture

### Frontend Structure

```
frontend/
├── HTML/            # Section pages (acabamento.html, estofagem.html, etc.)
├── JS/
│   ├── sections/    # Section logic (acabamento.js, estofagem.js, shift-basic.js)
│   └── config/      # Section configurations (*.config.js)
└── CSS/             # Styling
```

**Key Pattern:**
- Each section has a config file (`window.SECTION_CONFIG`) defining `section`, `webAppUrl`, `names`, and optional settings
- Section JS files read from `window.SECTION_CONFIG` for flexibility
- `shift-basic.js` provides generic shift logic reusable across sections
- `acabamento.js` and `estofagem.js` contain specialized section logic

### Backend Structure (server/index.js)

Single monolithic Express server (~800 lines) handling all sections:

**Core Functions:**
- `hhmmToTodayISO()` - Convert HH:MM to ISO datetime for today (Europe/Lisbon)
- `findPropertyByAlias()` - Flexible property name matching for Notion databases
- `findOpenShiftPage()` - Locate open shift for employee (optionally by OF)
- `createShiftStart()` - Create new shift record
- `closeShiftEntry()` - Close shift with automatic 10min break deduction (10:00-10:10)
- `cancelShiftEntry()` - Cancel open shift with system note
- `listOpenShifts()` - Fetch currently active shifts for UI sync
- `computeBreakAdjustment()` - Apply morning break deduction logic
- `combineNotes()` - Append system notes without overwriting

**Endpoints:**
- `GET /health` - Health check
- `GET /notion/whoami` - Validate Notion token
- `GET /notion/meta` - Database metadata
- `POST /acabamento` - Acabamento actions (`start`, `end`, `cancel`, `finishIncomplete`)
- `GET /acabamento/open` - List open Acabamento shifts
- `POST /estofagem` - Estofagem time actions
- `GET /estofagem/open` - List open Estofagem shifts
- `GET /estofagem/options?of=123` - List Acabamento workers on same OF
- Generic sections via `registerBasicShiftSection()`: `/costura`, `/pintura`, `/preparacao`, `/montagem`

### Offline Queue System

Frontend sections implement an offline-first queue:
- Stores failed requests in `localStorage` with exponential backoff
- Auto-retries every ~20s with increasing delays (5s → 10s → 20s → up to 10min)
- 30-minute expiration for queued items
- Flushes on page visibility changes and network status changes
- Shows user feedback: "Sem ligação. Guardado para envio automático."

**Implementation notes:**
- Uses `XMLHttpRequest` (not fetch) for Safari 9 compatibility
- Request locks prevent duplicate submissions
- Queue key includes employee+OF to prevent duplicates

### Notion Database Structure

Standard shift databases expect these properties:
- **Funcionário** (title) - Employee name
- **Ordem de Fabrico** (number) - Work order number (0 = general work)
- **Início do Turno** (date) - Shift start
- **Final do Turno** (date) - Shift end
- **Notas do Sistema** (rich_text) - System notes

**Property Aliases:** The backend uses `PROPERTY_ALIASES` to handle workspace migrations and naming variations (e.g., "Funcionário" = "Colaborador" = "funcionario").

**Special Databases:**
- **Estofagem - Registos Acab.**: Tracks who did Cru/Tapa-Poros finishing work per OF
  - Properties: "Registo Por:", "Data", "Ordem de Fabrico", "Cru Por:", "TP por:"
- **Pintura**: Includes quantity columns (Isolante, Tapa-Poros, Verniz, Aquecimento hours)

### Automatic Break Deduction

When a shift spans the morning break (10:00-10:10), the backend automatically:
1. Subtracts 10 minutes from the end time
2. Appends note: "Ajuste automático: pausa manhã (−10 min)"
3. Preserves any existing notes

Logic in `computeBreakAdjustment()` at server/index.js:470.

### Environment Variables (Render)

Required:
- `NOTION_TOKEN` - Integration token (supports `ntn_` prefix)
- `ACABAMENTO_DB_ID` - Acabamento database ID
- `ESTOFAGEM_TEMPO_DB_ID` - Estofagem time database
- `ESTOFAGEM_ACABAMENTOS_DB_ID` - Estofagem finishing records

Optional:
- `COSTURA_DB_ID`, `PINTURA_DB_ID`, `PREPARACAO_MADEIRAS_DB_ID`, `MONTAGEM_DB_ID`
- `ALLOW_ORIGIN` - CORS origins (default: `https://cifcoelho.github.io`, supports comma-separated list or `*`)
- `KEEPALIVE_URL` - URL to ping for keep-alive
- `KEEPALIVE_ENABLED` - `true`/`false` (default `true`) - Pings 07:30-17:30 weekdays
- `PINTURA_*_PROP` - Custom property names for Pintura quantities
- `ESTOFAGEM_REGISTOS_*_PROP` - Custom property names for Estofagem finishing records

Server exits on startup if `NOTION_TOKEN`, `ACABAMENTO_DB_ID`, or Estofagem IDs are missing.

## Common Patterns

### Adding a New Section

1. **Create config file** (e.g., `frontend/JS/config/newSection.config.js`):
```javascript
window.SECTION_CONFIG = {
  section: 'NewSection',
  webAppUrl: 'https://registo-horas.onrender.com/newSection',
  names: ['Worker1', 'Worker2'],
  storagePrefix: 'newSection' // for localStorage namespacing
};
```

2. **Create HTML page** using `acabamento.html` as template
3. **Link section JS** (`shift-basic.js` for simple shifts, or custom logic)
4. **Add backend route** using `registerBasicShiftSection('/newSection', NEW_SECTION_DB_ID, 'NewSection')`
5. **Configure env vars** in Render with database ID
6. **Update index.html** home page with navigation link

### Testing Offline Queue

1. Start backend locally
2. Open section page in browser
3. Stop backend server
4. Perform shift actions (start/end)
5. Check console for "Sem ligação. Guardado para envio automático."
6. Restart backend
7. Verify automatic retry and success

### Debugging Notion Property Mismatches

Run `node server/check-notion.js` or `node server/check-estofagem.js` to see actual database schema. Compare with `PROPERTY_ALIASES` in server/index.js:50-56.

## Important Implementation Details

### Race Condition Mitigation
When closing shifts, always pass the OF number to `findOpenShiftPage()` to ensure the correct shift is closed, even when offline requests arrive out of order.

### Safari 9 Compatibility Checklist
- Use `var` instead of `const`/`let`
- Use `XMLHttpRequest` instead of `fetch`
- Avoid arrow functions, template literals, destructuring
- Use explicit polyfills for time formatting (`formatHHMM` helper)
- Test on actual iPad 2 or iOS 9 simulator

### Frontend-Backend Sync
The frontend periodically calls `GET <section>/open` to reconcile local state with server:
- On page load
- Every 2 minutes
- When page becomes visible (visibility API)
- After successful operations

This ensures UI shows correct active shifts even when closed from other devices.

### Timezone Handling
Server forces `process.env.TZ = 'Europe/Lisbon'` to ensure consistent timestamps across Notion records and cron jobs.

### OF=0 (General Work)
When `of: "0"` or `of: 0`, the system records "general work" not tied to a specific order. UI displays as "Geral".

## Deployment

### Primary: local mini-PC (CT100 on Proxmox)

Used for: Acabamento, Pintura, Preparação, Montagem tablet endpoints + entire `/dashboard/`.

```bash
# From the laptop, after pushing to origin/main:
ssh root@192.168.1.103
cd /opt/registo-horas && git pull origin main && systemctl restart registo-backend
```

The `npm install` step is only needed if `server/package.json` changed. Static dashboard files take effect on `git pull` (nginx serves them directly); only `server/index.js` changes need the systemd restart.

Verify after deploy:
```bash
curl -s http://localhost/health
journalctl -u registo-backend -n 20 --no-pager
curl -s http://localhost/api/dashboard/summary | jq '.activeWorkers | keys'
```

Tailscale reach: `ssh root@100.121.124.108 'pct exec 100 -- bash'`.

### Legacy: Render (Estofagem only)

Still in use only for the Estofagem section's POST endpoint. Frontend lives on GitHub Pages and is configured in `frontend/JS/config/estofagem.config.js` (`webAppUrl: 'https://registo-horas.onrender.com/estofagem'`).

- Render Root Directory: `server`, Build: `npm install`, Start: `npm start`.
- Verify: `GET https://registo-horas.onrender.com/health`.

### Frontend (legacy GitHub Pages)

Still serves the Estofagem tablet page from `main` branch. Once Estofagem migrates to the local mini-PC, GitHub Pages can be retired entirely.

**Note:** Section config files determine the backend URL — keep them in sync with where each section is actually deployed.

## Known Issues & Documentation

See `docs/ANALISE_PROBLEMAS.md` for comprehensive technical analysis of 44 identified issues prioritized by severity (8 critical, 13 high, 12 medium, 11 low). This document includes exact file:line locations and detailed solutions.

## Working with this Codebase

- The system is production-critical for factory floor operations
- Changes must maintain Safari 9 compatibility
- Always test offline queue behavior after backend changes
- Verify Notion property names match actual databases before deploying
- The codebase intentionally avoids modern tooling to support legacy devices
- Backend cold starts are normal on Render free tier; consider keep-alive pings for production hours
