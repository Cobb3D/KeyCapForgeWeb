/**
 * KeyCapForge "Send to Print" — emails each order (the design's 3MF file
 * plus the customer's details) to Cobb3D.
 *
 * This runs on YOUR Google account, as a Google Apps Script web app, and
 * sends the email from your own Gmail. It costs nothing. Personal Gmail
 * accounts can send about 100 emails a day this way.
 *
 * ONE-TIME SETUP (about 5 minutes), signed in as Cobb3DPrinting@gmail.com:
 *   1. Go to https://script.google.com and click "New project".
 *   2. Delete what's in the editor, paste in this whole file, and click
 *      Save. Name the project "KeyCapForge orders".
 *   3. Click Deploy > New deployment. Click the gear next to "Select type"
 *      and pick "Web app". Set:
 *        Execute as:      Me
 *        Who has access:  Anyone
 *      Click Deploy. Google asks you to authorize: choose your account,
 *      then Advanced > "Go to KeyCapForge orders (unsafe)" > Allow. (It's
 *      "unsafe" only because you wrote the script rather than Google
 *      reviewing it; it can only send email as you.)
 *   4. Copy the "Web app URL" (it ends in /exec).
 *   5. In the KeyCapForge folder, open js/printOrder.js and paste that URL
 *      between the quotes on the ORDER_ENDPOINT line. Upload as usual. The
 *      Send to Print button appears next to Export.
 *
 * What it refuses: anything that isn't a KeyCapForge order, files that
 * aren't genuine 3MF files (see check3mf), files over 18MB, orders from
 * bots (a hidden bot-trap field, or a form filled in impossibly fast), and
 * more than 30 orders an hour.
 *
 * If you change this script later, use Deploy > Manage deployments > Edit
 * (pencil) > Version: New version > Deploy, so the same URL keeps working.
 */

const ORDER_TO = 'Cobb3DPrinting@gmail.com';
const MAX_FILE_BYTES = 18 * 1024 * 1024;  // Gmail allows 25MB of attachments
const MAX_ORDERS_PER_HOUR = 30;           // stops a flood of junk orders

function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents);
    if (d.kind !== 'keycapforge-print-order') return reply({ ok: false, error: 'not a KeyCapForge order' });

    // Bot trap: the form has a hidden "website" field people never see or
    // fill in, and nobody fills in the form in under 3 seconds. Either
    // means a bot: say "ok" so it doesn't try again, but send nothing
    // (and don't count it toward the hourly limit).
    if (String(d.website || '') !== '' || !(Number(d.elapsedMs) >= 3000)) return reply({ ok: true });

    const cache = CacheService.getScriptCache();
    const count = Number(cache.get('orders') || 0);
    if (count >= MAX_ORDERS_PER_HOUR) return reply({ ok: false, error: 'too many orders right now, please try again in an hour' });
    cache.put('orders', String(count + 1), 3600);

    const bytes = Utilities.base64Decode(String(d.fileBase64 || ''));
    if (!bytes.length) return reply({ ok: false, error: 'no file' });
    if (bytes.length > MAX_FILE_BYTES) return reply({ ok: false, error: 'file too large' });
    let fileName = String(d.fileName || 'design').replace(/[^\w.\-]/g, '_').replace(/\.+$/, '').slice(0, 76);
    if (!/\.3mf$/i.test(fileName)) fileName += '.3mf';
    const file = Utilities.newBlob(bytes, 'application/vnd.ms-package.3dmanufacturing-3dmodel+xml', fileName);
    // Only real 3MF files get through (see check3mf below).
    const problem = check3mf(file);
    if (problem) return reply({ ok: false, error: 'that is not a KeyCapForge 3MF file (' + problem + ')' });

    const name = clip(d.name, 100) || '(no name)';
    const email = clip(d.email, 200);
    const body = [
      'New print order from KeyCapForge.',
      '',
      'Name:  ' + name,
      'Email: ' + email,
      '',
      'Notes:',
      clip(d.notes, 4000) || '(none)',
      '',
      'Design:',
      clip(d.summary, 6000),
      '',
      'File: ' + fileName + ' (' + (bytes.length / 1048576).toFixed(2) + ' MB, attached)',
      'Sent from: ' + clip(d.page, 300),
      '',
      'Settings (to recreate the design):',
      clip(d.design, 20000),
    ].join('\n');

    const options = { attachments: [file], name: 'KeyCapForge' };
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) options.replyTo = email;
    MailApp.sendEmail(ORDER_TO, 'KeyCapForge print order: ' + name + ' - ' + (clip(d.title, 60) || 'design'), body, options);
    return reply({ ok: true });
  } catch (err) {
    return reply({ ok: false, error: String(err && err.message || err) });
  }
}

// Returns null if `file` is a 3MF like KeyCapForge makes, or a short reason
// if it isn't. A 3MF is a ZIP archive; this opens it and checks it holds
// only the files a 3MF should (the model, its content-type and relationship
// files, and slicer settings), and that the model really is a 3MF model.
// Anything else (a program, a document, a renamed file) is refused, so only
// genuine design files ever reach the inbox.
const ALLOWED_3MF_ENTRIES = /^(\[Content_Types\]\.xml|_rels\/\.rels|3D\/3dmodel\.model|Metadata\/[\w.\-]+\.config)$/;
function check3mf(file) {
  const b = file.getBytes();
  if (b.length < 4 || b[0] !== 0x50 || b[1] !== 0x4b || b[2] !== 3 || b[3] !== 4) return 'not a ZIP archive';
  let entries;
  try { entries = Utilities.unzip(Utilities.newBlob(b, 'application/zip', 'order.zip')); } catch (err) { return 'damaged archive'; }
  if (!entries.length || entries.length > 12) return 'unexpected contents';
  let model = null, types = false;
  for (const entry of entries) {
    const name = entry.getName();
    if (!ALLOWED_3MF_ENTRIES.test(name)) return 'unexpected file inside: ' + clip(name, 60);
    if (name === '3D/3dmodel.model') model = entry;
    if (name === '[Content_Types].xml') types = true;
  }
  if (!model || !types) return 'no 3D model inside';
  const head = model.getDataAsString().slice(0, 2000);
  if (!/^\s*<\?xml/.test(head) || !/<model[\s>]/.test(head) || head.indexOf('3dmanufacturing') < 0) return 'model is not a 3MF model';
  return null;
}

// Visiting the URL in a browser just confirms it's running.
function doGet() {
  return ContentService.createTextOutput('KeyCapForge order emailer is running.');
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function clip(v, n) {
  return String(v == null ? '' : v).slice(0, n);
}
