import { ensureThreeLoaded, Viewport, meshToObject3D } from './scene.js';
import { buildKeycap } from './keycapBuilder.js';
import { buildBase, capCenters, maxSafeRecessDepth } from './baseBuilder.js';
import { Mesh } from './mesh.js';
import { meshToSTL, downloadBlob } from './stlExport.js';
import { buildThreeMF, limitDistinctColors } from './threeMFExport.js';

const FONTS = ['Archivo Black', 'Anton', 'Bebas Neue', 'Russo One', 'Oswald', 'Roboto', 'Fjalla One'];

const settings = {
  capWidthMM: 18, capTopWidthMM: 13.5, capHeightMM: 10, wallThicknessMM: 1.4,
  cornerRadiusMM: 1.6, topBevelMM: 0.8, bottomBevelMM: 0.8,
  legendDepthMM: 0.6, legendSizeFraction: 0.62,
  stemCavityWidthMM: 4.2, stemCavityThicknessMM: 1.35, stemCavityDepthMM: 3.5,
  // baseThicknessMM (16, up from 9), clearanceHeightMM (5.5, new — see
  // maxSafeRecessDepth in baseBuilder.js), and recessDepthMM (8.0, = 50%
  // of baseThicknessMM) are chosen together, not independently: reported
  // directly that the old 4.0mm clearance height let real switches hit
  // the floor before their retention clips could engage, and simply
  // raising that number alone — without also raising baseThicknessMM —
  // would have silently clamped the recess down to near-nothing, since
  // recess depth and switch clearance both draw from the same fixed
  // baseThicknessMM budget. 16mm comfortably fits a 50%-of-thickness
  // recess (8.0mm) on top of the increased clearance requirement, with
  // ~0.4mm of margin left over (verified: maxSafeRecessDepth at these
  // settings is 8.4mm) — that margin is deliberate, not just unused
  // slack, so recessDepthMM can be nudged up a bit from the slider
  // without silently hitting the clamp at all.
  baseFootprintMM: 21, baseThicknessMM: 16, plateHoleMM: 14, plateThicknessMM: 1.5,
  clearanceMM: 15.8, clearanceHeightMM: 5.5, joinGapMM: 1.0, joinedBase: true, recessDepthMM: 8.0,
  baseTopBevelMM: 0.8, baseBottomBevelMM: 0.8,
  keyringStyle: 'lug', keyringSide: 'top', keyringOuterMM: 14, keyringHoleMM: 6,
  baseColorHex: '#c92a2a', verticalLayout: true,
};

let shape = 'square';
// Default starting set, matching the app's own "by Cobb3D" branding —
// shown both here and in wordInput's own default value in index.html
// (kept in sync manually, since nothing re-derives one from the other at
// load time).
let caps = ['C', 'o', 'b', 'b'].map((ch) => makeCap(ch));
let explodedView = false;
let explodeDistance = 20;

function makeCap(text, { colorfulEmoji = false } = {}) {
  return {
    text, shape, fontFamily: FONTS[0], isBold: true, isItalic: false, isUnderline: false,
    // 'engraved' (not 'embossed') is the default on purpose: its legend
    // sits flush with the cap's flat top surface — same Z-plane, just a
    // different color region for multi-material printing — rather than
    // protruding above it. That's what lets the cap be printed face-down
    // with zero supports: 'embossed' would put the raised letters as the
    // lowest points touching the bed, leaving the flat background
    // suspended above them needing support to bridge across.
    legendStyle: 'engraved', bodyColorHex: '#3b5bdb', legendColorHex: '#ffffff',
    // When true, the legend is rendered in its own native colors (up to 3,
    // via color clustering — see rasterizeLegend in textVoxel.js) instead
    // of the single legendColorHex above. Only set for caps added via the
    // quick-insert emoji palette; symbols and typed text keep the ordinary
    // single-color legend, matching normal keycap conventions.
    colorfulEmoji,
  };
}

