// Filament colour palette for every colour box on the page. Clicking a
// colour box opens a pop-up with a Brand menu (IIID Max, Bambu Lab, Sunlu,
// Polymaker) and that brand's PLA colours, grouped by product line;
// "Custom color…" still opens the browser's own picker for anything else.
// The brand last used is remembered in this browser.
//
// Sources:
//  - IIID Max: IIID Max's Filament Color Guide (3 Nov 2026), sent by
//    IIID Max: High Speed PLA+ (55) and Classic PLA+ (14), with their
//    own hex codes. Colours not in it are no longer sold.
//  - Bambu Lab, Sunlu, Polymaker: the Open Filament Database (MIT), via
//    js/filamentData.js (generated; see vendor/open-filament-database/).
//
// Send to Print orders name the filament behind each colour (describeColor).
// The design only stores a hex colour, and some filaments share one
// (#ffffff is white in most lines), so each filament gets its own colour in
// the app: the first with a hex (IIID Max first, then the database's order)
// keeps it, and later ones are moved by the smallest step that's free (a
// few channels off by at most 4 out of 255, which can't be seen). The order
// still shows the database's hex.

import { OFD_BRANDS } from './filamentData.js';

const IIID_MAX = {
  id: 'iiidmax', name: 'IIID Max',
  // IIID Max's own Filament Color Guide (3 Nov 2026): everything they
  // currently sell; colours not in it are discontinued. Ordered by hue.
  lines: [
    {
      name: 'High Speed PLA+',
      colors: [
      ['Matte White', '#dddbd6'],
      ['Crystal', '#cfceca'],
      ['White', '#c2bfb9'],
      ['Matte Cold Grey', '#b6b4b0'],
      ['Dark Grey', '#9b9da0'],
      ['Ebony Color', '#796e6c'],
      ['Space Gray', '#6a6f71'],
      ['Army Green', '#70755d'],
      ['Chocolate', '#373535'],
      ['Dark Green', '#36382c'],
      ['Black', '#28292a'],
      ['Matte Graphite', '#28292a'],
      ['Matte Black', '#282828'],
      ['Purplish Red', '#ef7387'],
      ['Mahogany', '#bc8172'],
      ['Matte Red', '#e04759'],
      ['Fluo Orange', '#f24a32'],
      ['Pink', '#d32d4a'],
      ['Orange', '#d53e0c'],
      ['Peach', '#994f45'],
      ['Fluo Red', '#bb1a25'],
      ['Red', '#8e282f'],
      ['Burgundy', '#3a2a2a'],
      ['Matte Oats', '#e5cea7'],
      ['White Oak', '#c9bea1'],
      ['Dove Grey', '#bcb2a2'],
      ['Faux Wood', '#cd9c78'],
      ['Matte Pumpkin', '#fdcc48'],
      ['Frosty Desert Yellow', '#f0c351'],
      ['Skin', '#cc9174'],
      ['Vanilla', '#9d8466'],
      ['Brown', '#925a46'],
      ['Ochre', '#673724'],
      ['Vintage Brass', '#4a3f21'],
      ['Duvet Yellow', '#e1b825'],
      ['Yellow', '#c9a81c'],
      ['Matte Green Plum', '#cee68e'],
      ['Scallion Green', '#68c74c'],
      ['Fluo Green', '#2aa030'],
      ['Pine Green', '#01ba85'],
      ['Matte Glacier Blue', '#85b9be'],
      ['Grayish Green', '#669698'],
      ['Turquoise', '#42a6a5'],
      ['Emerald', '#35736c'],
      ['Light Blue', '#3da1c5'],
      ['Blue', '#3b6abf'],
      ['Fluo Blue', '#16368e'],
      ['Deep Cyan', '#253148'],
      ['Lavender', '#bbb1cb'],
      ['Violet', '#6b5691'],
      ['Matte Mystic Purple', '#4d445e'],
      ['Matte Lavender', '#f5c0f0'],
      ['Cream Pink', '#cfbbcb'],
      ['Lotus Pink', '#cd778d'],
      ['Light Pink', '#b16e99'],
      ],
    },
    {
      name: 'Classic PLA+',
      colors: [
      ['Marble', '#d9d8d7'],
      ['Space Gray', '#c8cace'],
      ['Silver', '#acacad'],
      ['Matte Black', '#2a2b2e'],
      ['Light Pink', '#f99eab'],
      ['Sunset Orange', '#ea6b62'],
      ['Matte Red', '#ee5765'],
      ['Ivory', '#ede9e2'],
      ['Yellow', '#fed83f'],
      ['Forest Green', '#3f7964'],
      ['Cool White', '#edeff2'],
      ['Royal Blue', '#014aa9'],
      ['Violet', '#c4b2f8'],
      ['Raspberry', '#c55f7f'],
      ],
    }
  ],
};

