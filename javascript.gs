const TEMPLATES_SHEET     = 'TrainingTypes';
const WORKOUTS_SHEET      = 'אימונים';
const MEASUREMENTS_SHEET  = 'מדידות';
const MEASURE_TYPES_SHEET = 'סוגי מדידות';

// ---------- טעינה ראשונית ----------

function getAppData() {
  try {
    const templates    = getWorkoutTemplates();
    const allWorkouts  = getAllWorkouts();
    const measureTypes = getMeasurementTypes();
    const measurements = getMeasurements();

    // Derive last session per type from already-fetched data
    const sessions = Array.isArray(allWorkouts) ? allWorkouts : [];
    const lastWorkouts = {};
    sessions.forEach(s => { if (!lastWorkouts[s.type]) lastWorkouts[s.type] = s; });

    return { templates, allWorkouts, measureTypes, measurements, lastWorkouts };
  } catch(err) { return { error: err.toString() }; }
}

// ---------- ניתוב ----------

function doGet(e) {
  const page = e && e.parameter ? e.parameter.page : null;
  if (page === 'edit') {
    return HtmlService.createHtmlOutputFromFile('Edit')
      .setTitle('עריכת אימונים')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('יומן אימונים')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ---------- סוגי מדידות ----------

function _getMeasureTypesSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(MEASURE_TYPES_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(MEASURE_TYPES_SHEET);
    sheet.appendRow(['שם', 'יחידה', 'ID']);
    sheet.getRange(1, 1, 1, 3).setFontWeight('bold').setBackground('#f3f3f3');
    _insertDefaultMeasureTypes(sheet);
  } else {
    _ensureHeader(sheet, 3, 'ID');
  }
  return sheet;
}

function _insertDefaultMeasureTypes(sheet) {
  [
    ['משקל',    'ק"ג'],
    ['חזה',     'ס"מ'],
    ['כתפיים',  'ס"מ'],
    ['זרוע',    'ס"מ'],
    ['ירך',     'ס"מ'],
    ['שוק',     'ס"מ'],
    ['מותניים', 'ס"מ'],
    ['ישבן',    'ס"מ'],
  ].forEach(row => sheet.appendRow([...row, generateId()]));
}

function getMeasurementTypes() {
  try {
    const sheet = _getMeasureTypesSheet();
    const last = sheet.getLastRow();
    if (last < 2) return [];
    return sheet.getRange(2, 1, last - 1, 3).getValues()
      .filter(r => r[0])
      .map(r => ({ name: String(r[0]), unit: String(r[1]), id: String(r[2]) }));
  } catch(err) { return { error: err.toString() }; }
}

function saveMeasurementTypes(types) {
  try {
    const sheet = _getMeasureTypesSheet();
    if (sheet.getLastRow() > 1) sheet.deleteRows(2, sheet.getLastRow() - 1);
    types.forEach(t => sheet.appendRow([t.name, t.unit, t.id || generateId()]));
    // Ensure measurement sheet has a column for every type name
    const mSheet = _getMeasurementsSheet();
    types.forEach(t => _ensureMeasurementColumn(mSheet, t.name));
    return 'סוגי המדידות נשמרו בהצלחה';
  } catch(err) { return 'שגיאה: ' + err.toString(); }
}

function _ensureMeasurementColumn(sheet, name) {
  const lastCol = sheet.getLastColumn();
  const headers = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  if (!headers.includes(name)) {
    sheet.getRange(1, lastCol + 1).setValue(name).setFontWeight('bold').setBackground('#f3f3f3');
  }
}

// ---------- מדידות ----------

function _getMeasurementsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(MEASUREMENTS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(MEASUREMENTS_SHEET);
    // Build header dynamically from current types
    const types = getMeasurementTypes();
    const header = ['ID', 'תאריך', ...types.map(t => t.name)];
    sheet.appendRow(header);
    sheet.getRange(1, 1, 1, header.length).setFontWeight('bold').setBackground('#f3f3f3');
  }
  return sheet;
}

