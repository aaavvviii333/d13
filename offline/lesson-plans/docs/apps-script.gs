/**
 * Lesson Plans backend — Google Apps Script web app.
 * Paste this whole file into a new Apps Script project, then follow SETUP below.
 *
 * SETUP
 * 1.  Make a Google Sheet (any name). Copy its ID from the URL:
 *       docs.google.com/spreadsheets/d/<THIS PART>/edit
 * 2.  Make a Drive folder for lesson photos. Copy its ID the same way.
 * 3.  script.google.com -> New project -> paste this file over Code.gs.
 * 4.  Project Settings -> Script Properties -> add three:
 *       SHEET_ID          the sheet from step 1
 *       DRIVE_FOLDER_ID   the folder from step 2
 *       SHARED_KEY        any passphrase; staff type this once in the app
 * 5.  Run the `setup` function once (it creates the two tabs and their headers).
 *     Approve the permission prompt.
 * 6.  Deploy -> New deployment -> Web app
 *       Execute as:      Me
 *       Who has access:  Anyone
 *     ("Anyone within the org" cannot be called cross-origin from a static page.
 *      SHARED_KEY is what actually gates access.)
 * 7.  Copy the /exec URL into offline/lesson-plans/modules/store.js as EXEC_URL.
 *
 * After editing this file you must Deploy -> Manage deployments -> edit -> New version,
 * or the live URL keeps serving the old code.
 */

var PLANS = 'plans';
var VERSIONS = 'versions';
var PLAN_HEADERS = ['id', 'title', 'status', 'updatedAt', 'updatedBy', 'version', 'json'];
var VERSION_HEADERS = ['id', 'version', 'savedAt', 'savedBy', 'json'];

// A Sheets cell holds 50,000 characters. Refuse a save that would overflow it
// rather than let Sheets truncate the JSON and lose the plan.
// ponytail: if plans ever outgrow this, spill `json` across json1..jsonN columns.
var MAX_JSON = 45000;

function prop(name) {
  var v = PropertiesService.getScriptProperties().getProperty(name);
  if (!v) throw new Error('Missing Script Property: ' + name);
  return v;
}

function book() { return SpreadsheetApp.openById(prop('SHEET_ID')); }

