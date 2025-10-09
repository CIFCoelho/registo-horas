# 🔍 Análise Profunda - Problemas Identificados

> **Data da Análise**: 9 Outubro 2025
> **Versão Analisada**: main @ commit 980c086
> **Contexto**: Sistema em produção para iPads antigos (Safari 9.3.5) em modo quiosque

---

## 📊 RESUMO EXECUTIVO

Foram identificados **44 problemas** distribuídos em 8 categorias críticas:

- 🔴 **8 CRÍTICOS**: Perda de dados, race conditions, performance blocker
- 🟠 **13 ALTOS**: Funcionalidade afetada, segurança, duplicação
- 🟡 **12 MÉDIOS**: UX degradada, memory leaks, validações
- 🔵 **11 BAIXOS**: Polimentos, edge cases raros

### ⚡ TOP 5 MAIS URGENTES

1. **Backend O(n⁴) Performance** - 256 queries ao Notion por operação
2. **Race Condition** - Turnos duplicados em tablets simultâneos
3. **localStorage Overflow** - Fila cresce até crash (5-10MB)
4. **Optimistic UI Sem Rollback** - UI inconsistente em erros 4xx
5. **Pausa Cross-Midnight** - Cálculo errado para turnos noturnos

---

## 🗂 ÍNDICE POR CATEGORIA

