// Drag-to-reorder side menu. Each panel title gets a grip (⋮⋮) on its left:
// drag it up or down to move the whole section. Works with a mouse, a
// finger or a pen (pointer events), and from the keyboard: focus the grip
// and press the up / down arrow keys.
//
// The order is remembered in this browser (localStorage, by panel title),
// so it survives reloads; panels added in a later update appear where the
// page puts them. "Reset menu order" in the sidebar footer goes back to
// the page's own order. Run after initCollapsiblePanels (it needs the
// title buttons that one makes).

const ORDER_KEY = 'keycapforge.sidebarOrder';

const titleOf = (panel) => (panel.querySelector('.panel-title') || panel.querySelector('h2') || {}).textContent?.trim() || '';
const isShown = (el) => !el.hidden && el.offsetParent !== null;

function loadOrder() {
  try { const v = JSON.parse(localStorage.getItem(ORDER_KEY) || 'null'); return Array.isArray(v) ? v : null; } catch (e) { return null; }
}
function saveOrder(list) {
  try {
    if (list) localStorage.setItem(ORDER_KEY, JSON.stringify(list));
    else localStorage.removeItem(ORDER_KEY);
  } catch (e) { /* not remembered */ }
}

export function initPanelOrder(root = document.getElementById('sidebar')) {
  if (!root) return;
  const panels = () => [...root.querySelectorAll(':scope > section.panel')];
  const anchor = root.querySelector(':scope > .sidebar-footer'); // panels stay above it
  const original = panels().map(titleOf);

  // Put panels in the given title order. Titles not in the list keep their
  // place just after the panel that comes before them in the page's order.
  function applyOrder(list) {
    const byTitle = new Map(panels().map((p) => [titleOf(p), p]));
    const order = list.filter((t) => byTitle.has(t));
    for (const t of original) {
      if (order.includes(t) || !byTitle.has(t)) continue;
      const before = original.slice(0, original.indexOf(t)).reverse().find((x) => order.includes(x));
      order.splice(before ? order.indexOf(before) + 1 : 0, 0, t);
    }
    for (const t of order) root.insertBefore(byTitle.get(t), anchor);
  }
  const save = () => saveOrder(panels().map(titleOf));

  const saved = loadOrder();
  if (saved) applyOrder(saved);

  for (const panel of panels()) {
    const h2 = panel.querySelector('h2');
    if (!h2 || h2.querySelector('.panel-grip')) continue;
    const title = titleOf(panel);
    const grip = document.createElement('button');
    grip.type = 'button';
    grip.className = 'panel-grip';
    grip.title = `Drag to move ${title} (or use the arrow keys)`;
    grip.setAttribute('aria-label', `Move ${title}`);
    grip.innerHTML = '<svg viewBox="0 0 10 16" width="10" height="16" aria-hidden="true"><g fill="currentColor"><circle cx="2.5" cy="3" r="1.4"/><circle cx="7.5" cy="3" r="1.4"/><circle cx="2.5" cy="8" r="1.4"/><circle cx="7.5" cy="8" r="1.4"/><circle cx="2.5" cy="13" r="1.4"/><circle cx="7.5" cy="13" r="1.4"/></g></svg>';
    h2.classList.add('has-grip');
    h2.prepend(grip);

    // Keyboard: arrows move past the next shown panel.
    grip.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      const shown = panels().filter(isShown);
      const i = shown.indexOf(panel);
      const target = shown[i + (e.key === 'ArrowUp' ? -1 : 1)];
      if (!target) return;
      if (e.key === 'ArrowUp') target.before(panel); else target.after(panel);
      save();
      grip.focus();
      panel.scrollIntoView({ block: 'nearest' });
    });

    // Pointer drag: the panel moves live as the pointer passes the middle of
    // a neighbour, so what you see is where it lands.
    grip.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      panel.classList.add('dragging');
      root.classList.add('reordering');
      let lastY = e.clientY;
      let scrollTimer = null;

      const place = (y) => {
        for (const other of panels().filter(isShown)) {
          if (other === panel) continue;
          const r = other.getBoundingClientRect();
          const mid = r.top + r.height / 2;
          const pr = panel.getBoundingClientRect();
          if (y < mid && pr.top > r.top) { other.before(panel); return; }
          if (y > mid && pr.top < r.top) { other.after(panel); return; }
        }
      };
      // Scroll the menu when dragging near its top or bottom edge.
      const autoScroll = () => {
        const r = root.getBoundingClientRect();
        const edge = 48;
        let dy = 0;
        if (lastY < r.top + edge) dy = -Math.min(24, Math.ceil((r.top + edge - lastY) / 2));
        else if (lastY > r.bottom - edge) dy = Math.min(24, Math.ceil((lastY - (r.bottom - edge)) / 2));
        if (dy) { root.scrollTop += dy; place(lastY); }
        scrollTimer = requestAnimationFrame(autoScroll);
      };
      scrollTimer = requestAnimationFrame(autoScroll);

      // Listen on the whole page, not the grip: moving the panel in the page
      // would drop a pointer capture on the grip and lose the drag.
      const id = e.pointerId;
      const move = (ev) => { if (ev.pointerId !== id) return; lastY = ev.clientY; place(lastY); };
      const end = (ev) => {
        if (ev.pointerId !== id) return;
        cancelAnimationFrame(scrollTimer);
        panel.classList.remove('dragging');
        root.classList.remove('reordering');
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', end);
        window.removeEventListener('pointercancel', end);
        save();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', end);
      window.addEventListener('pointercancel', end);
    });
  }

  // "Reset menu order" in the footer.
  const footer = anchor;
  if (footer && !footer.querySelector('#resetMenuOrder')) {
    const link = document.createElement('a');
    link.href = '#';
    link.id = 'resetMenuOrder';
    link.textContent = 'Reset menu order';
    link.addEventListener('click', (e) => {
      e.preventDefault();
      saveOrder(null);
      applyOrder(original);
      root.scrollTop = 0;
    });
    footer.append(document.createTextNode(' · '), link);
  }
}