function saveMeasurement(data) {
  try {
    const sheet = _getMeasurementsSheet();
    const date = data.date ? new Date(data.date) : new Date();

    // Ensure columns exist for all incoming fields
    if (data.fields) {
      Object.keys(data.fields).forEach(name => _ensureMeasurementColumn(sheet, name));
    }

    const lastCol = sheet.getLastColumn();
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    const row = new Array(lastCol).fill('');
    row[0] = generateId();
    row[1] = date;

    if (data.fields) {
      Object.entries(data.fields).forEach(([name, val]) => {
        const col = headers.indexOf(name);
        if (col >= 0 && val !== '' && val !== undefined) row[col] = val;
      });
    }

    sheet.appendRow(row);
    return 'המדידה נשמרה בהצלחה';
  } catch(err) { return 'שגיאה: ' + err.toString(); }
}

function getMeasurements() {
  try {
    const sheet = _getMeasurementsSheet();
    const last = sheet.getLastRow();
    if (last < 2) return [];

    const numCols = sheet.getLastColumn();
    const headers = sheet.getRange(1, 1, 1, numCols).getValues()[0];

    return sheet.getRange(2, 1, last - 1, numCols).getValues()
      .filter(r => r[1])
      .map(r => {
        const obj = {
          id:   r[0],
          date: Utilities.formatDate(r[1], 'GMT+2', 'dd/MM/yyyy')
        };
        for (let c = 2; c < headers.length; c++) {
          if (headers[c]) obj[headers[c]] = r[c];
        }
        return obj;
      })
      .reverse();
  } catch(err) { return { error: err.toString() }; }
}

// ---------- מחיקות ----------

function deleteWorkoutRow(id) {
  try {
    const sheet = _getWorkoutsSheet();
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return 'לא נמצא';
    const ids = sheet.getRange(2, 9, lastRow - 1, 1).getValues();
    for (let i = ids.length - 1; i >= 0; i--) {
      if (String(ids[i][0]) === String(id)) { sheet.deleteRow(i + 2); return 'התרגיל נמחק'; }
    }
    return 'לא נמצא';
  } catch(err) { return 'שגיאה: ' + err.toString(); }
}

function deleteWorkoutSession(ids) {
  try {
    const sheet = _getWorkoutsSheet();
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return 'לא נמצא';
    const idSet = new Set(ids.map(String));
    const sheetIds = sheet.getRange(2, 9, lastRow - 1, 1).getValues();
    let deleted = 0;
    for (let i = sheetIds.length - 1; i >= 0; i--) {
      if (idSet.has(String(sheetIds[i][0]))) { sheet.deleteRow(i + 2); deleted++; }
    }
    return deleted > 0 ? deleted + ' תרגילים נמחקו' : 'לא נמצא';
  } catch(err) { return 'שגיאה: ' + err.toString(); }
}

function updateWorkoutSession(exercises) {
  // exercises: [{id, weight, sets, reps, notes, sessionName, deleted?}]
  try {
    const sheet = _getWorkoutsSheet();
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return 'לא נמצא';
    const sheetData = sheet.getRange(2, 1, lastRow - 1, 10).getValues();
    const toDelete = new Set(exercises.filter(e => e.deleted).map(e => String(e.id)));
    let updated = 0;
    for (let i = sheetData.length - 1; i >= 0; i--) {
      const rowId = String(sheetData[i][8]);
      if (toDelete.has(rowId)) { sheet.deleteRow(i + 2); continue; }
      const ex = exercises.find(e => !e.deleted && String(e.id) === rowId);
      if (ex) {
        sheet.getRange(i + 2, 5, 1, 4).setValues([[ex.weight, ex.sets, ex.reps, ex.notes]]);
        sheet.getRange(i + 2, 10).setValue(ex.sessionName || '');
        updated++;
      }
    }
    return 'האימון עודכן בהצלחה';
  } catch(err) { return 'שגיאה: ' + err.toString(); }
}

function deleteMeasurement(id) {
  try {
    const sheet = _getMeasurementsSheet();
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return 'לא נמצא';
    const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (let i = ids.length - 1; i >= 0; i--) {
      if (String(ids[i][0]) === String(id)) { sheet.deleteRow(i + 2); return 'המדידה נמחקה'; }
    }
    return 'לא נמצא';
  } catch(err) { return 'שגיאה: ' + err.toString(); }
}