async function main() {
  // Everything below depends on Three.js actually being loaded — this is
  // the one async gate the whole app waits on. See scene.js for why this
  // isn't a plain static `import` (it tries several CDN sources in turn,
  // which static imports can't do since they can't be wrapped in try/catch).
  const { THREE, OrbitControls } = await ensureThreeLoaded();
  const viewport = new Viewport(document.getElementById('canvasHost'), THREE, OrbitControls);

  function rebuild() {
    const count = caps.length;
    const centers = capCenters(count, settings);
    const baseMesh = buildBase(caps, settings);

    const group = new THREE.Group();
    group.add(meshToObject3D(THREE, baseMesh, settings.baseColorHex));

    const explodeZ = explodedView ? explodeDistance : 0;

    caps.forEach((cap, i) => {
      const { body, legendParts } = buildKeycap(cap, settings);
      const z = settings.baseThicknessMM + explodeZ;
      const { x, y } = centers[i];
      const bodyObj = meshToObject3D(THREE, body, cap.bodyColorHex);
      bodyObj.position.set(x, y, z);
      group.add(bodyObj);
      // One object per legend part — always 1 for plain text/symbols, up
      // to 3 for a colorfulEmoji cap, each already carrying its own
      // detected color from rasterizeLegend.
      for (const part of legendParts) {
        const partObj = meshToObject3D(THREE, part.mesh, part.colorHex, { decal: true });
        partObj.position.set(x, y, z);
        group.add(partObj);
      }
    });

    viewport.setModel(group);
    viewport.frameToModel();

    renderCapCount();
    updateCornerRadiusHint();
    updateRecessDepthHint();
  }

  // Static explanation is always shown (see the hint's default text in
  // index.html); this adds a dynamic, more attention-grabbing note on top
  // of it specifically when the slider is currently a no-op for every cap
  // in the set — the exact "why isn't this doing anything" moment it's
  // meant to head off. Shape is a per-cap property, not a global setting,
  // so a mixed set (some square, some not) should leave the slider looking
  // normal; only flag it when NO cap would be affected at all.
  const cornerRadiusHintEl = document.getElementById('cornerRadiusHint');
  const CORNER_RADIUS_DEFAULT_HINT = cornerRadiusHintEl.textContent;
  function updateCornerRadiusHint() {
    const anySquare = caps.some((c) => c.shape === 'square');
    if (caps.length > 0 && !anySquare) {
      cornerRadiusHintEl.textContent = 'No square caps in this set right now, so this slider has no visible effect — add a square cap or switch one to square to use it.';
      cornerRadiusHintEl.classList.add('warning');
    } else {
      cornerRadiusHintEl.textContent = CORNER_RADIUS_DEFAULT_HINT;
      cornerRadiusHintEl.classList.remove('warning');
    }
  }

  // Same pattern as the corner-radius hint above — recess depth and
  // switch clearance draw from the same fixed baseThicknessMM budget (see
  // maxSafeRecessDepth, baseBuilder.js), so raising switch clearance for
  // a switch that needs more room, or shrinking base thickness, can push
  // the slider's own chosen value past what's actually safe to build —
  // silently, since buildBlock() clamps it without saying so. This makes
  // that clamp visible instead of just quietly not matching the slider.
  const recessDepthHintEl = document.getElementById('recessDepthHint');
  const RECESS_DEPTH_DEFAULT_HINT = recessDepthHintEl.textContent;
  function updateRecessDepthHint() {
    const maxSafe = maxSafeRecessDepth(settings);
    if (settings.recessDepthMM > maxSafe + 0.01) {
      recessDepthHintEl.textContent = `Capped to ${maxSafe.toFixed(1)}mm right now, not the ${settings.recessDepthMM.toFixed(1)}mm the slider shows — switch clearance and plate thickness need the rest of the base's own thickness. Increase base thickness or reduce switch clearance to get the full amount you've set.`;
      recessDepthHintEl.classList.add('warning');
    } else {
      recessDepthHintEl.textContent = RECESS_DEPTH_DEFAULT_HINT;
      recessDepthHintEl.classList.remove('warning');
    }
  }

  // ---------- Word field ----------
  const wordInput = document.getElementById('wordInput');
  function setWord(word) {
    const letters = Array.from(word);
    if (letters.length === 0) { caps = []; renderCapList(); rebuild(); return; }
    const next = letters.map((ch, i) => (i < caps.length ? { ...caps[i], text: ch } : makeCap(ch)));
    caps = next;
    renderCapList();
    rebuild();
  }
  wordInput.addEventListener('input', () => setWord(wordInput.value));

  // ---------- Cap list ----------
  const capListEl = document.getElementById('capList');
  const capCountEl = document.getElementById('capCount');
  function renderCapCount() { capCountEl.textContent = caps.length; }

  function renderCapList() {
    capListEl.innerHTML = '';
    caps.forEach((cap, i) => {
      const row = document.createElement('div');
      row.className = 'cap-row';

      const line1 = document.createElement('div');
      line1.className = 'line1';

      const textInput = document.createElement('input');
      textInput.type = 'text'; textInput.maxLength = 3; textInput.value = cap.text;
      textInput.addEventListener('input', () => { cap.text = textInput.value; syncWordFromCaps(); rebuild(); });

      const shapeSel = document.createElement('select');
      for (const s of ['square', 'round', 'hexagon', 'pentagon', 'octagon', 'heart', 'flower', 'star']) {
        const o = document.createElement('option'); o.value = s; o.textContent = s; shapeSel.appendChild(o);
      }
      shapeSel.value = cap.shape || shape;
      shapeSel.addEventListener('change', () => { cap.shape = shapeSel.value; rebuild(); });

      const fontSel = document.createElement('select');
      for (const f of FONTS) { const o = document.createElement('option'); o.value = f; o.textContent = f; fontSel.appendChild(o); }
      fontSel.value = cap.fontFamily;
      fontSel.addEventListener('change', () => { cap.fontFamily = fontSel.value; rebuild(); });

      const del = document.createElement('button');
      del.className = 'delete-cap'; del.textContent = '✕';
      del.addEventListener('click', () => { caps.splice(i, 1); syncWordFromCaps(); renderCapList(); rebuild(); });

      line1.append(textInput, shapeSel, fontSel, del);

      const line2 = document.createElement('div');
      line2.className = 'line2';

      const styleToggle = document.createElement('div');
      styleToggle.className = 'style-toggle';
      const bBtn = styleButton('B', cap.isBold, (v) => { cap.isBold = v; rebuild(); });
      const iBtn = styleButton('I', cap.isItalic, (v) => { cap.isItalic = v; rebuild(); });
      const uBtn = styleButton('U', cap.isUnderline, (v) => { cap.isUnderline = v; rebuild(); });
      styleToggle.append(bBtn, iBtn, uBtn);

      const legendSel = document.createElement('select');
      for (const s of ['embossed', 'engraved', 'shineThrough']) { const o = document.createElement('option'); o.value = s; o.textContent = s; legendSel.appendChild(o); }
      legendSel.value = cap.legendStyle;
      legendSel.addEventListener('change', () => { cap.legendStyle = legendSel.value; rebuild(); });

      const swatches = document.createElement('div');
      swatches.className = 'swatches';
      swatches.append(colorInput(cap.bodyColorHex, (v) => { cap.bodyColorHex = v; rebuild(); }), document.createTextNode(' '), colorInput(cap.legendColorHex, (v) => { cap.legendColorHex = v; rebuild(); }));

      line2.append(styleToggle, legendSel, swatches);
      row.append(line1, line2);
      capListEl.appendChild(row);
    });
  }

  function styleButton(label, on, onToggle) {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.className = on ? 'on' : '';
    btn.addEventListener('click', () => { const next = btn.className !== 'on'; btn.className = next ? 'on' : ''; onToggle(next); });
    return btn;
  }
  function colorInput(value, onChange) {
    const el = document.createElement('input');
    el.type = 'color'; el.value = value;
    el.addEventListener('input', () => onChange(el.value));
    return el;
  }
  function syncWordFromCaps() { wordInput.value = caps.map((c) => c.text).join(''); }

  function appendCap(char, { colorfulEmoji = false } = {}) {
    caps.push(makeCap(char, { colorfulEmoji }));
    syncWordFromCaps();
    renderCapList();
    rebuild();
  }

  const addBtn = document.createElement('button');
  addBtn.className = 'add-cap-btn';
  addBtn.textContent = 'Add Cap';
  addBtn.addEventListener('click', () => appendCap('?'));
  capListEl.after(addBtn);

  // ---------- Quick-insert symbols & emoji ----------
  // Each cap is already just one character, so "adding a symbol/emoji" is
  // exactly the same operation as Add Cap above — this is a curated
  // shortcut for people who don't know (or don't want to look up) the
  // keyboard combo for typing them directly into the word field. Symbols
  // keep the ordinary single (user-chosen) legend color; emoji are marked
  // colorfulEmoji so their legend renders in up to 3 of their own native
  // colors instead (see rasterizeLegend in textVoxel.js).
  const QUICK_INSERT_SYMBOLS = [
    '★', '♥', '♦', '♣', '♠', '☆', '✓', '✗',
    '№', '§', '©', '®', '™', '°', '&', '@',
    '#', '%', '+', '=', '∞', '♪', '☀', '☂',
  ];
  const QUICK_INSERT_EMOJI = [
    // Faces & emotions
    '😀', '😂', '😅', '😊', '😍', '🥰', '😘', '😜',
    '🤔', '😴', '😭', '😢', '😡', '🥳', '🤩', '😎',
    '🙄', '😳', '🤗', '😇', '🥺', '😱', '🤣', '😆',
    // Hearts & hands
    '❤️', '💕', '💖', '💯', '👍', '👎', '👏', '🙏',
    '✌️', '🤞', '👋', '💪',
    // Animals
    '🐶', '🐱', '🐭', '🐰', '🦊', '🐻', '🐼', '🐨',
    '🐸', '🐷', '🦄', '🐵',
    // Food & drink
    '🍕', '🍔', '🍟', '🌮', '🍰', '🎂', '🍩', '🍦',
    '🍺', '☕',
    // Nature & weather
    '🌙', '⭐', '🌈', '⚡', '🔥', '❄️', '🌊', '🌟',
    // Activities & objects
    '🎉', '🎊', '🎈', '🎁', '🎮', '🎵', '🎧', '⚽',
    '🏀', '🚀', '✈️', '🚗', '💰', '📱', '💻', '🏆',
    // Misc
    '💀', '👻', '👑', '💩', '✨',
  ];
  const quickInsertEl = document.getElementById('quickInsert');
  for (const ch of QUICK_INSERT_SYMBOLS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = ch;
    btn.title = `Add "${ch}" as a new cap`;
    btn.addEventListener('click', () => appendCap(ch));
    quickInsertEl.appendChild(btn);
  }
  for (const ch of QUICK_INSERT_EMOJI) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = ch;
    btn.title = `Add "${ch}" as a new cap (up to 3 colors)`;
    btn.addEventListener('click', () => appendCap(ch, { colorfulEmoji: true }));
    quickInsertEl.appendChild(btn);
  }

  // ---------- Global shape & size ----------
  document.getElementById('shapeSelect').addEventListener('change', (e) => {
    shape = e.target.value;
    caps.forEach((c) => { c.shape = shape; });
    renderCapList();
    rebuild();
  });

  function bindSlider(id, key, unit, decimals = 1) {
    const input = document.getElementById(id);
    const output = input.nextElementSibling;
    input.addEventListener('input', () => {
      settings[key] = parseFloat(input.value);
      output.textContent = `${settings[key].toFixed(decimals)}${unit}`;
      rebuild();
    });
  }
  bindSlider('capWidth', 'capWidthMM', 'mm');
  bindSlider('capTopWidth', 'capTopWidthMM', 'mm');
  bindSlider('capHeight', 'capHeightMM', 'mm');
  bindSlider('wallThickness', 'wallThicknessMM', 'mm');
  bindSlider('cornerRadius', 'cornerRadiusMM', 'mm');
  bindSlider('topBevel', 'topBevelMM', 'mm');
  bindSlider('bottomBevel', 'bottomBevelMM', 'mm');
  bindSlider('legendDepth', 'legendDepthMM', 'mm');
  bindSlider('legendSize', 'legendSizeFraction', '×', 2);
  bindSlider('baseFootprint', 'baseFootprintMM', 'mm');
  bindSlider('baseThickness', 'baseThicknessMM', 'mm');
  bindSlider('plateHole', 'plateHoleMM', 'mm', 2);
  bindSlider('clearanceHeight', 'clearanceHeightMM', 'mm');
  bindSlider('plateThickness', 'plateThicknessMM', 'mm');
  bindSlider('clearance', 'clearanceMM', 'mm', 2);
  bindSlider('recessDepth', 'recessDepthMM', 'mm');
  bindSlider('baseTopBevel', 'baseTopBevelMM', 'mm');
  bindSlider('baseBottomBevel', 'baseBottomBevelMM', 'mm');
  bindSlider('keyringOuter', 'keyringOuterMM', 'mm');
  bindSlider('keyringHole', 'keyringHoleMM', 'mm');

  document.getElementById('baseColor').addEventListener('input', (e) => { settings.baseColorHex = e.target.value; rebuild(); });
  document.getElementById('joinedBase').addEventListener('change', (e) => { settings.joinedBase = e.target.checked; rebuild(); });
  document.getElementById('verticalLayout').addEventListener('change', (e) => { settings.verticalLayout = e.target.checked; rebuild(); });
  document.getElementById('keyringStyle').addEventListener('change', (e) => { settings.keyringStyle = e.target.value; rebuild(); });
  document.getElementById('keyringSide').addEventListener('change', (e) => { settings.keyringSide = e.target.value; rebuild(); });

  // ---------- Exploded view ----------
  const explodedToggle = document.getElementById('explodedToggle');
  const explodeSlider = document.getElementById('explodeSlider');
  explodedToggle.addEventListener('change', () => {
    explodedView = explodedToggle.checked;
    explodeSlider.disabled = !explodedView;
    rebuild();
  });
  explodeSlider.addEventListener('input', () => { explodeDistance = parseFloat(explodeSlider.value); rebuild(); });

  // ---------- Reset view ----------
  document.getElementById('resetViewBtn').addEventListener('click', () => viewport.frameToModel(true));

  // ---------- Export ----------
  let exportFormat = 'stl';
  document.querySelectorAll('#formatToggle .fmt').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#formatToggle .fmt').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      exportFormat = btn.dataset.fmt;
    });
  });

  // Where each cap goes for the exported file — deliberately different from
  // where it sits in the live preview. On screen, caps sit stacked on top
  // of their base socket, matching how the finished keychain actually
  // looks. But that's not how you'd want the *file* laid out: caps need to
  // sit flat on the print bed as their own separate parts, not floating in
  // mid-air above the base. This arranges them in a line clear of the
  // base's footprint instead — to the side for a vertical layout, above for
  // a horizontal one — so the exported file is print-ready without needing
  // to be manually rearranged in a slicer first.
  function computeExportLayout() {
    const count = caps.length;
    const centers = capCenters(count, settings);
    const footprint = settings.baseFootprintMM;
    const margin = footprint * 0.6;
    const gap = 2;
    const xs = centers.map((c) => c.x).concat(0), ys = centers.map((c) => c.y).concat(0);
    const baseMaxX = Math.max(...xs) + footprint / 2;
    const baseMinX = Math.min(...xs) - footprint / 2;
    const baseMaxY = Math.max(...ys) + footprint / 2;

    const positions = [];
    if (settings.verticalLayout) {
      const startX = baseMaxX + margin;
      for (let i = 0; i < count; i++) positions.push({ x: startX + i * (settings.capWidthMM + gap), y: 0 });
    } else {
      const startX = baseMinX;
      const lineY = baseMaxY + margin;
      for (let i = 0; i < count; i++) positions.push({ x: startX + i * (settings.capWidthMM + gap), y: lineY });
    }
    return positions;
  }

  function exportFileBaseName() {
    const raw = caps.map((c) => c.text).join('') || 'keycapforge';
    return raw.replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  document.getElementById('exportBtn').addEventListener('click', () => {
    const baseMesh = buildBase(caps, settings);
    const exportPositions = computeExportLayout();
    const fileBase = exportFileBaseName();

    const combined = new Mesh();
    combined.append(baseMesh);
    const threeMFObjects = [{ mesh: baseMesh, colorHex: settings.baseColorHex, name: 'base', translation: [0, 0, 0] }];

    caps.forEach((cap, i) => {
      const { body, legendParts } = buildKeycap(cap, settings);
      const { x, y } = exportPositions[i];
      // Flipping top-face-down only makes sense for legend styles whose
      // top surface is actually flat. 'engraved' (flush, the default) and
      // 'shineThrough' (legend sits entirely below topZ, so the cap
      // body's own top face is just as flat as with 'engraved') both
      // qualify. 'embossed' genuinely protrudes above topZ — flipping it
      // face-down would recreate exactly the problem this whole feature
      // exists to avoid: the raised letters becoming the lowest points
      // touching the bed, with the flat background suspended above them
      // needing support to bridge across. So an embossed cap stays
      // rim-down, unflipped, the same orientation as before this feature
      // existed and the same as the live preview.
      const shouldFlip = cap.legendStyle !== 'embossed';
      const orient = (mesh) => (shouldFlip ? mesh.flippedForPrint(settings.capHeightMM) : mesh);
      const flippedBody = orient(body);
      combined.append(flippedBody, x, y, 0);
      const label = cap.text || String(i);
      threeMFObjects.push({ mesh: flippedBody, colorHex: cap.bodyColorHex, name: `cap_${i}_${label}_body`, translation: [x, y, 0] });
      // One object per legend part for 3MF (up to 3 distinct colors for a
      // colorfulEmoji cap); STL has no color anyway, so every part just
      // merges into the one combined mesh regardless of how many there are.
      legendParts.forEach((part, j) => {
        const flippedPart = orient(part.mesh);
        combined.append(flippedPart, x, y, 0);
        threeMFObjects.push({ mesh: flippedPart, colorHex: part.colorHex, name: `cap_${i}_${label}_legend_${j}`, translation: [x, y, 0] });
      });
    });

    if (exportFormat === 'stl' || exportFormat === 'both') {
      // Welded once, right before export — every triangle built by
      // addTriangle() gets its own brand-new vertex entries, even where
      // it shares a physical edge with a triangle built moments earlier,
      // so nothing anywhere in this file has ever actually shared a
      // vertex INDEX with anything else. See Mesh.welded() (mesh.js) for
      // why that turned out to be the actual root cause behind a whole
      // string of reported slicing regressions (floating regions, a
      // joined base's own recess/cutout detail vanishing, an object
      // showing exactly triangleCount*3 "open edges") despite this
      // project's own extensive position-based manifoldness checks always
      // passing — those checks were correct about the geometry, and
      // blind to this, since it isn't a geometry defect at all.
      downloadBlob(meshToSTL(combined.welded(), 'KeyCapForge by Cobb3D'), `${fileBase}.stl`);
    }
    if (exportFormat === '3mf' || exportFormat === 'both') {
      // Capped at 4 total distinct colors across the whole file — a set
      // with several multi-color emoji legends (each already limited to 3
      // colors on its own) plus multiple cap bodies plus the base can
      // easily add up to far more distinct colors than a typical
      // multi-material setup actually has filament slots for.
      const MAX_EXPORT_COLORS = 4;
      const limitedObjects = limitDistinctColors(threeMFObjects, MAX_EXPORT_COLORS);
      // Each object welded independently — never merged with another
      // object's vertices, since these are meant to stay separate,
      // independently-colored printable parts (see the earlier
      // <components> revert). See the STL branch above and
      // Mesh.welded() (mesh.js) for why this step is needed at all.
      const weldedObjects = limitedObjects.map((o) => ({ ...o, mesh: o.mesh.welded() }));
      downloadBlob(buildThreeMF(weldedObjects), `${fileBase}.3mf`);
    }
  });

  // ---------- Initial render ----------
  renderCapList();
  rebuild();
  window.__kcfLoaded = true;
  // Canvas text rendering doesn't automatically wait for @font-face fonts
  // to finish loading the way normal DOM text does — without this, the
  // very first render could briefly rasterize with a fallback font instead
  // of the intended Google Font. Rebuilding once fonts are confirmed ready
  // self-corrects that silently.
  document.fonts.ready.then(() => rebuild());
}

main().catch((err) => {
  console.error('KeyCapForge failed to start:', err);
  window.dispatchEvent(new ErrorEvent('error', { message: 'KeyCapForge failed to start: ' + err.message }));
});
