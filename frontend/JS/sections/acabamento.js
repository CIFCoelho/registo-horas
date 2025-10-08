document.addEventListener('DOMContentLoaded', function () {
  var config = window.SECTION_CONFIG;
  var employeeList = document.getElementById('employee-list');
  var keypad = document.getElementById('of-keypad');
  var status = document.getElementById('status');
  var activeEmployee = null;
  var currentOF = '';
  var activeSessions = {};
  var actionButtons = {};
  var employeeButtons = {};
  var modalOverlay = null;
  var statusTimeoutId = null;
  var requestLocks = {};

  // --- Time formatting helper (Safari 9 friendly) ---
  function formatHHMM(d) {
    var h = d.getHours();
    var m = d.getMinutes();
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }

  function sanitizePrefix(value, fallback) {
    if (typeof value !== 'string' || !value.trim()) return fallback;
    return value.trim().replace(/[^a-z0-9_-]/gi, '_');
  }

  var storagePrefix = sanitizePrefix(config.storagePrefix, 'acabamento');

  // --- Minimal offline queue ---
  var QUEUE_KEY = storagePrefix + 'Queue';
  var ACTIVE_SESSIONS_KEY = 'activeSessions';
  if (!config.storagePrefix) {
    // backward compatibility for original Acabamento implementation
    ACTIVE_SESSIONS_KEY = 'activeSessions';
  } else {
    ACTIVE_SESSIONS_KEY = storagePrefix + 'ActiveSessions';
  }
  var queueSending = false;
  var FLUSH_INTERVAL_MS = 20000; // try every 20s
  var MAX_QUEUE_AGE_MS = 30 * 60 * 1000; // 30 minutes

  function loadQueue() {
    try {
      var raw = localStorage.getItem(QUEUE_KEY);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (_) { return []; }
  }
  function saveQueue(q) {
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q || [])); } catch (_) {}
  }
  function enqueueRequest(data, url, key) {
    try {
      var q = loadQueue();
      if (key) {
        for (var i = 0; i < q.length; i++) {
          if (q[i].key === key) {
            // Refresh timestamps so the retry happens sooner after a manual attempt
            q[i].ts = Date.now();
            q[i].next = Date.now();
            q[i].data = data;
            q[i].url = url;
            q[i].retries = 0;
            saveQueue(q);
            setStatus('Pedido já guardado. Aguarde ligação.', 'orange');
            setTimeout(flushQueue, 1000);
            return false;
          }
        }
      }
      q.push({ data: data, url: url, ts: Date.now(), retries: 0, next: Date.now(), key: key });
      saveQueue(q);
      setStatus('Sem ligação. Guardado para envio automático.', 'orange');
      // Nudge a quick flush attempt
      setTimeout(flushQueue, 1000);
      return true;
    } catch (_) { return false; }
  }
  function sendQueueItem(item, cb) {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', item.url, true);
      xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
      xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) {
          var ok = xhr.status >= 200 && xhr.status < 300;
          if (ok) return cb(true);
          // Retry for network/5xx/429; treat 4xx (except 429) as fatal
          if (xhr.status === 0 || xhr.status === 429 || xhr.status >= 500) return cb(false, true);
          return cb(false, false);
        }
      };
      xhr.onerror = function () { cb(false, true); };
      xhr.send('data=' + encodeURIComponent(JSON.stringify(item.data)));
    } catch (_) { cb(false, true); }
  }
  function flushQueue() {
    if (queueSending) return;
    var q = loadQueue();
    var now = Date.now();
    // Prune expired items (older than MAX_QUEUE_AGE_MS)
    var kept = [];
    for (var i = 0; i < q.length; i++) {
      var it = q[i];
      if (now - (it.ts || 0) <= MAX_QUEUE_AGE_MS) kept.push(it);
    }
    if (kept.length !== q.length) saveQueue(kept);
    q = kept;
    // Find next ready item
    var idx = -1;
    for (var j = 0; j < q.length; j++) {
      if ((q[j].next || 0) <= now) { idx = j; break; }
    }
    if (idx === -1) return; // nothing ready
    // Pop the item for sending, then re-save remaining queue
    var item = q.splice(idx, 1)[0];
    saveQueue(q);
    queueSending = true;
    sendQueueItem(item, function (success, shouldRetry) {
      queueSending = false;
      if (success) {
        // Try to drain more quickly
        setTimeout(flushQueue, 100);
      } else if (shouldRetry) {
        item.retries = (item.retries || 0) + 1;
        var backoff = Math.min(10 * 60 * 1000, 5000 * Math.pow(2, Math.max(0, item.retries - 1))); // 5s,10s,20s,... cap 10m
        item.next = Date.now() + backoff;
        var q2 = loadQueue();
        q2.push(item);
        saveQueue(q2);
      } else {
        // Fatal error; drop item
        setStatus('Erro permanente ao enviar um pedido. Verifique dados.', 'red');
      }
    });
  }
  // Periodic and event-based flush triggers
  setInterval(flushQueue, FLUSH_INTERVAL_MS);
  window.addEventListener('online', function () { setTimeout(flushQueue, 500); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) setTimeout(flushQueue, 500); });
  window.addEventListener('pageshow', function () { setTimeout(flushQueue, 500); });

  function setStatus(message, color) {
    if (statusTimeoutId) {
      clearTimeout(statusTimeoutId);
      statusTimeoutId = null;
    }
    status.textContent = message || '';
    if (color) status.style.color = color;
    if (message) {
      statusTimeoutId = setTimeout(function () {
        status.textContent = '';
      }, 30000); // auto-hide after 30 seconds
    }
  }

  function acquireLock(key) {
    if (!key) return true;
    if (requestLocks[key]) return false;
    requestLocks[key] = true;
    return true;
  }

  function releaseLock(key) {
    if (!key) return;
    delete requestLocks[key];
  }

  function loadActiveSessions() {
    try {
      var raw = localStorage.getItem(ACTIVE_SESSIONS_KEY);
      if (!raw) return {};
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') {
        localStorage.removeItem(ACTIVE_SESSIONS_KEY);
        return {};
      }
      return parsed;
    } catch (_) {
      localStorage.removeItem(ACTIVE_SESSIONS_KEY);
      return {};
    }
  }

  function persistActiveSessions() {
    try { localStorage.setItem(ACTIVE_SESSIONS_KEY, JSON.stringify(activeSessions || {})); } catch (_) {}
  }

  activeSessions = loadActiveSessions();

  config.names.forEach(function (name) {
    var row = document.createElement('div');
    row.className = 'employee-row';

    var btn = document.createElement('div');
    btn.className = 'employee';

    var nameSpan = document.createElement('span');
    nameSpan.textContent = name;
    btn.appendChild(nameSpan);

    var controls = document.createElement('div');
    controls.className = 'right-controls';

    var ofDisplay = document.createElement('span');
    ofDisplay.className = 'of-display';
    ofDisplay.textContent = '+';
    controls.appendChild(ofDisplay);

    btn.appendChild(controls);
    row.appendChild(btn);

    // Action button belongs inside the right-side controls so it
    // stays within the green card on older Safari (no flex-gap).
    var actionBtn = document.createElement('button');
    actionBtn.className = 'action-btn';
    actionBtn.textContent = '\u22EF'; // "⋯"
    actionBtn.onclick = function (e) {
      e.stopPropagation();
      showActionMenu(name, btn);
    };

    controls.appendChild(actionBtn);
    actionButtons[name] = actionBtn;
    employeeButtons[name] = btn;

    ofDisplay.onclick = function (e) {
      e.stopPropagation();
      if (activeSessions[name]) {
        handleOFChange(name, btn);
      }
    };

    btn.onclick = function () {
      if (!activeSessions[name]) {
        handleEmployeeClick(name, btn);
      } else {
        endShift(name, btn);
      }
    };

    employeeList.appendChild(row);

    if (activeSessions[name]) {
      btn.classList.add('active');
      ofDisplay.textContent = activeSessions[name];
      actionBtn.style.display = 'inline-block';

    }
  });

  function sendPayload(data, url, opts) {
    opts = opts || {};
    var settled = false;
    var accepted = opts.acceptStatuses || [];
    var lockKey = opts.lockKey || null;
    if (lockKey && !acquireLock(lockKey)) {
      if (typeof opts.onDuplicate === 'function') {
        opts.onDuplicate();
      } else {
        setStatus('Pedido já está a ser processado. Aguarde.', 'orange');
      }
      return false;
    }
    function finish(success, queued) {
      if (settled) return;
      settled = true;
      releaseLock(lockKey);
      if (success) {
        if (typeof opts.onSuccess === 'function') opts.onSuccess();
      } else {
        if (typeof opts.onError === 'function') opts.onError({ queued: queued });
      }
      if (typeof opts.onSettled === 'function') opts.onSettled(success, queued);
    }
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', url, true);
      xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
      xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) {
          var ok = xhr.status >= 200 && xhr.status < 300;
          if (!ok) {
            if (accepted.indexOf(xhr.status) !== -1) {
              finish(true, false);
              return;
            }
            console.error('❌ Falha ao enviar', data, xhr.status, xhr.responseText);

            // Provide user-friendly error messages
            var errorMsg = 'Erro ao enviar';
            if (xhr.status === 503) {
              errorMsg = 'Sistema a iniciar, aguarde...';
            } else if (xhr.status === 0) {
              errorMsg = 'Sem ligação. Guardado para envio automático.';
            } else if (xhr.status >= 500) {
              errorMsg = 'Erro no servidor. Guardado para reenvio.';
            } else if (xhr.status === 429) {
              errorMsg = 'Muitos pedidos. A reenviar...';
            }

            // Queue for retry on network/5xx/429/503
            if (xhr.status === 0 || xhr.status === 429 || xhr.status === 503 || xhr.status >= 500) {
              enqueueRequest(data, url, opts.queueKey || null);
              finish(false, true);
            } else {
              setStatus('Erro: ligação falhou (' + xhr.status + ')', 'red');
              finish(false, false);
            }
          } else {
            console.log('✅ Enviado com sucesso', data, xhr.responseText);
            finish(true, false);
          }
        }
      };
      xhr.onerror = function () {
        console.error('❌ Erro de rede ao enviar', data);
        enqueueRequest(data, url, opts.queueKey || null);
        finish(false, true);
      };
      xhr.send('data=' + encodeURIComponent(JSON.stringify(data)));
    } catch (e) {
      console.error('❌ Exceção ao enviar', e);
      enqueueRequest(data, url, opts.queueKey || null);
      finish(false, true);
    }
    return true;
  }

  // Periodically reconcile local UI with backend open shifts
  function getOpenEndpoint() {
    // Expecting config.webAppUrl to end with '/acabamento'
    try {
      if (config.webAppUrl.slice(-11) === '/acabamento') return config.webAppUrl + '/open';
      return config.webAppUrl.replace(/\/?$/, '') + '/open';
    } catch (e) { return config.webAppUrl + '/open'; }
  }

  function applySessionsToUI(serverMap) {
    // serverMap: { [name]: of }
    var changed = false;
    // Remove local sessions not present on server
    for (var localName in activeSessions) {
      if (!serverMap[localName]) {
        delete activeSessions[localName];
        changed = true;
      }
    }
    // Apply/overwrite sessions from server
    for (var name in serverMap) {
      if (activeSessions[name] !== serverMap[name]) {
        activeSessions[name] = serverMap[name];
        changed = true;
      }
    }
    if (changed) persistActiveSessions();

    // Reflect in UI
    for (var i = 0; i < config.names.length; i++) {
      var n = config.names[i];
      var btn = employeeButtons[n];
      var ofDisplay = btn && btn.querySelector('.of-display');
      var actionBtn = actionButtons[n];
      if (!btn || !ofDisplay || !actionBtn) continue;
      if (activeSessions[n]) {
        btn.classList.add('active');
        ofDisplay.textContent = activeSessions[n];
        actionBtn.style.display = 'inline-block';
      } else {
        btn.classList.remove('active');
        ofDisplay.textContent = '+';
        actionBtn.style.display = 'none';
      }
    }
  }

  function syncOpenSessions() {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', getOpenEndpoint(), true);
      xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              var resp = JSON.parse(xhr.responseText || '{}');
              if (resp && resp.ok && resp.sessions) {
                var map = {};
                for (var i = 0; i < resp.sessions.length; i++) {
                  var s = resp.sessions[i];
                  if (s && s.funcionario) {
                    map[s.funcionario] = s.of ? String(s.of) : '';
                  }
                }
                applySessionsToUI(map);
              }
            } catch (e) { /* ignore parse errors */ }
          } else {
            // ignore network/cors errors silently; UI remains usable offline
          }
        }
      };
      xhr.send();
    } catch (e) { /* ignore */ }
  }

  // Initial sync after load, then periodic to catch remote updates.
  // Use a conservative interval to avoid hammering the backend.
  setTimeout(syncOpenSessions, 1500);
  setInterval(syncOpenSessions, 120000); // every 2 min
  // Also resync when returning to the page (after lunch / screen wake)
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) syncOpenSessions();
  });
  window.addEventListener('pageshow', function () { syncOpenSessions(); });

  function handleEmployeeClick(name, btn) {
    activeEmployee = name;
    showKeypad(btn);
    highlightSelected(btn);
  }

  function handleOFChange(name, btn) {
    activeEmployee = name;
    currentOF = '';
    showKeypad(btn, true);
    highlightSelected(btn);
  }

  function highlightSelected(selectedBtn) {
    var buttons = document.querySelectorAll('.employee');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].classList.remove('selected');
    }
    selectedBtn.classList.add('selected');
  }

  function showKeypad(btn, isSwitchingOF) {
    if (typeof isSwitchingOF === 'undefined') {
      isSwitchingOF = false;
    }
    keypad.innerHTML = '';

    var display = document.createElement('div');
    display.id = 'of-display';
    display.textContent = currentOF;
    keypad.appendChild(display);

    var rows = [['1','2','3'], ['4','5','6'], ['7','8','9'], ['←','0','OK']];
    rows.forEach(function (row) {
      var rowDiv = document.createElement('div');
      rowDiv.className = 'key-row';
      row.forEach(function (key) {
        var keyBtn = document.createElement('button');
        keyBtn.className = 'key';
        if (key === 'OK') keyBtn.classList.add('wide');
        keyBtn.textContent = key;
        keyBtn.onclick = function () {
          handleKeyPress(key, btn, isSwitchingOF);
        };
        rowDiv.appendChild(keyBtn);
      });
      keypad.appendChild(rowDiv);
    });

    var cancelBtn = document.createElement('button');
    cancelBtn.id = 'cancel-btn';
    cancelBtn.textContent = 'Cancelar';
    cancelBtn.onclick = function () {
      currentOF = '';
      activeEmployee = null;
      keypad.innerHTML = '';
      keypad.style.display = 'none';
      var buttons = document.querySelectorAll('.employee');
      for (var i = 0; i < buttons.length; i++) {
        buttons[i].classList.remove('selected');
      }
    };
    keypad.appendChild(cancelBtn);

    keypad.style.display = 'block';
  }

  function handleKeyPress(key, btn, isSwitchingOF) {
    var display = document.getElementById('of-display');
    if (key === '←') {
      currentOF = currentOF.slice(0, -1);
    } else if (key === 'OK') {
      if (currentOF && activeEmployee) {
        if (isSwitchingOF && activeSessions[activeEmployee] === currentOF) {
          setStatus('Erro: já está nessa OF.', 'red');
          return;
        }
        sendAction(btn, isSwitchingOF);
      }
    } else {
      if (currentOF.length < 6) currentOF += key;
    }
    display.textContent = currentOF;
  }

  function resetKeypadState() {
    currentOF = '';
    activeEmployee = null;
    keypad.innerHTML = '';
    keypad.style.display = 'none';
    var buttons = document.querySelectorAll('.employee');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].classList.remove('selected');
    }
  }

  function sendAction(btn, isSwitchingOF) {
    var name = activeEmployee;
    var newOF = currentOF;
    var previousOF = activeSessions[name];

    function applyStartUI() {
      activeSessions[name] = newOF;
      persistActiveSessions();
      btn.classList.add('active');
      btn.querySelector('.of-display').textContent = newOF;
      actionButtons[name].style.display = 'inline-block';
      setStatus('Registado: ' + name + ' [' + newOF + ']', 'green');
      resetKeypadState();
    }

    function sendStartPayload() {
      var startHora = formatHHMM(new Date());
      var startPayload = {
        funcionario: name,
        of: newOF,
        acao: 'start',
        hora: startHora
      };
      console.log('📤 Enviar início da OF:', startPayload);
      var accepted = sendPayload(startPayload, config.webAppUrl, {
        lockKey: 'start:' + name,
        queueKey: 'start:' + name + ':' + String(newOF || ''),
        onDuplicate: function () {
          setStatus('Pedido de início já em processamento para ' + name + '.', 'orange');
        }
      });
      if (!accepted) return;
      applyStartUI();
    }

    if (isSwitchingOF && previousOF) {
      var endHora = formatHHMM(new Date());
      var endPayload = {
        funcionario: name,
        of: previousOF,
        acao: 'end',
        hora: endHora
      };
      console.log('📤 Enviar fim da OF anterior:', endPayload);
      var endAccepted = sendPayload(endPayload, config.webAppUrl, {
        acceptStatuses: [400],
        lockKey: 'end:' + name,
        queueKey: 'end:' + name + ':' + String(previousOF || ''),
        onDuplicate: function () {
          setStatus('Pedido de fecho já em processamento para ' + name + '.', 'orange');
        },
        onSettled: function (success, queued) {
          if (!success && !queued) {
            setStatus('Erro ao terminar turno atual. Tente novamente.', 'red');
            resetKeypadState();
            return;
          }
          sendStartPayload();
        }
      });
      if (!endAccepted) return;
    } else {
      sendStartPayload();
    }
  }

  function endShift(name, btn) {
    // Replace window.confirm with consistent modal UI
    openModal(function(modal) {
      var title = document.createElement('h3');
      title.textContent = 'Terminar Turno?';
      modal.appendChild(title);

      var info = document.createElement('div');
      var ofNum = activeSessions[name];
      info.textContent = 'Terminar turno de ' + name + (ofNum ? ' da OF ' + ofNum : '') + '?';
      modal.appendChild(info);

      var confirmBtn = document.createElement('button');
      confirmBtn.textContent = 'Terminar';
      confirmBtn.onclick = function () {
        var now = new Date();
        var hora = formatHHMM(now);

        var currentOfValue = activeSessions[name];
        var payload = {
          funcionario: name,
          of: currentOfValue,
          acao: 'end',
          hora: hora
        };

        var accepted = sendPayload(payload, config.webAppUrl, {
          lockKey: 'end:' + name,
          queueKey: 'end:' + name + ':' + String(currentOfValue || ''),
          onDuplicate: function () {
            setStatus('Pedido de fecho já em processamento para ' + name + '.', 'orange');
          }
        });
        if (!accepted) return;

        delete activeSessions[name];
        persistActiveSessions();
        btn.classList.remove('active');
        btn.querySelector('.of-display').textContent = '+';
        actionButtons[name].style.display = 'none';

        setStatus('Turno fechado: ' + name, 'orange');
        closeModal();
      };
      modal.appendChild(confirmBtn);

      var cancelBtn = document.createElement('button');
      cancelBtn.textContent = 'Cancelar';
      cancelBtn.onclick = function () {
        setStatus('Operação cancelada', 'orange');
        closeModal();
      };
      modal.appendChild(cancelBtn);
    });
  }

  function showActionMenu(name, btn) {
    openModal(function(modal) {
      var finishBtn = document.createElement('button');
      finishBtn.textContent = 'Terminar Acabamento Incompleto';
      finishBtn.onclick = function () {
        closeModal();
        showFinishIncompleteForm(name);
      };
      modal.appendChild(finishBtn);

      var cancelBtn = document.createElement('button');
      cancelBtn.textContent = 'Cancelar Turno Atual';
      cancelBtn.onclick = function () {
        closeModal();
        cancelCurrentShift(name, btn);
      };
      modal.appendChild(cancelBtn);

      var fecharBtn = document.createElement('button');
      fecharBtn.textContent = 'Fechar';
      fecharBtn.onclick = closeModal;
      modal.appendChild(fecharBtn);
    });
  }

  function showFinishIncompleteForm(name) {
    openModal(function(modal) {
      var title = document.createElement('h3');
      title.textContent = 'Terminar Acabamento Incompleto';
      modal.appendChild(title);

      var tipoDiv = document.createElement('div');
      tipoDiv.textContent = 'Tipo de acabamento:';
      var tpLabel = document.createElement('label');
      var tp = document.createElement('input');
      tp.type = 'radio';
      tp.name = 'tipo';
      tp.value = 'Tapa-Poros';
      tpLabel.appendChild(tp);
      tpLabel.appendChild(document.createTextNode(' Tapa-Poros '));
      var cruLabel = document.createElement('label');
      var cru = document.createElement('input');
      cru.type = 'radio';
      cru.name = 'tipo';
      cru.value = 'Cru';
      cruLabel.appendChild(cru);
      cruLabel.appendChild(document.createTextNode(' Cru'));
      tipoDiv.appendChild(tpLabel);
      tipoDiv.appendChild(cruLabel);
      modal.appendChild(tipoDiv);

      var colabDiv = document.createElement('div');
      colabDiv.textContent = 'Colaborador que iniciou:';
      var colabSelect = document.createElement('select');
      for (var i = 0; i < config.names.length; i++) {
        if (config.names[i] === name) continue; // não permitir selecionar a si próprio
        var opt = document.createElement('option');
        opt.value = config.names[i];
        opt.textContent = config.names[i];
        colabSelect.appendChild(opt);
      }
      colabDiv.appendChild(colabSelect);
      modal.appendChild(colabDiv);

      var tempoDiv = document.createElement('div');
      tempoDiv.textContent = 'Tempo restante:';
      var tempoSelect = document.createElement('select');
      var tempos = [10,20,30,40,50,60];
      for (var j = 0; j < tempos.length; j++) {
        var optT = document.createElement('option');
        optT.value = tempos[j];
        optT.textContent = tempos[j] + ' min';
        tempoSelect.appendChild(optT);
      }
      tempoDiv.appendChild(tempoSelect);
      modal.appendChild(tempoDiv);

      var enviar = document.createElement('button');
      enviar.textContent = 'Enviar';
      enviar.onclick = function () {
        var tipoRadio = modal.querySelector('input[name="tipo"]:checked');
        if (!tipoRadio) {
          setStatus('Selecione o tipo de acabamento', 'red');
          return;
        }
        if (!colabSelect.value) {
          setStatus('Escolha outro colaborador', 'red');
          return;
        }
        finishIncompleteAction(name, tipoRadio.value, colabSelect.value, tempoSelect.value);
        closeModal();
      };
      modal.appendChild(enviar);

      var cancel = document.createElement('button');
      cancel.textContent = 'Cancelar';
      cancel.onclick = closeModal;
      modal.appendChild(cancel);
    });
  }

  function finishIncompleteAction(name, tipo, iniciou, tempo) {
    var now = new Date();
    var hora = formatHHMM(now);
    var payload = {
      funcionario: name,
      acao: 'finishIncomplete',
      tipo: tipo,
      iniciou: iniciou,
      minutosRestantes: Number(tempo),
      hora: hora
    };
    var accepted = sendPayload(payload, config.webAppUrl, {
      lockKey: 'finishIncomplete:' + name,
      queueKey: 'finishIncomplete:' + name + ':' + tipo + ':' + iniciou + ':' + String(tempo),
      onDuplicate: function () {
        setStatus('Pedido já em processamento para ' + name + '.', 'orange');
      }
    });
    if (!accepted) return;
    setStatus('Complemento registado', 'green');
  }

  function cancelCurrentShift(name, btn) {
    if (!activeSessions[name]) {
      setStatus('Sem turno para cancelar', 'red');
      return;
    }
    var now = new Date();
    var hora = formatHHMM(now);
    var currentOfValue = activeSessions[name];
    var payload = {
      funcionario: name,
      of: currentOfValue,
      acao: 'cancel',
      hora: hora
    };
    var accepted = sendPayload(payload, config.webAppUrl, {
      lockKey: 'cancel:' + name,
      queueKey: 'cancel:' + name + ':' + String(currentOfValue || ''),
      onDuplicate: function () {
        setStatus('Pedido de cancelamento já em processamento para ' + name + '.', 'orange');
      }
    });
    if (!accepted) return;
    delete activeSessions[name];
    persistActiveSessions();
    btn.classList.remove('active');
    btn.querySelector('.of-display').textContent = '+';
    actionButtons[name].style.display = 'none';
    setStatus('Turno cancelado: ' + name, 'orange');
  }

  function openModal(builder) {
    closeModal();
    modalOverlay = document.createElement('div');
    modalOverlay.className = 'modal-overlay';
    var modal = document.createElement('div');
    modal.className = 'modal';
    builder(modal);
    modalOverlay.appendChild(modal);
    document.body.appendChild(modalOverlay);
  }

  function closeModal() {
    if (modalOverlay) {
      modalOverlay.remove();
      modalOverlay = null;
    }
  }
});
