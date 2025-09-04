document.addEventListener('DOMContentLoaded', function () {
  var config = window.SECTION_CONFIG;
  var employeeList = document.getElementById('employee-list');
  var keypad = document.getElementById('of-keypad');
  var status = document.getElementById('status');
  var activeEmployee = null;
  var currentOF = '';
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
      }, 30000);
    }
  }

  // Cria os botões dos funcionários
  config.names.forEach(function (name) {
    var btn = document.createElement('button');
    btn.className = 'employee';
    btn.innerHTML = '<span>' + name + '</span><span class="of-display">IN</span>';
    btn.onclick = function () {
      handleEmployeeClick(name, btn);
    };
    employeeList.appendChild(btn);
  });

  function handleEmployeeClick(name, btn) {
    activeEmployee = name;
    showKeypad();
    highlightSelected(btn);
  }

  function highlightSelected(selectedBtn) {
    var allButtons = document.querySelectorAll('.employee');
    for (var i = 0; i < allButtons.length; i++) {
      allButtons[i].classList.remove('selected');
    }
    selectedBtn.classList.add('selected');
  }

  function showKeypad() {
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
        var btn = document.createElement('button');
        btn.className = 'key';
        if (key === 'OK') btn.className += ' wide';
        btn.textContent = key;
        btn.onclick = function () {
          handleKeyPress(key);
        };
        rowDiv.appendChild(btn);
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
      var allButtons = document.querySelectorAll('.employee');
      for (var i = 0; i < allButtons.length; i++) {
        allButtons[i].classList.remove('selected');
      }
    };
    keypad.appendChild(cancelBtn);

    keypad.style.display = 'block';
  }

  function handleKeyPress(key) {
    var display = document.getElementById('of-display');
    if (key === '←') {
      currentOF = currentOF.slice(0, -1);
    } else if (key === 'OK') {
      if (currentOF && activeEmployee) sendAction();
    } else {
      if (currentOF.length < 6) currentOF += key;
    }
    display.textContent = currentOF;
  }

  function sendAction() {
    var action = 'start';
    var now = new Date();
    var time = ('0' + now.getHours()).slice(-2) + ':' + ('0' + now.getMinutes()).slice(-2);
  

    var xhr = new XMLHttpRequest();
    xhr.open('POST', config.webAppUrl, true);
    xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4) {
        if (xhr.status === 200) {
          setStatus('Registado: ' + activeEmployee + ' [' + currentOF + ']', 'green');
        } else {
          setStatus('Erro: ligação falhou.', 'red');
        }
      }
    };
    var encoded = encodeURIComponent(JSON.stringify({
      funcionario: activeEmployee,
      of: currentOF,
      acao: action,
      hora: time
    }));
    xhr.send('data=' + encoded);

    currentOF = '';
    activeEmployee = null;
    keypad.innerHTML = '';
    keypad.style.display = 'none';
    var allButtons = document.querySelectorAll('.employee');
    for (var i = 0; i < allButtons.length; i++) {
      allButtons[i].classList.remove('selected');
    }
  }
});
