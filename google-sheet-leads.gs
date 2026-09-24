/**
 * Godrej Evergreen Square — Google Sheets lead receiver.
 * Create this as a bound Apps Script from your leads spreadsheet:
 * Extensions > Apps Script, paste this file into Code.gs.
 * Deploy as a Web app; execute as "Me"; access "Anyone".
 */
const SHEET_NAME = "Leads";
const HEADERS = [
  "Received at", "Name", "Mobile", "Request", "Home", "Plan",
  "Form submitted at", "Page", "UTM source", "UTM medium",
  "UTM campaign", "GCLID", "FBCLID"
];

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    const data = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    const name = String(data.name || "").trim();
    const phone = String(data.phone || "").replace(/\D/g, "");
    if (name.length < 2 || !/^[6-9]\d{9}$/.test(phone)) {
      return json_({ ok: false, error: "Invalid name or mobile" });
    }
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) throw new Error("Bind this script to the leads spreadsheet.");
    lock.waitLock(10000);
    const sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
    if (sheet.getLastRow() === 0) sheet.appendRow(HEADERS);
    const utm = data.utm || {};
    const safe = value => {
      const text = String(value == null ? "" : value).slice(0, 500);
      // Keep untrusted visitor text from becoming a spreadsheet formula.
      return /^[\s]*[=+\-@]/.test(text) ? "'" + text : text;
    };
    sheet.appendRow([
      new Date(), safe(name), phone, safe(data.intent), safe(data.config),
      safe(data.plan), safe(data.at), safe(data.page),
      safe(utm.utm_source), safe(utm.utm_medium),
      safe(utm.utm_campaign), safe(utm.gclid), safe(utm.fbclid)
    ]);
    SpreadsheetApp.flush();
    return json_({ ok: true });
  } catch (error) {
    console.error(error);
    return json_({ ok: false, error: "Could not save lead" });
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
