# In this file, we have the backend logic being used with Apps Script


const SPREADSHEET_ID = '1ya2DpDG9rrVTC7oo0XMcWupdyiC0RKH4-UA-PViOCQA';

function doPost(e) {
  Logger.log("Recebido doPost: " + JSON.stringify(e));
  try {
    if (!e.postData || !e.postData.contents)
      throw new Error('No postData.');

    const raw = e.postData.contents;
    const kv = raw.split('=');
    if (kv.length !== 2 || kv[0] !== 'data')
      throw new Error('Invalid body: ' + raw);

    const data = JSON.parse(decodeURIComponent(kv[1]));
    Logger.log("Dados recebidos: " + JSON.stringify(data));
    if (!data || !data.acao || !data.funcionario)
      throw new Error('Dados incompletos');

    return ContentService.createTextOutput(handleAcabamentoRequest(data))
                         .setMimeType(ContentService.MimeType.TEXT);
  } catch (err) {
    Logger.log(err);
    return ContentService.createTextOutput('Erro: ' + err.message)
                         .setMimeType(ContentService.MimeType.TEXT);
  }
}

function doGet()     { return ContentService.createTextOutput('OK'); }
function doOptions() { return ContentService.createTextOutput('');   }

function autoCloseOpenPeriods() {
  const total = autoCloseAcabamento();
  Logger.log(`Encerrados automaticamente: ${total}`);
  return total;
}

function createDailyTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'autoCloseOpenPeriods') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger('autoCloseOpenPeriods')
    .timeBased()
    .atHour(17)
    .nearMinute(8)
    .everyDays(1)
    .create();
}