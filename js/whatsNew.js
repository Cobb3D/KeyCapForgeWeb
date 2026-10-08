// "What's new" pop-up: shown once per update, the first time someone opens
// the site after it changes. Each browser remembers the last APP_VERSION it
// showed (localStorage), so bumping APP_VERSION in bugReport.js when
// publishing makes the pop-up appear again for everyone.
//
// To update it for a new upload: bump APP_VERSION, and replace the bullets
// below with short notes on what changed.

import { APP_VERSION } from './bugReport.js';

export const WHATS_NEW = [
  'New Logo clicker mode: import your own logo image (switch modes at the top of the sidebar)',
  'Logos are now traced with smooth edges and fine detail instead of a blocky grid, with truer colors and much smaller files',
  'Logos made of separate pieces (like an icon with text under it) now keep every piece on the cap',
  'The cap is shaped like your logo, and the base follows the same outline',
  'New Cap shape choice: keep the logo outline, or pick a circle, rounded square, rounded rectangle, square, hexagon, octagon, heart or star (the base follows the shape)',
  'Logos are now printed the full Top thickness (1.5mm by default) instead of one thin layer; use the Top thickness slider to change it',
  'Logos print in up to 3 of their own colors, or 1 color with a cap-color background',
  'PNGs with transparent backgrounds work best; plain backgrounds are removed automatically',
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
