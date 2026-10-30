// Design codes: a short piece of text that holds a whole letter-caps design,
// so a buyer can paste it into Etsy's personalization box and Cobb3D can
// rebuild the exact design from it (Maker tools > "Load a design code", or
// the page opened with ?design=<code>).
//
// A code looks like  KCF1-<payload>-<check>
//   KCF1     format version 1 (the tables below are frozen for it)
//   payload  the design as compact JSON, deflate-compressed when that's
//            shorter ('z' prefix) or plain ('j' prefix), in base64url
//            (A-Z a-z 0-9 - _, which survive copy and paste anywhere)
//   check    3 characters of a checksum of the payload, so a code that was
//            cut short or mistyped is caught instead of building the wrong
//            design.
//
// Only what differs from the version-1 defaults is stored. The defaults are
// frozen here (not read from app.js), so a code made today still rebuilds
// the same design after the app's own defaults change. Adding a setting
// later: give it a new short key at the end of SETTING_KEYS with its
// default in V1_SETTINGS (older codes then get that default).
//
// Logo clicker designs can't be coded: the logo image is far too big.

export const CODE_PREFIX = 'KCF1';

// Version-1 defaults (10/30/2026a), as app.js had them.
const V1_SETTINGS = {
  capWidthMM: 18, capTopWidthMM: 13.5, capHeightMM: 10, wallThicknessMM: 1.4,
  cornerRadiusMM: 1.6, topBevelMM: 0.8, bottomBevelMM: 0.8,
  legendDepthMM: 0.6, legendSizeFraction: 0.62, emojiOneColor: false,
  stemCavityWidthMM: 4.2, stemCavityThicknessMM: 1.35, stemCavityDepthMM: 3.5,
  stemBossWallMM: 0.65, topThicknessMM: 1.5,
  baseFootprintMM: 21, baseThicknessMM: 17.4, floorThicknessMM: 2.0, plateHoleMM: 14, plateThicknessMM: 1.5,
  clearanceMM: 15.8, clearanceHeightMM: 5.5, joinGapMM: 1.0, joinedBase: true, recessDepthMM: 8.0,
  baseTopBevelMM: 0.8, baseBottomBevelMM: 0.8, baseOuterWallExtraMM: 1.7, keyClearanceMM: 0.45,
  baseShape: 'soft', keyringStyle: 'lug', keyringSide: 'top', keyringOuterMM: 10.7, keyringHoleMM: 6.6,
  baseColorHex: '#c92a2a', verticalLayout: true,
  basePattern: false, patternStyle: 'camo', patternMarks: ['#c2b280', '#5b4632', '#3b4a2a'],
};
// Short key for each setting. Append only; never reuse or reorder.
const SETTING_KEYS = {
  capWidthMM: 'cw', capTopWidthMM: 'ct', capHeightMM: 'ch', wallThicknessMM: 'wt',
  cornerRadiusMM: 'cr', topBevelMM: 'tb', bottomBevelMM: 'bb',
  legendDepthMM: 'ld', legendSizeFraction: 'ls', emojiOneColor: 'e1',
  stemCavityWidthMM: 'sw', stemCavityThicknessMM: 'st', stemCavityDepthMM: 'sd',
  stemBossWallMM: 'sb', topThicknessMM: 'tt',
  baseFootprintMM: 'bf', baseThicknessMM: 'bt', floorThicknessMM: 'ft', plateHoleMM: 'ph', plateThicknessMM: 'pt',
  clearanceMM: 'cl', clearanceHeightMM: 'cH', joinGapMM: 'jg', joinedBase: 'jb', recessDepthMM: 'rd',
  baseTopBevelMM: 'Bt', baseBottomBevelMM: 'Bb', baseOuterWallExtraMM: 'ow', keyClearanceMM: 'kc',
  baseShape: 'bs', keyringStyle: 'ks', keyringSide: 'kS', keyringOuterMM: 'ko', keyringHoleMM: 'kh',
  baseColorHex: 'bc', verticalLayout: 'vl',
  basePattern: 'bp', patternStyle: 'ps', patternMarks: 'pm',
};

