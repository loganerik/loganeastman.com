/**
 * RSVP backend for loganeastman.com/37
 *
 * One-time setup (do this signed in as logan.eastman@gmail.com):
 *   1. Create a Google Sheet named "37 RSVPs".
 *   2. Extensions → Apps Script → delete the default code, paste this file, save.
 *   3. Deploy → New deployment → type: Web app
 *        - Execute as: Me
 *        - Who has access: Anyone
 *   4. Copy the web app URL (ends in /exec) and paste it into SCRIPT_URL
 *      at the top of the <script> block in static/37/index.html, then push.
 *
 * The sheet fills with rows: [timestamp, full name, status, note].
 * Full names stay private — doGet() only ever returns "First L." publicly.
 */

function sheet_() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// "Samantha Kowalski" -> "Samantha K."
function displayName_(full) {
  var parts = String(full).trim().split(/\s+/);
  var first = parts[0];
  if (parts.length > 1) {
    var last = parts[parts.length - 1];
    return first + ' ' + last.charAt(0).toUpperCase() + '.';
  }
  return first;
}

function doPost(e) {
  var p = (e && e.parameter) || {};

  // honeypot — real humans never fill this field
  if (p.website) return json_({ ok: true });

  var name = String(p.name || '').trim().slice(0, 80);
  var status = p.status === 'maybe' ? 'maybe' : 'yes';
  var note = String(p.note || '').trim().slice(0, 280);

  if (!name) return json_({ ok: false, error: 'name required' });

  sheet_().appendRow([new Date(), name, status, note]);
  return json_({ ok: true });
}

function doGet(e) {
  // visit the /exec URL with ?debug=1 to see where this script is reading/writing
  if (e && e.parameter && e.parameter.debug) {
    return json_({
      spreadsheet: SpreadsheetApp.getActiveSpreadsheet().getName(),
      tab: sheet_().getName(),
      lastRow: sheet_().getLastRow()
    });
  }
  var rows = sheet_().getDataRange().getValues();
  var guests = [];
  var maybeCount = 0;

  rows.forEach(function (r) {
    var name = String(r[1] || '').trim();
    if (!name) return;
    // skip a header row like "Timestamp | Name | Status | Note"
    if (name.toLowerCase() === 'name') return;
    if (r[2] === 'maybe') {
      maybeCount++;
    } else {
      guests.push(displayName_(name));
    }
  });

  return json_({ count: guests.length, guests: guests, maybeCount: maybeCount });
}
