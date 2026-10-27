// "What's new" pop-up: shown once per update, the first time someone opens
// the site after it changes. Each browser remembers the last APP_VERSION it
// showed (localStorage), so bumping APP_VERSION in bugReport.js when
// publishing makes the pop-up appear again for everyone.
//
// To update it for a new upload: bump APP_VERSION, and replace the bullets
// below with short notes on what changed.

import { APP_VERSION } from './bugReport.js';

export const WHATS_NEW = [
  'Arrange the side menu your way: drag the dots (⋮⋮) beside any section title to move it. Your order is remembered; "Reset menu order" at the bottom puts it back. Base & Fit now starts above the caps',
  'Pick filament colors by brand: click any color box and choose IIID Max, Bambu Lab, Sunlu or Polymaker from the Brand menu, with every PLA color they make, grouped by product line (PLA Basic, Matte, Silk...). Custom color… is still there for anything else',
  'Send to Print orders name the brand, line and color for each part',
  '3MF files open with gyroid infill at 12% and 3 walls in Bambu Studio, OrcaSlicer and PrusaSlicer',
  'KeyCapForge is now just "Beta", with the Cobb3D printer logo at the top left and on the browser tab',
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
