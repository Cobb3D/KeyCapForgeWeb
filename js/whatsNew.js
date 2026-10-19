// "What's new" pop-up: shown once per update, the first time someone opens
// the site after it changes. Each browser remembers the last APP_VERSION it
// showed (localStorage), so bumping APP_VERSION in bugReport.js when
// publishing makes the pop-up appear again for everyone.
//
// To update it for a new upload: bump APP_VERSION, and replace the bullets
// below with short notes on what changed.

import { APP_VERSION } from './bugReport.js';

export const WHATS_NEW = [
  'New "Same color for every cap" checkbox under Caps in this set: pick one cap color and one letter color for the whole set, including caps you add later',
  'More room around each key in the base (0.45mm per side) so caps don\'t rub the pocket walls; adjust it with the Key clearance slider',
  '3MF files bring your colors into Bambu Studio and OrcaSlicer: use Color match to map them to your AMS, and every part stays changeable in the slicer',
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
