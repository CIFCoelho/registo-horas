(function () {
  var STORAGE_KEY = 'pinturaRegisterTotals';

  function createEmptyTotals() {
    return { isolante: 0, tapaPoros: 0, verniz: 0, aquecimento: 0 };
  }

  function loadTotals() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function saveTotals(state) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state || {})); } catch (_) {}
  }

  var totalsState = loadTotals();

  function getTotals(name) {
    if (!totalsState[name]) totalsState[name] = createEmptyTotals();
    return totalsState[name];
  }

  function setTotals(name, values) {
    totalsState[name] = {
      isolante: Math.max(0, Number(values.isolante) || 0),
      tapaPoros: Math.max(0, Number(values.tapaPoros) || 0),
      verniz: Math.max(0, Number(values.verniz) || 0),
      aquecimento: Math.max(0, Number(values.aquecimento) || 0)
    };
    saveTotals(totalsState);
  }

  function resetTotals(name) {
    totalsState[name] = createEmptyTotals();
    saveTotals(totalsState);
  }

  function sumWorkUnits(entry) {
    var isolante = Number(entry.isolante) || 0;
    var tapa = Number(entry.tapaPoros) || 0;
    var verniz = Number(entry.verniz) || 0;
    return isolante + tapa + verniz;
  }

  function formatNumber(value) {
    if (!value) return '0';
    if (Math.floor(value) === value) return String(value);
    return value.toFixed(1).replace(/\.0$/, '');
  }

  function createCounterRow(options) {
    var wrapper = document.createElement('div');
    wrapper.className = 'pintura-counter';

    var label = document.createElement('span');
    label.className = 'pintura-counter__label';
    label.textContent = options.label;

    var minus = document.createElement('button');
    minus.type = 'button';
    minus.className = 'pintura-counter__btn';
    minus.textContent = '-';

    var display = document.createElement('span');
    display.className = 'pintura-counter__value';

    var plus = document.createElement('button');
    plus.type = 'button';
    plus.className = 'pintura-counter__btn';
    plus.textContent = '+';

    var step = typeof options.step === 'number' ? options.step : 1;
    var decimals = options.decimals || 0;
    var min = typeof options.min === 'number' ? options.min : 0;
    var value = typeof options.value === 'number' ? options.value : 0;

    function refresh() {
      display.textContent = formatNumber(value);
    }

    minus.onclick = function () {
      value = Math.max(min, Math.round((value - step) * Math.pow(10, decimals)) / Math.pow(10, decimals));
      refresh();
    };

    plus.onclick = function () {
      value = Math.round((value + step) * Math.pow(10, decimals)) / Math.pow(10, decimals);
      refresh();
    };

    refresh();

    wrapper.appendChild(label);
    wrapper.appendChild(minus);
    wrapper.appendChild(display);
    wrapper.appendChild(plus);

    return {
      element: wrapper,
      getValue: function () { return value; },
      setValue: function (next) {
        value = Math.max(min, Math.round((Number(next) || 0) * Math.pow(10, decimals)) / Math.pow(10, decimals));
        refresh();
      }
    };
  }

  function buildRegisterModal(ctx) {
    var totals = getTotals(ctx.name);

    var counters = [];
    counters.push({ key: 'isolante', counter: createCounterRow({ label: 'ISOLANTE', value: totals.isolante, step: 1, decimals: 0 }) });
    counters.push({ key: 'tapaPoros', counter: createCounterRow({ label: 'TAPA-POROS', value: totals.tapaPoros, step: 1, decimals: 0 }) });
    counters.push({ key: 'verniz', counter: createCounterRow({ label: 'VERNIZ', value: totals.verniz, step: 1, decimals: 0 }) });
    counters.push({ key: 'aquecimento', counter: createCounterRow({ label: 'AQUECIMENTO (HORAS)', value: totals.aquecimento, step: 0.5, decimals: 1 }) });

    ctx.openModal(function (modal) {
      modal.classList.add('pintura-modal');

      var header = document.createElement('h3');
      header.textContent = 'Registar Pintura';
      modal.appendChild(header);

      var list = document.createElement('div');
      list.className = 'pintura-counter-list';
      for (var i = 0; i < counters.length; i++) {
        list.appendChild(counters[i].counter.element);
      }
      modal.appendChild(list);

      var actions = document.createElement('div');
      actions.className = 'pintura-modal-actions';

      var cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.textContent = 'Cancelar';
      cancelBtn.onclick = ctx.closeModal;
      actions.appendChild(cancelBtn);

      var confirmBtn = document.createElement('button');
      confirmBtn.type = 'button';
      confirmBtn.textContent = 'Confirmar';
      confirmBtn.onclick = function () {
        var updated = createEmptyTotals();
        for (var i = 0; i < counters.length; i++) {
          updated[counters[i].key] = counters[i].counter.getValue();
        }

        setTotals(ctx.name, updated);
        ctx.refreshState();

        if (!ctx.getActiveOF()) {
          ctx.setStatus('Turno não encontrado. Inicie antes de registar.', 'red');
          ctx.closeModal();
          return;
        }

        var payload = {
          funcionario: ctx.name,
          of: ctx.getActiveOF(),
          acao: 'register',
          isolante: updated.isolante,
          tapaPoros: updated.tapaPoros,
          verniz: updated.verniz,
          aquecimento: updated.aquecimento
        };

        var accepted = ctx.sendRequest(payload, {
          lockKey: 'register:' + ctx.name,
          queueKey: ctx.queuePrefix + ':register:' + ctx.name + ':' + ctx.getActiveOF(),
          onDuplicate: function () {
            ctx.setStatus('Pedido de registo já em processamento.', 'orange');
          },
          onSuccess: function () {
            ctx.setStatus('Quantidades registadas.', 'green');
          },
          onError: function (info) {
            if (info && info.queued) {
              ctx.setStatus('Sem ligação. Registo guardado para envio automático.', 'orange');
              return;
            }
            var detail = info && info.detail ? info.detail : null;
            var message = 'Erro ao registar quantidades.';
            if (detail && detail.body) {
              try {
                var parsed = JSON.parse(detail.body);
                if (parsed && parsed.error) message = String(parsed.error);
              } catch (_) {
                if (detail.body.length && detail.body.length < 180) {
                  message = detail.body;
                }
              }
            }
            ctx.setStatus(message, 'red');
          }
        });

        if (accepted) {
          ctx.closeModal();
        }
      };
      actions.appendChild(confirmBtn);

      modal.appendChild(actions);
    });
  }

  window.SECTION_CONFIG = {
    section: 'Pintura',
    webAppUrl: 'https://registo-horas.onrender.com/pintura',
    activeSessionsKey: 'pinturaActiveSessions',
    queueKey: 'pinturaQueue',
    names: ['Pedro', 'Teresa'],
    enableCancel: true,

    onRowCreated: function (ctx) {
      var button = document.createElement('button');
      button.className = 'register-btn';
      button.type = 'button';
      button.textContent = 'REGISTAR';

      ctx.controls.insertBefore(button, ctx.ofDisplay);

      button.onclick = function (evt) {
        evt.stopPropagation();
        if (!ctx.getActiveOF()) {
          ctx.setStatus('Inicie um turno antes de registar.', 'red');
          return;
        }
        buildRegisterModal(ctx);
      };

      ctx.registerStateUpdater(function (info) {
        if (!info.card) return;
        var totals = getTotals(ctx.name);
        var sum = sumWorkUnits(totals);
        var text = 'REGISTAR';
        if (sum > 0) {
          text += ' (' + formatNumber(sum) + ')';
        }
        button.textContent = text;
        button.style.display = info.isActive ? 'inline-block' : 'none';
      });
    },

    onShiftStarted: function (evt) {
      resetTotals(evt.name);
    },
    onShiftEnded: function (evt) {
      resetTotals(evt.name);
    },
    onShiftCancelled: function (evt) {
      resetTotals(evt.name);
    }
  };
})();