const V1_FONTS = ['Archivo Black', 'Anton', 'Bebas Neue', 'Russo One', 'Oswald', 'Roboto', 'Fjalla One'];
const V1_CAP = {
  shape: 'square', fontFamily: 'Archivo Black', isBold: true, isItalic: false, isUnderline: false,
  legendStyle: 'engraved', bodyColorHex: '#3b5bdb', legendColorHex: '#ffffff', colorfulEmoji: false,
};
const CAP_KEYS = {
  shape: 'sh', fontFamily: 'f', isBold: 'B', isItalic: 'I', isUnderline: 'U',
  legendStyle: 'lg', bodyColorHex: 'b', legendColorHex: 'l', colorfulEmoji: 'e',
};
const MAX_CAPS = 24;

const invert = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [v, k]));
const SETTING_NAMES = invert(SETTING_KEYS);
const CAP_NAMES = invert(CAP_KEYS);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Colours are stored as 6 hex digits without the '#'.
const isColorKey = (k) => /Hex$/.test(k);
const packColor = (h) => String(h).replace('#', '').toLowerCase();
const unpackColor = (h) => (/^[0-9a-f]{6}$/i.test(h) ? '#' + h.toLowerCase() : null);

function packValue(key, v) {
  if (isColorKey(key)) return packColor(v);
  if (key === 'patternMarks') return v.map(packColor);
  if (key === 'fontFamily') { const i = V1_FONTS.indexOf(v); return i >= 0 ? i : v; }
  if (typeof v === 'boolean') return v ? 1 : 0;
  return v;
}
// Back to the app's value, or undefined if it isn't a valid value for that
// key (wrong type, bad colour), in which case the default stays.
function unpackValue(key, v, def) {
  if (isColorKey(key)) return typeof v === 'string' ? (unpackColor(v) ?? undefined) : undefined;
  if (key === 'patternMarks') {
    if (!Array.isArray(v) || v.length > 6) return undefined;
    const c = v.map(unpackColor);
    return c.every(Boolean) ? c : undefined;
  }
  if (key === 'fontFamily') {
    if (Number.isInteger(v) && V1_FONTS[v]) return V1_FONTS[v];
    return typeof v === 'string' && v.length <= 60 ? v : undefined;
  }
  if (typeof def === 'boolean') return v === 1 || v === true ? true : v === 0 || v === false ? false : undefined;
  if (typeof def === 'number') return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
  if (typeof def === 'string') return typeof v === 'string' && v.length <= 40 ? v : undefined;
  return undefined;
}

// The value most caps share for a field (first one on a tie).
function mostCommon(values) {
  const counts = new Map();
  let best = values[0], bestN = 0;
  for (const v of values) {
    const k = JSON.stringify(v);
    const n = (counts.get(k) || 0) + 1;
    counts.set(k, n);
    if (n > bestN) { best = v; bestN = n; }
  }
  return best;
}

// The design as a small object with short keys:
//   t   the caps' text: a string when every cap is one character, else a list
//   s   settings that differ from V1_SETTINGS
//   d   cap fields shared by most caps, where they differ from V1_CAP
//   c   per-cap exceptions to d, keyed by cap number (0 = first)
//   th  colour theme, sc 1 = "Same color for every cap" was on
export function designToObject({ settings, caps, theme, sameColor }) {
  const o = {};
  const texts = caps.slice(0, MAX_CAPS).map((c) => String(c.text ?? ''));
  o.t = texts.every((t) => Array.from(t).length === 1) ? texts.join('') : texts;

  const s = {};
  for (const [name, key] of Object.entries(SETTING_KEYS)) {
    if (!(name in settings) || same(settings[name], V1_SETTINGS[name])) continue;
    s[key] = packValue(name, settings[name]);
  }
  if (Object.keys(s).length) o.s = s;

  const shared = {};
  const d = {};
  for (const [name, key] of Object.entries(CAP_KEYS)) {
    shared[name] = caps.length ? mostCommon(caps.map((c) => c[name] ?? V1_CAP[name])) : V1_CAP[name];
    if (!same(shared[name], V1_CAP[name])) d[key] = packValue(name, shared[name]);
  }
  if (Object.keys(d).length) o.d = d;

  const c = {};
  caps.slice(0, MAX_CAPS).forEach((cap, i) => {
    const diff = {};
    for (const [name, key] of Object.entries(CAP_KEYS)) {
      const v = cap[name] ?? V1_CAP[name];
      if (!same(v, shared[name])) diff[key] = packValue(name, v);
    }
    if (Object.keys(diff).length) c[i] = diff;
  });
  if (Object.keys(c).length) o.c = c;

  if (theme) o.th = theme;
  if (sameColor) o.sc = 1;
  return o;
}

