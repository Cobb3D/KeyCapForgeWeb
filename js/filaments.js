// IIID Max PLA+ colours, offered as swatches for every colour box on the
// page. Clicking a colour box opens a palette of these instead of the
// browser's own picker; "Custom color…" in the palette still opens the
// browser's picker for any other colour.
//
// Source: a HueForge filament library for IIID Max (IIIDMax.json, October
// 2026), PLA+ entries only (its two PETG entries are left out). The hex
// values are what that library lists, not IIID Max's official colours, so a
// few may want adjusting against a real spool. Order is by colour family.
export const FILAMENT_BRAND = 'IIID Max';
export const FILAMENT_TYPE = 'PLA+';

export const FILAMENTS = [
  // Whites, greys, black
  { name: 'Xtreme White', hex: '#ffffff' },
  { name: 'White', hex: '#e4e8e7' },
  { name: 'Clear', hex: '#cbcdcd' },
  { name: 'Space Gray', hex: '#abb4ba' },
  { name: 'Silver', hex: '#727571' },
  { name: 'Night Gray', hex: '#21282a' },
  { name: 'Black', hex: '#000000' },
  // Creams, tans, browns
  { name: 'Vanilla Cream', hex: '#c4cbb1' },
  { name: 'Vintage Rose', hex: '#c1b4a9' },
  { name: 'Tan', hex: '#d5c2a0' },
  { name: 'Gold', hex: '#a08c59' },
  { name: 'Coyote Brown', hex: '#906c3f' },
  { name: 'Copper', hex: '#7d5246' },
  { name: 'Brown', hex: '#61392a' },
  // Reds, pinks, oranges, yellows
  { name: 'Red', hex: '#a62f36' },
  { name: 'Candy Red', hex: '#a92a30' },
  { name: 'Pink', hex: '#bf3f62' },
  { name: 'Light Pink', hex: '#dc9d9f' },
  { name: 'Fuchsia', hex: '#ad578b' },
  { name: 'Orange', hex: '#d34c36' },
  { name: 'Burnt Orange', hex: '#b96023' },
  { name: 'Fluorescent Orange', hex: '#ce712a' },
  { name: 'Yellow', hex: '#eac322' },
  // Greens
  { name: 'Key Lime', hex: '#bdc846' },
  { name: 'Fluorescent Yellow', hex: '#a6da6d' },
  { name: 'Apple Green', hex: '#60b04e' },
  { name: 'Fluorescent Green', hex: '#00a065' },
  { name: 'Green Forest', hex: '#07592c' },
  { name: 'Army Green', hex: '#54563f' },
  // Blues, purples
  { name: 'Teal', hex: '#0099a7' },
  { name: 'Light Blue', hex: '#229bd5' },
  { name: 'Baby Blue', hex: '#c3dee5' },
  { name: 'Blue', hex: '#005ba9' },
  { name: 'Navy Blue', hex: '#002043' },
  { name: 'Violet', hex: '#6e5a95' },
  { name: 'Mystic Purple', hex: '#734784' },
];

const byHex = new Map(FILAMENTS.map((f) => [f.hex, f]));

// The filament with exactly this colour, or null for a custom colour.
export function filamentFor(hex) {
  return byHex.get(String(hex || '').toLowerCase()) || null;
}

// "IIID Max Candy Red PLA+ (#a92a30)" for a filament colour, else "#a92a30
// (custom)". Used in Send to Print orders.
export function describeColor(hex) {
  const f = filamentFor(hex);
  return f ? `${FILAMENT_BRAND} ${f.name} ${FILAMENT_TYPE} (${f.hex})` : `${hex} (custom)`;
}

// ---------- Palette pop-up ----------

let popover = null;
let current = null; // the colour box the pop-up is open for

function setValue(input, hex) {
  input.value = hex;
  // The page's own handlers listen for 'input' (and some for 'change').
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  labelInput(input);
}

function labelInput(input) {
  const f = filamentFor(input.value);
  input.title = f ? `${FILAMENT_BRAND} ${f.name}` : `Custom color ${input.value}`;
}