1. [Bugs e Race Conditions](#1-bugs-e-race-conditions) (9 problemas)
2. [Segurança e Dados](#2-segurança-e-dados) (7 problemas)
3. [Performance e Resiliência](#3-performance-e-resiliência) (8 problemas)
4. [Compatibilidade Safari 9](#4-compatibilidade-safari-9) (5 problemas)
5. [Lógica de Negócio](#5-lógica-de-negócio) (7 problemas)
6. [UX e Feedback](#6-ux-e-feedback) (4 problemas)
7. [Código e Arquitetura](#7-código-e-arquitetura) (4 problemas)
8. [Backend (Resumo)](#8-backend-resumo)

---

## 1. BUGS E RACE CONDITIONS

### 🔴 CRÍTICO #1: Race Condition no Backend - Criação Simultânea de Turnos
**Localização**: `server/index.js:375-399`
**Descrição**: `createShiftStart` não previne criação de turnos duplicados se dois tablets enviarem requests ao mesmo tempo para o mesmo funcionário.

**Impacto**: Funcionário pode ter 2+ registos de início de turno simultâneos no Notion, corrompendo cálculos de tempo.

**Solução**:
```javascript
async function createShiftStart(dbId, data) {
  // Adicionar verificação ANTES de criar
  const existing = await findOpenShiftPage(dbId, data.funcionario, null).catch(() => null);
  if (existing) {
    throw new Error('Já existe turno aberto para este funcionário');
  }

  const startISO = hhmmToTodayISO(data.hora);
  const ofNumber = data.of !== null && data.of !== undefined ? Number(data.of) : null;
  // ... resto do código
}
```
**Prioridade**: 1 - Resolver IMEDIATAMENTE

---

### 🔴 CRÍTICO #2: Backend O(n⁴) Performance Bottleneck
**Localização**: `server/index.js:409-450`
**Descrição**: `findOpenShiftPage` tem 4 nested loops iterando sobre todas as combinações de property name aliases. Com 4 aliases por propriedade = 4×4×4×4 = **256 queries** ao Notion por chamada.

**Impacto**: Cold start no Render pode levar >30s, causando timeouts nos iPads. Cada fim de turno faz esta operação.

**Solução**:
```javascript
// Cache global de property names por database
const propertyCache = new Map();

async function findOpenShiftPage(dbId, funcionario, ofNumber) {
  const cacheKey = `props:${dbId}`;
  let resolvedProps = propertyCache.get(cacheKey);

  if (!resolvedProps) {
    // Fetch database schema ONCE
    const dbMeta = await fetch(`https://api.notion.com/v1/databases/${dbId}`, { headers });
    const schema = await dbMeta.json();
    resolvedProps = {
      funcionario: findMatchingProperty(schema.properties, PROPERTY_ALIASES.funcionario),
      finalTurno: findMatchingProperty(schema.properties, PROPERTY_ALIASES.finalTurno),
      inicioTurno: findMatchingProperty(schema.properties, PROPERTY_ALIASES.inicioTurno),
      of: findMatchingProperty(schema.properties, PROPERTY_ALIASES.of)
    };
    propertyCache.set(cacheKey, resolvedProps);
  }

  // Usar nomes resolvidos diretamente - SINGLE query ao Notion
  const filters = [
    { property: resolvedProps.funcionario, title: { equals: funcionario } },
    { property: resolvedProps.finalTurno, date: { is_empty: true } }
  ];

  if (ofNumber !== null && ofNumber !== undefined) {
    filters.push({ property: resolvedProps.of, number: { equals: Number(ofNumber) } });
  }

  const query = {
    filter: { and: filters },
    sorts: [{ property: resolvedProps.inicioTurno, direction: 'descending' }],
    page_size: 1
  };

  const resp = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
    method: 'POST',
    headers,
    body: JSON.stringify(query)
  });

  if (!resp.ok) {
    throw new Error(`Notion query failed (${resp.status})`);
  }

  const json = await resp.json();
  if (json.results && json.results.length) {
    return json.results[0];
  }

  throw new Error('Nenhum turno aberto encontrado');
}

// Helper para encontrar property matching
function findMatchingProperty(properties, aliases) {
  const lookup = {};
  Object.keys(properties).forEach((name) => {
    lookup[normalizeKey(name)] = name;
  });

  for (const alias of aliases) {
    const actual = lookup[normalizeKey(alias)];
    if (actual) return actual;
  }

  return aliases[0]; // fallback
}
```
**Prioridade**: 1 - Resolve problema #1 do cold start

---

### 🟠 ALTO #3: Optimistic UI Update Sem Rollback
**Localização**: `shift-basic.js:626-679`, `acabamento.js:592-647`
**Descrição**: UI atualiza imediatamente (linha 627-637) antes do servidor confirmar. Se request falhar SEM ser enfileirado (ex: 4xx error), UI fica inconsistente.

**Impacto**: Funcionário vê turno "ativo" mas não está registado no backend. Só descobre quando outro tablet sincronizar.

**Solução**:
```javascript
sendPayload(startPayload, {
  lockKey: 'start:' + name,
  queueKey: 'start:' + name + ':' + String(newOF || ''),
  onError: function(details) {
    // ROLLBACK optimistic update se falha permanente (não enfileirado)
    if (!details.queued) {
      delete activeSessions[name];
      persistActiveSessions();
      card.classList.remove('active');
      ofDisplay.textContent = '+';
      if (menuBtn) menuBtn.style.display = 'none';
      setStatus('Erro ao registar. Tente novamente.', 'red');
      notifyRowState(name);
    }
  },
  onDuplicate: function () {
    console.log('⚠️ Pedido de início duplicado (ignorado)');
  }
});
```
**Prioridade**: 2

---

### 🟠 ALTO #4: Fila Offline Sem Deduplicação (Estofagem)
**Localização**: `estofagem.js:97-105`
**Descrição**: `enqueueRequest` não usa `key` parameter para deduplicar requests. Múltiplos cliques criam múltiplas entradas na fila.

**Impacto**: Registos duplicados de acabamentos (Cru/TP) no Notion.

**Solução**:
```javascript
function enqueueRequest(data, key) {  // Adicionar key parameter
  try {
    var q = loadQueue();
    if (key) {
      // Deduplicate by key
      for (var i = 0; i < q.length; i++) {
        if (q[i].key === key) {
          q[i].ts = Date.now();
          q[i].next = Date.now();
          q[i].data = data;
          q[i].retries = 0;
          saveQueue(q);
          setStatus('Pedido já guardado. Aguarde ligação.', 'orange');
          setTimeout(flushQueue, 1000);
          return false;
        }
      }
    }
    q.push({ data: data, url: API_URL, ts: Date.now(), retries: 0, next: Date.now(), key: key });
    saveQueue(q);
    setStatus('Sem ligação. Guardado para envio automático.', 'orange');
    setTimeout(flushQueue, 1000);
    return true;
  } catch (_) { return false; }
}

// Atualizar chamadas para incluir key
sendAction(payload, {
  onError: function () {
    enqueueRequest(data, 'register:' + name + ':' + ofValue); // key única
  }
});
```
**Prioridade**: 2

---

### 🟡 MÉDIO #5: localStorage Corruption Silenciosa
**Localização**: `shift-basic.js:92-106`, `acabamento.js:170-184`
**Descrição**: Quando `JSON.parse` falha, apenas remove dados sem log. Impossível debug em produção.

**Impacto**: Perda silenciosa de estado de turnos ativos. Funcionário precisa reiniciar turno sem saber porquê.

**Solução**:
```javascript
function loadActiveSessions() {
  try {
    var raw = localStorage.getItem(ACTIVE_SESSIONS_KEY);
    if (!raw) return {};
    var parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      console.error('⚠️ CORRUPTED localStorage data:', raw.substring(0, 100));
      setStatus('Dados corrompidos. Estado limpo.', 'orange');
      localStorage.removeItem(ACTIVE_SESSIONS_KEY);
      return {};
    }
    return parsed;
  } catch (e) {
    console.error('⚠️ localStorage parse error:', e, 'Data:', raw?.substring(0, 100));
    setStatus('Erro ao carregar dados. Estado limpo.', 'orange');
    localStorage.removeItem(ACTIVE_SESSIONS_KEY);
    return {};
  }
}
```
**Prioridade**: 3

---

### 🟡 MÉDIO #6: Fila Pode Duplicar Entre Tabs
**Localização**: `shift-basic.js:173-214`
**Descrição**: `flushQueue` usa flag `queueSending` em memória. Múltiplos tabs podem processar mesmo item se opened simultaneamente.

**Impacto**: Raro mas possível: 2 requests idênticos enviados ao backend.

**Solução**: Usar localStorage lock com timestamp:
```javascript
function acquireQueueLock() {
  var lockKey = QUEUE_KEY + ':lock';
  var lock = localStorage.getItem(lockKey);
  if (lock && Date.now() - Number(lock) < 5000) return false; // locked
  localStorage.setItem(lockKey, String(Date.now()));
  return true;
}

function releaseQueueLock() {
  localStorage.removeItem(QUEUE_KEY + ':lock');
}

function flushQueue() {
  if (queueSending || !acquireQueueLock()) return;
  var queue = loadQueue();
  // ... processo fila ...
  releaseQueueLock();
}
```
**Prioridade**: 4

---

### 🟡 MÉDIO #7: Backoff Excessivo
**Localização**: `shift-basic.js:204`
**Descrição**: Exponential backoff com cap de 10 minutos. Request pode ficar 10min sem reenviar.

**Impacto**: Funcionário espera muito tempo para ver dados sincronizados.

**Solução**: Reduzir cap para 2-3 minutos:
```javascript
var backoff = Math.min(3 * 60 * 1000, 5000 * Math.pow(2, Math.max(0, item.retries - 1)));
```
**Prioridade**: 4

---

### 🔵 BAIXO #8: Prevenção de Duplicação Pode Falhar com Cliques Rápidos
**Localização**: `shift-basic.js:612-616`
**Descrição**: Check `hasActiveShift` acontece antes de lock. Cliques muito rápidos (< 50ms) podem passar.

**Impacto**: Muito raro em iPads antigos (tap delay ~300ms).

**Solução**: Mover check para dentro do lock (já implementado em sendPayload via lockKey).
**Prioridade**: 5

---

### 🔵 BAIXO #9: syncRetries Não Reset em Falhas Parciais
**Localização**: `shift-basic.js:334-402`
**Descrição**: `syncRetries` só reseta em sucesso (linha 359). Se falhar 3x, nunca mais tenta até reload.

**Impacto**: Após 3 falhas consecutivas, UI para de sincronizar até página reload.

**Solução**: Reset após intervalo de tempo:
```javascript
var lastSyncAttempt = 0;
function syncOpenSessions(onComplete) {
  var now = Date.now();
  if (now - lastSyncAttempt > 300000) syncRetries = 0; // reset após 5min
  lastSyncAttempt = now;
  // ...
}
```
**Prioridade**: 5

---

## 2. SEGURANÇA E DADOS

### 🔴 CRÍTICO #10: Exposição de Dados em Logs
**Localização**: `server/index.js:156`, `184`, `247`
**Descrição**: `console.log` imprime payload completo incluindo nomes de funcionários e OFs.

**Impacto**: Logs do Render contêm dados sensíveis acessíveis a quem tem acesso ao dashboard.

**Solução**:
```javascript
// Função de redação
function redactPayload(data) {
  return {
    acao: data.acao,
    funcionario: data.funcionario ? data.funcionario.substring(0, 3) + '***' : null,
    of: data.of ? '***' : null,
    hora: data.hora
  };
}

console.log(`[REQ] /acabamento ->`, redactPayload(data));
```
**Prioridade**: 1

---

### 🟠 ALTO #11: Falta Sanitização de Inputs
**Localização**: `acabamento.js:428`, `estofagem.js:196-198`
**Descrição**: Nomes de funcionários vêm direto da config e vão para `textContent`, mas se config for alterada maliciosamente pode injetar HTML.

**Impacto**: XSS se atacante conseguir alterar config.js (baixa probabilidade mas possível se deploy comprometido).

**Solução**:
```javascript
function sanitizeName(name) {
  return String(name || '').replace(/[<>"'&]/g, function(c) {
    return {'<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','&':'&amp;'}[c];
  });
}

// Usar em todos os lugares onde nomes são exibidos
nameSpan.textContent = sanitizeName(name);
```
**Prioridade**: 2

---

### 🟠 ALTO #12: OF Number Não Validado
**Localização**: `server/index.js:379`, `acabamento.js:555`
**Descrição**: OF aceita qualquer número sem validação. Pode ser negativo, NaN, ou muito grande.

**Impacto**: Dados inválidos no Notion, queries lentas se OF = 999999999.

**Solução**:
```javascript
// No backend
const ofNumber = data.of !== null && data.of !== undefined ? Number(data.of) : null;
if (ofNumber !== null && (isNaN(ofNumber) || ofNumber < 0 || ofNumber > 99999)) {
  throw new Error('OF inválida: deve estar entre 0 e 99999');
}

// No frontend (antes de enviar)
function validateOF(ofString) {
  if (ofString.length === 0) return false;
  var ofNum = Number(ofString);
  if (isNaN(ofNum) || ofNum < 0 || ofNum > 99999) {
    setStatus('OF inválida. Use 0-99999.', 'red');
    return false;
  }
  return true;
}
```
**Prioridade**: 2

---

### 🟡 MÉDIO #13: CORS Não Valida Credentials
**Localização**: `server/index.js:84-107`
**Descrição**: CORS permite origem específica mas não seta `Access-Control-Allow-Credentials`. Cookies não enviados/recebidos (não usado atualmente mas pode ser problema futuro).

**Impacto**: Baixo - sistema não usa cookies atualmente.

**Solução**: Se planear usar auth com cookies:
```javascript
if (allowHeader) {
  res.setHeader('Access-Control-Allow-Origin', allowHeader);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
}
```
**Prioridade**: 5 (apenas se implementar auth)

---

### 🟡 MÉDIO #14: Falta Rate Limiting
**Localização**: `server/index.js` (todas as rotas)
**Descrição**: Nenhuma rota tem rate limiting. iPad com script malicioso pode fazer DoS.

**Impacto**: Ataques DoS consumem quotas do Notion (rate limits são por workspace).

**Solução**: Implementar express-rate-limit:
```javascript
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 30, // 30 requests por minuto por IP
  message: { ok: false, error: 'Muitos pedidos. Aguarde.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Aplicar a rotas críticas
app.use('/acabamento', limiter);
app.use('/estofagem', limiter);
app.use('/costura', limiter);
app.use('/pintura', limiter);
app.use('/preparacao', limiter);
app.use('/montagem', limiter);
```
**Prioridade**: 3

---

### 🔵 BAIXO #15: Notion Token em Plaintext Logs
**Localização**: `server/index.js:11`
**Descrição**: Token carregado de env mas se houver erro de conexão pode ser logado.

**Impacto**: Risco baixo - apenas se logs leaked.

**Solução**: Redact token em error handlers:
```javascript
function redactError(err) {
  var msg = String(err.message || err);
  if (NOTION_TOKEN) {
    msg = msg.replace(new RegExp(NOTION_TOKEN, 'g'), '***REDACTED***');
  }
  return msg;
}

// Usar em catch blocks
catch (err) {
  console.error(redactError(err));
}
```
**Prioridade**: 5

---

### 🔵 BAIXO #16: Headers Expostos em Respostas de Erro
**Localização**: `server/index.js:319`, `361`, etc.
**Descrição**: Respostas de erro do Notion repassadas ao cliente podem conter headers internos.

**Impacto**: Information disclosure (versão do Notion, rate limit headers).

**Solução**:
```javascript
if (!resp.ok) {
  const text = await resp.text();
  // Não expor detalhes internos
  throw new Error(`Erro ao comunicar com base de dados (${resp.status})`);
}
```
**Prioridade**: 5

---

## 3. PERFORMANCE E RESILIÊNCIA

### 🔴 CRÍTICO #17: localStorage Sem Limite de Tamanho
**Localização**: `shift-basic.js:121-123`, `acabamento.js:50-52`
**Descrição**: Fila offline pode crescer indefinidamente até atingir limite do Safari (5-10MB). Quando cheio, `setItem` falha silenciosamente.

**Impacto**: Após offline prolongado, novos registos não salvos. Perda de dados.

**Solução**:
```javascript
var MAX_QUEUE_SIZE = 100; // Máximo 100 items na fila

function saveQueue(q) {
  try {
    if (q.length > MAX_QUEUE_SIZE) {
      // Remove oldest non-priority items
      q.sort(function(a, b) { return (a.ts || 0) - (b.ts || 0); });
      q = q.slice(-MAX_QUEUE_SIZE);
      setStatus('Fila cheia. Itens antigos removidos.', 'orange');
    }
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q || []));
  } catch (e) {
    // QuotaExceededError
    console.error('localStorage full:', e);
    // Forçar flush de metade
    if (q.length > 10) {
      q = q.slice(Math.floor(q.length / 2));
      try {
        localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
        setStatus('Memória cheia. Alguns registos foram removidos.', 'orange');
      } catch (e2) {
        console.error('Failed to recover from quota exceeded:', e2);
      }
    }
  }
}
```
**Prioridade**: 1

---

### 🟠 ALTO #18: Sync Timeout Curto para Cold Start
**Localização**: `shift-basic.js:341`, `acabamento.js:391`, `estofagem.js:846`
**Descrição**: Timeout de 8s para GET /open. Render free tier cold start pode levar 15-30s.

**Impacto**: Primeiro sync falha sempre após cold start. UI mostra "Falha ao carregar" mesmo quando backend está ok.

**Solução**:
```javascript
// Timeout maior para primeira tentativa
var isFirstSync = true;

function syncOpenSessions(onComplete) {
  try {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', getOpenEndpoint(), true);

    // Timeout adaptativo: 30s na primeira vez, 8s depois
    xhr.timeout = isFirstSync ? 30000 : 8000;

    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4) {
        if (xhr.status >= 200 && xhr.status < 300) {
          // Marcar como inicializado - futuras syncs podem ser mais rápidas
          isFirstSync = false;

          try {
            var resp = JSON.parse(xhr.responseText || '{}');
            // ... resto do processamento
          } catch (e) {
            console.warn('Erro ao parsear resposta de /open:', e);
          }
        }
      }
    };

    xhr.send();
  } catch (e) {
    console.error('Exceção ao sincronizar:', e);
    if (typeof onComplete === 'function') onComplete(false);
  }
}
```
**Prioridade**: 2

---

### 🟡 MÉDIO #19: Fila Flush Interval Fixo
**Localização**: `shift-basic.js:216`
**Descrição**: `setInterval(flushQueue, 20000)` tenta cada 20s mesmo se não houver itens. Desperdício de CPU em iPads antigos.

**Impacto**: Battery drain desnecessário.

**Solução**:
```javascript
// Remover setInterval fixo
// setInterval(flushQueue, FLUSH_INTERVAL_MS);