// Back from that object to { settings, caps, theme, sameColor }: settings
// is a full set (V1 defaults plus the code's changes), caps full objects.
export function objectToDesign(o) {
  if (!o || typeof o !== 'object') throw new Error('not a design');
  const settings = JSON.parse(JSON.stringify(V1_SETTINGS));
  for (const [key, v] of Object.entries(o.s || {})) {
    const name = SETTING_NAMES[key];
    if (!name) continue; // a setting this version doesn't know
    const val = unpackValue(name, v, V1_SETTINGS[name]);
    if (val !== undefined) settings[name] = val;
  }
  const texts = Array.isArray(o.t) ? o.t.map((t) => String(t).slice(0, 8)) : Array.from(String(o.t ?? ''));
  if (!texts.length) throw new Error('the design has no caps');
  const shared = { ...V1_CAP };
  for (const [key, v] of Object.entries(o.d || {})) {
    const name = CAP_NAMES[key];
    if (!name) continue;
    const val = unpackValue(name, v, V1_CAP[name]);
    if (val !== undefined) shared[name] = val;
  }
  const caps = texts.slice(0, MAX_CAPS).map((text, i) => {
    const cap = { ...shared, text };
    for (const [key, v] of Object.entries((o.c || {})[i] || {})) {
      const name = CAP_NAMES[key];
      if (!name) continue;
      const val = unpackValue(name, v, V1_CAP[name]);
      if (val !== undefined) cap[name] = val;
    }
    return cap;
  });
  return {
    settings, caps,
    theme: typeof o.th === 'string' && o.th.length <= 30 ? o.th : null,
    sameColor: o.sc === 1,
  };
}

// ---------- Text form ----------

const toB64u = (bytes) => {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64u = (s) => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(b, (ch) => ch.charCodeAt(0));
};
async function pipe(bytes, stream) {
  const out = await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer();
  return new Uint8Array(out);
}
// FNV-1a over the payload, as 3 base64url characters (18 bits).
function check(payload) {
  let h = 0x811c9dc5;
  for (let i = 0; i < payload.length; i++) { h ^= payload.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  return A[h & 63] + A[(h >>> 6) & 63] + A[(h >>> 12) & 63];
}

export async function encodeDesign(design) {
  const json = JSON.stringify(designToObject(design));
  const raw = new TextEncoder().encode(json);
  let payload = 'j' + toB64u(raw);
  if (typeof CompressionStream === 'function') {
    try {
      const z = 'z' + toB64u(await pipe(raw, new CompressionStream('deflate-raw')));
      if (z.length < payload.length) payload = z;
    } catch (e) { /* plain is fine */ }
  }
  return `${CODE_PREFIX}-${payload}-${check(payload)}`;
}

// The first design code in a piece of text (an Etsy order shows it after
// "Personalization:"), or null. A code runs to the next space or
// punctuation other than - and _ (base64url uses both).
export function findDesignCode(text) {
  const m = String(text || '').match(/KCF1-[A-Za-z0-9_-]{6,}/);
  return m && m[0].at(-4) === '-' ? m[0] : null;
}

// The design in a code (or in text containing one). Throws an Error with a
// plain explanation if it can't be read.
export async function decodeDesign(text) {
  const code = findDesignCode(text);
  if (!code) {
    if (/KCF\d+-/.test(String(text))) throw new Error('this design code is from a newer or different version of KeyCapForge, or it was cut short');
    throw new Error('no design code found (they start with KCF1-)');
  }
  const payload = code.slice(CODE_PREFIX.length + 1, -4);
  if (check(payload) !== code.slice(-3)) throw new Error('the code has a typo or was cut short (its check letters don\'t match)');
  let bytes = fromB64u(payload.slice(1));
  if (payload[0] === 'z') {
    if (typeof DecompressionStream !== 'function') throw new Error('this browser can\'t unpack design codes; try a current Chrome, Safari, Firefox or Edge');
    bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
  } else if (payload[0] !== 'j') {
    throw new Error('unknown code format');
  }
  return objectToDesign(JSON.parse(new TextDecoder().decode(bytes)));
}
