// "What's new" pop-up: shown once per update, the first time someone opens
// the site after it changes. Each browser remembers the last APP_VERSION it
// showed (localStorage), so bumping APP_VERSION in bugReport.js when
// publishing makes the pop-up appear again for everyone.
//
// To update it for a new upload: bump APP_VERSION, and replace the bullets
// below with short notes on what changed.

import { APP_VERSION } from './bugReport.js';

export const WHATS_NEW = [
  'Fixed for the latest Bambu Studio: 3MF files import with the letters on their own filament again (the update had put every part on filament 1). Set each filament to the color you want in Bambu Studio',
  'Maker tools are open to everyone: click "Maker tools" at the bottom of the menu for plates of bases and letter caps to print ahead of orders',
  'New Copy design code button: it gives you a short code for your whole design. Ordering on Etsy? Paste the code into the Personalization box on the listing and check out as usual',
  'Have a code already? Open the Copy design code window and use "Have a design code? Open it here" to bring the design back',
  'Pick filament colors by brand: IIID Max, Bambu Lab, Sunlu or Polymaker, every PLA color they make',
  'Arrange the side menu your way: drag the dots (⋮⋮) beside any section title',
]

const SEEN_KEY = 'keycapforge.whatsNewSeen';

export function initWhatsNew() {
  const dialog = document.getElementById('whatsNewDialog');
  if (!dialog) return;
  document.getElementById('whatsNewVersion').textContent = `Update ${APP_VERSION}`;
  const list = document.getElementById('whatsNewList');
  list.replaceChildren(...WHATS_NEW.map((text) => { const li = document.createElement('li'); li.textContent = text; return li; }));

  const markSeen = () => { try { localStorage.setItem(SEEN_KEY, APP_VERSION); } catch (e) { /* storage blocked: it just shows again next time */ } };
  document.getElementById('whatsNewClose').addEventListener('click', () => { markSeen(); dialog.close(); });
  dialog.addEventListener('cancel', markSeen); // Esc closes it too
  const link = document.getElementById('whatsNewLink');
  if (link) link.addEventListener('click', (e) => { e.preventDefault(); dialog.showModal(); });

  let seen = null;
  try { seen = localStorage.getItem(SEEN_KEY); } catch (e) { seen = null; }
  if (seen !== APP_VERSION && WHATS_NEW.length) dialog.showModal();
}
