document.addEventListener('DOMContentLoaded', function () {
  var config = window.SECTION_CONFIG;
  var employeeList = document.getElementById('employee-list');
  var keypad = document.getElementById('of-keypad');
  var status = document.getElementById('status');
  var activeEmployee = null;
  var currentOF = '';
  var activeSessions = {}; // Guarda OF atual por funcionário

  // Cria os botões dos funcionários
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
      }
    };

    employeeList.appendChild(btn);
  });

  function handleEmployeeClick(name, btn) {
    activeEmployee = name;
    showKeypad(btn);
    highlightSelected(btn);
  }

  function handleOFChange(name, btn) {
    activeEmployee = name;
    currentOF = '';
    showKeypad(btn, true); // modo de troca
    highlightSelected(btn);
  }

  function highlightSelected(selectedBtn) {
    var allButtons = document.querySelectorAll('.employee');
    for (var i = 0; i < allButtons.length; i++) {
      allButtons[i].classList.remove('selected');
    }
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
    var time = now.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });

    var payloads = [];

    if (isSwitchingOF) {
      payloads.push({
        section: config.section,
        employee: activeEmployee,
        of: activeSessions[activeEmployee],
        action: 'end',
        time: time
      });
    }

    payloads.push({
      section: config.section,
      employee: activeEmployee,
      of: currentOF,
      action: 'start',
      time: time
    });

    payloads.forEach(payload => {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', config.webAppUrl, true);
      xhr.setRequestHeader('Content-Type', 'text/plain');
      xhr.send(JSON.stringify(payload));
    });

    // Atualiza interface
    activeSessions[activeEmployee] = currentOF;
    btn.classList.add('active');
    btn.querySelector('.of-display').textContent = currentOF;

    // Reset estado
    status.textContent = `Registado: ${activeEmployee} [${currentOF}]`;
    status.style.color = 'green';
    currentOF = '';
    activeEmployee = null;
    keypad.innerHTML = '';
    document.querySelectorAll('.employee').forEach(b => b.classList.remove('selected'));
  }
});