// Usar apenas event-based + scheduled retry quando há itens
function flushQueue() {
  if (queueSending) return;
  var queue = loadQueue();

  // ... flush logic ...

  // Reschedule only if queue not empty
  if (queue.length > 0) {
    var nextReady = Infinity;
    for (var i = 0; i < queue.length; i++) {
      nextReady = Math.min(nextReady, queue[i].next || 0);
    }
    var delay = Math.max(1000, nextReady - Date.now());
    setTimeout(flushQueue, Math.min(delay, 60000));
  }
}

// Manter apenas triggers por eventos
window.addEventListener('online', function () { setTimeout(flushQueue, 500); });
document.addEventListener('visibilitychange', function () {
  if (!document.hidden) setTimeout(flushQueue, 500);
});
window.addEventListener('pageshow', function () { setTimeout(flushQueue, 500); });
```
**Prioridade**: 4

---

### 🟡 MÉDIO #20: Memory Leak com modalOverlay
**Localização**: `shift-basic.js:824-840`, `acabamento.js:869-885`
**Descrição**: `modalOverlay.remove()` pode não limpar event listeners em Safari antigo.

**Impacto**: Pequeno memory leak após muitos modals abertos/fechados (raro).

**Solução**:
```javascript
function closeModal() {
  if (modalOverlay) {
    // Remove listeners explicitamente
    modalOverlay.onclick = null;
    var buttons = modalOverlay.querySelectorAll('button');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].onclick = null;
    }

    // Usar removeChild em vez de remove() para Safari 9
    if (modalOverlay.parentNode) {
      modalOverlay.parentNode.removeChild(modalOverlay);
    }
    modalOverlay = null;
  }
}
```
**Prioridade**: 4

---

### 🟡 MÉDIO #21: XHR Não Abortado em Página Unload
**Localização**: `shift-basic.js:259-286`, `acabamento.js:276-328`
**Descrição**: Requests XHR continuam mesmo após página fechada/recarregada.

**Impacto**: Render recebe requests duplicados, consome quotas.

**Solução**:
```javascript
var activeXHRs = [];