// ---------- ID ----------

function generateId() {
  return Utilities.getUuid().replace(/-/g, '').substring(0, 12).toUpperCase();
}

function _ensureHeader(sheet, colIndex, label) {
  const current = sheet.getRange(1, colIndex).getValue();
  if (!current || String(current).trim() === '') {
    sheet.getRange(1, colIndex).setValue(label).setFontWeight('bold').setBackground('#f3f3f3');
  }
}

// מלא IDs לכל שורות TrainingTypes שאין להן ID
function backfillTrainingTypeIds() {
  const sheet = _getTemplatesSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 'אין שורות';
  const data = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
  let count = 0;
  data.forEach((row, i) => {
    if (!row[3] || String(row[3]).trim() === '') {
      sheet.getRange(i + 2, 4).setValue(generateId());
      count++;
    }
  });
  return 'TrainingTypes: מולאו ' + count + ' IDs';
}

// מלא IDs לכל שורות אימונים שאין להן ID
function backfillWorkoutIds() {
  const sheet = _getWorkoutsSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 'אין שורות';
  const data = sheet.getRange(2, 1, lastRow - 1, 9).getValues();
  let count = 0;
  data.forEach((row, i) => {
    if (!row[8] || String(row[8]).trim() === '') {
      sheet.getRange(i + 2, 9).setValue(generateId());
      count++;
    }
  });
  return 'אימונים: מולאו ' + count + ' IDs';
}

// הרץ פעם אחת כדי לאתחל הכל
function initDB() {
  _getTemplatesSheet();
  _getWorkoutsSheet();
  _getMeasureTypesSheet();
  _getMeasurementsSheet();
  const r1 = backfillTrainingTypeIds();
  const r2 = backfillWorkoutIds();
  return r1 + '\n' + r2;
}

// ---------- TrainingTypes ----------

function _getTemplatesSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(TEMPLATES_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(TEMPLATES_SHEET);
    sheet.appendRow(['סוג', 'שם תרגיל', 'יעד', 'ID']);
    sheet.getRange(1, 1, 1, 4).setFontWeight('bold').setBackground('#f3f3f3');
    _insertDefaultTemplates(sheet);
  } else {
    _ensureHeader(sheet, 4, 'ID');
  }
  return sheet;
}

function _insertDefaultTemplates(sheet) {
  [
    ['A', 'בכן סקוואט',            '3 X 4-6 + 1 X 15-20'],
    ['A', 'ספליט סקוואט/לאנג G',   '3 X 10-12 / 3 X הלך-חזור'],
    ['A', 'לחיצת כפיים',           '3 X 4-6 + 1 X 15-20'],
    ['A', 'הרמקת כתף',             '3 X 15'],
    ['A', 'יד אחורית',             '3 X 12-15'],
    ['A', 'Toes to Bar',           '3 X 8-10'],
    ['A', 'תליה על מתח',           '3 X 50s'],
    ['B', 'מתח כבד',               '2 X 3-5'],
    ['B', 'מתח טבעות',             '3 X 6-10'],
    ['B', 'חתירה אוסטרלית',        '2 X 12-15'],
    ['B', "בצ'",                   '3 X 3-5'],
    ['B', 'מקבילים משקל/טבעות',    '2 X RIR2'],
    ['B', 'שיפוע עליון',           '2 X 20'],
    ['B', 'יד קדמית סופינציה',     '2 X 12-15'],
    ['B', 'יד קדמית פטיש',         '1 X 12-15']
  ].forEach(row => sheet.appendRow([...row, generateId()]));
}

function getWorkoutTemplates() {
  try {
    const sheet = _getTemplatesSheet();
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return { types: ['A', 'B'], A: [], B: [] };
    const data = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
    const result = { types: [] };
    data.forEach(row => {
      const t = String(row[0]).trim();
      if (!t) return;
      if (!result[t]) { result[t] = []; result.types.push(t); }
      result[t].push({ type: t, name: String(row[1]), target: String(row[2]), id: String(row[3]) });
    });
    if (!result.types.length) result.types = ['A', 'B'];
    return result;
  } catch (err) {
    return { types: ['A', 'B'], A: [], B: [], error: err.toString() };
  }
}

