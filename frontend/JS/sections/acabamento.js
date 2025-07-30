document.addEventListener('DOMContentLoaded', function () {
  var config = window.SECTION_CONFIG;
  var employeeList = document.getElementById('employee-list');
  var keypad = document.getElementById('of-keypad');
  var status = document.getElementById('status');
  var activeEmployee = null;
  var currentOF = '';
  var activeSessions = {};
  var modalOverlay = null;

  if (localStorage.getItem('activeSessions')) {
    activeSessions = JSON.parse(localStorage.getItem('activeSessions'));
  }

  config.names.forEach(function (name) {
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
    btn.appendChild(ofDisplay);

    var actionBtn = document.createElement('button');
    actionBtn.className = 'action-btn';
    actionBtn.textContent = '\u22EF'; // "⋯"
    actionBtn.onclick = function (e) {
      e.stopPropagation();
      showActivityMenu(name, btn);
    };
    controls.appendChild(actionBtn);

    btn.appendChild(actionBtn);

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

    employeeList.appendChild(btn);

    if (activeSessions[name]) {
      btn.classList.add('active');
      ofDisplay.textContent = activeSessions[name];
    }
  });

  function sendPayload(data, url) {
    var xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
    xhr.send('data=' + encodeURIComponent(JSON.stringify(data)));
  }

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
          status.textContent = 'Erro: já está nessa OF.';
          status.style.color = 'red';
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

    status.textContent = 'Registado: ' + activeEmployee + ' [' + currentOF + ']';
    status.style.color = 'green';
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

    status.textContent = 'Turno fechado: ' + name;
    status.style.color = 'orange';
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
        if (!tipoRadio) return;
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
    status.textContent = 'Complemento registado';
    status.style.color = 'green';
  }

  function cancelCurrentShift(name, btn) {
    if (!activeSessions[name]) {
      status.textContent = 'Sem turno para cancelar';
      status.style.color = 'red';
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
    status.textContent = 'Turno cancelado: ' + name;
    status.style.color = 'orange';
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