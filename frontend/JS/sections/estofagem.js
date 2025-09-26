(function () {
  document.addEventListener('DOMContentLoaded', function () {
    var config = window.SECTION_CONFIG || {};
    var names = Array.isArray(config.names) ? config.names : [];
    var acabamentoOptions = Array.isArray(config.acabamentoOptions) ? config.acabamentoOptions : [];

    var employeeList = document.getElementById('employee-list');
    var keypad = document.getElementById('of-keypad');
    var status = document.getElementById('status');

    if (!employeeList) return;

    var activeEmployee = null;
    var currentOF = '';
    var activeSessions = {};
    var uiMap = {};
    var statusTimeoutId = null;

    var activeRegisterModal = null;
    var openDropdown = null;

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

    function clearSelections() {
      for (var key in uiMap) {
        if (uiMap.hasOwnProperty(key)) uiMap[key].card.classList.remove('selected');
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
      registerBtn.textContent = 'REGISTAR ACABAMENTO';

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
        openRegisterModal(name);
      };

      uiMap[name] = {
        card: card,
        ofDisplay: ofDisplay,
        registerBtn: registerBtn
      };
    }

    function beginShift(name) {
      activeEmployee = name;
      currentOF = '';
      clearSelections();
      if (uiMap[name]) uiMap[name].card.classList.add('selected');
      showKeypad();
    }

    function closeKeypad() {
      keypad.innerHTML = '';
      keypad.style.display = 'none';
      activeEmployee = null;
      currentOF = '';
      clearSelections();
    }

    function showKeypad() {
      keypad.innerHTML = '';

      var display = document.createElement('div');
      display.id = 'of-display';
      display.textContent = currentOF;
      keypad.appendChild(display);

      var rows = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['←', '0', 'OK']];
      for (var i = 0; i < rows.length; i++) {
        var row = document.createElement('div');
        row.className = 'key-row';
        for (var j = 0; j < rows[i].length; j++) {
          var key = rows[i][j];
          var btn = document.createElement('button');
          btn.className = 'key';
          if (key === 'OK') btn.className += ' wide';
          btn.textContent = key;
          btn.onclick = (function (value) {
            return function () { handleKeyPress(value); };
          })(key);
          row.appendChild(btn);
        }
        keypad.appendChild(row);
      }

      var cancelBtn = document.createElement('button');
      cancelBtn.id = 'cancel-btn';
      cancelBtn.textContent = 'Cancelar';
      cancelBtn.onclick = function () {
        closeKeypad();
      };
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
          startShift(activeEmployee, currentOF);
        }
      } else {
        if (currentOF.length < 6) {
          currentOF += key;
        }
      }

      display.textContent = currentOF;
    }

    function startShift(name, ofValue) {
      if (!name || !ofValue) return;
      closeKeypad();

      activeSessions[name] = { of: ofValue };
      var ui = uiMap[name];
      if (ui) {
        ui.card.classList.add('active');
        ui.ofDisplay.textContent = ofValue;
      }
      setStatus('Turno iniciado para ' + name + ' na OF ' + ofValue + '.', '#026042');
    }

    function endShift(name) {
      if (!activeSessions[name]) return;
      if (!window.confirm('Terminar turno de ' + name + '?')) return;

      delete activeSessions[name];
      var ui = uiMap[name];
      if (ui) {
        ui.card.classList.remove('active');
        ui.ofDisplay.textContent = '+';
      }
      setStatus('Turno terminado para ' + name + '.', '#026042');
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

    function openRegisterModal(name) {
      if (!activeSessions[name]) {
        setStatus('Inicie o turno antes de registar o acabamento.', 'orange');
        return;
      }

      closeRegisterModal();

      var overlay = document.createElement('div');
      overlay.className = 'estofagem-modal-overlay';

      var modal = document.createElement('div');
      modal.className = 'estofagem-modal';

      var title = document.createElement('h2');
      title.textContent = 'Registar acabamento';
      modal.appendChild(title);

      var selectionState = { cru: null, tp: null };

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

          if (!acabamentoOptions.length) {
            var empty = document.createElement('div');
            empty.className = 'dropdown-empty';
            empty.textContent = 'Sem opções disponíveis';
            dropdown.appendChild(empty);
          } else {
            for (var idx = 0; idx < acabamentoOptions.length; idx++) {
              (function (optionName) {
                var optBtn = document.createElement('button');
                optBtn.type = 'button';
                optBtn.textContent = optionName;
                optBtn.onclick = function () {
                  selectionState[key] = optionName;
                  button.textContent = optionName;
                  button.setAttribute('data-selected', 'true');
                  closeDropdown();
                  openDropdown = null;
                  updateConfirmState();
                };
                dropdown.appendChild(optBtn);
              })(acabamentoOptions[idx]);
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
        setStatus('Acabamento registado: Cru - ' + selectionState.cru + ', TP - ' + selectionState.tp + '.', '#026042');
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
        if (evt.target === overlay) {
          closeRegisterModal();
        }
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
    }

    for (var i = 0; i < names.length; i++) {
      createEmployeeRow(names[i]);
    }
  });
})();
