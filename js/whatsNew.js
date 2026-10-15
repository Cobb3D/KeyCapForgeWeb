// "What's new" pop-up: shown once per update, the first time someone opens
// the site after it changes. Each browser remembers the last APP_VERSION it
// showed (localStorage), so bumping APP_VERSION in bugReport.js when
// publishing makes the pop-up appear again for everyone.
//
// To update it for a new upload: bump APP_VERSION, and replace the bullets
// below with short notes on what changed.

import { APP_VERSION } from './bugReport.js';

export const WHATS_NEW = [
  'The ledge under each switch plate now only overhangs in the middle of each side, where the switch clips catch; the corners slope instead. This removes most of the overhang that could leave a line around the outside of the base about 8mm up',
  'New Base shape menu for fused bases: rounded rectangle, soft corners, pill, bubbles, chamfered ends, or a tag end with the keyring hole built into the base',
  'Every shape keeps the full wall around each key, so the faint divider lines stay hidden; shapes with rounded or angled ends get a little longer so their corners don\'t cut in',
  'Fused bases have a thicker outer wall (Extra outer wall, 1.5mm by default)',
  'Each keycap opens in Bambu Studio and OrcaSlicer as one object with its letter, and every part is on its own filament so you can change colors in the slicer',
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
