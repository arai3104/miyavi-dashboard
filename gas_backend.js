// Google Apps Script backend for MIYAVI Dashboard
// Deploy as: Extensions → Apps Script → Deploy → New deployment
//   Type: Web app | Execute as: Me | Who has access: Anyone
//
// Spreadsheet needs two sheets: "Edits" and "NewRecords"
// Edits columns:    work_code_raw | field | value | updated_at
// NewRecords cols:  work_code_raw | title | json | created_at

const SS_ID = 'YOUR_SPREADSHEET_ID_HERE'; // ← paste your Spreadsheet ID

function doGet(e) {
  const action = e && e.parameter && e.parameter.action;
  if (action === 'ping') {
    return jsonResponse({ok: true});
  }
  // action === 'get' or default: return overlay.json format
  return jsonResponse(buildOverlay());
}

function doPost(e) {
  const payload = JSON.parse(e.postData.contents);
  const action = payload.action;

  if (action === 'edit') {
    saveEdit(payload.work_code_raw, payload.data);
    return jsonResponse({ok: true});
  }
  if (action === 'new_record') {
    saveNewRecord(payload.record);
    return jsonResponse({ok: true});
  }
  return jsonResponse({ok: false, error: 'Unknown action'});
}

function buildOverlay() {
  const ss = SpreadsheetApp.openById(SS_ID);
  const edits = {};
  const editsSheet = ss.getSheetByName('Edits');
  if (editsSheet) {
    const rows = editsSheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      const [wc, field, value] = rows[i];
      if (!wc) continue;
      edits[wc] = edits[wc] || {};
      edits[wc][field] = value;
    }
  }

  const new_records = [];
  const nrSheet = ss.getSheetByName('NewRecords');
  if (nrSheet) {
    const rows = nrSheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      const [wc, title, json] = rows[i];
      if (!wc) continue;
      try { new_records.push(JSON.parse(json)); } catch(e) {}
    }
  }

  return {edits, new_records};
}

function saveEdit(workCode, data) {
  const ss = SpreadsheetApp.openById(SS_ID);
  let sheet = ss.getSheetByName('Edits');
  if (!sheet) {
    sheet = ss.insertSheet('Edits');
    sheet.appendRow(['work_code_raw', 'field', 'value', 'updated_at']);
  }
  const now = new Date().toISOString();
  const rows = sheet.getDataRange().getValues();
  Object.entries(data).forEach(([field, value]) => {
    // update existing row if present, else append
    let found = false;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] === workCode && rows[i][1] === field) {
        sheet.getRange(i + 1, 3, 1, 2).setValues([[value, now]]);
        rows[i][2] = value; rows[i][3] = now;
        found = true; break;
      }
    }
    if (!found) {
      sheet.appendRow([workCode, field, value, now]);
      rows.push([workCode, field, value, now]);
    }
  });
}

function saveNewRecord(record) {
  const ss = SpreadsheetApp.openById(SS_ID);
  let sheet = ss.getSheetByName('NewRecords');
  if (!sheet) {
    sheet = ss.insertSheet('NewRecords');
    sheet.appendRow(['work_code_raw', 'title', 'json', 'created_at']);
  }
  sheet.appendRow([record.work_code_raw || '', record.title || '', JSON.stringify(record), new Date().toISOString()]);
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
