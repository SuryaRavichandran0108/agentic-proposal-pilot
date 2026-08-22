/**
 * LiveCards — Google Sheets change trigger.
 *
 * Fires the moment a row is added or edited and asks the LiveCards backend to
 * re-read the sheet. Nothing about the change is sent: the backend reads the
 * sheet itself and works out what is new, which keeps this script tiny and
 * makes a missed or duplicated trigger harmless.
 *
 * Setup:
 *   1. In your sheet: Extensions > Apps Script, paste this file in.
 *   2. Fill in WEBHOOK_URL and WEBHOOK_SECRET below (both are shown in the
 *      app when you connect a sheet to a deck).
 *   3. Run installTrigger() once and accept the authorization prompt.
 *   4. Add a row. The card should appear in the app within a second or two.
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** https://<your-project-ref>.supabase.co/functions/v1/ingest-sheet */
var WEBHOOK_URL = 'PASTE_YOUR_FUNCTION_URL_HERE';

/** The per-deck secret shown in the app's "Connect a sheet" panel. */
var WEBHOOK_SECRET = 'PASTE_YOUR_WEBHOOK_SECRET_HERE';

/**
 * Coalesce bursts of changes. Pasting 50 rows fires onChange many times; there
 * is no point re-reading the sheet for each one. Ingestion is idempotent, so
 * dropping the extra fires costs nothing.
 */
var DEBOUNCE_SECONDS = 3;

// ---------------------------------------------------------------------------
// Trigger installation
// ---------------------------------------------------------------------------

/**
 * Run this once, by hand, from the Apps Script editor.
 *
 * A simple onChange(e) function is NOT enough: simple triggers cannot make
 * external requests. This installs the trigger properly so UrlFetchApp works.
 */
function installTrigger() {
  var sheet = SpreadsheetApp.getActive();

  // Clear any previous copy so repeated runs don't stack duplicate triggers.
  var existing = ScriptApp.getProjectTriggers();
  for (var i = 0; i < existing.length; i++) {
    if (existing[i].getHandlerFunction() === 'onSheetChange') {
      ScriptApp.deleteTrigger(existing[i]);
    }
  }

  ScriptApp.newTrigger('onSheetChange')
    .forSpreadsheet(sheet)
    .onChange()
    .create();

  Logger.log('LiveCards trigger installed for: ' + sheet.getName());
  Logger.log('Spreadsheet ID: ' + sheet.getId());
}

/** Remove the trigger and stop syncing. */
function uninstallTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'onSheetChange') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  Logger.log('LiveCards trigger removed.');
}

// ---------------------------------------------------------------------------
// Change handling
// ---------------------------------------------------------------------------

/** Change types that can alter card content. Formatting-only edits are ignored. */
var RELEVANT_CHANGES = {
  EDIT: true,
  INSERT_ROW: true,
  REMOVE_ROW: true,
  INSERT_GRID: true,
  REMOVE_GRID: true,
  OTHER: true
};

function onSheetChange(e) {
  var changeType = e && e.changeType ? e.changeType : 'OTHER';
  if (!RELEVANT_CHANGES[changeType]) return;

  if (isDebounced_()) return;

  syncNow_(changeType);
}

/**
 * Returns true if we already fired within the debounce window.
 * CacheService is shared across trigger executions, which is what makes this
 * work at all.
 */
function isDebounced_() {
  var cache = CacheService.getScriptCache();
  if (cache.get('livecards_recent_sync')) return true;
  cache.put('livecards_recent_sync', '1', DEBOUNCE_SECONDS);
  return false;
}

/** Menu entry: Extensions > LiveCards > Sync now. */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('LiveCards')
    .addItem('Sync now', 'manualSync')
    .addItem('Install trigger', 'installTrigger')
    .addItem('Remove trigger', 'uninstallTrigger')
    .addToUi();
}

function manualSync() {
  var result = syncNow_('manual');
  SpreadsheetApp.getUi().alert(
    result.ok ? 'LiveCards: sync complete.' : 'LiveCards: ' + result.message
  );
}

function syncNow_(trigger) {
  if (WEBHOOK_URL.indexOf('PASTE_') === 0 || WEBHOOK_SECRET.indexOf('PASTE_') === 0) {
    Logger.log('LiveCards is not configured. Set WEBHOOK_URL and WEBHOOK_SECRET.');
    return { ok: false, message: 'Not configured — set WEBHOOK_URL and WEBHOOK_SECRET.' };
  }

  var payload = {
    spreadsheetId: SpreadsheetApp.getActive().getId(),
    trigger: trigger
  };

  try {
    var response = UrlFetchApp.fetch(WEBHOOK_URL, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-livecards-secret': WEBHOOK_SECRET },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    var code = response.getResponseCode();
    var body = response.getContentText();

    if (code >= 200 && code < 300) {
      Logger.log('LiveCards sync ok: ' + body);
      return { ok: true, message: body };
    }

    Logger.log('LiveCards sync failed (' + code + '): ' + body);
    return { ok: false, message: 'HTTP ' + code + ' — ' + body };
  } catch (err) {
    Logger.log('LiveCards sync threw: ' + err);
    return { ok: false, message: String(err) };
  }
}
