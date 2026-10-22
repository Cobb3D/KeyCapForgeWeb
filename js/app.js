import { ensureThreeLoaded, Viewport, meshToObject3D } from './scene.js';
import { buildKeycap } from './keycapBuilder.js';
import { buildBase, buildBaseParts, capCenters, maxSafeRecessDepth, baseExtentsFor } from './baseBuilder.js';
import { Mesh } from './mesh.js';
import { buildSwitchObject, MX_SWITCH } from './switchModel.js';
import { meshToSTL, downloadBlob } from './stlExport.js';
import { buildThreeMF, buildThreeMFCompressed, limitDistinctColors } from './threeMFExport.js';
import { initBugReport, APP_NAME } from './bugReport.js';
import { initPrintOrder } from './printOrder.js';
import { PRINT_BEDS, bedById, fitsOnBed, DEFAULT_PRINT_BED } from './printBeds.js';
import { initWhatsNew } from './whatsNew.js';
import { initCollapsiblePanels } from './collapsible.js';
import { THEMES, themeCapColors } from './themes.js';
import { camoBase, PATTERN_STYLES } from './camo.js';
import { loadLogoFile } from './logoImport.js';
import { buildLogoClicker } from './logoBuilder.js';

const FONTS = ['Archivo Black', 'Anton', 'Bebas Neue', 'Russo One', 'Oswald', 'Roboto', 'Fjalla One'];

const settings = {
  capWidthMM: 18, capTopWidthMM: 13.5, capHeightMM: 10, wallThicknessMM: 1.4,
  cornerRadiusMM: 1.6, topBevelMM: 0.8, bottomBevelMM: 0.8,
  legendDepthMM: 0.6, legendSizeFraction: 0.62,
  // Emoji in their cap's legend colour, with dark details cut out, instead
  // of up to 3 of their own colours (the '1-color emoji' checkbox).
  emojiOneColor: false,
  stemCavityWidthMM: 4.2, stemCavityThicknessMM: 1.35, stemCavityDepthMM: 3.5,
  // Wall thickness of the stem boss, measured straight out from the end of
  // each cross arm. 0.65mm gives a 5.5mm-diameter boss (4.2mm cross +
  // 2 x 0.65mm), about the size of commercial keycaps' stems.
  stemBossWallMM: 0.65,
  // Solid top of the keycap above its hollow interior.
  topThicknessMM: 1.5,
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
  // Base thickness went 16 -> 17.4 when the floor went 0.6 -> 2.0mm: the extra
  // 1.4mm is added underneath, so the recess, plate, and switch sit exactly
  // where they did relative to the top of the base.
  baseFootprintMM: 21, baseThicknessMM: 17.4, floorThicknessMM: 2.0, plateHoleMM: 14, plateThicknessMM: 1.5,
  clearanceMM: 15.8, clearanceHeightMM: 5.5, joinGapMM: 1.0, joinedBase: true, recessDepthMM: 8.0,
  baseTopBevelMM: 0.8, baseBottomBevelMM: 0.8,
  // Extra thickness on the outside of a fused base (see baseOuterExtraFor).
  baseOuterWallExtraMM: 1.7,
  // Gap on each side between a cap and its recess wall (keyClearanceFor).
  keyClearanceMM: 0.45,
  // Outline of a fused base: see BASE_SHAPES in baseShapes.js.
  baseShape: 'rect',
  keyringStyle: 'lug', keyringSide: 'top', keyringOuterMM: 10.7, keyringHoleMM: 6.6,
  baseColorHex: '#c92a2a', verticalLayout: true,
  // A pattern on the base (camo.js): camo blobs or cow patches, in
  // patternMarks' colours over the base colour, in the patternStyle style.
  // Choosing a patterned theme turns it on with that theme's pattern and
  // colours (themes.js); the checkbox keeps the last ones used.
  // base colour. Turned on by choosing the Camo theme, or by its checkbox.
  // Logo clicker mode (logoImport.js, logoBuilder.js): the logo's longest
  // side, whether it prints in 1 colour, and the cap and 1-colour logo
  // colours.
  logoSizeMM: 28, logoShape: 'outline', logoOneColor: false, logoCapColorHex: '#3b5bdb', logoLegendColorHex: '#ffffff',
  basePattern: false,
  patternStyle: 'camo',
  patternMarks: ['#c2b280', '#5b4632', '#3b4a2a'],
};

