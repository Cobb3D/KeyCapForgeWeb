// Fold-away sidebar, two levels:
//  - each panel's title gets a + / − button that folds the whole panel;
//  - inside a panel, the fine-tuning settings sit in a <div class="advanced">
//    behind a "More settings +" button, so only the basics (shape, colors,
//    text, base shape, keyring style) show at first.
// What's open is remembered in this browser (localStorage). The first time,
// every panel is open (except Maker tools) and every "More settings" is
// closed.

const STORE_KEY = 'keycapforge.sidebarOpen';
const CLOSED_BY_DEFAULT = new Set(['Maker tools']);

function loadState() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {}; } catch (e) { return {}; }
}
function saveState(state) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* not remembered */ }
}

export function initCollapsiblePanels(root = document.getElementById('sidebar')) {
  if (!root) return;
  const state = loadState();
  for (const panel of root.querySelectorAll('section.panel')) {
    const h2 = panel.querySelector('h2');
    if (!h2 || h2.querySelector('.panel-toggle')) continue;
    const title = h2.textContent.trim();
    const header = h2.closest('.panel-header') || h2;
    if (header.parentElement !== panel) continue;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'panel-toggle';
    const label = document.createElement('span');
    label.textContent = title;
    const sign = document.createElement('span');
    sign.className = 'panel-sign';
    sign.setAttribute('aria-hidden', 'true');
    label.className = 'panel-title';
    btn.append(label, sign);
    h2.replaceChildren(btn);
    // A count next to the title (Caps in this set) goes just before the sign.
    const count = header !== h2 ? header.querySelector('.count') : null;
    if (count) btn.insertBefore(count, sign);

    const set = (open, remember) => {
      panel.classList.toggle('collapsed', !open);
      btn.setAttribute('aria-expanded', String(open));
      sign.textContent = open ? '−' : '+';
      btn.title = open ? `Hide ${title}` : `Show ${title}`;
      if (remember) { state[title] = open; saveState(state); }
    };
    set(title in state ? !!state[title] : !CLOSED_BY_DEFAULT.has(title), false);
    btn.addEventListener('click', () => set(panel.classList.contains('collapsed'), true));

    // "More settings" inside the panel.
    for (const adv of panel.querySelectorAll(':scope > .advanced')) {
      const key = `more:${title}`;
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'adv-toggle';
      const text = document.createElement('span');
      const msign = document.createElement('span');
      msign.className = 'panel-sign';
      msign.setAttribute('aria-hidden', 'true');
      more.append(text, msign);
      adv.before(more);
      const setMore = (open, remember) => {
        adv.hidden = !open;
        more.setAttribute('aria-expanded', String(open));
        text.textContent = open ? 'Fewer settings' : 'More settings';
        msign.textContent = open ? '−' : '+';
        if (remember) { state[key] = open; saveState(state); }
      };
      setMore(!!state[key], false);
      more.addEventListener('click', () => setMore(adv.hidden, true));
    }
  }
}
