(function () {
  document.addEventListener('DOMContentLoaded', function () {
    var config = window.SECTION_CONFIG || {};
    var employeeList = document.getElementById('employee-list');
    var keypad = document.getElementById('of-keypad');
    var status = document.getElementById('status');

    if (!employeeList || !keypad || !status) {
      console.warn('ShiftBasic: missing container elements.');
      return;
    }

    var API_URL = (config.webAppUrl || '').replace(/\/$/, '');
    if (!API_URL) {
      console.warn('ShiftBasic: missing webAppUrl in config.');
      return;
    }

    var sectionSlug = (config.section || 'shift')
      .toString()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'shift';

    var QUEUE_KEY = config.queueKey || (sectionSlug + ':queue');
    var ACTIVE_SESSIONS_KEY = config.activeSessionsKey || (sectionSlug + ':sessions');
    var enableCancel = config.enableCancel !== false;
    var extraMenuBuilders = Array.isArray(config.extraActions) ? config.extraActions : [];
    var hasActionMenu = enableCancel || extraMenuBuilders.length > 0;

    var names = Array.isArray(config.names) ? config.names : [];
    if (!names.length) {
      console.warn('ShiftBasic: no names configured.');
    }

    var activeEmployee = null;
    var currentOF = '';
    var activeSessions = loadActiveSessions();
    var actionButtons = {};
    var employeeButtons = {};
    var controlsMap = {};
    var ofDisplayMap = {};
    var rowStateUpdaters = {};
    var modalOverlay = null;
    var statusTimeoutId = null;
    var requestLocks = {};
    var queueSending = false;

    var FLUSH_INTERVAL_MS = typeof config.flushIntervalMs === 'number' ? config.flushIntervalMs : 20000;
    var MAX_QUEUE_AGE_MS = typeof config.maxQueueAgeMs === 'number' ? config.maxQueueAgeMs : 30 * 60 * 1000;

    // --- Helpers ---------------------------------------------------------

    function formatHHMM(date) {
      var h = date.getHours();
      var m = date.getMinutes();
      return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
    }

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
        }, 30000);
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
        var queue = loadQueue();
        if (key) {
          for (var i = 0; i < queue.length; i++) {
            if (queue[i].key === key) {
              queue[i].ts = Date.now();
              queue[i].next = Date.now();
              queue[i].data = data;
              queue[i].url = url;
              queue[i].retries = 0;
              saveQueue(queue);
              setStatus('Pedido já guardado. Aguarde ligação.', 'orange');
              setTimeout(flushQueue, 1000);
              return false;
            }
          }
        }
        queue.push({ data: data, url: url, ts: Date.now(), retries: 0, next: Date.now(), key: key });
        saveQueue(queue);
        setStatus('Sem ligação. Guardado para envio automático.', 'orange');
        setTimeout(flushQueue, 1000);
        return true;
      } catch (_) {
        return false;
      }
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
            if (xhr.status === 0 || xhr.status === 429 || xhr.status >= 500) return cb(false, true);
            return cb(false, false);
          }
        };
        xhr.onerror = function () { cb(false, true); };
        xhr.send('data=' + encodeURIComponent(JSON.stringify(item.data)));
      } catch (_) {
        cb(false, true);
      }
    }

    function flushQueue() {
      if (queueSending) return;
      var queue = loadQueue();
      var now = Date.now();
      var kept = [];
      for (var i = 0; i < queue.length; i++) {
        var entry = queue[i];
        if (now - (entry.ts || 0) <= MAX_QUEUE_AGE_MS) kept.push(entry);
      }
      if (kept.length !== queue.length) saveQueue(kept);
      queue = kept;

      var idx = -1;
      for (var j = 0; j < queue.length; j++) {
        if ((queue[j].next || 0) <= now) {
          idx = j;
          break;
        }
      }
      if (idx === -1) return;

      var item = queue.splice(idx, 1)[0];
      saveQueue(queue);
      queueSending = true;
      sendQueueItem(item, function (success, shouldRetry) {
        queueSending = false;
        if (success) {
          setTimeout(flushQueue, 100);
          scheduleSync(1500);
        } else if (shouldRetry) {
          item.retries = (item.retries || 0) + 1;
          var backoff = Math.min(10 * 60 * 1000, 5000 * Math.pow(2, Math.max(0, item.retries - 1)));
          item.next = Date.now() + backoff;
          var q2 = loadQueue();
          q2.push(item);
          saveQueue(q2);
        } else {
          setStatus('Erro permanente ao enviar um pedido. Verifique dados.', 'red');
          scheduleSync(1500);
        }
      });
    }

    setInterval(flushQueue, FLUSH_INTERVAL_MS);
    window.addEventListener('online', function () { setTimeout(flushQueue, 500); scheduleSync(500); });
    document.addEventListener('visibilitychange', function () { if (!document.hidden) { setTimeout(flushQueue, 500); scheduleSync(500); } });
    window.addEventListener('pageshow', function () { setTimeout(flushQueue, 500); scheduleSync(500); });

    var syncTimeoutId = null;
    function scheduleSync(delay) {
      if (syncTimeoutId) {
        clearTimeout(syncTimeoutId);
        syncTimeoutId = null;
      }
      syncTimeoutId = setTimeout(syncOpenSessions, typeof delay === 'number' ? delay : 2000);
    }

    function sendPayload(data, opts) {
      opts = opts || {};
      var settled = false;
      var acceptedStatuses = opts.acceptStatuses || [];
      var lockKey = opts.lockKey || null;
      if (lockKey && !acquireLock(lockKey)) {
        if (typeof opts.onDuplicate === 'function') {
          opts.onDuplicate();
        } else {
          setStatus('Pedido já está a ser processado. Aguarde.', 'orange');
        }
        return false;
      }

      function finish(success, queued, detail) {
        if (settled) return;
        settled = true;
        releaseLock(lockKey);
        if (success) {
          if (typeof opts.onSuccess === 'function') opts.onSuccess(detail);
        } else {
          if (typeof opts.onError === 'function') {
            opts.onError({ queued: queued, detail: detail || null });
          }
        }
        if (typeof opts.onSettled === 'function') opts.onSettled(success, queued, detail || null);
      }

      try {
        var xhr = new XMLHttpRequest();
        xhr.open('POST', API_URL, true);
        xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
        xhr.onreadystatechange = function () {
          if (xhr.readyState === 4) {
            var ok = xhr.status >= 200 && xhr.status < 300;
            if (!ok) {
              if (acceptedStatuses.indexOf(xhr.status) !== -1) {
                finish(true, false, { status: xhr.status, body: xhr.responseText });
                return;
              }
              if (xhr.status === 0 || xhr.status === 429 || xhr.status >= 500) {
                enqueueRequest(data, API_URL, opts.queueKey || null);
                finish(false, true, { status: xhr.status, body: xhr.responseText });
              } else {
                setStatus('Erro: ligação falhou (' + xhr.status + ')', 'red');
                finish(false, false, { status: xhr.status, body: xhr.responseText });
              }
            } else {
              finish(true, false, { status: xhr.status, body: xhr.responseText });
            }
          }
        };
        xhr.onerror = function () {
          enqueueRequest(data, API_URL, opts.queueKey || null);
          finish(false, true, { status: 0, body: '' });
        };
        xhr.send('data=' + encodeURIComponent(JSON.stringify(data)));
      } catch (err) {
        enqueueRequest(data, API_URL, opts.queueKey || null);
        finish(false, true, { status: 0, body: String(err && err.message ? err.message : err) });
      }
      return true;
    }

    function getOpenEndpoint() {
      return API_URL + '/open';
    }

    function applySessionsToUI(serverMap) {
      var changed = false;
      for (var localName in activeSessions) {
        if (!serverMap[localName]) {
          delete activeSessions[localName];
          changed = true;
        }
      }
      for (var serverName in serverMap) {
        if (activeSessions[serverName] !== serverMap[serverName]) {
          activeSessions[serverName] = serverMap[serverName];
          changed = true;
        }
      }
      if (changed) persistActiveSessions();

      for (var i = 0; i < names.length; i++) {
        var n = names[i];
        var card = employeeButtons[n];
        if (!card) continue;
        var ofDisplay = ofDisplayMap[n];
        var menuBtn = actionButtons[n];
        if (activeSessions[n]) {
          card.classList.add('active');
          if (ofDisplay) ofDisplay.textContent = activeSessions[n];
          if (menuBtn) menuBtn.style.display = 'inline-block';
        } else {
          card.classList.remove('active');
          if (ofDisplay) ofDisplay.textContent = '+';
          if (menuBtn) menuBtn.style.display = 'none';
        }
        notifyRowState(n);
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
                    var session = resp.sessions[i];
                    if (session && session.funcionario) {
                      map[session.funcionario] = session.of ? String(session.of) : '';
                    }
                  }
                  applySessionsToUI(map);
                }
              } catch (_) {}
            }
          }
        };
        xhr.send();
      } catch (_) {}
    }

    setTimeout(syncOpenSessions, 1500);
    setInterval(syncOpenSessions, 120000);

    // --- UI construction -------------------------------------------------

    names.forEach(function (name) {
      var row = document.createElement('div');
      row.className = 'employee-row';

      var card = document.createElement('div');
      card.className = 'employee';

      var nameSpan = document.createElement('span');
      nameSpan.textContent = name;
      card.appendChild(nameSpan);

      var controls = document.createElement('div');
      controls.className = 'right-controls';

      var ofDisplay = document.createElement('span');
      ofDisplay.className = 'of-display';
      ofDisplay.textContent = '+';
      controls.appendChild(ofDisplay);

      var menuBtn = null;
      if (hasActionMenu) {
        menuBtn = document.createElement('button');
        menuBtn.className = 'action-btn';
        menuBtn.textContent = '\u22EF';
        menuBtn.onclick = function (event) {
          event.stopPropagation();
          showActionMenu(name, card);
        };
        controls.appendChild(menuBtn);
        actionButtons[name] = menuBtn;
      }

      card.appendChild(controls);
      row.appendChild(card);
      employeeList.appendChild(row);

      employeeButtons[name] = card;
      controlsMap[name] = controls;
      ofDisplayMap[name] = ofDisplay;
      rowStateUpdaters[name] = [];

      ofDisplay.onclick = function (event) {
        event.stopPropagation();
        if (activeSessions[name]) {
          handleOFChange(name, card);
        }
      };

      card.onclick = function () {
        if (!activeSessions[name]) {
          handleEmployeeClick(name, card);
        } else {
          endShift(name, card);
        }
      };

      if (typeof config.onRowCreated === 'function') {
        try {
          var api = {
            name: name,
            card: card,
            controls: controls,
            ofDisplay: ofDisplay,
            actionButton: menuBtn,
            setStatus: setStatus,
            openModal: openModal,
            closeModal: closeModal,
            sendRequest: function (payload, options) { return sendPayload(payload, options || {}); },
            getActiveOF: function () { return activeSessions[name] || ''; },
            registerStateUpdater: function (fn) {
              if (typeof fn === 'function') rowStateUpdaters[name].push(fn);
            },
            refreshState: function () { notifyRowState(name); },
            queuePrefix: sectionSlug,
            scheduleSync: scheduleSync,
            persistActiveSessions: persistActiveSessions
          };
          var result = config.onRowCreated(api);
          if (typeof result === 'function') {
            rowStateUpdaters[name].push(result);
          }
        } catch (err) {
          console.warn('ShiftBasic onRowCreated error:', err && err.message ? err.message : err);
        }
      }

      if (activeSessions[name]) {
        card.classList.add('active');
        ofDisplay.textContent = activeSessions[name];
        if (menuBtn) menuBtn.style.display = 'inline-block';
      }

      notifyRowState(name);
    });

    // --- Interaction logic ----------------------------------------------

    function handleEmployeeClick(name, card) {
      activeEmployee = name;
      showKeypad(card, false);
      highlightSelected(card);
    }

    function handleOFChange(name, card) {
      activeEmployee = name;
      currentOF = '';
      showKeypad(card, true);
      highlightSelected(card);
    }

    function highlightSelected(selectedCard) {
      var buttons = document.querySelectorAll('.employee');
      for (var i = 0; i < buttons.length; i++) {
        buttons[i].classList.remove('selected');
      }
      selectedCard.classList.add('selected');
    }

    function showKeypad(card, isSwitchingOF) {
      keypad.innerHTML = '';

      var display = document.createElement('div');
      display.id = 'of-display';
      display.textContent = currentOF;
      keypad.appendChild(display);

      var rows = [['1','2','3'], ['4','5','6'], ['7','8','9'], ['\u2190','0','OK']];
      for (var r = 0; r < rows.length; r++) {
        var row = document.createElement('div');
        row.className = 'key-row';
        for (var c = 0; c < rows[r].length; c++) {
          var key = rows[r][c];
          var keyBtn = document.createElement('button');
          keyBtn.className = 'key';
          if (key === 'OK') keyBtn.className += ' wide';
          keyBtn.textContent = key === '\u2190' ? '←' : key;
          keyBtn.onclick = (function (value) {
            return function () {
              handleKeyPress(value, card, !!isSwitchingOF);
            };
          })(key);
          row.appendChild(keyBtn);
        }
        keypad.appendChild(row);
      }

      var cancelBtn = document.createElement('button');
      cancelBtn.id = 'cancel-btn';
      cancelBtn.textContent = 'Cancelar';
      cancelBtn.onclick = resetKeypadState;
      keypad.appendChild(cancelBtn);

      keypad.style.display = 'block';
    }

    function handleKeyPress(key, card, isSwitchingOF) {
      var display = document.getElementById('of-display');
      if (key === '\u2190' || key === '←') {
        currentOF = currentOF.slice(0, -1);
      } else if (key === 'OK') {
        if (currentOF && activeEmployee) {
          if (isSwitchingOF && activeSessions[activeEmployee] === currentOF) {
            setStatus('Erro: já está nessa OF.', 'red');
            return;
          }
          sendAction(card, isSwitchingOF);
        }
      } else {
        if (currentOF.length < 6) currentOF += key;
      }
      if (display) display.textContent = currentOF;
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

    function sendAction(card, isSwitchingOF) {
      var name = activeEmployee;
      var newOF = currentOF;
      var previousOF = activeSessions[name];

      function applyStartUI() {
        activeSessions[name] = newOF;
        persistActiveSessions();
        card.classList.add('active');
        var ofDisplay = ofDisplayMap[name];
        if (ofDisplay) ofDisplay.textContent = newOF;
        var menuBtn = actionButtons[name];
        if (menuBtn) menuBtn.style.display = 'inline-block';
        setStatus('Registado: ' + name + ' [' + newOF + ']', 'green');
        resetKeypadState();
        notifyRowState(name);
        triggerShiftEvent('start', name, { of: newOF });
      }

      function sendStartPayload() {
        var startPayload = {
          funcionario: name,
          of: newOF,
          acao: 'start',
          hora: formatHHMM(new Date())
        };
        var accepted = sendPayload(startPayload, {
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
        var endPayload = {
          funcionario: name,
          of: previousOF,
          acao: 'end',
          hora: formatHHMM(new Date())
        };
        var accepted = sendPayload(endPayload, {
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
        if (!accepted) return;
      } else {
        sendStartPayload();
      }
    }

    function endShift(name, card) {
      openModal(function (modal) {
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
          var currentOfValue = activeSessions[name];
          var payload = {
            funcionario: name,
            of: currentOfValue,
            acao: 'end',
            hora: formatHHMM(new Date())
          };
          var accepted = sendPayload(payload, {
            lockKey: 'end:' + name,
            queueKey: 'end:' + name + ':' + String(currentOfValue || ''),
            onDuplicate: function () {
              setStatus('Pedido de fecho já em processamento para ' + name + '.', 'orange');
            }
          });
          if (!accepted) return;
          delete activeSessions[name];
          persistActiveSessions();
          card.classList.remove('active');
          var ofDisplay = ofDisplayMap[name];
          if (ofDisplay) ofDisplay.textContent = '+';
          var menuBtn = actionButtons[name];
          if (menuBtn) menuBtn.style.display = 'none';
          setStatus('Turno fechado: ' + name, 'orange');
          notifyRowState(name);
          triggerShiftEvent('end', name, { of: currentOfValue });
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

    function cancelCurrentShift(name, card) {
      if (!activeSessions[name]) {
        setStatus('Sem turno para cancelar', 'red');
        return;
      }
      var currentOfValue = activeSessions[name];
      var payload = {
        funcionario: name,
        of: currentOfValue,
        acao: 'cancel',
        hora: formatHHMM(new Date())
      };
      var accepted = sendPayload(payload, {
        lockKey: 'cancel:' + name,
        queueKey: 'cancel:' + name + ':' + String(currentOfValue || ''),
        onDuplicate: function () {
          setStatus('Pedido de cancelamento já em processamento para ' + name + '.', 'orange');
        }
      });
      if (!accepted) return;
      delete activeSessions[name];
      persistActiveSessions();
      card.classList.remove('active');
      var ofDisplay = ofDisplayMap[name];
      if (ofDisplay) ofDisplay.textContent = '+';
      var menuBtn = actionButtons[name];
      if (menuBtn) menuBtn.style.display = 'none';
      setStatus('Turno cancelado: ' + name, 'orange');
      notifyRowState(name);
      triggerShiftEvent('cancel', name, { of: currentOfValue });
    }

    function showActionMenu(name, card) {
      openModal(function (modal) {
        var header = document.createElement('h3');
        header.textContent = 'Ações';
        modal.appendChild(header);

        if (enableCancel) {
          var cancelBtn = document.createElement('button');
          cancelBtn.textContent = 'Cancelar Turno Atual';
          cancelBtn.onclick = function () {
            closeModal();
            cancelCurrentShift(name, card);
          };
          modal.appendChild(cancelBtn);
        }

        for (var i = 0; i < extraMenuBuilders.length; i++) {
          try {
            extraMenuBuilders[i](modal, {
              nome: name,
              closeModal: closeModal,
              setStatus: setStatus,
              activeSessions: activeSessions,
              persistActiveSessions: persistActiveSessions,
              sendPayload: sendPayload,
              card: card
            });
          } catch (e) {
            console.warn('ShiftBasic extra action error:', e && e.message ? e.message : e);
          }
        }

        var fecharBtn = document.createElement('button');
        fecharBtn.textContent = 'Fechar';
        fecharBtn.onclick = closeModal;
        modal.appendChild(fecharBtn);
      });
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

    function notifyRowState(name) {
      var updaters = rowStateUpdaters[name];
      if (!updaters || !updaters.length) return;
      var info = {
        name: name,
        isActive: !!activeSessions[name],
        of: activeSessions[name] ? String(activeSessions[name]) : '',
        card: employeeButtons[name] || null,
        controls: controlsMap[name] || null,
        ofDisplay: ofDisplayMap[name] || null
      };
      for (var i = 0; i < updaters.length; i++) {
        try {
          updaters[i](info);
        } catch (err) {
          console.warn('ShiftBasic state updater error:', err && err.message ? err.message : err);
        }
      }
    }

    function triggerShiftEvent(type, name, details) {
      if (!config) return;
      var payload = {
        name: name,
        of: details && details.of ? details.of : '',
        details: details || {}
      };
      try {
        if (type === 'start' && typeof config.onShiftStarted === 'function') {
          config.onShiftStarted(payload);
        } else if (type === 'end' && typeof config.onShiftEnded === 'function') {
          config.onShiftEnded(payload);
        } else if (type === 'cancel' && typeof config.onShiftCancelled === 'function') {
          config.onShiftCancelled(payload);
        }
      } catch (err) {
        console.warn('ShiftBasic shift event error:', err && err.message ? err.message : err);
      }
    }
  });
})();
