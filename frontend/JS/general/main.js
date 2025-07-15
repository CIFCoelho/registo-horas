document.addEventListener('DOMContentLoaded', function () {
  var config = window.SECTION_CONFIG;
  var employeeList = document.getElementById('employee-list');
  var keypad = document.getElementById('of-keypad');
  var status = document.getElementById('status');
  var activeEmployee = null;
  var currentOF = '';

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
    var payload = {
      section: config.section,
      employee: activeEmployee,
      of: currentOF,
      action: action,
      time: time
    };

    var xhr = new XMLHttpRequest();
    xhr.open('POST', config.webAppUrl, true);
    xhr.setRequestHeader('Content-Type', 'text/plain');
    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4) {
        if (xhr.status === 200) {
          status.textContent = 'Registado: ' + activeEmployee + ' [' + currentOF + ']';
          status.style.color = 'green';
        } else {
          status.textContent = 'Erro: ligação falhou.';
          status.style.color = 'red';
        }
      }
    };
    xhr.send(JSON.stringify(payload));

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