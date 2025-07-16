function handleAcabamentoRequest(data) {
  Logger.log("[Acabamento] Dados recebidos: " + JSON.stringify(data));
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheetName = 'Acabamento';
  const sh = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);

  const dia = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");

  if (data.acao === 'start') {
    const row = [
      dia,
      data.funcionario,
      data.of || '',
      data.hora || '',
      '',
      '' // a fórmula vai sobrepor este valor
    ];

    const nextRow = sh.getLastRow() + 1;
    sh.getRange(nextRow, 1, 1, row.length).setValues([row]);

    // Inserir fórmula de duração automática na coluna F
    const formula = `=ARRAYFORMULA(
  IF(
    (D2:D<>"")*(E2:E<>"");
    ROUND(((TIMEVALUE(E2:E) - TIMEVALUE(D2:D))
           - MAX(0; MIN(TIMEVALUE(E2:E); TIME(10;10;0))
                 - MAX(TIMEVALUE(D2:D); TIME(10;0;0)))) * 24; 2);
    ""
  )
)`;
    sh.getRange(nextRow, 6).setFormula(formula);

    return 'Início registado.';
  }

  if (data.acao === 'end') {
    const dataValues = sh.getDataRange().getValues();
    for (let i = dataValues.length - 1; i > 0; i--) {
      const row = dataValues[i];
      if (row[1] === data.funcionario && row[4] === '') {
        const rowIndex = i + 1;
        sh.getRange(rowIndex, 5).setValue(data.hora);

        const startStr = row[3];
        const [shour, smin] = startStr.split(':').map(Number);
        const start = new Date(row[0]);
        start.setHours(shour, smin, 0, 0);

        const [ehour, emin] = data.hora.split(':').map(Number);
        const end = new Date(row[0]);
        end.setHours(ehour, emin, 0, 0);

        const minutes = (end - start) / 60000;
        const duration = (minutes / 60).toFixed(2);
        sh.getRange(rowIndex, 6).setValue(duration);
        Logger.log('⌛ Calculated duration: ' + duration + ' h');

        return 'Fim registado.';
      }
    }
    return 'Turno não encontrado para fechar.';
  }

  return 'Ação inválida.';
}