function sendPayload(data, opts) {
  // ... setup ...
  var xhr = new XMLHttpRequest();
  activeXHRs.push(xhr);

  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      // Remove from active list
      var idx = activeXHRs.indexOf(xhr);
      if (idx > -1) activeXHRs.splice(idx, 1);
      // ... resto do handler
    }
  };

  // ... resto do setup
}

// Abort all active XHRs on unload
window.addEventListener('beforeunload', function() {
  for (var i = 0; i < activeXHRs.length; i++) {
    try {
      activeXHRs[i].abort();
    } catch (_) {}
  }
});
```
**Prioridade**: 4

---

### 🔵 BAIXO #22: Status Timeout Pode Esconder Erros
**Localização**: `shift-basic.js:74-78`
**Descrição**: Mensagens de erro desaparecem após 30s. Erro importante pode passar despercebido.

**Impacto**: Funcionário não vê erro crítico se distracted.

**Solução**: Diferentes timeouts por severidade:
```javascript
function setStatus(message, color, persistent) {
  if (statusTimeoutId) {
    clearTimeout(statusTimeoutId);
    statusTimeoutId = null;
  }
  status.textContent = message || '';
  if (color) status.style.color = color;

  if (message && !persistent) {
    // Erros críticos duram mais tempo
    var timeout = color === 'red' ? 60000 : 30000;
    statusTimeoutId = setTimeout(function () {
      status.textContent = '';
    }, timeout);
  }
}
```
**Prioridade**: 5

---

### 🔵 BAIXO #23: Keep-Alive Cron Pode Falhar Silenciosamente
**Localização**: `server/index.js:780-798`
**Descrição**: Cron job tenta keep-alive mas erros são apenas logged, sem alertas.

**Impacto**: Cold start pode acontecer mesmo com cron se job falhar por dias.

**Solução**: Monitorar com serviço externo (UptimeRobot já recomendado no comentário linha 789).
**Prioridade**: 5

---

### 🔵 BAIXO #24: Falta Timeout nas Requests de Fila
**Localização**: `shift-basic.js:153-171`, `acabamento.js:80-97`
**Descrição**: `sendQueueItem` não seta timeout em XHR. Request pode ficar pendurado indefinidamente.

**Impacto**: Fila para de processar se um item ficar stuck.

**Solução**:
```javascript
function sendQueueItem(item, cb) {
  try {
    var xhr = new XMLHttpRequest();
    xhr.open('POST', item.url, true);
    xhr.timeout = 15000; // 15s timeout
    xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');

    xhr.ontimeout = function() {
      console.warn('Queue item timeout:', item);
      cb(false, true);
    };

    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4) {
        var ok = xhr.status >= 200 && xhr.status < 300;
        if (ok) return cb(true);
        if (xhr.status === 0 || xhr.status === 429 || xhr.status >= 500) return cb(false, true);
        return cb(false, false);
      }
    };

    xhr.onerror = function () { cb(false, true); };
    xhr.send('data=' + encodeURIComponent(JSON.stringify(item.data)));
  } catch (_) { cb(false, true); }
}
```
**Prioridade**: 5

---

## 4. COMPATIBILIDADE SAFARI 9

### 🟠 ALTO #25: Array.from Não Disponível
**Localização**: `server/index.js:372` (listAcabamentoOptions)
**Descrição**: `Array.from(names)` não existe em Safari 9. Código é backend (Node.js) mas se for portado para frontend quebra.

**Impacto**: Atualmente nenhum (só backend), mas armadilha futura.

**Solução**: Usar spread operator ou polyfill:
```javascript
// Backend (já funciona no Node 18+)
return Array.from(names).sort((a, b) => a.localeCompare(b, 'pt-PT'));

// Se portar para frontend, usar:
var namesArray = [];
names.forEach(function(name) { namesArray.push(name); });
return namesArray.sort(function(a, b) { return a.localeCompare(b, 'pt-PT'); });
```
**Prioridade**: 5 (preventivo)

---

### 🟡 MÉDIO #26: forEach em NodeList
**Localização**: `shift-basic.js:531-534`, `acabamento.js:488-492`
**Descrição**: `querySelectorAll` retorna NodeList, não Array. `forEach` pode não existir em Safari 9.

**Impacto**: Botão "selected" pode não ser limpo corretamente.

**Solução**:
```javascript
// EVITAR
var buttons = document.querySelectorAll('.employee');
buttons.forEach(function(btn) { btn.classList.remove('selected'); });

// USAR
var buttons = document.querySelectorAll('.employee');
for (var i = 0; i < buttons.length; i++) {
  buttons[i].classList.remove('selected');
}
```
**Prioridade**: 3

---

### 🟡 MÉDIO #27: Arrow Functions em Callbacks
**Localização**: `shift-basic.js:217-218`, `estofagem.js:507-509`
**Descrição**: Arrow functions não suportadas em Safari 9. Código atual usa function expressions mas podem existir arrows em merges futuros.

**Impacto**: Syntax error, página não carrega.

**Solução**: Linting rule + code review:
```javascript
// .eslintrc.js
module.exports = {
  parserOptions: {
    ecmaVersion: 5, // Force ES5 syntax
    sourceType: 'script'
  },
  rules: {
    'prefer-arrow-callback': 'off',
    'no-var': 'off',
    'object-shorthand': 'off'
  }
};
```
**Prioridade**: 3

---

### 🔵 BAIXO #28: classList.add/remove
**Localização**: Usado extensivamente (shift-basic.js:322, acabamento.js:246, etc.)
**Descrição**: `classList` existe em Safari 9 mas alguns métodos como `toggle(class, force)` não.

**Impacto**: Código atual usa apenas `.add` e `.remove` que são suportados. Sem problema atual.

**Solução**: Documentar para não usar `toggle()` com segundo argumento.
**Prioridade**: 5

---

### 🔵 BAIXO #29: JSON.stringify Pode Falhar com Circular Refs
**Localização**: `shift-basic.js:109`, `122`, `286`
**Descrição**: Se `activeSessions` ou payload tiver referências circulares (improvável mas possível com bugs), `JSON.stringify` lança.

**Impacto**: Crash silencioso sem fallback.

**Solução**:
```javascript
function safeStringify(obj) {
  try {
    return JSON.stringify(obj);
  } catch (e) {
    console.error('stringify error:', e);
    // Fallback simples
    return JSON.stringify({ error: 'serialization failed' });
  }
}

