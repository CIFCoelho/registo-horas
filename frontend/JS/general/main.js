document.addEventListener('DOMContentLoaded', () => {
  const config = window.SECTION_CONFIG;
  const employeeList = document.getElementById('employee-list');
  const keypad = document.getElementById('of-keypad');
  const status = document.getElementById('status');
  let activeEmployee = null;
  let currentOF = '';

  // Cria os botões dos funcionários
  config.names.forEach(name => {
    const btn = document.createElement('button');
    btn.className = 'employee';
    btn.innerHTML = `<span>${name}</span><span class="of-display">IN</span>`;
    btn.onclick = () => handleEmployeeClick(name, btn);
    employeeList.appendChild(btn);
  });

  // Mostra teclado para digitar OF
  function handleEmployeeClick(name, btn) {
    activeEmployee = name;
    showKeypad();
    highlightSelected(btn);
  }

  function highlightSelected(selectedBtn) {
    document.querySelectorAll('.employee').forEach(btn => {
      btn.classList.remove('selected');
    });
    selectedBtn.classList.add('selected');
  }

  // Cria interface do teclado
  function showKeypad() {
    keypad.innerHTML = '';

    const display = document.createElement('div');
    display.id = 'of-display';
    display.textContent = currentOF;
    keypad.appendChild(display);

    const rows = [['1','2','3'], ['4','5','6'], ['7','8','9'], ['←','0','OK']];
    rows.forEach(row => {
      const rowDiv = document.createElement('div');
      rowDiv.className = 'key-row';
      row.forEach(key => {
        const btn = document.createElement('button');
        btn.className = 'key';
        if (key === 'OK') btn.classList.add('wide');
        btn.textContent = key;
        btn.onclick = () => handleKeyPress(key);
        rowDiv.appendChild(btn);
      });
      keypad.appendChild(rowDiv);
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.id = 'cancel-btn';
    cancelBtn.textContent = 'Cancelar';
    cancelBtn.onclick = () => {
      currentOF = '';
      activeEmployee = null;
      keypad.innerHTML = '';
      document.querySelectorAll('.employee').forEach(btn => {
        btn.classList.remove('selected');
      });
    };
    keypad.appendChild(cancelBtn);

    keypad.style.display = 'block';
  }

  function handleKeyPress(key) {
    const display = document.getElementById('of-display');
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
    const action = 'start'; // ou "end" se quiseres alternar depois
    const payload = {
      section: config.section,
      employee: activeEmployee,
      of: currentOF,
      action: action,
      time: new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }),
    };

    fetch(config.webAppUrl, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'text/plain' }
    })
    .then(res => res.text())
    .then(response => {
      status.textContent = `Registado: ${activeEmployee} [${currentOF}]`;
      status.style.color = 'green';
    })
    .catch(error => {
      console.error('Erro ao enviar:', error);
      status.textContent = 'Erro: ligação falhou.';
      status.style.color = 'red';
    });

    // Reset
    currentOF = '';
    activeEmployee = null;
    keypad.innerHTML = '';
    document.querySelectorAll('.employee').forEach(btn => {
      btn.classList.remove('selected');
    });
  }
});