export const BRANDS = [IIID_MAX, ...OFD_BRANDS];
const DEFAULT_BRAND = 'iiidmax';
const BRAND_KEY = 'keycapforge.filamentBrand';

// Every filament as { brand, line, name, hexes, hex }: hexes are the
// database's (several for a multi-colour filament), hex is the colour the
// app uses for it, unique to this filament (see above).
const toRGB = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
// Steps of up to 4 on each channel, smallest first (biggest single-channel
// change, then total change).
const NUDGES = [];
for (let r = -4; r <= 4; r++) for (let g = -4; g <= 4; g++) for (let b = -4; b <= 4; b++) {
  if (r || g || b) NUDGES.push([r, g, b]);
}
const size = (n) => Math.max(...n.map(Math.abs)) * 100 + n.reduce((a, v) => a + Math.abs(v), 0);
NUDGES.sort((a, b) => size(a) - size(b));
export const ALL = [];
const byHex = new Map();
for (const brand of BRANDS) {
  for (const line of brand.lines) {
    for (const [name, h] of line.colors) {
      const hexes = (Array.isArray(h) ? h : [h]).map((x) => x.toLowerCase());
      let hex = hexes[0];
      if (byHex.has(hex)) {
        const rgb = toRGB(hex);
        for (const n of NUDGES) {
          const c = rgb.map((v, i) => v + n[i]);
          if (c.some((v) => v < 0 || v > 255)) continue;
          if (!byHex.has(toHex(c))) { hex = toHex(c); break; }
        }
      }
      const f = { brand, line: line.name, name, hexes, hex };
      if (!byHex.has(hex)) byHex.set(hex, f);
      ALL.push(f);
    }
  }
}

// The filament for this colour, or null for a custom colour.
export function filamentFor(hex) {
  return byHex.get(String(hex || '').toLowerCase()) || null;
}

// Brand, line and colour; a line that already starts with the brand name
// ("Polymaker PLA Pro") doesn't get it twice.
const fullName = (f) => {
  const line = f.line.toLowerCase().startsWith(f.brand.name.toLowerCase() + ' ') ? f.line : `${f.brand.name} ${f.line}`;
  return `${line} ${f.name}`;
};

// A plain word for a colour ("white", "dark blue"...), for colours that
// aren't a known filament.
export function colorWord(hex) {
  const h = String(hex).replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (d < 0.08 || (l > 0.92) || (l < 0.08)) return l > 0.85 ? 'white' : l < 0.15 ? 'black' : l > 0.6 ? 'light grey' : l < 0.35 ? 'dark grey' : 'grey';
  let hue = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  hue = (hue * 60 + 360) % 360;
  const names = [[15, 'red'], [40, 'orange'], [65, 'yellow'], [160, 'green'], [195, 'teal'], [250, 'blue'], [290, 'purple'], [335, 'pink'], [360, 'red']];
  let name = names.find(([lim]) => hue < lim)[1];
  if (name === 'orange' && l < 0.4) name = 'brown';
  if (name === 'yellow' && l < 0.35) name = 'olive';
  const shade = l < 0.3 ? 'dark ' : l > 0.72 ? 'light ' : '';
  return shade + name;
}

// What to load as each filament, for the note after a 3MF export: the
// filament's name, or a plain colour word, with its hex.
export function filamentLabel(hex) {
  const f = filamentFor(hex);
  const label = f ? `${fullName(f)} (${f.hexes[0]})` : `${colorWord(hex)} (${String(hex).toLowerCase()})`;
  return label + iiidSuggestion(hex);
}

// ---------- Closest IIID Max colour ----------
// Cobb3D prints with IIID Max, so any other colour (another brand's, or a
// custom one) gets the nearest IIID Max filament, by CIEDE2000: the
// standard measure of how different two colours look (about 1 = barely
// visible side by side, 2-5 = noticeable up close, over 10 = clearly a
// different colour).

function toLab(hex) {
  const h = String(hex).replace('#', '');
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const [r, g, b] = [0, 2, 4].map((i) => lin(parseInt(h.slice(i, i + 2), 16)));
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const [fx, fy, fz] = [f(x), f(y), f(z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

// CIEDE2000 colour difference (Sharma, Wu & Dalal 2005).
export function deltaE2000(hexA, hexB) {
  const [L1, a1, b1] = toLab(hexA), [L2, a2, b2] = toLab(hexB);
  const rad = Math.PI / 180;
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cm = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1, a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const hp = (b, a) => (b === 0 && a === 0 ? 0 : (Math.atan2(b, a) / rad + 360) % 360);
  const h1p = hp(b1, a1p), h2p = hp(b2, a2p);
  const dLp = L2 - L1, dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) { dhp = h2p - h1p; if (dhp > 180) dhp -= 360; else if (dhp < -180) dhp += 360; }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * rad);
  const Lpm = (L1 + L2) / 2, Cpm = (C1p + C2p) / 2;
  let hpm = h1p + h2p;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) <= 180) hpm = (h1p + h2p) / 2;
    else hpm = h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2;
  }
  const T = 1 - 0.17 * Math.cos((hpm - 30) * rad) + 0.24 * Math.cos(2 * hpm * rad) + 0.32 * Math.cos((3 * hpm + 6) * rad) - 0.2 * Math.cos((4 * hpm - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hpm - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cpm ** 7 / (Cpm ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lpm - 50) ** 2) / Math.sqrt(20 + (Lpm - 50) ** 2);
  const Sc = 1 + 0.045 * Cpm, Sh = 1 + 0.015 * Cpm * T;
  const Rt = -Math.sin(2 * dTheta * rad) * Rc;
  return Math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh));
}