// Usar em todos os localStorage.setItem
function persistActiveSessions() {
  try {
    localStorage.setItem(ACTIVE_SESSIONS_KEY, safeStringify(activeSessions || {}));
  } catch (_) {}
}
```
**Prioridade**: 5

---

## 5. LÓGICA DE NEGÓCIO

### 🔴 CRÍTICO #30: Pausa Não Válida para Turnos Noturnos
**Localização**: `server/index.js:467-487`
**Descrição**: `computeBreakAdjustment` assume pausa 10h00-10h10 no mesmo dia. Turno que começa às 23h00 e acaba às 01h00 não tem pausa corretamente ajustada.

**Impacto**: Cálculo errado de horas trabalhadas para turno noturno.

**Solução**:
```javascript
function computeBreakAdjustment(startDate, requestedEndDate) {
  if (!startDate || requestedEndDate <= startDate) {
    return { endDate: requestedEndDate, note: null };
  }

  // Pausa é SEMPRE 10h00-10h10 no dia do início do turno
  const breakStart = new Date(startDate);
  breakStart.setHours(10, 0, 0, 0);
  const breakEnd = new Date(breakStart);
  breakEnd.setMinutes(10);

  // Turno cobre a pausa se começou antes das 10h00 E terminou depois das 10h10
  const coversBreak = startDate <= breakStart && requestedEndDate >= breakEnd;

  if (coversBreak) {
    const adjusted = new Date(requestedEndDate.getTime() - 10 * 60_000);
    if (adjusted > startDate) {
      return { endDate: adjusted, note: 'Ajuste automático: pausa manhã (−10 min)' };
    }
  }

  return { endDate: requestedEndDate, note: null };
}
```
**Prioridade**: 1

---

### 🟠 ALTO #31: Comparação de OF com Tipos Mistos
**Localização**: `shift-basic.js:619`, `acabamento.js:585-589`, `estofagem.js:338`
**Descrição**: `String(previousOF) === String(newOF)` funciona mas `activeSessions[name] === currentOF` (linha 581 shift-basic) compara sem conversão.

**Impacto**: Permite trocar para "mesma" OF se tipos diferentes (ex: '123' vs 123).

**Solução**: Normalizar sempre para String:
```javascript
// Em handleKeyPress
if (key === 'OK') {
  if (currentOF && activeEmployee) {
    // Normalizar para comparação
    if (isSwitchingOF && String(activeSessions[activeEmployee]) === String(currentOF)) {
      var msg = currentOF === '0' ? 'Erro: já está em trabalho geral.' : 'Erro: já está nessa OF.';
      setStatus(msg, 'red');
      return;
    }
    sendAction(card, isSwitchingOF);
  }
}
```
**Prioridade**: 2

---

### 🟠 ALTO #32: finishIncomplete Sem Validação de Tempo
**Localização**: `acabamento.js:812-832`, `server/index.js:660-709`
**Descrição**: `minutosRestantes` não validado. Pode ser negativo, > 1440 (24h), ou string maliciosa.

**Impacto**: Turno pode ter início no futuro ou passado distante, corrompendo relatórios.

**Solução**:
```javascript
// Frontend (acabamento.js)
function finishIncompleteAction(name, tipo, iniciou, tempo) {
  var minutos = Number(tempo);
  if (isNaN(minutos) || minutos < 0 || minutos > 480) { // Max 8h
    setStatus('Tempo inválido (0-480 min)', 'red');
    return;
  }

  var now = new Date();
  var hora = formatHHMM(now);
  var payload = {
    funcionario: name,
    acao: 'finishIncomplete',
    tipo: tipo,
    iniciou: iniciou,
    minutosRestantes: minutos, // já validado
    hora: hora
  };

  sendPayload(payload, config.webAppUrl, {
    lockKey: 'finishIncomplete:' + name,
    queueKey: 'finishIncomplete:' + name + ':' + tipo + ':' + iniciou + ':' + String(minutos)
  });

  setStatus('Complemento registado', 'green');
}

// Backend (server/index.js)
async function finishIncompleteEntry(dbId, data) {
  if (!data.tipo || !data.iniciou || typeof data.minutosRestantes === 'undefined') {
    throw new Error('Dados incompletos');
  }
  if (String(data.iniciou).trim() === String(data.funcionario).trim()) {
    throw new Error('Escolha outro colaborador');
  }

  // VALIDAÇÃO CRÍTICA
  const minutes = Number(data.minutosRestantes);
  if (isNaN(minutes) || minutes < 0 || minutes > 480) {
    throw new Error('Tempo inválido: deve estar entre 0 e 480 minutos');
  }

  // ... resto do código usando minutes
}
```
**Prioridade**: 2

---

### 🟡 MÉDIO #33: hhmmToTodayISO Ignora Turnos Cross-Midnight
**Localização**: `server/index.js:294-299`
**Descrição**: Sempre usa data atual. Turno que começa 23h50 e acaba 00h10 tem fim ANTES do início.

**Impacto**: Duração negativa no Notion, relatórios quebrados.

**Solução**:
```javascript
function hhmmToTodayISO(hhmm, referenceDate) {
  const [h, m] = String(hhmm).split(':').map(Number);
  const ref = referenceDate || new Date();
  const dt = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), h, m, 0, 0);
  return dt.toISOString();
}

// Em closeShiftEntry, passar startDate como referência e ajustar
async function closeShiftEntry(dbId, data) {
  const ofNumber = data.of !== null && data.of !== undefined ? Number(data.of) : null;
  const page = await findOpenShiftPage(dbId, data.funcionario, ofNumber);

  const inicioTurnoProp = resolveProperty(page, 'inicioTurno');
  const startProp = page.properties?.[inicioTurnoProp]?.date?.start;
  const startDate = startProp ? new Date(startProp) : null;

  let requestedEndISO = hhmmToTodayISO(data.hora, startDate);
  let requestedEndDate = new Date(requestedEndISO);

  // Se fim < início, adicionar 1 dia (turno cross-midnight)
  if (startDate && requestedEndDate < startDate) {
    requestedEndDate.setDate(requestedEndDate.getDate() + 1);
    requestedEndISO = requestedEndDate.toISOString();
  }

  const adjustment = computeBreakAdjustment(startDate, requestedEndDate);

  // ... resto do código
}
```
**Prioridade**: 2 (se fábrica tem turnos noturnos)

---

### 🟡 MÉDIO #34: combineNotes Pode Crescer Infinitamente
**Localização**: `server/index.js:458-465`
**Descrição**: Notas concatenadas com ` | `. Após muitas operações (ex: 100x finish incomplete), string > 10KB.

**Impacto**: Notion API rejeita properties muito grandes (limite ~2000 chars).

**Solução**:
```javascript
function combineNotes(existingRichText, message, maxLength) {
  if (!message) return null;
  maxLength = maxLength || 1000; // Default 1000 chars

  const existingNotes = (existingRichText || [])
    .map((r) => r.plain_text || (r.text && r.text.content) || '')
    .join(' ')
    .trim();

  let combined = existingNotes ? `${existingNotes} | ${message}` : message;

  // Truncate old notes if too long
  if (combined.length > maxLength) {
    const parts = combined.split(' | ');
    // Keep only last 5 parts + ellipsis
    combined = '...' + parts.slice(-5).join(' | ');
  }

  return combined;
}
```
**Prioridade**: 3

---

### 🔵 BAIXO #35: Falta Validação de Formato HH:MM
**Localização**: Backend recebe `data.hora` sem validação (`server/index.js:376`, `493`, etc.)
**Descrição**: Frontend gera hora corretamente mas se payload manipulado pode enviar "25:99".

**Impacto**: `hhmmToTodayISO` cria data inválida.

**Solução**:
```javascript
function validateHHMM(hhmm) {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(hhmm));
  if (!match) throw new Error('Formato de hora inválido (esperado HH:MM)');
  return hhmm;
}