function saveWorkoutTemplates(templates) {
  try {
    const sheet = _getTemplatesSheet();
    if (sheet.getLastRow() > 1) {
      sheet.deleteRows(2, sheet.getLastRow() - 1);
    }
    templates.forEach(t => {
      sheet.appendRow([t.type, t.name, t.target, t.id || generateId()]);
    });
    return 'תבניות האימון נשמרו בהצלחה';
  } catch (err) {
    return 'שגיאה בשמירה: ' + err.toString();
  }
}

// ---------- אימונים ----------

function _getWorkoutsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(WORKOUTS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(WORKOUTS_SHEET);
    sheet.appendRow(['תאריך', 'סוג אימון', 'תרגיל', 'יעד', 'משקל', 'סטים', 'חזרות', 'הערות', 'ID', 'שם אימון']);
    sheet.getRange(1, 1, 1, 10).setFontWeight('bold').setBackground('#f3f3f3');
  } else {
    _ensureHeader(sheet, 9, 'ID');
    _ensureHeader(sheet, 10, 'שם אימון');
  }
  return sheet;
}

function getWorkoutData(type) {
  try {
    const templates = getWorkoutTemplates();
    return templates[type] || [];
  } catch (err) {
    return [];
  }
}

function saveWorkout(data) {
  try {
    const sheet = _getWorkoutsSheet();
    const date = new Date();
    let rowsAdded = 0;
    data.exercises.forEach(ex => {
      if (ex.weight || ex.reps || ex.sets) {
        sheet.appendRow([date, data.type, ex.name, ex.target, ex.weight, ex.sets, ex.reps, ex.notes, generateId(), data.sessionName || '']);
        rowsAdded++;
      }
    });
    return rowsAdded > 0 ? 'האימון נשמר בהצלחה! (' + rowsAdded + ' תרגילים)' : 'לא הוזנו נתונים.';
  } catch (err) {
    return 'שגיאה בשמירה: ' + err.toString();
  }
}

function getAllWorkouts() {
  try {
    const sheet = _getWorkoutsSheet();
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];

    const data = sheet.getRange(2, 1, lastRow - 1, 10).getValues();
    const sessions = {};

    data.forEach(row => {
      const date = row[0];
      const type = String(row[1]).trim();
      if (!date || !type) return;

      const key = date.toString() + '|' + type;
      if (!sessions[key]) {
        sessions[key] = {
          date: Utilities.formatDate(date, 'GMT+2', 'dd/MM/yyyy'),
          dateTs: new Date(date).getTime(),
          type,
          sessionName: String(row[9] || ''),
          exercises: []
        };
      }
      sessions[key].exercises.push({
        name:   row[2],
        target: row[3],
        weight: row[4],
        sets:   row[5],
        reps:   row[6],
        notes:  row[7],
        id:     row[8]
      });
    });

    return Object.values(sessions).sort((a, b) => b.dateTs - a.dateTs);
  } catch (err) {
    return { error: err.toString() };
  }
}

function getLastWorkout(type) {
  try {
    const sheet = _getWorkoutsSheet();
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return null;
    const data = sheet.getRange(2, 1, lastRow - 1, 9).getValues();

    let lastDate = null;
    for (let i = data.length - 1; i >= 0; i--) {
      if (data[i][1] === type) { lastDate = data[i][0]; break; }
    }
    if (!lastDate) return null;

    const history = data
      .filter(row => row[1] === type && row[0].toString() === lastDate.toString())
      .map(row => ({ name: row[2], target: row[3], weight: row[4], sets: row[5], reps: row[6], notes: row[7], id: row[8] }));

    return { date: Utilities.formatDate(lastDate, 'GMT+2', 'dd/MM/yyyy'), exercises: history };
  } catch (err) {
    return null;
  }
}
