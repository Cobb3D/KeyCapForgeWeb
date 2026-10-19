// "Send to Print": a customer fills in their name, email and any notes, and
// the current design's 3MF (the same file the Export button makes) is
// emailed to Cobb3D with those details and a summary of the design.
//
// A static site can't send email itself, and a mailto: link can't carry an
// attachment, so the order goes to a small Google Apps Script web app
// running on Cobb3D's own Google account (google-apps-script/OrderEmail.gs
// in this folder; setup steps in its header and in README.md). That script
// sends the email to Cobb3DPrinting@gmail.com, with the customer's address
// as Reply-To.
//
// Paste the web app's URL (it ends in /exec) between the quotes below. While
// it's empty the Send to Print button stays hidden.
const ORDER_ENDPOINT = '';

// Orders bigger than this aren't sent (Gmail's attachment limit is 25MB, and
// the file grows by a third when encoded for sending).
const MAX_FILE_BYTES = 18 * 1024 * 1024;

export function initPrintOrder({ make3mf, orderInfo }) {
  const btn = document.getElementById('printOrderBtn');
  const dialog = document.getElementById('printOrderDialog');
  if (!btn || !dialog) return;
  if (!ORDER_ENDPOINT) { btn.hidden = true; return; }
  btn.hidden = false;

  const form = document.getElementById('printOrderForm');
  const nameEl = document.getElementById('orderName');
  const emailEl = document.getElementById('orderEmail');
  const notesEl = document.getElementById('orderNotes');
  const note = document.getElementById('orderNote');
  const sendBtn = document.getElementById('orderSend');
  const trapEl = document.getElementById('orderWebsite');
  let sending = false;
  let openedAt = 0;

  btn.addEventListener('click', () => {
    note.textContent = '';
    note.className = 'order-note';
    sendBtn.disabled = false;
    openedAt = Date.now();
    dialog.showModal();
    nameEl.focus();
  });
  document.getElementById('orderCancel').addEventListener('click', () => { if (!sending) dialog.close(); });

  const toBase64 = (blob) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (sending) return;
    if (!form.reportValidity()) return;
    const file = make3mf();
    if (!file) { note.textContent = 'There is nothing to send yet (import a logo first).'; return; }
    if (file.blob.size > MAX_FILE_BYTES) {
      note.textContent = `This design's file is too big to email (${(file.blob.size / 1048576).toFixed(1)}MB). Try fewer caps or emoji.`;
      return;
    }
    sending = true;
    sendBtn.disabled = true;
    note.className = 'order-note';
    note.textContent = 'Sending…';
    try {
      const info = orderInfo() || {};
      const payload = {
        kind: 'keycapforge-print-order',
        name: nameEl.value.trim(),
        email: emailEl.value.trim(),
        notes: notesEl.value.trim(),
        // Bot trap (see OrderEmail.gs): a hidden field people leave empty,
        // and how long the form was open.
        website: trapEl ? trapEl.value : '',
        elapsedMs: Date.now() - openedAt,
        title: info.title || '',
        summary: info.summary || '',
        design: info.design || '',
        page: location.href,
        fileName: file.name,
        fileBase64: await toBase64(file.blob),
      };
      // text/plain keeps this a "simple" request, which Apps Script accepts
      // from any site without a CORS preflight.
      const res = await fetch(ORDER_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) });
      let reply = null;
      try { reply = await res.json(); } catch (err) { reply = null; }
      if (!res.ok || !reply || !reply.ok) throw new Error((reply && reply.error) || `the server answered ${res.status}`);
      note.className = 'order-note ok';
      note.textContent = 'Sent! Cobb3D will reply to your email about your order.';
      notesEl.value = '';
    } catch (err) {
      note.className = 'order-note error';
      note.textContent = `Couldn't send it (${err.message}). Please try again, or use Export and email the file to Cobb3DPrinting@gmail.com.`;
      sendBtn.disabled = false;
    } finally {
      sending = false;
    }
  });
}