// Em cada endpoint que usa data.hora
async function createShiftStart(dbId, data) {
  const hora = validateHHMM(data.hora);
  const startISO = hhmmToTodayISO(hora);
  // ...
}
```
**Prioridade**: 4

---

### 🔵 BAIXO #36: OF=0 Display Inconsistente
**Localização**: `shift-basic.js:60-64`, `estofagem.js:41-47`
**Descrição**: shift-basic mostra "Geral", estofagem mostra "Geral" ou "GERAL" dependendo do contexto.

**Impacto**: Confusão visual, não afeta funcionalidade.

**Solução**: Padronizar para "Geral" em todos os locais.
```javascript
// Função única em todos os ficheiros
function formatOFDisplay(ofValue) {
  // Display "Geral" para OF=0 (trabalho geral)
  if (ofValue === '0' || ofValue === 0) return 'Geral';
  if (!ofValue && ofValue !== 0) return 'Geral'; // null/undefined também
  return String(ofValue);
}
```
**Prioridade**: 5

---

## 6. UX E FEEDBACK

### 🟡 MÉDIO #37: Falta Indicador Visual de Fila Offline
**Localização**: Todas as secções
**Descrição**: Quando requests estão na fila (offline ou backend down), UI não mostra quantos estão pendentes.

**Impacto**: Funcionário não sabe se dados serão enviados ou perdidos.

**Solução**:
```javascript
function updateQueueIndicator() {
  var q = loadQueue();
  var indicator = document.getElementById('queue-indicator');

  if (!indicator) {
    indicator = document.createElement('div');
    indicator.id = 'queue-indicator';
    indicator.style.cssText = 'position:fixed;top:10px;right:10px;background:#ff9800;color:white;padding:8px 12px;border-radius:4px;font-size:14px;font-weight:bold;box-shadow:0 2px 4px rgba(0,0,0,0.2);z-index:9999;';
    document.body.appendChild(indicator);
  }

  if (q.length > 0) {
    indicator.textContent = q.length + ' pendente' + (q.length > 1 ? 's' : '');
    indicator.style.display = 'block';
  } else {
    indicator.style.display = 'none';
  }
}

// Chamar após cada mudança na fila
function saveQueue(q) {
  try {
    // ... código atual ...
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q || []));
    updateQueueIndicator();
  } catch (_) {}
}

// Chamar também no load inicial
document.addEventListener('DOMContentLoaded', function() {
  // ... código existente ...
  updateQueueIndicator();
});
```
**Prioridade**: 3

---

### 🟡 MÉDIO #38: Botão OK Não Desabilita Durante Envio
**Localização**: `shift-basic.js:579-588`, `acabamento.js:545-558`
**Descrição**: Após clicar "OK" no keypad, botão permanece clicável. Cliques rápidos múltiplos podem bypassar lock.

**Impacto**: Possível envio duplicado se usuário clicar 5x rapidamente.

**Solução**:
```javascript
function handleKeyPress(key, card, isSwitchingOF) {
  var display = document.getElementById('of-display');

  if (key === '←') {
    currentOF = currentOF.slice(0, -1);
  } else if (key === 'OK') {
    if (currentOF && activeEmployee) {
      // Validações...
      if (isSwitchingOF && String(activeSessions[activeEmployee]) === String(currentOF)) {
        var msg = currentOF === '0' ? 'Erro: já está em trabalho geral.' : 'Erro: já está nessa OF.';
        setStatus(msg, 'red');
        return;
      }

      // DESABILITAR TODOS OS BOTÕES DO KEYPAD
      var keys = keypad.querySelectorAll('.key, #cancel-btn');
      for (var i = 0; i < keys.length; i++) {
        keys[i].disabled = true;
        keys[i].style.opacity = '0.5';
        keys[i].style.cursor = 'not-allowed';
      }

      sendAction(card, isSwitchingOF);
    }
  } else {
    if (currentOF.length < 6) currentOF += key;
  }

  if (display) display.textContent = currentOF === '0' ? 'Geral' : currentOF;
}
```
**Prioridade**: 3

---

### 🔵 BAIXO #39: Mensagens de Erro Genéricas
**Localização**: `acabamento.js:291-300`, `shift-basic.js:274`
**Descrição**: "Erro: ligação falhou (503)" não explica ao usuário o que fazer.

**Impacto**: Funcionário não sabe se deve retentar ou esperar.

**Solução**:
```javascript
// Em sendPayload
if (!ok) {
  var errorMsg = 'Erro ao enviar';
  var userAction = '';

  if (xhr.status === 503) {
    errorMsg = 'Sistema a iniciar';
    userAction = 'Aguarde 30 segundos e tente novamente.';
  } else if (xhr.status === 0) {
    errorMsg = 'Sem internet';
    userAction = 'O registo será enviado automaticamente quando a ligação voltar.';
  } else if (xhr.status >= 500) {
    errorMsg = 'Erro no servidor';
    userAction = 'A reenviar automaticamente.';
  } else if (xhr.status === 429) {
    errorMsg = 'Muitos pedidos';
    userAction = 'Aguarde alguns segundos.';
  } else {
    errorMsg = 'Erro ao registar';
    userAction = 'Verifique os dados e tente novamente.';
  }

  setStatus(errorMsg + '. ' + userAction, xhr.status === 0 ? 'orange' : 'red');
}
```
**Prioridade**: 4

---

### 🔵 BAIXO #40: Falta Confirmação em Ações Destrutivas (Estofagem Cancel)
**Localização**: `estofagem.js` não tem cancel shift
**Descrição**: Acabamento tem "Cancelar Turno Atual" mas Estofagem não (assumindo é intencional mas vale mencionar).

**Impacto**: Assimetria entre secções pode confundir funcionários.

**Solução**: Se intencional, documentar. Se não, adicionar action menu em estofagem similar ao acabamento.
**Prioridade**: 5

---

## 7. CÓDIGO E ARQUITETURA

### 🟠 ALTO #41: Duplicação Massiva Entre acabamento.js e shift-basic.js
**Localização**: Ambos os ficheiros têm 99% do mesmo código
**Descrição**: `acabamento.js` (887 linhas) e `shift-basic.js` (883 linhas) são quase idênticos. Qualquer bugfix precisa ser aplicado 2x.

**Impacto**: Bugs #1 e #3 existem em ambos os ficheiros. Manutenção duplicada, erros humanos.

**Solução**: Refactor incremental:

**Fase 1** (curto prazo): Acabamento importa shift-basic como base:
```javascript
// acabamento.html
<script src="../JS/sections/shift-basic.js"></script>
<script src="../JS/config/acabamento.config.js"></script>

