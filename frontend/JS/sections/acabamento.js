document.addEventListener('DOMContentLoaded', function () {
  var config = window.SECTION_CONFIG;
  var employeeList = document.getElementById('employee-list');
  var keypad = document.getElementById('of-keypad');
  var status = document.getElementById('status');
  var activeEmployee = null;
  var currentOF = '';
  var activeSessions = {};

  if (localStorage.getItem('activeSessions')) {
    activeSessions = JSON.parse(localStorage.getItem('activeSessions'));
  }

  config.names.forEach(function (name) {
    var btn = document.createElement('button');
    btn.className = 'employee';
    btn.innerHTML = '<span>' + name + '</span><span class="of-display">+</span>';

    btn.querySelector('.of-display').onclick = function (e) {
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
      btn.querySelector('.of-display').textContent = activeSessions[name];
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
    document.querySelectorAll('.employee').forEach(btn => btn.classList.remove('selected'));
    selectedBtn.classList.add('selected');
  }

  function showKeypad(btn, isSwitchingOF = false) {
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
      document.querySelectorAll('.employee').forEach(btn => btn.classList.remove('selected'));
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
    isSwitchingOF,
    activeEmployee,
    currentOF,
    previousOF: activeSessions[activeEmployee]
  });

  var payloads = [];

  // Se estiver a mudar de OF e houver uma OF anterior registada
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

  // Novo início
  var startPayload = {
    funcionario: activeEmployee,
    of: currentOF,
    acao: 'start',
    hora: hora
  };
  payloads.push(startPayload);
  console.log('📤 Enviar início da nova OF:', startPayload);

  // Enviar todos
  payloads.forEach(payload => sendPayload(payload, config.webAppUrl));

  // Atualizar interface/localStorage
  activeSessions[activeEmployee] = currentOF;
  localStorage.setItem('activeSessions', JSON.stringify(activeSessions));
  btn.classList.add('active');
  btn.querySelector('.of-display').textContent = currentOF;

  status.textContent = `Registado: ${activeEmployee} [${currentOF}]`;
  status.style.color = 'green';
  currentOF = '';
  activeEmployee = null;
  keypad.innerHTML = '';
  document.querySelectorAll('.employee').forEach(b => b.classList.remove('selected'));
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

    status.textContent = `Turno fechado: ${name}`;
    status.style.color = 'orange';
  }
});