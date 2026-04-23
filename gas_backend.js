// Google Apps Script backend for MIYAVI Dashboard
// Deploy as: Extensions → Apps Script → Deploy → New deployment
//   Type: Web app | Execute as: Me | Who has access: Anyone
//
// Sheets used:
//   Works      — all tracks (populated once by populateInitialData)
//   Edits      — per-field edits made via dashboard Edit form
//   NewRecords — manually added tracks

const SS_ID = 'YOUR_SPREADSHEET_ID_HERE'; // ← paste your Spreadsheet ID

// Column layout for Works sheet
const WORKS_HEADERS = [
  'work_code_raw', 'title', 'primary_artist', 'release_period', 'source_type',
  'iswc', 'status', 'chui_sakuhin',
  'master_rh', 'master_license_start', 'master_license_end',
  'advance_amount', 'territory', 'contract_status', 'internal_notes'
];

function doGet(e) {
  try {
    const params = e && e.parameter ? e.parameter : {};

    if (params.action === 'ping') {
      return jsonResponse({ok: true});
    }

    // Mutations sent as GET to avoid GAS POST CORS issues
    if (params.payload) {
      const payload = JSON.parse(params.payload);
      if (payload.action === 'edit') {
        saveEdit(payload.work_code_raw, payload.data);
        return jsonResponse({ok: true});
      }
      if (payload.action === 'new_record') {
        saveNewRecord(payload.record);
        return jsonResponse({ok: true});
      }
      return jsonResponse({ok: false, error: 'Unknown action'});
    }

    // Default: return full overlay (edits from Works sheet + Edits sheet + NewRecords)
    return jsonResponse(buildOverlay());
  } catch(err) {
    return jsonResponse({ok: false, error: err.toString()});
  }
}

function doPost(e) {
  return doGet(e);
}

function buildOverlay() {
  const ss = SpreadsheetApp.openById(SS_ID);
  const edits = {};

  // Read editable fields from Works sheet (master rights columns)
  const worksSheet = ss.getSheetByName('Works');
  if (worksSheet && worksSheet.getLastRow() > 1) {
    const rows = worksSheet.getDataRange().getValues();
    const headers = rows[0];
    const editableFields = ['master_rh','master_license_start','master_license_end',
                            'advance_amount','territory','contract_status','internal_notes'];
    const wcIdx = headers.indexOf('work_code_raw');
    for (let i = 1; i < rows.length; i++) {
      const wc = rows[i][wcIdx];
      if (!wc) continue;
      editableFields.forEach(field => {
        const idx = headers.indexOf(field);
        if (idx >= 0 && rows[i][idx] !== '' && rows[i][idx] !== null) {
          edits[wc] = edits[wc] || {};
          edits[wc][field] = rows[i][idx];
        }
      });
    }
  }

  // Read point edits from Edits sheet (dashboard Edit form saves here)
  const editsSheet = ss.getSheetByName('Edits');
  if (editsSheet && editsSheet.getLastRow() > 1) {
    const rows = editsSheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      const [wc, field, value] = rows[i];
      if (!wc) continue;
      edits[wc] = edits[wc] || {};
      edits[wc][field] = value;
    }
  }

  // Read manually added tracks
  const new_records = [];
  const nrSheet = ss.getSheetByName('NewRecords');
  if (nrSheet && nrSheet.getLastRow() > 1) {
    const rows = nrSheet.getDataRange().getValues();
    const nrHeaders = rows[0];
    const jsonCol = nrHeaders.indexOf('json');
    const wcCol = nrHeaders.indexOf('work_code_raw');
    for (let i = 1; i < rows.length; i++) {
      const wc = rows[i][wcCol];
      if (!wc) continue;
      const jsonStr = jsonCol >= 0 ? rows[i][jsonCol] : null;
      if (jsonStr) {
        try { new_records.push(JSON.parse(jsonStr)); } catch(e) {}
      }
    }
  }

  return {edits, new_records};
}

function saveEdit(workCode, data) {
  const ss = SpreadsheetApp.openById(SS_ID);

  // Try to update the Works sheet first (for editable columns)
  const worksSheet = ss.getSheetByName('Works');
  if (worksSheet && worksSheet.getLastRow() > 1) {
    const rows = worksSheet.getDataRange().getValues();
    const headers = rows[0];
    const wcIdx = headers.indexOf('work_code_raw');
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][wcIdx] === workCode) {
        Object.entries(data).forEach(([field, value]) => {
          const idx = headers.indexOf(field);
          if (idx >= 0) worksSheet.getRange(i + 1, idx + 1).setValue(value);
        });
        return; // updated in Works sheet, done
      }
    }
  }

  // Fallback: save to Edits sheet (for tracks not yet in Works)
  let sheet = ss.getSheetByName('Edits');
  if (!sheet) {
    sheet = ss.insertSheet('Edits');
    sheet.appendRow(['work_code_raw', 'field', 'value', 'updated_at']);
  }
  const now = new Date().toISOString();
  const rows = sheet.getDataRange().getValues();
  Object.entries(data).forEach(([field, value]) => {
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
    sheet.appendRow([
      'work_code_raw','title','primary_artist','release_period','source_type','iswc',
      'master_rh','master_license_start','master_license_end',
      'advance_amount','territory','contract_status','internal_notes',
      'created_at','json'
    ]);
  }
  sheet.appendRow([
    record.work_code_raw || '',
    record.title || '',
    record.primary_artist || '',
    record.release_period || '',
    record.source_type || '',
    record.iswc_csv || record.iswc_jwid || '',
    record.master_rh || '',
    record.master_license_start || '',
    record.master_license_end || '',
    record.advance_amount || '',
    record.territory || '',
    record.contract_status || '',
    record.internal_notes || '',
    new Date().toISOString(),
    JSON.stringify(record)  // full record kept for reference
  ]);
}

// ── Run this ONCE from the Apps Script editor to populate the Works sheet ──
function populateInitialData() {
  try {
    Logger.log('Step 1: fetching JSON...');
    const url = 'https://arai3104.github.io/miyavi-dashboard/miyavi_full_merged.json';
    const resp = UrlFetchApp.fetch(url, {muteHttpExceptions: true});
    Logger.log('HTTP status: ' + resp.getResponseCode());
    const text = resp.getContentText();
    Logger.log('Content length: ' + text.length + ' chars');
    const data = JSON.parse(text);
    const compositions = data.compositions || [];
    Logger.log('Compositions found: ' + compositions.length);

    Logger.log('Step 2: writing to Works sheet...');
    const ss = SpreadsheetApp.openById(SS_ID);
    let sheet = ss.getSheetByName('Works');
    if (sheet) ss.deleteSheet(sheet);
    sheet = ss.insertSheet('Works');
    sheet.appendRow(WORKS_HEADERS);
    const rows = compositions.map(c => WORKS_HEADERS.map(h => {
      const v = c[h];
      return (v === null || v === undefined) ? '' : v;
    }));
    if (rows.length > 0) {
      sheet.getRange(2, 1, rows.length, WORKS_HEADERS.length).setValues(rows);
    }
    Logger.log('Done: ' + rows.length + ' tracks written.');
  } catch(err) {
    Logger.log('ERROR: ' + err.toString());
  }
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