function tab(name, headers) {
  var sheet = book().getSheetByName(name);
  if (!sheet) {
    sheet = book().insertSheet(name);
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** Run once from the editor. */
function setup() {
  tab(PLANS, PLAN_HEADERS);
  tab(VERSIONS, VERSION_HEADERS);
  return 'ready';
}

// ---------------------------------------------------------------- routing

function doPost(e) {
  var req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return json({ error: 'bad-request' });
  }
  if (req.key !== prop('SHARED_KEY')) return json({ error: 'bad-key' });

  try {
    switch (req.action) {
      case 'list':     return json({ plans: listPlans() });
      case 'get':      return json(getPlan(req.id));
      case 'save':     return json(savePlan(req));
      case 'remove':   return json(removePlan(req.id));
      case 'versions': return json({ versions: listVersions(req.id) });
      case 'version':  return json(getVersion(req.id, req.version));
      case 'upload':   return json(uploadImage(req.filename, req.dataUrl));
      case 'people':   return json({ people: listPeople() });
      default:         return json({ error: 'unknown-action' });
    }
  } catch (err) {
    return json({ error: 'server', message: String(err && err.message || err) });
  }
}

/** A browser hitting the URL directly gets something human, not a stack trace. */
function doGet() {
  return ContentService
    .createTextOutput('Lesson Plans backend. POST only.')
    .setMimeType(ContentService.MimeType.TEXT);
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---------------------------------------------------------------- plans

function rows(sheet) {
  var values = sheet.getDataRange().getValues();
  values.shift();
  return values;
}

function listPlans() {
  return rows(tab(PLANS, PLAN_HEADERS))
    .filter(function (r) { return r[0]; })
    .map(function (r) {
      return {
        id: String(r[0]), title: r[1], status: r[2],
        updatedAt: iso(r[3]), updatedBy: r[4], version: Number(r[5]) || 0,
      };
    });
}

function findRow(sheet, id) {
  var all = rows(sheet);
  for (var i = 0; i < all.length; i++) {
    if (String(all[i][0]) === String(id)) return { index: i + 2, values: all[i] };
  }
  return null;
}

function getPlan(id) {
  var hit = findRow(tab(PLANS, PLAN_HEADERS), id);
  if (!hit) return { error: 'not-found' };
  return { plan: JSON.parse(hit.values[6]), version: Number(hit.values[5]) || 0 };
}

/**
 * Optimistic concurrency: the client sends the version it loaded. If the stored
 * version has moved on, someone else saved first and we refuse rather than
 * silently overwrite their work.
 */
function savePlan(req) {
  var plan = req.plan;
  if (!plan || !plan.id) return { error: 'bad-request' };
  var who = String(req.who || 'unknown');

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sheet = tab(PLANS, PLAN_HEADERS);
    var hit = findRow(sheet, plan.id);
    var current = hit ? Number(hit.values[5]) || 0 : 0;

    if (hit && Number(req.baseVersion) !== current && !req.force) {
      return { error: 'conflict', current: current, currentBy: hit.values[4], currentAt: iso(hit.values[3]) };
    }

    var now = new Date();
    var version = current + 1;

    plan.metadata = plan.metadata || {};
    plan.metadata.updatedAt = now.toISOString();
    plan.metadata.version = version;
    if (!plan.metadata.author) plan.metadata.author = who;
    if (!plan.metadata.createdAt) plan.metadata.createdAt = now.toISOString();
    plan.metadata.editors = dedupe((plan.metadata.editors || []).concat([who]));
    plan.metadata.updatedBy = who;

    var blob = JSON.stringify(plan);
    if (blob.length > MAX_JSON) return { error: 'too-large', size: blob.length, max: MAX_JSON };

    // Snapshot the version we are replacing, so it can be viewed or restored.
    if (hit) {
      tab(VERSIONS, VERSION_HEADERS)
        .appendRow([plan.id, current, iso(hit.values[3]), hit.values[4], hit.values[6]]);
    }

    var row = [plan.id, plan.title || '(untitled)', plan.metadata.status || 'draft',
               now, who, version, blob];
    if (hit) sheet.getRange(hit.index, 1, 1, row.length).setValues([row]);
    else sheet.appendRow(row);

    return { ok: true, version: version, plan: plan };
  } finally {
    lock.releaseLock();
  }
}

function removePlan(id) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sheet = tab(PLANS, PLAN_HEADERS);
    var hit = findRow(sheet, id);
    if (!hit) return { error: 'not-found' };
    // Versions are left in place: deleting a plan should not erase its history.
    sheet.deleteRow(hit.index);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------- versions

function listVersions(id) {
  return rows(tab(VERSIONS, VERSION_HEADERS))
    .filter(function (r) { return String(r[0]) === String(id); })
    .map(function (r) {
      return { version: Number(r[1]), savedAt: iso(r[2]), savedBy: r[3] };
    })
    .sort(function (a, b) { return b.version - a.version; });
}

function getVersion(id, version) {
  var all = rows(tab(VERSIONS, VERSION_HEADERS));
  for (var i = 0; i < all.length; i++) {
    if (String(all[i][0]) === String(id) && Number(all[i][1]) === Number(version)) {
      return { plan: JSON.parse(all[i][4]) };
    }
  }
  return { error: 'not-found' };
}

function listPeople() {
  var seen = {};
  rows(tab(PLANS, PLAN_HEADERS)).forEach(function (r) { if (r[4]) seen[r[4]] = 1; });
  rows(tab(VERSIONS, VERSION_HEADERS)).forEach(function (r) { if (r[3]) seen[r[3]] = 1; });
  return Object.keys(seen).sort();
}

// ---------------------------------------------------------------- images

function uploadImage(filename, dataUrl) {
  var m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl || '');
  if (!m) return { error: 'bad-image' };
  if (m[1].indexOf('image/') !== 0) return { error: 'not-an-image' };

  var blob = Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], sanitize(filename));
  var file = DriveApp.getFolderById(prop('DRIVE_FOLDER_ID')).createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  // The /thumbnail endpoint is the one Drive URL that reliably renders in an
  // <img>; /uc and /file/d/.../view do not.
  return { ok: true, url: 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w1600' };
}

function sanitize(name) {
  return String(name || 'photo').replace(/[^\w.\- ]+/g, '_').slice(0, 120);
}

// ---------------------------------------------------------------- misc

function iso(v) {
  if (v instanceof Date) return v.toISOString();
  return v ? String(v) : '';
}

function dedupe(list) {
  var seen = {}, out = [];
  list.forEach(function (x) { if (x && !seen[x]) { seen[x] = 1; out.push(x); } });
  return out;
}