const IIID_FILAMENTS = ALL.filter((f) => f.brand.id === 'iiidmax');

// The nearest IIID Max filament to a colour: { filament, dE }.
export function closestIIIDMax(hex) {
  let best = null;
  for (const f of IIID_FILAMENTS) {
    const dE = deltaE2000(hex, f.hexes[0]);
    if (!best || dE < best.dE) best = { filament: f, dE };
  }
  return best;
}

const closeness = (dE) => (dE < 1 ? 'same color' : dE < 3 ? 'very close' : dE < 6 ? 'close' : dE < 12 ? 'nearest, noticeably different' : 'nearest, but clearly different');

// " → closest IIID Max: High Speed PLA+ Red (#c12e1f), close" for a colour
// that isn't an IIID Max filament; '' for one that is.
export function iiidSuggestion(hex) {
  const f = filamentFor(hex);
  if (f && f.brand.id === 'iiidmax') return '';
  const m = closestIIIDMax(f ? f.hexes[0] : hex);
  if (!m) return '';
  return ` → closest IIID Max: ${m.filament.line} ${m.filament.name} (${m.filament.hexes[0]}), ${closeness(m.dE)} (ΔE ${m.dE.toFixed(1)})`;
}

// "Bambu Lab PLA Matte Charcoal (#000000)" for a filament colour, else
// "#a92a30 (custom)". Used in Send to Print orders.
export function describeColor(hex) {
  const f = filamentFor(hex);
  if (!f) return `${hex} (custom)`;
  const shown = f.hexes.length > 1 ? `multi-color ${f.hexes.join(' / ')}` : f.hexes[0];
  return `${fullName(f)} (${shown})`;
}

// ---------- Palette pop-up ----------

let popover = null;
let current = null; // the colour box the pop-up is open for
let brandId = DEFAULT_BRAND;
try { const saved = localStorage.getItem(BRAND_KEY); if (BRANDS.some((b) => b.id === saved)) brandId = saved; } catch (e) { /* default */ }

function setValue(input, f) {
  input.value = f.hex;
  // The page's own handlers listen for 'input' (and some for 'change').
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  labelInput(input);
}

function labelInput(input) {
  const f = filamentFor(input.value);
  input.title = f ? fullName(f) : `Custom color ${input.value}`;
}

// A multi-colour filament's swatch shows each of its colours in a band.
function swatchBackground(hexes) {
  if (hexes.length === 1) return hexes[0];
  const step = 100 / hexes.length;
  return `linear-gradient(135deg, ${hexes.map((h, i) => `${h} ${i * step}%, ${h} ${(i + 1) * step}%`).join(', ')})`;
}

let nameEl, lineEl, bodyEl, brandSel;

function showName(f) {
  if (!nameEl) return;
  if (f) {
    nameEl.textContent = f.name;
    nameEl.title = fullName(f) + (f.hexes.length > 1 ? ' (multi-color; the preview shows the first color)' : '');
    nameEl.dataset.line = f.line;
  } else {
    const cur = current && filamentFor(current.value);
    if (cur) { showName(cur); return; }
    nameEl.textContent = 'Custom color';
    nameEl.title = '';
    nameEl.dataset.line = '';
  }
  lineEl.textContent = nameEl.dataset.line || '';
}

function renderBrand() {
  const brand = BRANDS.find((b) => b.id === brandId) || BRANDS[0];
  brandSel.value = brand.id;
  const frag = document.createDocumentFragment();
  const value = current ? String(current.value).toLowerCase() : '';
  const picked = filamentFor(value);
  for (const line of brand.lines) {
    if (brand.lines.length > 1) {
      const h = document.createElement('div');
      h.className = 'filament-line';
      h.textContent = `${line.name} (${line.colors.length})`;
      frag.appendChild(h);
    }
    const grid = document.createElement('div');
    grid.className = 'filament-grid';
    for (const f of ALL) {
      if (f.brand !== brand || f.line !== line.name) continue;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'filament-swatch';
      b.style.background = swatchBackground(f.hexes);
      b.title = f.hexes.length > 1 ? `${f.name} (multi-color)` : f.name;
      b.setAttribute('aria-label', `${line.name} ${f.name}`);
      if (picked === f) b.classList.add('selected');
      b._filament = f;
      grid.appendChild(b);
    }
    frag.appendChild(grid);
  }
  bodyEl.replaceChildren(frag);
  bodyEl.scrollTop = 0;
}