let shape = 'square';
// Default starting set ("Cobb"). The word box is filled from this on
// load (see syncWordFromCaps below), so this is the source of truth;
// index.html's value="Cobb" only shows for the moment before the app loads.
let caps = ['C', 'o', 'b', 'b'].map((ch) => makeCap(ch));
let explodedView = false;
// 'letters' (a set of letter caps) or 'logo' (one logo-shaped clicker).
let mode = 'letters';
// The imported logo: { canvas (background removed, cropped), name, hadTransparency }.
let logo = null;
let explodeDistance = 20;
let showSwitches = false; // "Show KeySwitch": only takes effect in exploded view
let activeTheme = null;    // key into THEMES, or null for Custom (see themes.js)
// "Same color for every cap": when on, every cap (including ones added
// later) uses these two colours, and the per-cap colour boxes are hidden.
let sameCapColor = { on: false, body: '#3b5bdb', legend: '#ffffff' };
// Snapshots of the defaults, so bug reports can list only what the user
// changed (a full design is too long to fit in a pre-filled email).
const DEFAULT_SETTINGS = JSON.parse(JSON.stringify(settings));
const DEFAULT_CAP = makeCap('');
const changedFrom = (obj, defaults) => Object.fromEntries(Object.entries(obj).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(defaults[k])));
// Pieces of main()'s state the bug reporter reads (set once main() has them).
const liveState = { viewport: null, getExportFormat: null };

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
  liveState.viewport = viewport;

  // ---------- Print bed (see-through outline in the 3D view) ----------
  // The choice is remembered in this browser only (a per-visitor
  // convenience; it never affects the exported file).
  const BED_KEY = 'keycapforge.printBed';
  const bedSelect = document.getElementById('printBedSelect');
  const bedFitEl = document.getElementById('bedFit');
  let printBed = null;
  for (const b of PRINT_BEDS) {
    const o = document.createElement('option');
    o.value = b.id;
    o.textContent = b.w ? `${b.name} (${b.w} × ${b.d} mm)` : b.name;
    bedSelect.appendChild(o);
  }
  function setPrintBed(id) {
    printBed = bedById(id);
    bedSelect.value = printBed.id;
    viewport.setPrintBed(printBed.w ? printBed : null);
    updateBedFit();
  }
  let savedBed = null;
  try { savedBed = localStorage.getItem(BED_KEY); } catch (e) { savedBed = null; }
  bedSelect.addEventListener('change', () => {
    setPrintBed(bedSelect.value);
    try { localStorage.setItem(BED_KEY, bedSelect.value); } catch (e) { /* storage blocked: just not remembered */ }
  });
  // The parts' footprint as exported (the base, with the caps laid out
  // beside it), set by rebuild()/rebuildLogo().
  let exportFootprint = null;
  function updateBedFit() {
    if (!bedFitEl) return;
    if (!printBed || !printBed.w || !exportFootprint) { bedFitEl.textContent = ''; bedFitEl.className = 'bed-fit'; return; }
    const { w, h } = exportFootprint;
    const fits = fitsOnBed(printBed, w, h);
    bedFitEl.className = 'bed-fit ' + (fits ? 'ok' : 'warn');
    bedFitEl.textContent = fits ? `✓ Fits (parts take ${Math.ceil(w)} × ${Math.ceil(h)} mm)` : `⚠ Too big: parts take ${Math.ceil(w)} × ${Math.ceil(h)} mm`;
    bedFitEl.title = (fits ? 'The exported parts (base, and the caps laid out beside it) fit on this bed.' : 'The exported parts (base, and the caps laid out beside it) need more room than this bed has. Print the caps and base as separate plates, or use fewer keys.')
      + (printBed.note ? ` ${printBed.name} ${printBed.note}.` : '');
  }
  const bboxOf = (mesh, dx = 0, dy = 0) => {
    const v = mesh.vertices; let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < v.length; i += 3) { x0 = Math.min(x0, v[i] + dx); x1 = Math.max(x1, v[i] + dx); y0 = Math.min(y0, v[i + 1] + dy); y1 = Math.max(y1, v[i + 1] + dy); }
    return { x0, x1, y0, y1 };
  };
  const unionBox = (a, b) => ({ x0: Math.min(a.x0, b.x0), x1: Math.max(a.x1, b.x1), y0: Math.min(a.y0, b.y0), y1: Math.max(a.y1, b.y1) });
  function setExportFootprint(box) {
    exportFootprint = box && isFinite(box.x0) ? { w: box.x1 - box.x0, h: box.y1 - box.y0 } : null;
    updateBedFit();
  }
  setPrintBed(savedBed);

  // Pushes the Cross Section / X-Ray checkbox state to the viewport. Looks
  // the elements up itself so it's safe to call from rebuild(), which first
  // runs before the toolbar's event wiring further down.
  function applyViewModes() {
    const section = document.getElementById('sectionToggle');
    const slider = document.getElementById('sectionSlider');
    const xray = document.getElementById('xrayToggle');
    if (!section || !slider || !xray) return;
    viewport.setViewModes({
      crossSection: section.checked,
      cutOffset: parseFloat(slider.value) || 0,
      cutAxis: settings.verticalLayout ? 'x' : 'y',
      xray: xray.checked,
    });
  }

  // The base with camo marks, or null when they're off. Uses the Camo
  // theme's cap colours for the marks, over whatever the base colour is.
  function camoForBase(baseMesh) {
    if (!settings.basePattern) return null;
    return camoBase(baseMesh, settings.baseColorHex, settings.patternMarks, {
      centers: capCenters(caps.length, settings),
      halfFootprint: settings.baseFootprintMM / 2,
      thickness: settings.baseThicknessMM,
    }, PATTERN_STYLES[settings.patternStyle] || PATTERN_STYLES.camo);
  }

  // ---------- Logo clicker ----------
  // The logo clicker is rebuilt only when something it depends on changes
  // (building it takes a fraction of a second, and the preview also
  // rebuilds for view-only changes like exploded view).
  let logoCache = { key: null, result: null };
  function logoBuild() {
    if (!logo) return null;
    const key = JSON.stringify([logo.id, settings]);
    if (logoCache.key !== key) {
      logoCache = { key, result: buildLogoClicker(logo.canvas, settings, {
        sizeMM: settings.logoSizeMM, oneColor: settings.logoOneColor,
        capColorHex: settings.logoCapColorHex, legendColorHex: settings.logoLegendColorHex,
      }) };
    }
    return logoCache.result;
  }

  function rebuildLogo() {
    const group = new THREE.Group();
    const r = logoBuild();
    if (r) {
      group.add(meshToObject3D(THREE, r.base, settings.baseColorHex));
      const explodeZ = explodedView ? explodeDistance : 0;
      let capZ = settings.baseThicknessMM + explodeZ;
      if (explodedView && showSwitches) {
        const switchPlateZ = settings.baseThicknessMM + explodeZ + MX_SWITCH.lowestBelowPlate;
        capZ = switchPlateZ + MX_SWITCH.stemTopAbovePlate + explodeZ;
        const sw = buildSwitchObject(THREE);
        sw.position.set(0, 0, switchPlateZ);
        group.add(sw);
      }
      const bodyObj = meshToObject3D(THREE, r.capBody, settings.logoCapColorHex);
      bodyObj.position.set(0, 0, capZ);
      group.add(bodyObj);
      for (const part of r.capParts) {
        const obj = meshToObject3D(THREE, part.mesh, part.colorHex, { decal: true });
        obj.position.set(0, 0, capZ);
        group.add(obj);
      }
    }
    viewport.setModel(group);
    applyViewModes();
    if (r) viewport.frameToModel();
    if (r) {
      const xs = (poly) => poly.points.map((p) => p[0]);
      const capX = Math.max(...xs(r.outlines.base)) - Math.min(...xs(r.outlines.cap)) + 4; // as in exportLogo
      setExportFootprint(unionBox(bboxOf(r.base), bboxOf(r.capBody, capX, 0)));
    } else setExportFootprint(null);
    updateRecessDepthHint();
  }

  function exportLogo() {
    const r = logoBuild();
    if (!r) { alert('Import a logo image first.'); return; }
    const H = settings.capHeightMM;
    // The cap prints face-down, beside the base.
    const xs = (poly) => poly.points.map((p) => p[0]);
    const capX = Math.max(...xs(r.outlines.base)) - Math.min(...xs(r.outlines.cap)) + 4;
    const fileBase = 'logo_' + (logo.name || 'clicker').replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
    const combined = new Mesh();
    combined.append(r.base);
    // The base goes in as its parts (base + keyring loop, or floor slab +
    // the rest), grouped into one object: see buildThreeMF.
    const objects = r.baseParts.map((p) => ({ mesh: p.mesh, colorHex: settings.baseColorHex, name: p.name, group: 'base', translation: [0, 0, 0] }));
    const body = r.capBody.flippedForPrint(H);
    combined.append(body, capX, 0, 0);
    objects.push({ mesh: body, colorHex: settings.logoCapColorHex, name: 'logo_cap_body', group: 'logo_cap', translation: [capX, 0, 0] });
    r.capParts.forEach((part, j) => {
      const m = part.mesh.flippedForPrint(H);
      combined.append(m, capX, 0, 0);
      objects.push({ mesh: m, colorHex: part.colorHex, name: part.isRim ? 'logo_cap_rim' : `logo_cap_logo_${j}`, group: 'logo_cap', translation: [capX, 0, 0] });
    });
    if (exportFormat === 'stl' || exportFormat === 'both') {
      downloadBlob(meshToSTL(combined.welded(), `${APP_NAME} by Cobb3D`), `${fileBase}.stl`);
    }
    if (exportFormat === '3mf' || exportFormat === 'both') {
      const limited = limitDistinctColors(objects, 4);
      deliver3mf(buildThreeMF(limited.map((o) => ({ ...o, mesh: o.mesh.welded() })), `${APP_NAME} by Cobb3D`), `${fileBase}.3mf`);
    }
  }

  function setMode(next) {
    mode = next;
    document.body.classList.toggle('mode-logo', mode === 'logo');
    for (const b of document.querySelectorAll('#modeToggle button')) b.classList.toggle('active', b.dataset.mode === mode);
    if (mode === 'logo') rebuildLogo(); else rebuild();
    if (mode === 'logo' && logo) viewport.frameToModel(true);
    else if (mode === 'letters') viewport.frameToModel(true);
  }

  // In logo mode the rebuild waits until changes pause for a moment: the
  // traced logo takes up to about a second to build at large sizes, and a
  // slider fires many changes per second while being dragged.
  let logoRebuildTimer = null;
  function rebuild() {
    if (mode === 'logo') {
      clearTimeout(logoRebuildTimer);
      logoRebuildTimer = setTimeout(rebuildLogo, 150);
      return;
    }
    const count = caps.length;
    const centers = capCenters(count, settings);
    const baseMesh = buildBase(caps, settings);

    const group = new THREE.Group();
    const camo = camoForBase(baseMesh);
    group.add(camo
      ? meshToObject3D(THREE, camo.mesh, settings.baseColorHex, { triangleColors: camo.triangleColors })
      : meshToObject3D(THREE, baseMesh, settings.baseColorHex));

    const explodeZ = explodedView ? explodeDistance : 0;

    // Exploded with switches shown, the parts stack with equal gaps of
    // explodeZ: the base, then each switch (its lowest point one gap above the
    // base's top), then each cap (its bottom one gap above the stem's top).
    // Without switches, caps sit one gap above the base, as before. The
    // switch is preview-only; nothing here touches the exported meshes.
    const switchesShown = explodedView && showSwitches;
    let capZ = settings.baseThicknessMM + explodeZ;
    let switchPlateZ = 0;
    let switchTemplate = null;
    if (switchesShown) {
      switchPlateZ = settings.baseThicknessMM + explodeZ + MX_SWITCH.lowestBelowPlate;
      capZ = switchPlateZ + MX_SWITCH.stemTopAbovePlate + explodeZ;
      switchTemplate = buildSwitchObject(THREE);
    }

    caps.forEach((cap, i) => {
      const { body, legendParts } = buildKeycap(cap, settings);
      const z = capZ;
      const { x, y } = centers[i];
      if (switchTemplate) {
        const sw = switchTemplate.clone(); // shares geometry and materials
        sw.position.set(x, y, switchPlateZ);
        group.add(sw);
      }
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
    applyViewModes();
    viewport.frameToModel();
    {
      // Footprint as exported: the base plus each cap where the export
      // lays it out.
      let box = bboxOf(baseMesh);
      const half = settings.capWidthMM / 2;
      for (const p of computeExportLayout()) box = unionBox(box, { x0: p.x - half, x1: p.x + half, y0: p.y - half, y1: p.y + half });
      setExportFootprint(caps.length ? box : null);
    }

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
      recessDepthHintEl.textContent = `Capped to ${maxSafe.toFixed(1)}mm right now, not the ${settings.recessDepthMM.toFixed(1)}mm the slider shows — the floor, switch clearance, and plate need the rest of the base's own thickness. Increase base thickness or reduce switch clearance to get the full amount you've set.`;
      recessDepthHintEl.classList.add('warning');
    } else {
      recessDepthHintEl.textContent = RECESS_DEPTH_DEFAULT_HINT;
      recessDepthHintEl.classList.remove('warning');
    }
  }

  // ---------- Word field ----------
  const wordInput = document.getElementById('wordInput');
  // Browsers (Safari and Firefox especially) refill text boxes with
  // whatever was last typed when a page is reloaded, which could leave this
  // box showing an old word while the model is built from the default set.
  // Setting it from the actual caps on load keeps the two in agreement.
  // syncWordFromCaps is a function declaration further down, so it's
  // already available here.
  syncWordFromCaps();
  // Re-colours the base and every cap from the active theme (no-op when
  // Custom). Called whenever the caps list changes, so added caps continue
  // the theme's pattern and deleting one keeps it in step.
  function applyTheme() {
    if (sameCapColor.on) caps.forEach((cap) => { cap.bodyColorHex = sameCapColor.body; cap.legendColorHex = sameCapColor.legend; });
    if (!activeTheme) return;
    settings.baseColorHex = THEMES[activeTheme].base;
    document.getElementById('baseColor').value = settings.baseColorHex;
    caps.forEach((cap, i) => {
      const c = themeCapColors(activeTheme, i);
      cap.bodyColorHex = c.body;
      cap.legendColorHex = c.legend;
    });
  }
  // A hand-picked colour means the design no longer follows the theme.
  function leaveTheme() {
    if (!activeTheme) return;
    activeTheme = null;
    document.getElementById('themeSelect').value = '';
  }

  function setWord(word) {
    const letters = Array.from(word);
    if (letters.length === 0) { caps = []; renderCapList(); rebuild(); return; }
    const next = letters.map((ch, i) => (i < caps.length ? { ...caps[i], text: ch } : makeCap(ch)));
    caps = next;
    applyTheme();
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
      del.addEventListener('click', () => { caps.splice(i, 1); applyTheme(); syncWordFromCaps(); renderCapList(); rebuild(); });

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
      swatches.append(colorInput(cap.bodyColorHex, (v) => { cap.bodyColorHex = v; leaveTheme(); rebuild(); }), document.createTextNode(' '), colorInput(cap.legendColorHex, (v) => { cap.legendColorHex = v; leaveTheme(); rebuild(); }));
      if (sameCapColor.on) swatches.hidden = true;

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
    applyTheme();
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
    '№', '§', '©', '®', '™', '&', '@',
    '#', '%', '+', '=', '∞', '♪', '☀', '☂',
  ];
  // Each emoji prints in up to 3 of its own colours, so the palette leaves
  // out ones that don't survive that: 🌈 (needs the full spectrum), 😱
  // (loses its blue), and 🌮 (loses its fillings). All the others were
  // reviewed against their 3-colour print versions. (° was removed from
  // the symbols as unwanted.)
  const QUICK_INSERT_EMOJI = [
    // Faces & emotions
    '😀', '😂', '😅', '😊', '😍', '🥰', '😘', '😜',
    '🤔', '😴', '😭', '😢', '😡', '🥳', '🤩', '😎',
    '🙄', '😳', '🤗', '😇', '🥺', '🤣', '😆',
    // Hearts & hands
    '❤️', '💕', '💖', '💯', '👍', '👎', '👏', '🙏',
    '✌️', '🤞', '👋', '💪',
    // Animals
    '🐶', '🐱', '🐭', '🐰', '🦊', '🐻', '🐼', '🐨',
    '🐸', '🐷', '🦄', '🐵', '🐯', '🦁', '🐮', '🐔',
    '🐧', '🐦', '🐤', '🦉', '🦅', '🐺', '🐴', '🐝',
    '🦋', '🐌', '🐞', '🐢', '🐍', '🦖', '🦕', '🐙',
    '🦀', '🐠', '🐬', '🐳', '🦈', '🐊', '🦒', '🐘',
    '🦥', '🦔', '🐹', '🦝', '🦓', '🦩', '🦜', '🐑',
    '🦆', '🦚', '🐾',
    // Food & drink
    '🍕', '🍔', '🍟', '🍰', '🎂', '🍩', '🍦',
    '🍺', '☕',
    // Nature & weather
    '🌙', '⭐', '⚡', '🔥', '❄️', '🌊', '🌟',
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

  // ---------- Same color for every cap ----------
  const sameToggle = document.getElementById('sameCapColor');
  const sameRow = document.getElementById('sameCapColors');
  const allBody = document.getElementById('allCapBody'), allLegend = document.getElementById('allCapLegend');
  function setSameCapColor(on) {
    sameCapColor.on = on;
    sameToggle.checked = on;
    sameRow.hidden = !on;
    if (on) {
      // Start from the first cap's colours, so ticking it changes nothing
      // until a colour is picked.
      if (caps[0]) { sameCapColor.body = caps[0].bodyColorHex; sameCapColor.legend = caps[0].legendColorHex; }
      allBody.value = sameCapColor.body; allLegend.value = sameCapColor.legend;
      leaveTheme();
      applyTheme();
    }
    renderCapList();
    rebuild();
  }
  sameToggle.addEventListener('change', () => setSameCapColor(sameToggle.checked));
  allBody.addEventListener('input', () => { sameCapColor.body = allBody.value; applyTheme(); rebuild(); });
  allLegend.addEventListener('input', () => { sameCapColor.legend = allLegend.value; applyTheme(); rebuild(); });

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
  document.getElementById('emojiOneColor').addEventListener('change', (e) => { settings.emojiOneColor = e.target.checked; rebuild(); });
  bindSlider('baseFootprint', 'baseFootprintMM', 'mm');
  bindSlider('baseOuterWall', 'baseOuterWallExtraMM', 'mm');
  bindSlider('keyClearance', 'keyClearanceMM', 'mm', 2);
  bindSlider('baseThickness', 'baseThicknessMM', 'mm');
  bindSlider('plateHole', 'plateHoleMM', 'mm', 2);
  bindSlider('clearanceHeight', 'clearanceHeightMM', 'mm');
  bindSlider('floorThickness', 'floorThicknessMM', 'mm');
  bindSlider('plateThickness', 'plateThicknessMM', 'mm');
  bindSlider('clearance', 'clearanceMM', 'mm', 2);
  bindSlider('recessDepth', 'recessDepthMM', 'mm');
  bindSlider('baseTopBevel', 'baseTopBevelMM', 'mm');
  bindSlider('baseBottomBevel', 'baseBottomBevelMM', 'mm');
  bindSlider('keyringOuter', 'keyringOuterMM', 'mm');
  bindSlider('keyringHole', 'keyringHoleMM', 'mm');
  bindSlider('stemBossWall', 'stemBossWallMM', 'mm', 2);
  bindSlider('topThickness', 'topThicknessMM', 'mm');

  document.getElementById('baseColor').addEventListener('input', (e) => { settings.baseColorHex = e.target.value; leaveTheme(); rebuild(); });

  // ---------- Themes ----------
  document.getElementById('basePatternToggle').addEventListener('change', (e) => { settings.basePattern = e.target.checked; rebuild(); });
  document.getElementById('themeSelect').addEventListener('change', (e) => {
    activeTheme = e.target.value || null;
    // A theme colours each cap itself, so it turns "same color" off.
    if (activeTheme && sameCapColor.on) setSameCapColor(false);
    // Picking a theme also decides the base's pattern: on, in the theme's
    // own pattern and colours, for patterned themes (camo, cow); off for the
    // others (Custom leaves it as it is).
    if (activeTheme) {
      const { marks, pattern } = THEMES[activeTheme];
      settings.basePattern = !!marks;
      if (marks) { settings.patternMarks = [...marks]; settings.patternStyle = pattern; }
      document.getElementById('basePatternToggle').checked = settings.basePattern;
    }
    // Choosing Custom keeps the current colours as they are.
    if (!activeTheme) return;
    applyTheme();
    renderCapList();
    rebuild();
  });
  const baseShapeSelect = document.getElementById('baseShape');
  const syncBaseShape = () => { baseShapeSelect.disabled = !settings.joinedBase; };
  baseShapeSelect.addEventListener('change', (e) => { settings.baseShape = e.target.value; rebuild(); });
  document.getElementById('joinedBase').addEventListener('change', (e) => { settings.joinedBase = e.target.checked; syncBaseShape(); rebuild(); });
  syncBaseShape();
  document.getElementById('verticalLayout').addEventListener('change', (e) => { settings.verticalLayout = e.target.checked; rebuild(); });
  document.getElementById('keyringStyle').addEventListener('change', (e) => { settings.keyringStyle = e.target.value; rebuild(); });
  document.getElementById('keyringSide').addEventListener('change', (e) => { settings.keyringSide = e.target.value; rebuild(); });

  // ---------- Exploded view ----------
  const explodedToggle = document.getElementById('explodedToggle');
  const explodeSlider = document.getElementById('explodeSlider');
  const switchToggle = document.getElementById('switchToggle');
  explodedToggle.addEventListener('change', () => {
    explodedView = explodedToggle.checked;
    explodeSlider.disabled = !explodedView;
    switchToggle.disabled = !explodedView;
    rebuild();
  });
  // Adding or removing the switches changes the stack's height a lot, so
  // re-fit the camera to it (the same as pressing Reset View).
  switchToggle.addEventListener('change', () => {
    showSwitches = switchToggle.checked;
    rebuild();
    viewport.frameToModel(true);
  });

  // Cross Section / X-Ray: preview-only view modes (see setViewModes in
  // scene.js). The cut runs along the row of caps, through their centres by
  // default, so it passes through every socket, stem, and recess: across X
  // for a vertical layout, across Y for a horizontal one.
  const sectionToggle = document.getElementById('sectionToggle');
  const sectionSlider = document.getElementById('sectionSlider');
  const xrayToggle = document.getElementById('xrayToggle');
  sectionToggle.addEventListener('change', () => {
    sectionSlider.disabled = !sectionToggle.checked;
    applyViewModes();
    // Turn the camera to face the cut (the default view is top-down, which
    // would see it edge-on); turning it off goes back to the default view.
    if (sectionToggle.checked) viewport.viewFrom(settings.verticalLayout ? [1, 0, 0.35] : [0, -1, 0.35]);
    else viewport.frameToModel(true);
  });
  sectionSlider.addEventListener('input', applyViewModes);
  xrayToggle.addEventListener('change', applyViewModes);
  explodeSlider.addEventListener('input', () => { explodeDistance = parseFloat(explodeSlider.value); rebuild(); });

  // ---------- Reset view ----------
  document.getElementById('resetViewBtn').addEventListener('click', () => viewport.frameToModel(true));

  // ---------- Export ----------
  let exportFormat = 'stl';
  liveState.getExportFormat = () => exportFormat;
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
    const ext = baseExtentsFor(count, settings);
    const baseMaxX = ext.maxX;
    const baseMinX = ext.minX;
    const baseMaxY = ext.maxY;

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

  document.getElementById('exportBtn').addEventListener('click', () => runExport());
  function runExport() {
    if (mode === 'logo') { exportLogo(); return; }
    const baseMesh = buildBase(caps, settings);
    const exportPositions = computeExportLayout();
    const fileBase = exportFileBaseName();

    const combined = new Mesh();
    combined.append(baseMesh);
    // The 3MF gets the base with its camo marks as per-triangle colours;
    // the STL (no colour) keeps the plain base.
    const camo = camoForBase(baseMesh);
    // Without camo marks the base goes in as its parts (base + keyring
    // loop, or floor slab + the rest), grouped into one object: see
    // buildThreeMF.
    const threeMFObjects = camo
      ? [{ mesh: camo.mesh, triangleColors: camo.triangleColors, colorHex: settings.baseColorHex, name: 'base', translation: [0, 0, 0] }]
      : buildBaseParts(caps, settings).map((p) => ({ mesh: p.mesh, colorHex: settings.baseColorHex, name: p.name, group: 'base', translation: [0, 0, 0] }));

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
      threeMFObjects.push({ mesh: flippedBody, colorHex: cap.bodyColorHex, name: `cap_${i}_${label}_body`, group: `cap_${i}_${label}`, translation: [x, y, 0] });
      // One object per legend part for 3MF (up to 3 distinct colors for a
      // colorfulEmoji cap); STL has no color anyway, so every part just
      // merges into the one combined mesh regardless of how many there are.
      legendParts.forEach((part, j) => {
        const flippedPart = orient(part.mesh);
        combined.append(flippedPart, x, y, 0);
        threeMFObjects.push({ mesh: flippedPart, colorHex: part.colorHex, name: `cap_${i}_${label}_legend_${j}`, group: `cap_${i}_${label}`, translation: [x, y, 0] });
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
      downloadBlob(meshToSTL(combined.welded(), `${APP_NAME} by Cobb3D`), `${fileBase}.stl`);
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
      deliver3mf(buildThreeMF(weldedObjects, `${APP_NAME} by Cobb3D`), `${fileBase}.3mf`);
    }
  }

  // "Send to Print" (printOrder.js) needs the same 3MF the Export button
  // makes, as a file rather than a download: while capture3mf is set, the
  // export hands its 3MF to it instead of downloading (and skips the STL).
  let capture3mf = null;
  function deliver3mf(blob, name) {
    if (capture3mf) capture3mf({ blob, name });
    else downloadBlob(blob, name);
  }
  liveState.make3mf = () => {
    let result = null;
    const saved = exportFormat;
    exportFormat = '3mf';
    capture3mf = (r) => { result = r; };
    try { runExport(); } finally { exportFormat = saved; capture3mf = null; }
    return result; // null if there was nothing to export (no logo imported)
  };
  // What the order email says about the design.
  liveState.orderInfo = () => {
    const lines = [];
    if (mode === 'logo') {
      lines.push(`Logo clicker: ${logo ? logo.name : '(no logo)'}`, `Logo size: ${settings.logoSizeMM}mm, cap shape: ${settings.logoShape}`,
        `Cap color ${settings.logoCapColorHex}, logo ${settings.logoOneColor ? 'one color ' + settings.logoLegendColorHex : 'in its own colors'}`);
    } else {
      lines.push(`Keys: ${caps.map((c) => c.text || ' ').join('')} (${caps.length})`);
      caps.forEach((c, i) => lines.push(`  ${i + 1}. "${c.text}" ${c.shape}, cap ${c.bodyColorHex}, letter ${c.colorfulEmoji && !settings.emojiOneColor ? 'emoji colors' : c.legendColorHex}`));
      lines.push(`Base shape: ${settings.joinedBase ? settings.baseShape : 'separate bases'}${activeTheme ? ', theme: ' + activeTheme : ''}`);
    }
    lines.push(`Base color: ${settings.baseColorHex}`, `Keyring: ${settings.keyringStyle}`);
    return {
      title: mode === 'logo' ? 'logo clicker' : caps.map((c) => c.text).join(''),
      summary: lines.join('\n'),
      design: JSON.stringify({ mode, settings: changedFrom(settings, DEFAULT_SETTINGS), caps: mode === 'logo' ? undefined : caps.map((cap) => ({ text: cap.text, ...changedFrom(cap, DEFAULT_CAP) })) }),
    };
  };

  // ---------- Maker tools (only with ?maker) ----------
  // For Cobb3D's own batch printing: one 3MF with a base for each key count
  // (2 to 7 by default) laid out on one plate, from the current base
  // settings. The panel shows when the site is opened with ?maker on the
  // address, and stays on in that browser until "Hide maker tools" (or
  // ?maker=off). It's hidden, not secret: anyone who adds ?maker sees it,
  // and it only exports files.
  {
    const MAKER_KEY = 'keycapforge.maker';
    const q = new URLSearchParams(location.search).get('maker');
    let on = false;
    try {
      if (q === 'off') localStorage.removeItem(MAKER_KEY);
      else if (q !== null) localStorage.setItem(MAKER_KEY, '1');
      on = localStorage.getItem(MAKER_KEY) === '1';
    } catch (e) { on = q !== null && q !== 'off'; }
    const panel = document.getElementById('makerPanel');
    panel.hidden = !on;
    document.getElementById('makerHide').addEventListener('click', (e) => {
      e.preventDefault();
      try { localStorage.removeItem(MAKER_KEY); } catch (err) { /* nothing to forget */ }
      panel.hidden = true;
    });
    const note = document.getElementById('makerNote');
    document.getElementById('makerPlateBtn').addEventListener('click', () => {
      let from = Math.round(Number(document.getElementById('makerFrom').value) || 2);
      let to = Math.round(Number(document.getElementById('makerTo').value) || 7);
      from = Math.max(1, Math.min(12, from)); to = Math.max(1, Math.min(12, to));
      if (from > to) [from, to] = [to, from];
      const shapeSel = document.getElementById('makerBaseShape');
      const shapeOverride = shapeSel ? shapeSel.value : '';
      const plate = buildBasePlate(from, to, shapeOverride);
      deliverPlate(plate, `KeyCapForge_bases_${from}-${to}keys${shapeOverride ? '_' + shapeOverride : ''}.3mf`);
      const fit = printBed && printBed.w ? (fitsOnBed(printBed, plate.w, plate.h) ? `fits on the ${printBed.name}` : `too big for the ${printBed.name}, try a smaller range`) : '';
      note.textContent = `Exported ${to - from + 1} bases (${from} to ${to} keys, ${shapeOverride ? shapeSel.selectedOptions[0].textContent.toLowerCase() : 'Base & Fit shape'}); the plate takes ${Math.ceil(plate.w)} × ${Math.ceil(plate.h)} mm${fit ? ', ' + fit : ''}.`;
    });
  }

  // The bases for `from`..`to` keys, side by side (across the row
  // direction, 6mm apart), centred on the origin, as 3MF objects. Each
  // base is its own object, in parts like the normal export (buildBaseParts),
  // plain even when a camo or cow theme is on.
  function buildBasePlate(from, to, shapeOverride = '') {
    // A shape picked in Maker tools wins over Base & Fit's, and (since
    // shapes are for fused bases) makes the bases fused.
    const settings = shapeOverride ? { ...liveSettings(), baseShape: shapeOverride, joinedBase: true } : liveSettings();
    const GAP = 6;
    const vertical = !!settings.verticalLayout;
    const items = [];
    for (let n = from; n <= to; n++) {
      const fakeCaps = Array.from({ length: n }, () => ({ shape }));
      // Always plain bases: themed (camo / cow) bases are print-to-order
      // and come from the normal Export, never from the plate.
      const parts = buildBaseParts(fakeCaps, settings).map((p) => ({ mesh: p.mesh, name: `base_${n}keys_${p.name}` }));
      let box = null;
      for (const p of parts) box = box ? unionBox(box, bboxOf(p.mesh)) : bboxOf(p.mesh);
      items.push({ n, parts, box });
    }
    // Side by side: across X for a vertical row, down Y for a horizontal one.
    // Each base's near end lined up, so the plate is tidy.
    const objects = [];
    let cursor = 0, x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const it of items) {
      const { box } = it;
      const tx = vertical ? cursor - box.x0 : -box.x0;
      const ty = vertical ? -box.y0 : -(cursor + (box.y1 - box.y0)) - box.y0;
      cursor += (vertical ? box.x1 - box.x0 : box.y1 - box.y0) + GAP;
      x0 = Math.min(x0, box.x0 + tx); x1 = Math.max(x1, box.x1 + tx); y0 = Math.min(y0, box.y0 + ty); y1 = Math.max(y1, box.y1 + ty);
      for (const p of it.parts) objects.push({ ...p, colorHex: settings.baseColorHex, group: `base_${it.n}keys`, translation: [tx, ty, 0] });
    }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    for (const o of objects) o.translation = [o.translation[0] - cx, o.translation[1] - cy, 0];
    return { objects, w: x1 - x0, h: y1 - y0 };
  }
  function deliverPlate(plate, name) {
    const limited = limitDistinctColors(plate.objects, 4);
    downloadBlob(buildThreeMF(limited.map((o) => ({ ...o, mesh: o.mesh.welded() })), `${APP_NAME} by Cobb3D`), name);
  }
  function liveSettings() { return settings; }
  liveState.buildBasePlate = buildBasePlate;

  // Letter caps plate: full sets of `letters` (A..Z) on `plates` print
  // beds, `copies` of each letter in all (or as many as fit), shared out as
  // evenly as possible so each bed holds whole sets and can be printed on
  // its own. Every cap is a copy of the first cap in the set (shape, font,
  // legend style, colors) with its letter changed, oriented for printing
  // like the normal export (face down, except embossed). The back-right
  // corner of each bed is kept free for the prime tower.
  //
  // Each letter is ONE object (body + legend parts) placed as many times as
  // needed (3MF build items sharing the object), so its mesh is in the file
  // once and the slicer shows "A" with all its copies as instances. Beds
  // after the first sit where Bambu Studio puts its plate 2, 3, 4 (1.2 bed
  // widths apart, in its grid). Bambu Studio only keeps plates in its own
  // project files, though, so on opening it moves everything together;
  // Arrange (A) then fills plate 1 and adds the extra plates itself.
  const TOWER_MM = 60; // free square in the back-right corner
  function buildCapsPlate(lettersRaw, copiesWanted, platesWanted = 1) {
    const letters = [...String(lettersRaw || '').toUpperCase().replace(/\s+/g, '')];
    if (!letters.length) return null;
    const plates = Math.max(1, Math.min(4, Math.round(platesWanted) || 1));
    const template = caps[0] || makeCap('A');
    const bed = printBed && printBed.w ? printBed : bedById(DEFAULT_PRINT_BED);
    const GAP = 3, EDGE = 5;
    const shouldFlip = template.legendStyle !== 'embossed';
    const orient = (mesh) => (shouldFlip ? mesh.flippedForPrint(settings.capHeightMM) : mesh);
    const built = new Map();
    let cw = 0, ch = 0;
    for (const L of new Set(letters)) {
      const cap = { ...template, text: L, colorfulEmoji: false };
      const { body, legendParts } = buildKeycap(cap, settings);
      const b = orient(body);
      const parts = [{ mesh: b, colorHex: cap.bodyColorHex, kind: 'body' }]
        .concat(legendParts.map((part) => ({ mesh: orient(part.mesh), colorHex: cap.legendColorHex, kind: 'legend' })));
      const box = bboxOf(b);
      cw = Math.max(cw, box.x1 - box.x0); ch = Math.max(ch, box.y1 - box.y0);
      built.set(L, { parts, cx: (box.x0 + box.x1) / 2, cy: (box.y0 + box.y1) / 2, spots: [] });
    }
    const pitchX = cw + GAP, pitchY = ch + GAP;
    const cols = Math.max(1, Math.floor((bed.w - 2 * EDGE + GAP) / pitchX));
    const rows = Math.max(1, Math.floor((bed.d - 2 * EDGE + GAP) / pitchY));
    const W = cols * pitchX - GAP, H = rows * pitchY - GAP;
    // Cells on one bed (front-left first, row by row) outside the tower
    // corner, relative to the bed's centre.
    const cells = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = -W / 2 + c * pitchX + cw / 2, y = -H / 2 + r * pitchY + ch / 2;
        const inTower = x + cw / 2 > W / 2 - TOWER_MM && y + ch / 2 > H / 2 - TOWER_MM;
        if (!inTower) cells.push({ x, y });
      }
    }
    const setsPerBed = Math.floor(cells.length / letters.length);
    const maxCopies = setsPerBed * plates;
    const base = { objects: [], w: W, h: H, placed: 0, copies: 0, maxCopies, setsPerBed, perPlate: cells.length, bed, plates, used: 0, sets: [] };
    if (setsPerBed < 1) return base;
    const copies = copiesWanted ? Math.min(copiesWanted, maxCopies) : maxCopies;
    // Sets per bed: as even as possible, fullest beds first.
    const sets = Array.from({ length: plates }, (_, i) => Math.floor(copies / plates) + (i < copies % plates ? 1 : 0)).filter((n) => n > 0);
    // Bambu Studio's plate grid: columns = ceil-ish sqrt of the count,
    // each plate 1.2 bed widths/depths from the last, rows going toward -Y.
    const plateCols = (n) => { const v = Math.sqrt(n), r = Math.round(v); return v > r ? r + 1 : r; };
    const pc = plateCols(sets.length);
    let placed = 0;
    sets.forEach((n, pi) => {
      const ox = (pi % pc) * bed.w * 1.2, oy = -Math.floor(pi / pc) * bed.d * 1.2;
      let k = 0;
      for (let s = 0; s < n; s++) {
        for (const L of letters) {
          const cell = cells[k++];
          const it = built.get(L);
          it.spots.push([ox + cell.x - it.cx, oy + cell.y - it.cy, 0]);
          placed++;
        }
      }
    });
    const objects = [];
    for (const [L, it] of built) {
      if (!it.spots.length) continue;
      const group = `cap_${L}`;
      it.parts.forEach((p, j) => objects.push({ mesh: p.mesh, colorHex: p.colorHex, name: p.kind === 'body' ? `${group}_body` : `${group}_legend_${j - 1}`, group, translation: it.spots[0], instances: it.spots }));
    }
    return { ...base, objects, placed, copies, used: sets.length, sets };
  }
  liveState.buildCapsPlate = buildCapsPlate;
  {
    const note = document.getElementById('makerCapsNote');
    const btn = document.getElementById('makerCapsBtn');
    btn.addEventListener('click', async () => {
      const letters = document.getElementById('makerLetters').value;
      const want = Math.round(Number(document.getElementById('makerCopies').value) || 0);
      const platesWanted = Math.round(Number(document.getElementById('makerPlates').value) || 1);
      btn.disabled = true;
      note.textContent = 'Building the caps…';
      await new Promise((r) => setTimeout(r, 30)); // let the note show
      try {
        const plate = buildCapsPlate(letters, want > 0 ? Math.min(99, want) : 0, platesWanted);
        if (!plate) { note.textContent = 'Type the letters to put on the plate first.'; return; }
        if (!plate.placed) { note.textContent = `Not even one set fits: the ${plate.bed.name} bed has room for ${plate.perPlate} caps. Use fewer letters.`; return; }
        const set = [...new Set(String(letters).toUpperCase().replace(/\s+/g, ''))].length;
        const limited = limitDistinctColors(plate.objects, 4);
        const blob = await buildThreeMFCompressed(limited.map((o) => ({ ...o, mesh: o.mesh.welded() })), `${APP_NAME} by Cobb3D`);
        const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
        downloadBlob(blob, `KeyCapForge_caps_${plate.copies}x_${plate.used}plate${plate.used === 1 ? '' : 's'}.3mf`);
        const perBed = plate.sets.map((n, i) => `plate ${i + 1}: ${plural(n, 'set')} (${n * set} caps)`).join(', ');
        const room = plate.copies < plate.maxCopies ? ` There's room for up to ${plate.setsPerBed} sets per plate (${plate.maxCopies} of each letter on ${plural(plate.plates, 'plate')}).` : ` That's as many as fit: ${plural(plate.setsPerBed, 'set')} per plate.`;
        const capped = want > plate.maxCopies ? ` (You asked for ${want}; only ${plate.maxCopies} fit.)` : '';
        const arrange = plate.used > 1 ? ' In Bambu Studio, press Arrange (A) after opening and it puts them on separate plates.' : '';
        note.textContent = `Exported ${plate.placed} caps, ${plate.copies} of each letter, for the ${plate.bed.name}: ${perBed}.${capped}${room} ${(blob.size / 1048576).toFixed(1)} MB.${arrange}`;
      } finally {
        btn.disabled = false;
      }
    });
  }

  // ---------- Logo clicker controls ----------
  for (const b of document.querySelectorAll('#modeToggle button')) b.addEventListener('click', () => setMode(b.dataset.mode));
  const logoFile = document.getElementById('logoFile');
  const logoStatus = document.getElementById('logoStatus');
  document.getElementById('logoImportBtn').addEventListener('click', () => logoFile.click());
  let logoCounter = 0;
  logoFile.addEventListener('change', async () => {
    const file = logoFile.files && logoFile.files[0];
    logoFile.value = ''; // so choosing the same file again still triggers
    if (!file) return;
    logoStatus.textContent = 'Reading the image…';
    logoStatus.className = 'hint';
    try {
      const { canvas, hadTransparency } = await loadLogoFile(file);
      logo = { canvas, name: file.name, hadTransparency, id: ++logoCounter };
      logoStatus.textContent = `${file.name}: ${hadTransparency ? 'transparent background kept' : 'background removed'}.`;
      logoStatus.className = 'hint ok';
      rebuildLogo();
      viewport.frameToModel(true);
    } catch (err) {
      logoStatus.textContent = err.message || String(err);
      logoStatus.className = 'hint error';
    }
  });
  bindSlider('logoSize', 'logoSizeMM', 'mm');
  document.getElementById('logoShape').addEventListener('change', (e) => { settings.logoShape = e.target.value; rebuild(); });
  const logoLegendColorRow = document.getElementById('logoLegendColorRow');
  const syncLogoOneColor = () => { logoLegendColorRow.style.display = settings.logoOneColor ? '' : 'none'; };
  syncLogoOneColor();
  document.getElementById('logoOneColor').addEventListener('change', (e) => { settings.logoOneColor = e.target.checked; syncLogoOneColor(); rebuild(); });
  document.getElementById('logoCapColor').addEventListener('input', (e) => { settings.logoCapColorHex = e.target.value; rebuild(); });
  document.getElementById('logoLegendColor').addEventListener('input', (e) => { settings.logoLegendColorHex = e.target.value; rebuild(); });

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

// Set up before main() so reporting still works if the app fails to start.
// Like the bug reporter, set up before main() so it shows even if the app
// fails to start.
initCollapsiblePanels();
initWhatsNew();

initPrintOrder({
  make3mf: () => liveState.make3mf && liveState.make3mf(),
  orderInfo: () => liveState.orderInfo && liveState.orderInfo(),
});
initBugReport(() => {
  const checked = (id) => !!(document.getElementById(id) && document.getElementById(id).checked);
  return {
    settings: changedFrom(settings, DEFAULT_SETTINGS),
    caps: caps.map((cap) => ({ text: cap.text, ...changedFrom(cap, DEFAULT_CAP) })),
    renderer: liveState.viewport && liveState.viewport.renderer,
    exportFormat: liveState.getExportFormat && liveState.getExportFormat(),
    mode,
    view: { exploded: explodedView, switches: explodedView && showSwitches, crossSection: checked('sectionToggle'), xray: checked('xrayToggle') },
  };
});

main().catch((err) => {
  console.error('KeyCapForge failed to start:', err);
  window.dispatchEvent(new ErrorEvent('error', { message: 'KeyCapForge failed to start: ' + err.message }));
});
