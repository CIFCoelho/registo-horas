(function () {
  document.addEventListener('DOMContentLoaded', function () {
    var config = window.SECTION_CONFIG || {};
    var API_URL = (config.webAppUrl || '').replace(/\/$/, '');
    var fallbackOptions = Array.isArray(config.acabamentoOptions) ? config.acabamentoOptions.slice() : [];
    var names = Array.isArray(config.names) ? config.names : [];

    var employeeList = document.getElementById('employee-list');
    var keypad = document.getElementById('of-keypad');
    var status = document.getElementById('status');

    if (!employeeList || !API_URL) {
      console.warn('Estofagem: missing container or webAppUrl');
      return;
    }

    var statusTimeoutId = null;
    var syncTimeoutId = null;
    var activeEmployee = null;
    var currentOF = '';

    var ACTIVE_KEY = 'estofagemActiveSessions';
    var QUEUE_KEY = 'estofagemQueue';
    var activeSessions = loadActiveSessions();
    var uiMap = {};
    var openDropdown = null;
    var activeRegisterModal = null;
    var activeConfirmDialog = null;

    var queueSending = false;
    var FLUSH_INTERVAL_MS = 20000;
    var MAX_QUEUE_AGE_MS = 30 * 60 * 1000; // 30 minutes
    var switchingOF = false;

    function formatHHMM(date) {
      var h = date.getHours();
      var m = date.getMinutes();
      return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
    }

    function formatOFDisplay(ofValue) {
      // Display "Geral" for OF=0 (general work)
      if (ofValue === '0' || ofValue === 0) return 'Geral';
      return String(ofValue);
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

    function scheduleSync(delay) {
      if (syncTimeoutId) {
        clearTimeout(syncTimeoutId);
        syncTimeoutId = null;
      }
      syncTimeoutId = setTimeout(syncOpenSessions, typeof delay === 'number' ? delay : 2000);
    }

    function loadActiveSessions() {
      try {
        var raw = localStorage.getItem(ACTIVE_KEY);
        if (!raw) return {};
        var obj = JSON.parse(raw);
        return obj && typeof obj === 'object' ? obj : {};
      } catch (_) {
        return {};
      }
    }

    function persistActiveSessions() {
      try { localStorage.setItem(ACTIVE_KEY, JSON.stringify(activeSessions || {})); } catch (_) {}
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
    function enqueueRequest(data) {
      try {
        var q = loadQueue();
        q.push({ data: data, url: API_URL, ts: Date.now(), retries: 0, next: Date.now() });
        saveQueue(q);
        setStatus('Sem ligação. Guardado para envio automático.', 'orange');
        setTimeout(flushQueue, 1000);
      } catch (_) {}
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
      } catch (_) { cb(false, true); }
    }
    function flushQueue() {
      if (queueSending) return;
      var q = loadQueue();
      var now = Date.now();
      var kept = [];
      for (var i = 0; i < q.length; i++) {
        var it = q[i];
        if (now - (it.ts || 0) <= MAX_QUEUE_AGE_MS) kept.push(it);
      }
      if (kept.length !== q.length) saveQueue(kept);
      q = kept;
      var idx = -1;
      for (var j = 0; j < q.length; j++) {
        if ((q[j].next || 0) <= now) { idx = j; break; }
      }
      if (idx === -1) return;
      var item = q.splice(idx, 1)[0];
      saveQueue(q);
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

    function clearSelections() {
      for (var key in uiMap) {
        if (uiMap.hasOwnProperty(key)) {
          uiMap[key].card.classList.remove('selected');
        }
      }
    }

    function updateCardState(name) {
      var ui = uiMap[name];
      if (!ui) return;
      var ofValue = activeSessions[name];
      if (ofValue) {
        ui.card.classList.add('active');
        ui.ofDisplay.textContent = formatOFDisplay(ofValue);
      } else {
        ui.card.classList.remove('active');
        ui.ofDisplay.textContent = '+';
      }
    }

    function createEmployeeRow(name) {
      var row = document.createElement('div');
      row.className = 'employee-row';

      var card = document.createElement('div');
      card.className = 'employee';
      card.setAttribute('data-funcionario', name);

      var nameSpan = document.createElement('span');
      nameSpan.className = 'employee-name';
      nameSpan.textContent = name;
      card.appendChild(nameSpan);

      var controls = document.createElement('div');
      controls.className = 'right-controls';

      var registerBtn = document.createElement('button');
      registerBtn.className = 'register-btn';
      registerBtn.type = 'button';
      registerBtn.textContent = 'REGISTAR ACAB.';

      var ofDisplay = document.createElement('span');
      ofDisplay.className = 'of-display';
      ofDisplay.textContent = '+';

      controls.appendChild(registerBtn);
      controls.appendChild(ofDisplay);
      card.appendChild(controls);
      row.appendChild(card);
      employeeList.appendChild(row);

      card.onclick = function () {
        if (activeSessions[name]) {
          endShift(name);
        } else {
          beginShift(name);
        }
      };

      registerBtn.onclick = function (evt) {
        evt.stopPropagation();
        prepareRegister(name);
      };

      ofDisplay.onclick = function (evt) {
        evt.stopPropagation();
        if (activeSessions[name]) {
          initiateOFChange(name);
        }
      };

      uiMap[name] = {
        card: card,
        ofDisplay: ofDisplay,
        registerBtn: registerBtn
      };

      updateCardState(name);
    }

    function beginShift(name) {
      activeEmployee = name;
      currentOF = '';
      switchingOF = false;
      clearSelections();
      if (uiMap[name]) uiMap[name].card.classList.add('selected');
      showKeypad();
    }

    function initiateOFChange(name) {
      activeEmployee = name;
      currentOF = '';
      switchingOF = true;
      clearSelections();
      if (uiMap[name]) uiMap[name].card.classList.add('selected');
      showKeypad();
    }

    function closeKeypad() {
      keypad.innerHTML = '';
      keypad.style.display = 'none';
      activeEmployee = null;
      currentOF = '';
      switchingOF = false;
      clearSelections();
    }

    function showKeypad() {
      keypad.innerHTML = '';

      var display = document.createElement('div');
      display.id = 'of-display';
      display.textContent = currentOF === '0' ? 'Geral' : currentOF;
      keypad.appendChild(display);

      var rows = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['←', '0', 'OK']];
      for (var i = 0; i < rows.length; i++) {
        var row = document.createElement('div');
        row.className = 'key-row';
        for (var j = 0; j < rows[i].length; j++) {
          (function (value) {
            var btn = document.createElement('button');
            btn.className = 'key';
            if (value === 'OK') btn.className += ' wide';
            btn.textContent = value;
            btn.onclick = function () { handleKeyPress(value); };
            row.appendChild(btn);
          })(rows[i][j]);
        }
        keypad.appendChild(row);
      }

      // Add "Trabalho Geral" button for OF=0
      var geralBtn = document.createElement('button');
      geralBtn.id = 'geral-btn';
      geralBtn.textContent = 'Trabalho Geral';
      geralBtn.style.cssText = 'width: 100%; padding: 15px; font-size: 18px; background: #4a90e2; color: white; border: none; border-radius: 8px; margin-bottom: 10px; cursor: pointer;';
      geralBtn.onclick = function () {
        if (activeEmployee) {
          submitStart(activeEmployee, '0');
        }
      };
      keypad.appendChild(geralBtn);

      var cancelBtn = document.createElement('button');
      cancelBtn.id = 'cancel-btn';
      cancelBtn.textContent = 'Cancelar';
      cancelBtn.onclick = function () { closeKeypad(); };
      keypad.appendChild(cancelBtn);

      keypad.style.display = 'block';
    }

    function handleKeyPress(key) {
      var display = document.getElementById('of-display');
      if (!display) return;

      if (key === '←') {
        currentOF = currentOF.slice(0, -1);
      } else if (key === 'OK') {
        if (currentOF) {
          submitStart(activeEmployee, currentOF);
        }
      } else {
        if (currentOF.length < 6) currentOF += key;
      }

      display.textContent = currentOF === '0' ? 'Geral' : currentOF;
    }

    function submitStart(name, ofValue) {
      if (!name || !ofValue) return;
      var previousOF = activeSessions[name] ? String(activeSessions[name]) : '';
      if (switchingOF && previousOF === String(ofValue)) {
        var msg = ofValue === '0' ? 'Já está em trabalho geral.' : 'Já está na OF ' + ofValue + '.';
        setStatus(msg, 'red');
        closeKeypad();
        return;
      }

      var wasSwitching = switchingOF && !!previousOF;
      closeKeypad();

      // OPTIMISTIC UI UPDATE - apply immediately for instant feedback
      activeSessions[name] = String(ofValue);
      persistActiveSessions();
      updateCardState(name);
      var displayText = ofValue === '0' ? 'trabalho geral' : 'OF ' + ofValue;
      setStatus('Turno iniciado para ' + name + ' em ' + displayText + '.', '#026042');

      // Send requests asynchronously (don't block UI)
      var currentTime = new Date();
      var hora = formatHHMM(currentTime);

      if (wasSwitching && previousOF) {
        // Send END for old OF (async, non-blocking)
        var endPayload = {
          acao: 'end',
          funcionario: name,
          of: previousOF,
          hora: hora
        };
        sendAction(endPayload, {
          acceptStatuses: [400],
          onError: function () {
            console.log('⚠️ Erro ao fechar OF anterior (ignorado, será corrigido no sync)');
          }
        });
      }

      // Send START for new OF (async, non-blocking)
      var startPayload = {
        acao: 'start',
        funcionario: name,
        of: ofValue,
        hora: hora
      };
      sendAction(startPayload, {
        onError: function () {
          console.log('⚠️ Erro ao iniciar nova OF (enfileirado para reenvio)');
        }
      });

      // Note: Backend now handles race conditions via OF-specific filtering.
      // GET /open sync (every 2min) will correct any drift.
    }

    function endShift(name) {
      if (!activeSessions[name]) return;

      var ofValue = activeSessions[name];
      showConfirmDialog('Terminar turno de ' + name + '?', function () {
        // OPTIMISTIC UI UPDATE - apply immediately
        delete activeSessions[name];
        persistActiveSessions();
        updateCardState(name);
        setStatus('Turno terminado para ' + name + '.', '#026042');

        // Send END request asynchronously (don't block UI)
        var payload = {
          acao: 'end',
          funcionario: name,
          of: ofValue,
          hora: formatHHMM(new Date())
        };

        sendAction(payload, {
          acceptStatuses: [400],
          onError: function () {
            console.log('⚠️ Erro ao registar término (enfileirado para reenvio)');
          }
        });

        // Note: GET /open sync will correct any drift if request fails
      });
    }

    function sendAction(data, opts) {
      opts = opts || {};
      try {
        var xhr = new XMLHttpRequest();
        xhr.open('POST', API_URL, true);
        xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
        xhr.onreadystatechange = function () {
          if (xhr.readyState === 4) {
            var ok = xhr.status >= 200 && xhr.status < 300;
            if (!ok && opts.acceptStatuses && opts.acceptStatuses.indexOf(xhr.status) !== -1) {
              if (typeof opts.onSettled === 'function') opts.onSettled(true, false);
              scheduleSync();
              return;
            }
            if (ok) {
              if (opts.successMessage) setStatus(opts.successMessage, '#026042');
              if (typeof opts.onSuccess === 'function') opts.onSuccess();
              if (typeof opts.onSettled === 'function') opts.onSettled(true, false);
              scheduleSync();
              return;
            }

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
              enqueueRequest(data);
              if (typeof opts.onSettled === 'function') opts.onSettled(false, true);
              scheduleSync();
              return;
            }
            var message = 'Erro: ' + (xhr.responseText || xhr.status);
            setStatus(message, 'red');
            if (typeof opts.onError === 'function') opts.onError();
            if (typeof opts.onSettled === 'function') opts.onSettled(false, false);
            scheduleSync();
          }
        };
        xhr.onerror = function () {
          enqueueRequest(data);
          if (typeof opts.onSettled === 'function') opts.onSettled(false, true);
          scheduleSync();
        };
        xhr.send('data=' + encodeURIComponent(JSON.stringify(data)));
      } catch (_) {
        enqueueRequest(data);
        if (typeof opts.onSettled === 'function') opts.onSettled(false, true);
        scheduleSync();
      }
    }

    function prepareRegister(name) {
      var ofValue = activeSessions[name];
      if (!ofValue) {
        setStatus('Inicie o turno antes de registar o acabamento.', 'orange');
        return;
      }

      // Open modal IMMEDIATELY with fallback options for instant UX
      var initialOptions = Array.isArray(fallbackOptions) ? fallbackOptions.slice() : [];
      var modalContext = openRegisterModal(name, ofValue, initialOptions);

      // Fetch options in BACKGROUND and update dropdown when ready
      fetchAcabamentoOptions(ofValue, 3000, function (options) {
        if (options && options.length && modalContext && modalContext.updateOptions) {
          var unique = [];
          var seen = {};
          var source = fallbackOptions.slice();
          source = source.concat(options);
          for (var i = 0; i < source.length; i++) {
            var opt = String(source[i] || '').trim();
            if (!opt) continue;
            if (!seen[opt]) {
              seen[opt] = true;
              unique.push(opt);
            }
          }
          modalContext.updateOptions(unique);
        }
      });
    }

    function fetchAcabamentoOptions(ofValue, timeout, cb) {
      var completed = false;
      var timeoutId = setTimeout(function () {
        completed = true;
        cb([]); // Timeout - use fallback
      }, timeout || 3000);

      try {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', API_URL + '/options?of=' + encodeURIComponent(ofValue), true);
        xhr.onreadystatechange = function () {
          if (xhr.readyState === 4 && !completed) {
            clearTimeout(timeoutId);
            completed = true;
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                var resp = JSON.parse(xhr.responseText || '{}');
                if (resp && resp.ok && Array.isArray(resp.options)) {
                  cb(resp.options);
                  return;
                }
              } catch (_) {}
            }
            cb([]);
          }
        };
        xhr.onerror = function () {
          if (!completed) {
            clearTimeout(timeoutId);
            completed = true;
            cb([]);
          }
        };
        xhr.send();
      } catch (_) {
        if (!completed) {
          clearTimeout(timeoutId);
          completed = true;
          cb([]);
        }
      }
    }

    function closeActiveDropdown() {
      if (openDropdown && typeof openDropdown.close === 'function') {
        openDropdown.close();
      }
      openDropdown = null;
    }

    function closeRegisterModal() {
      closeActiveDropdown();
      if (!activeRegisterModal) return;
      document.removeEventListener('keydown', activeRegisterModal.onKeyDown);
      if (activeRegisterModal.overlay && activeRegisterModal.overlay.parentNode) {
        activeRegisterModal.overlay.parentNode.removeChild(activeRegisterModal.overlay);
      }
      activeRegisterModal = null;
    }

    function closeConfirmDialog() {
      if (!activeConfirmDialog) return;
      document.removeEventListener('keydown', activeConfirmDialog.onKeyDown);
      if (activeConfirmDialog.overlay && activeConfirmDialog.overlay.parentNode) {
        activeConfirmDialog.overlay.parentNode.removeChild(activeConfirmDialog.overlay);
      }
      activeConfirmDialog = null;
    }

    function showConfirmDialog(message, onConfirm) {
      closeConfirmDialog();

      var overlay = document.createElement('div');
      overlay.className = 'estofagem-modal-overlay';

      var modal = document.createElement('div');
      modal.className = 'estofagem-modal confirm-dialog';

      var text = document.createElement('p');
      text.className = 'estofagem-confirm-message';
      text.textContent = message;
      modal.appendChild(text);

      var actions = document.createElement('div');
      actions.className = 'actions';

      var confirmBtn = document.createElement('button');
      confirmBtn.className = 'primary';
      confirmBtn.type = 'button';
      confirmBtn.textContent = 'Confirmar';

      var cancelBtn = document.createElement('button');
      cancelBtn.className = 'secondary';
      cancelBtn.type = 'button';
      cancelBtn.textContent = 'Cancelar';

      confirmBtn.onclick = function () {
        closeConfirmDialog();
        if (typeof onConfirm === 'function') onConfirm();
      };

      cancelBtn.onclick = function () {
        closeConfirmDialog();
      };

      actions.appendChild(confirmBtn);
      actions.appendChild(cancelBtn);
      modal.appendChild(actions);

      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      overlay.onclick = function (evt) {
        if (evt.target === overlay) closeConfirmDialog();
      };

      function onKeyDown(evt) {
        if (evt.key === 'Escape' || evt.key === 'Esc') {
          closeConfirmDialog();
        }
      }

      document.addEventListener('keydown', onKeyDown);

      activeConfirmDialog = {
        overlay: overlay,
        onKeyDown: onKeyDown
      };
    }

    function openRegisterModal(name, ofValue, optionsList) {
      closeConfirmDialog();
      closeRegisterModal();

      var overlay = document.createElement('div');
      overlay.className = 'estofagem-modal-overlay';

      var modal = document.createElement('div');
      modal.className = 'estofagem-modal';

      var title = document.createElement('h2');
      title.textContent = 'Registar acabamento';
      modal.appendChild(title);

      var subtitle = document.createElement('p');
      subtitle.style.margin = '0 0 16px';
      subtitle.style.textAlign = 'center';
      subtitle.style.color = '#4d4d4d';
      subtitle.textContent = name + ' · OF ' + ofValue;
      modal.appendChild(subtitle);

      var selectionState = { cru: null, tp: null };

      // Mutable options reference for dynamic updates
      var currentOptions = optionsList || [];

      function updateConfirmState() {
        confirmBtn.disabled = !(selectionState.cru && selectionState.tp);
      }

      function createField(labelText, key) {
        var wrapper = document.createElement('div');
        wrapper.className = 'register-field';

        var label = document.createElement('label');
        label.textContent = labelText;
        wrapper.appendChild(label);

        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'selector-btn';
        button.textContent = 'Selecionar';
        button.setAttribute('data-selected', 'false');

        var dropdown = null;

        function closeDropdown() {
          if (dropdown && dropdown.parentNode) {
            dropdown.parentNode.removeChild(dropdown);
          }
          dropdown = null;
          openDropdown = null;
        }

        button.onclick = function () {
          if (dropdown) {
            closeDropdown();
            return;
          }
          closeActiveDropdown();

          dropdown = document.createElement('div');
          dropdown.className = 'dropdown';

          // Use currentOptions (dynamically updated)
          if (!currentOptions || !currentOptions.length) {
            var empty = document.createElement('div');
            empty.className = 'dropdown-empty';
            empty.textContent = 'Sem opções disponíveis';
            dropdown.appendChild(empty);
          } else {
            for (var idx = 0; idx < currentOptions.length; idx++) {
              (function (optionName) {
                var optBtn = document.createElement('button');
                optBtn.type = 'button';
                optBtn.textContent = optionName;
                optBtn.onclick = function () {
                  selectionState[key] = optionName;
                  button.textContent = optionName;
                  button.setAttribute('data-selected', 'true');
                  closeDropdown();
                  updateConfirmState();
                };
                dropdown.appendChild(optBtn);
              })(currentOptions[idx]);
            }
          }

          wrapper.appendChild(dropdown);
          openDropdown = { close: closeDropdown };
        };

        wrapper.appendChild(button);
        return wrapper;
      }

      var cruField = createField('Cru', 'cru');
      var tpField = createField('Tapa-Poros', 'tp');
      modal.appendChild(cruField);
      modal.appendChild(tpField);

      var actions = document.createElement('div');
      actions.className = 'actions';

      var confirmBtn = document.createElement('button');
      confirmBtn.className = 'primary';
      confirmBtn.type = 'button';
      confirmBtn.textContent = 'Confirmar';
      confirmBtn.disabled = true;

      var cancelBtn = document.createElement('button');
      cancelBtn.className = 'secondary';
      cancelBtn.type = 'button';
      cancelBtn.textContent = 'Cancelar';

      confirmBtn.onclick = function () {
        closeRegisterModal();
        var payload = {
          acao: 'registerAcabamento',
          funcionario: name,
          of: ofValue,
          cru: selectionState.cru,
          tp: selectionState.tp
        };
        sendAction(payload, {
          successMessage: 'Acabamento registado: Cru - ' + selectionState.cru + ', TP - ' + selectionState.tp + '.',
          onError: function () {
            setStatus('Falha ao registar acabamento.', 'red');
          }
        });
      };

      cancelBtn.onclick = function () {
        closeRegisterModal();
      };

      actions.appendChild(confirmBtn);
      actions.appendChild(cancelBtn);
      modal.appendChild(actions);

      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      overlay.onclick = function (evt) {
        if (evt.target === overlay) closeRegisterModal();
      };

      function onKeyDown(evt) {
        if (evt.key === 'Escape' || evt.key === 'Esc') {
          closeRegisterModal();
        }
      }

      document.addEventListener('keydown', onKeyDown);

      activeRegisterModal = {
        overlay: overlay,
        onKeyDown: onKeyDown
      };

      // Return context for dynamic option updates
      return {
        updateOptions: function (newOptions) {
          if (Array.isArray(newOptions)) {
            currentOptions = newOptions;
          }
        }
      };
    }

    function applySessionsFromServer(sessions) {
      var updated = {};
      for (var i = 0; i < sessions.length; i++) {
        var item = sessions[i] || {};
        if (!item.funcionario) continue;
        updated[item.funcionario] = item.of ? String(item.of) : '';
      }
      activeSessions = updated;
      persistActiveSessions();
      for (var key in uiMap) {
        if (uiMap.hasOwnProperty(key)) updateCardState(key);
      }
    }

    function syncOpenSessions() {
      try {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', API_URL + '/open', true);
        xhr.onreadystatechange = function () {
          if (xhr.readyState === 4) {
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                var resp = JSON.parse(xhr.responseText || '{}');
                if (resp && resp.ok && Array.isArray(resp.sessions)) {
                  applySessionsFromServer(resp.sessions);
                }
              } catch (_) {}
            }
          }
        };
        xhr.send();
      } catch (_) {}
    }

    for (var i = 0; i < names.length; i++) {
      createEmployeeRow(names[i]);
    }

    setTimeout(syncOpenSessions, 1500);
    setInterval(syncOpenSessions, 120000);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) syncOpenSessions();
    });
    window.addEventListener('pageshow', function () { syncOpenSessions(); });

    setTimeout(flushQueue, 500);
  });
})();