// acabamento.config.js
window.SECTION_CONFIG = {
  section: 'Acabamento',
  webAppUrl: 'https://registo-horas.onrender.com/acabamento',
  names: ['Antónia', 'Cristina', 'Diogo', 'Teresa', 'Pedro'],
  enableCancel: true,
  extraActions: [
    function(modal, ctx) {
      // "Terminar Acabamento Incompleto" button
      var finishBtn = document.createElement('button');
      finishBtn.textContent = 'Terminar Acabamento Incompleto';
      finishBtn.onclick = function() {
        ctx.closeModal();
        showFinishIncompleteForm(ctx.nome, ctx);
      };
      modal.appendChild(finishBtn);
    }
  ],
  onRowCreated: function(api) {
    // Custom row logic if needed
  }
};

function showFinishIncompleteForm(name, ctx) {
  // Modal específico do acabamento
  ctx.openModal(function(modal) {
    // ... form UI ...
  });
}
```

**Fase 2** (longo prazo): Criar módulo comum ES5:
```javascript
// common/shift-manager.js (ES5 compatible)
function ShiftManager(config) {
  this.config = config;
  this.activeSessions = {};
  this.queueKey = config.queueKey || (config.section + ':queue');
  // ... toda a lógica comum ...
}

ShiftManager.prototype.init = function() {
  this.loadState();
  this.buildUI();
  this.startSync();
};

ShiftManager.prototype.addCustomAction = function(name, handler) {
  this.customActions[name] = handler;
};

// acabamento.js
var manager = new ShiftManager({
  section: 'Acabamento',
  webAppUrl: '...',
  names: [...]
});

manager.addCustomAction('finishIncomplete', function(name, context) {
  // Lógica específica do acabamento
});

manager.init();
```

**Prioridade**: 2 (previne bugs futuros e facilita manutenção)

---

### 🟡 MÉDIO #42: estofagem.js Não Usa shift-basic
**Localização**: `estofagem.js` é rewrite completo (928 linhas)
**Descrição**: Tem funcionalidades únicas (REGISTAR ACAB.) mas duplica toda a lógica de turnos.

**Impacto**: 3 versões da mesma lógica (acabamento, shift-basic, estofagem). Bugs diferentes em cada.

**Solução**: Após refactor de acabamento (#41), migrar estofagem para usar módulo comum com extensões:
```javascript
// estofagem.js (após módulo comum existir)
var manager = new ShiftManager({
  section: 'Estofagem',
  webAppUrl: 'https://registo-horas.onrender.com/estofagem',
  names: ['Ana', 'Carlos', 'Diana', 'Eduardo', 'Filipa']
});

// Extender cada row com botão de registo
manager.extendRow(function(api) {
  var registerBtn = document.createElement('button');
  registerBtn.className = 'register-btn';
  registerBtn.textContent = 'REGISTAR ACAB.';
  registerBtn.onclick = function(evt) {
    evt.stopPropagation();
    prepareRegister(api.name, api.getActiveOF());
  };
  api.controls.appendChild(registerBtn);

  return function(state) {
    // Update button visibility based on state
    registerBtn.style.display = state.isActive ? 'inline-block' : 'none';
  };
});

manager.init();

// Função específica para modal de acabamento
function prepareRegister(name, ofValue) {
  // ... lógica do modal de acabamento ...
}
```

**Prioridade**: 3

---

### 🔵 BAIXO #43: Falta Separation of Concerns
**Localização**: Todos os ficheiros frontend
**Descrição**: UI, estado, rede, e lógica de negócio misturados em ficheiros monolíticos. Dificulta testes unitários.

**Impacto**: Impossível testar sem browser. Bugs só descobertos em produção.

**Solução**: Refactor para arquitetura em camadas:
```
frontend/JS/
├── core/
│   ├── shift-state.js      # State management (testável com Node)
│   ├── shift-queue.js      # Offline queue logic
│   └── shift-validation.js # Business rules
├── api/
│   └── shift-api.js        # Network layer (mockável)
├── ui/
│   ├── shift-ui.js         # DOM manipulation
│   └── modal-ui.js         # Modal components
└── shift-manager.js        # Orquestração
```

Exemplo de separação:
```javascript
// shift-state.js (puro, sem DOM)
function ShiftState(storageKey) {
  this.sessions = {};
  this.storageKey = storageKey;
}

ShiftState.prototype.loadFromStorage = function() {
  try {
    var raw = localStorage.getItem(this.storageKey);
    if (raw) this.sessions = JSON.parse(raw);
  } catch (e) {
    console.error('Failed to load state:', e);
    this.sessions = {};
  }
};

ShiftState.prototype.isActive = function(name) {
  return this.sessions.hasOwnProperty(name);
};

// Testável com Node.js mock de localStorage
```

**Prioridade**: 5 (longo prazo, após resolver bugs críticos)

---

### 🔵 BAIXO #44: Falta Error Boundaries
**Localização**: DOMContentLoaded wrappers não têm try/catch global
**Descrição**: Qualquer erro não capturado para execução completa. Página fica branca sem mensagem.

**Impacto**: Dificulta debug em produção (iPads em modo quiosque sem devtools).

**Solução**:
```javascript
// Wrapper em todos os ficheiros de secção
document.addEventListener('DOMContentLoaded', function () {
  try {
    // ... todo o código da secção ...

  } catch (err) {
    console.error('FATAL ERROR:', err);

    // Mostrar mensagem amigável
    var errorDiv = document.createElement('div');
    errorDiv.style.cssText = 'padding:20px;color:#d32f2f;background:#ffebee;border:2px solid #d32f2f;margin:20px;border-radius:4px;font-size:16px;';
    errorDiv.innerHTML = '<strong>Erro ao carregar a página</strong><br>Recarregue a página ou contacte o suporte.<br><br><small>Erro: ' + (err.message || err) + '</small>';

    var container = document.getElementById('container') || document.body;
    container.innerHTML = '';
    container.appendChild(errorDiv);
  }
});

// Global error handler para runtime errors
window.addEventListener('error', function(evt) {
  console.error('Uncaught error:', evt.error);

  var status = document.getElementById('status');
  if (status) {
    status.textContent = 'Erro crítico. Recarregue a página.';
    status.style.color = '#d32f2f';
    status.style.background = '#ffebee';
    status.style.padding = '10px';
  }

  // Não prevenir default - deixar erro aparecer no console
});