function buildPopover() {
  const el = document.createElement('div');
  el.className = 'filament-popover';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Filament colors');
  el.hidden = true;

  const head = document.createElement('div');
  head.className = 'filament-head';
  const label = document.createElement('label');
  label.textContent = 'Brand';
  label.htmlFor = 'filamentBrand';
  brandSel = document.createElement('select');
  brandSel.id = 'filamentBrand';
  for (const b of BRANDS) {
    const count = b.lines.reduce((n, l) => n + l.colors.length, 0);
    const o = document.createElement('option');
    o.value = b.id;
    o.textContent = `${b.name} PLA (${count})`;
    brandSel.appendChild(o);
  }
  brandSel.addEventListener('change', () => {
    brandId = brandSel.value;
    try { localStorage.setItem(BRAND_KEY, brandId); } catch (e) { /* not remembered */ }
    renderBrand();
    position();
  });
  head.append(label, brandSel);

  bodyEl = document.createElement('div');
  bodyEl.className = 'filament-body';
  bodyEl.addEventListener('mouseover', (e) => { const f = e.target._filament; if (f) showName(f); });
  bodyEl.addEventListener('focusin', (e) => { const f = e.target._filament; if (f) showName(f); });
  bodyEl.addEventListener('mouseleave', () => showName(null));
  bodyEl.addEventListener('click', (e) => {
    const f = e.target._filament;
    if (!f) return;
    if (current) setValue(current, f);
    close();
  });

  const foot = document.createElement('div');
  foot.className = 'filament-foot';
  const names = document.createElement('div');
  names.className = 'filament-names';
  nameEl = document.createElement('span');
  nameEl.className = 'filament-name';
  lineEl = document.createElement('span');
  lineEl.className = 'filament-line-name';
  names.append(nameEl, lineEl);
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
  foot.append(names, custom);

  el.append(head, bodyEl, foot);
  document.body.appendChild(el);
  return el;
}

function open(input) {
  if (!popover) popover = buildPopover();
  current = input;
  // Open on the brand of the box's current colour, if it's a filament.
  const f = filamentFor(input.value);
  if (f) brandId = f.brand.id;
  renderBrand();
  showName(null);
  popover.hidden = false;
  position();

  const sel = bodyEl.querySelector('.filament-swatch.selected') || bodyEl.querySelector('.filament-swatch');
  if (sel) {
    sel.focus({ preventScroll: true });
    sel.scrollIntoView({ block: 'nearest' });
  }
}

// Below the colour box, or above it if there's more room there, kept on
// screen. Run again when the brand changes (the pop-up's height changes).
function position() {
  if (!current || !popover || popover.hidden) return;
  const r = current.getBoundingClientRect();
  const margin = 8;
  const below = window.innerHeight - r.bottom - 6 - margin;
  const above = r.top - 6 - margin;
  popover.style.maxHeight = `${Math.min(460, Math.max(below, above))}px`;
  const w = popover.offsetWidth, h = popover.offsetHeight;
  popover.style.left = `${Math.min(Math.max(margin, r.left), window.innerWidth - w - margin)}px`;
  popover.style.top = `${h <= below || below >= above ? r.bottom + 6 : r.top - 6 - h}px`;
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
    } else if (popover && !popover.hidden && e.target.classList && e.target.classList.contains('filament-swatch')) {
      // Arrow keys move through the swatches (across product lines too).
      const swatches = [...bodyEl.querySelectorAll('.filament-swatch')];
      const i = swatches.indexOf(e.target);
      const grid = e.target.parentElement;
      const cols = Math.max(1, Math.round(grid.clientWidth / (e.target.offsetWidth + 6)));
      const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key];
      if (step) {
        e.preventDefault();
        const next = swatches[Math.min(swatches.length - 1, Math.max(0, i + step))];
        next.focus();
        next.scrollIntoView({ block: 'nearest' });
      }
    }
  });

  window.addEventListener('resize', close);
  // Scrolling the page closes it; scrolling inside it doesn't.
  document.addEventListener('scroll', (e) => { if (popover && !popover.contains(e.target)) close(); }, true);

  // Hover names on the colour boxes themselves, worked out when the pointer
  // or focus arrives so they're right after a theme changes the colour.
  const label = (e) => { if (isColorBox(e.target)) labelInput(e.target); };
  document.addEventListener('pointerover', label);
  document.addEventListener('focusin', label);
}
