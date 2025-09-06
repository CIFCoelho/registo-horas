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

  if (localStorage.getItem('activeSessions')) {
    activeSessions = JSON.parse(localStorage.getItem('activeSessions'));
  }

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

  function sendPayload(data, url) {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', url, true);
      xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
      xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) {
          var ok = xhr.status >= 200 && xhr.status < 300;
          if (!ok) {
            console.error('❌ Falha ao enviar', data, xhr.status, xhr.responseText);
            setStatus('Erro: ligação falhou (' + xhr.status + ')', 'red');
          } else {
            console.log('✅ Enviado com sucesso', data, xhr.responseText);
          }
        }
      };
      xhr.onerror = function () {
        console.error('❌ Erro de rede ao enviar', data);
        setStatus('Erro de rede ao comunicar com o servidor', 'red');
      };
      xhr.send('data=' + encodeURIComponent(JSON.stringify(data)));
    } catch (e) {
      console.error('❌ Exceção ao enviar', e);
      setStatus('Erro inesperado ao enviar', 'red');
    }
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
    if (changed) localStorage.setItem('activeSessions', JSON.stringify(activeSessions));

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

  // Initial sync after load, then periodic to catch auto-close events.
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

  function sendAction(btn, isSwitchingOF) {
    var now = new Date();
    var hora = now.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });

    console.log('sendAction()', {
      isSwitchingOF: isSwitchingOF,
      activeEmployee: activeEmployee,
      currentOF: currentOF,
      previousOF: activeSessions[activeEmployee]
    });

    var payloads = [];

    if (isSwitchingOF && activeSessions[activeEmployee]) {
      var endPayload = {
        funcionario: activeEmployee,
        of: activeSessions[activeEmployee],
        acao: 'end',
        hora: hora
      };
      payloads.push(endPayload);
      console.log('📤 Enviar fim da OF anterior:', endPayload);
    }

    var startPayload = {
      funcionario: activeEmployee,
      of: currentOF,
      acao: 'start',
      hora: hora
    };
    payloads.push(startPayload);
    console.log('📤 Enviar início da nova OF:', startPayload);

    for (var i = 0; i < payloads.length; i++) {
      sendPayload(payloads[i], config.webAppUrl);
    }

    activeSessions[activeEmployee] = currentOF;
    localStorage.setItem('activeSessions', JSON.stringify(activeSessions));
    btn.classList.add('active');
    btn.querySelector('.of-display').textContent = currentOF;
    actionButtons[activeEmployee].style.display = 'inline-block';

    setStatus('Registado: ' + activeEmployee + ' [' + currentOF + ']', 'green');
    currentOF = '';
    activeEmployee = null;
    keypad.innerHTML = '';
    keypad.style.display = 'none';
    var buttons = document.querySelectorAll('.employee');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].classList.remove('selected');
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
        var hora = now.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });

        var payload = {
          funcionario: name,
          of: activeSessions[name],
          acao: 'end',
          hora: hora
        };

        sendPayload(payload, config.webAppUrl);

        delete activeSessions[name];
        localStorage.setItem('activeSessions', JSON.stringify(activeSessions));
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
    var hora = now.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
    var payload = {
      funcionario: name,
      acao: 'finishIncomplete',
      tipo: tipo,
      iniciou: iniciou,
      minutosRestantes: Number(tempo),
      hora: hora
    };
    sendPayload(payload, config.webAppUrl);
    setStatus('Complemento registado', 'green');
  }

  function cancelCurrentShift(name, btn) {
    if (!activeSessions[name]) {
      setStatus('Sem turno para cancelar', 'red');
      return;
    }
    var now = new Date();
    var hora = now.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
    var payload = {
      funcionario: name,
      of: activeSessions[name],
      acao: 'cancel',
      hora: hora
    };
    sendPayload(payload, config.webAppUrl);
    delete activeSessions[name];
    localStorage.setItem('activeSessions', JSON.stringify(activeSessions));
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