// Promise rejection handler (para XHR promises se usados no futuro)
window.addEventListener('unhandledrejection', function(evt) {
  console.error('Unhandled promise rejection:', evt.reason);
});
```

**Prioridade**: 4

---

## 8. BACKEND (RESUMO)

Principais problemas backend já cobertos em outras categorias:
- **#1**: Race condition em `createShiftStart`
- **#2**: O(n⁴) em `findOpenShiftPage`
- **#10**: Exposição de dados em logs
- **#14**: Falta rate limiting
- **#30**: Pausa inválida para turnos noturnos
- **#33**: `hhmmToTodayISO` cross-midnight

---

## 📋 PLANO DE IMPLEMENTAÇÃO

### SPRINT 1 - CRÍTICO (1-2 dias)
**Objetivo**: Eliminar problemas que causam perda de dados ou system down

1. ✅ **#2** - Backend O(n⁴) → Cache property names *(estimativa: 2h)*
2. ✅ **#1** - Backend race condition → Verificar turno existente *(estimativa: 1h)*
3. ✅ **#17** - localStorage overflow → Limite + QuotaExceededError *(estimativa: 1h)*
4. ✅ **#30** - Pausa cross-midnight → Ajustar lógica *(estimativa: 1h)*
5. ✅ **#10** - Logs sensíveis → Redact function *(estimativa: 30min)*

**Total estimado**: 5.5 horas

---

### SPRINT 2 - ALTO (1 semana)
**Objetivo**: Resolver problemas que afetam funcionalidade e segurança

6. ✅ **#3** - Optimistic UI rollback → onError handler *(estimativa: 2h)*
7. ✅ **#4** - Estofagem deduplicação → Key parameter *(estimativa: 1h)*
8. ✅ **#18** - Sync timeout → Timeout adaptativo *(estimativa: 1h)*
9. ✅ **#11** - Sanitização XSS → sanitizeName() *(estimativa: 1h)*
10. ✅ **#12** - Validação OF → Bounds checking *(estimativa: 1h)*
11. ✅ **#31** - Comparação OF → Normalizar String() *(estimativa: 30min)*
12. ✅ **#32** - finishIncomplete validação → Bounds *(estimativa: 1h)*
13. ✅ **#33** - Cross-midnight shifts → Date logic *(estimativa: 2h)*

**Total estimado**: 11.5 horas

---

### SPRINT 3 - MÉDIO (2 semanas)
**Objetivo**: Melhorar UX, performance e manutenibilidade

14. ✅ **#41** - Refactor duplicação → Módulo comum *(estimativa: 8h)*
15. ✅ **#5** - localStorage logging → Error visibility *(estimativa: 1h)*
16. ✅ **#37** - Queue indicator → UI feedback *(estimativa: 2h)*
17. ✅ **#38** - Botão OK disable → Double-click prevention *(estimativa: 1h)*
18. ✅ **#14** - Rate limiting → express-rate-limit *(estimativa: 1h)*
19. ✅ **#26** - NodeList forEach → For loop *(estimativa: 1h)*
20. ✅ **#27** - ESLint config → Prevent ES6 *(estimativa: 1h)*
21. ✅ **#34** - combineNotes → Truncate logic *(estimativa: 1h)*

**Total estimado**: 16 horas

---

### BACKLOG - BAIXO (quando tiver tempo)
**Objetivo**: Polimentos e edge cases raros

- **#6** - Multi-tab queue lock
- **#7** - Backoff reduction
- **#19** - Queue flush interval
- **#20** - Memory leak prevention
- **#21** - XHR abort on unload
- **#22** - Status timeout por severidade
- **#39** - Mensagens de erro friendly
- **#42** - Estofagem usar módulo comum
- **#43** - Separation of concerns
- **#44** - Error boundaries
- Todos os outros problemas BAIXO (#8, #9, #13, #15, #16, #23-29, #35, #36, #40)

---

## 🧪 TESTES RECOMENDADOS

### Cenários de Teste Críticos

#### 1. Race Condition (Problema #1, #2)
```
SETUP: 2 tablets no mesmo WiFi
TESTE: Ambos clicam no mesmo funcionário ao mesmo tempo
ESPERADO: Apenas 1 turno criado no Notion
VERIFICAR: GET /open retorna 1 sessão, não 2
```

#### 2. localStorage Overflow (Problema #17)
```
SETUP: Backend offline, localStorage quase cheio
TESTE: Registar 150 ações (> MAX_QUEUE_SIZE)
ESPERADO: Mensagem "Fila cheia. Itens antigos removidos."
VERIFICAR: Fila tem max 100 items, mais antigos removidos
```

#### 3. Optimistic UI Rollback (Problema #3)
```
SETUP: Backend retorna 400 error
TESTE: Iniciar turno com OF inválida
ESPERADO: UI reverte (botão fica inativo), mensagem erro
VERIFICAR: localStorage não tem sessão, GET /open confirma
```

#### 4. Turnos Cross-Midnight (Problema #30, #33)
```
SETUP: Backend em produção
TESTE: Turno 23h50 → 00h30 (atravessa meia-noite e pausa 10h)
ESPERADO: Duração = 40min (não aplica pausa)
VERIFICAR: Final > Início no Notion, sem duração negativa
```

#### 5. Cold Start Timeout (Problema #18)
```
SETUP: Backend dormindo (>15min sem requests)
TESTE: Abrir página pela primeira vez
ESPERADO: Timeout de 30s (não 8s), retry se falhar
VERIFICAR: Sincronização bem-sucedida dentro de 30s
```

---

## 📚 RECURSOS ADICIONAIS

### Documentação Relacionada
- `docs/MIGRACAO_WORKSPACE.md` - Property name aliasing
- `docs/MIGRATION_QUICKSTART.md` - Setup rápido
- `docs/REVIEW.md` - Review anterior

### Ferramentas Úteis
- **ESLint config para ES5**: Prevenir arrow functions
- **express-rate-limit**: Rate limiting no backend
- **Sentry**: Error tracking em produção
- **UptimeRobot**: Keep-alive externo (recomendado)

### Safari 9 Polyfills Necessários
```javascript
// Se precisar de Array.from
if (!Array.from) {
  Array.from = function(arrayLike) {
    var arr = [];
    for (var i = 0; i < arrayLike.length; i++) {
      arr.push(arrayLike[i]);
    }
    return arr;
  };
}

// Se precisar de Object.assign
if (typeof Object.assign !== 'function') {
  Object.assign = function(target) {
    for (var i = 1; i < arguments.length; i++) {
      var source = arguments[i];
      for (var key in source) {
        if (source.hasOwnProperty(key)) {
          target[key] = source[key];
        }
      }
    }
    return target;
  };
}
```

---

## 🔄 CHANGELOG

| Data | Versão | Mudanças |
|------|--------|----------|
| 2025-10-09 | 1.0 | Análise inicial completa (44 problemas) |

---

## 📞 SUPORTE

Para questões sobre esta análise ou implementação das soluções:
1. Consultar código específico nas localizações indicadas
2. Testar soluções em ambiente de desenvolvimento antes de produção
3. Validar em iPad 2 (Safari 9.3.5) após cada fix

**Nota final**: Priorize sempre CRÍTICO e ALTO antes de MÉDIO/BAIXO. Sistema em produção deve ser estável antes de otimizações.