function buildPopover() {
  const el = document.createElement('div');
  el.className = 'filament-popover';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', `${FILAMENT_BRAND} ${FILAMENT_TYPE} colors`);
  el.hidden = true;

  const head = document.createElement('div');
  head.className = 'filament-head';
  head.textContent = `${FILAMENT_BRAND} ${FILAMENT_TYPE}`;

  const grid = document.createElement('div');
  grid.className = 'filament-grid';
  for (const f of FILAMENTS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'filament-swatch';
    b.style.background = f.hex;
    b.title = f.name;
    b.setAttribute('aria-label', f.name);
    b.dataset.hex = f.hex;
    b.addEventListener('mouseenter', () => { nameEl.textContent = f.name; });
    b.addEventListener('focus', () => { nameEl.textContent = f.name; });
    b.addEventListener('click', () => { if (current) setValue(current, f.hex); close(); });
    grid.appendChild(b);
  }
  grid.addEventListener('mouseleave', () => showCurrentName());

  const foot = document.createElement('div');
  foot.className = 'filament-foot';
  const nameEl = document.createElement('span');
  nameEl.className = 'filament-name';
  const custom = document.createElement('button');
  custom.type = 'button';
  custom.className = 'filament-custom';
  custom.textContent = 'Custom color…';
  custom.addEventListener('click', () => {
    const input = current;
    close();
    if (!input) return;
    input.dataset.nativePicker = '1';
    try {
      if (typeof input.showPicker === 'function') input.showPicker();
      else input.click();
    } catch (e) {
      input.click();
    } finally {
      setTimeout(() => { delete input.dataset.nativePicker; }, 0);
    }
  });
  foot.append(nameEl, custom);

  el.append(head, grid, foot);
  document.body.appendChild(el);

  function showCurrentName() {
    const f = current && filamentFor(current.value);
    nameEl.textContent = f ? f.name : 'Custom color';
  }
  el.showCurrentName = showCurrentName;
  return el;
}

function open(input) {
  if (!popover) popover = buildPopover();
  current = input;
  const value = String(input.value).toLowerCase();
  for (const b of popover.querySelectorAll('.filament-swatch')) {
    b.classList.toggle('selected', b.dataset.hex === value);
  }
  popover.showCurrentName();
  popover.hidden = false;

  // Below the colour box, kept on screen.
  const r = input.getBoundingClientRect();
  const w = popover.offsetWidth, h = popover.offsetHeight;
  const margin = 8;
  let left = Math.min(Math.max(margin, r.left), window.innerWidth - w - margin);
  let top = r.bottom + 6;
  if (top + h > window.innerHeight - margin) top = Math.max(margin, r.top - h - 6);
  popover.style.left = `${left}px`;
  popover.style.top = `${top}px`;

  const sel = popover.querySelector('.filament-swatch.selected') || popover.querySelector('.filament-swatch');
  sel.focus({ preventScroll: true });
}

function close() {
  if (!popover || popover.hidden) return;
  popover.hidden = true;
  const input = current;
  current = null;
  if (input && document.contains(input)) input.focus({ preventScroll: true });
}

function isColorBox(t) {
  return t instanceof HTMLInputElement && t.type === 'color' && !t.disabled;
}

export function initFilamentPalette() {
  // One set of listeners for every colour box, including the ones the cap
  // list creates later.
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (isColorBox(t)) {
      if (t.dataset.nativePicker) return; // "Custom color…": let it open
      e.preventDefault();
      if (current === t && popover && !popover.hidden) close();
      else open(t);
      return;
    }
    if (popover && !popover.hidden && !popover.contains(t)) close();
  }, true);

  document.addEventListener('keydown', (e) => {
    if (isColorBox(e.target) && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      open(e.target);
    } else if (e.key === 'Escape' && popover && !popover.hidden) {
      e.preventDefault();
      close();
    } else if (popover && !popover.hidden && popover.contains(e.target) && e.target.classList.contains('filament-swatch')) {
      // Arrow keys move around the grid.
      const swatches = [...popover.querySelectorAll('.filament-swatch')];
      const i = swatches.indexOf(e.target);
      const cols = Math.round(popover.querySelector('.filament-grid').offsetWidth / e.target.offsetWidth) || 7;
      const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key];
      if (step) {
        e.preventDefault();
        swatches[Math.min(swatches.length - 1, Math.max(0, i + step))].focus();
      }
    }
  });

  window.addEventListener('resize', close);
  document.addEventListener('scroll', (e) => { if (popover && !popover.contains(e.target)) close(); }, true);

  // Hover names on the colour boxes themselves, worked out when the pointer
  // or focus arrives so they're right after a theme changes the colour.
  const label = (e) => { if (isColorBox(e.target)) labelInput(e.target); };
  document.addEventListener('pointerover', label);
  document.addEventListener('focusin', label);
}
