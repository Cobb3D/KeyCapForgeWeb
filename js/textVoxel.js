import { Mesh } from './mesh.js';

// Fonts that ship as a single static weight (their "black"/bold look is
// baked into the only face they have) — requesting a 700 weight on these
// via ctx.font doesn't just fail to make them bolder, it can fail to match
// the loaded @font-face at all, since only one weight was ever fetched.
// That's a font-matching failure specific to canvas text, not a rendering
// bug in the voxelizer — worth knowing if a garbled/wrong-looking legend
// ever shows up again after adding a new font to FONTS in app.js.
const SINGLE_WEIGHT_FONTS = new Set(['Archivo Black', 'Anton', 'Bebas Neue', 'Russo One', 'Fjalla One']);
const loggedCombos = new Set();

// Renders `text` to an offscreen canvas at high resolution using the
// browser's own font rendering (any CSS font-family, including Google
// Fonts loaded via a normal <link> tag), then reads back pixel data to
// build a small "inside/outside" grid. This sidesteps font-file parsing
// entirely — the same trick the native app fell back to for tricky letter
// counters, applied here to every glyph, which means it can never "lose" a
// hole in a letter (no polygon-with-hole triangulation involved at all).
//
// Returns an ARRAY of { mesh, colorHex } parts, not a single mesh. For
// plain text/symbols (colorful: false, the default) this is always exactly
// one part with colorHex: null — the caller applies its own chosen legend
// color, same as before. For colorful: true (emoji), the canvas is read
// back in full RGB rather than alpha-only, and opaque pixels are grouped
// into up to 3 color clusters via greedy nearest-color merging: repeatedly
// take the most common remaining color as a new cluster's representative,
// absorb every pixel within a color-distance threshold of it, and repeat.
// This naturally degrades to a single cluster for anything that really is
// only one color (a plain symbol rendered through the colorful path would
// just produce one part), so it doesn't need a separate "is this actually
// multicolor" check — it just reflects however many distinct colors were
// actually present.
export function rasterizeLegend(text, { fontFamily, bold, italic, underline, targetWidth, targetHeight, depth, colorful = false }) {
  if (!text) return [];

  const RES = 12; // canvas px per mm — plenty for a legend a few mm tall
  const pad = 8; // px padding so strokes near the edge aren't clipped

  const probe = document.createElement('canvas').getContext('2d');
  const weight = SINGLE_WEIGHT_FONTS.has(fontFamily) ? '400' : (bold ? '700' : '400');
  const styleStr = italic ? 'italic' : 'normal';
  const sizePx = 200;
  probe.font = `${styleStr} ${weight} ${sizePx}px "${fontFamily}"`;
  const metrics = probe.measureText(text);
  const textWidthPx = Math.max(metrics.width, 1);
  // Nullish coalescing (??), not ||, for every one of these metrics: 0 is a
  // legitimate value for all four (an all-caps word like "LENA" genuinely
  // has ~zero descent; ink can genuinely start exactly at the fillText
  // anchor, making actualBoundingBoxLeft exactly 0), and || treats any
  // falsy value — including a real, correct 0 — as "missing metric, use
  // the fallback instead." That bug is what shoved text noticeably
  // rightward for exactly this kind of text: simple left-aligned capital
  // letters routinely have actualBoundingBoxLeft land at exactly 0, which
  // `|| textWidthPx / 2` was silently overriding with a large bogus value.
  const ascent = metrics.actualBoundingBoxAscent ?? sizePx * 0.75;
  const descent = metrics.actualBoundingBoxDescent ?? sizePx * 0.25;
  const underlineH = underline ? Math.max(sizePx * 0.06, 6) : 0;
  const underlineGap = underline ? sizePx * 0.08 : 0;

  // metrics.width is the font's *advance* width (how far the text cursor
  // moves) — not necessarily the actual visible ink's width. For upright
  // non-italic text in most fonts these are close, but italic slant can
  // make ink overhang the advance box asymmetrically, bold strokes can
  // extend past it, and left/right side bearing is often unequal for an
  // arbitrary string regardless of style. Sizing and centering the canvas
  // around the advance width alone means the drawn ink doesn't necessarily
  // fill that symmetric box evenly, producing legends that are visibly a
  // little off-center without being outright broken. actualBoundingBoxLeft/
  // Right give the TRUE ink extent from the text's anchor point, so
  // centering against those — falling back to the advance-width split when
  // a browser doesn't report them — fixes it.
  const inkLeft = metrics.actualBoundingBoxLeft ?? textWidthPx / 2;
  const inkRight = metrics.actualBoundingBoxRight ?? textWidthPx / 2;
  const inkWidth = Math.max(inkLeft + inkRight, 1);
  // Whichever is wider — the ink or the advance box (which the underline
  // spans) — sets the content width, so neither one clips or forces the
  // other off-center.
  const contentWidth = Math.max(inkWidth, textWidthPx);

  const canvasW = Math.ceil(contentWidth) + pad * 2;
  const canvasH = Math.ceil(ascent + descent + underlineH + underlineGap) + pad * 2;

  const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext('2d');
  ctx.font = `${styleStr} ${weight} ${sizePx}px "${fontFamily}"`;
  // Ignored by color-emoji glyphs, which always draw their own native
  // colors regardless of fillStyle — this only matters for the plain-text
  // path, where it's what makes the alpha-only silhouette technique work.
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'alphabetic';
  const baselineY = pad + ascent;
  // Positions the fillText anchor so the ACTUAL ink — not the advance box —
  // ends up centered within contentWidth (itself centered in the canvas via
  // the symmetric pad on each side).
  const fillX = pad + (contentWidth - inkWidth) / 2 + inkLeft;
  ctx.fillText(text, fillX, baselineY);
  if (underline) {
    // The underline spans the advance width, centered the same way — a
    // slight overshoot past tight ink bounds is normal for underlines.
    const underlineX = pad + (contentWidth - textWidthPx) / 2;
    ctx.fillRect(underlineX, baselineY + underlineGap, textWidthPx, underlineH);
  }

  const { data } = ctx.getImageData(0, 0, canvasW, canvasH);
  const alphaAt = (px, py) => {
    if (px < 0 || py < 0 || px >= canvasW || py >= canvasH) return 0;
    return data[(py * canvasW + px) * 4 + 3];
  };
  const rgbAt = (px, py) => {
    const i = (py * canvasW + px) * 4;
    return [data[i], data[i + 1], data[i + 2]];
  };

  const threshold = 96;
  const isInside = (px, py) => alphaAt(px, py) > threshold;

  // The scale factor below is computed from the ACTUAL rendered opaque
  // pixels, not from canvasW/canvasH (which come from font metrics) —
  // this is what fixes emoji rendering wildly oversized. canvasW/H are
  // sized from ascent/descent/textWidthPx, all reported by
  // probe.measureText(). For ordinary text those metrics closely track
  // what's actually drawn, since the requested font itself defines the
  // glyph. But an emoji isn't drawn by the requested font at all — it's
  // substituted via the browser's separate system emoji fallback, which
  // draws a color bitmap/COLR glyph that doesn't necessarily follow the
  // same metric conventions as a vector glyph in the originally-requested
  // font. When those metrics don't match what's actually on the canvas,
  // canvasW/H end up wrong, and since the mesh's scale is derived from
  // dividing targetWidth/Height by canvasW/H, a wrong (typically much too
  // small) canvas size produces a wrong (much too large) scale — legends
  // coming out far bigger than intended, exactly as reported. Measuring
  // the real opaque bounding box sidesteps font-metric reliability
  // entirely: the mesh always ends up sized to whatever pixels actually
  // got drawn, regardless of what the font claims about itself.
  let minPX = canvasW, maxPX = -1, minPY = canvasH, maxPY = -1;
  for (let py = 0; py < canvasH; py++) {
    for (let px = 0; px < canvasW; px++) {
      if (!isInside(px, py)) continue;
      if (px < minPX) minPX = px;
      if (px > maxPX) maxPX = px;
      if (py < minPY) minPY = py;
      if (py > maxPY) maxPY = py;
    }
  }
  const hasContent = maxPX >= minPX && maxPY >= minPY;
  const contentPxW = hasContent ? (maxPX - minPX + 1) : canvasW;
  const contentPxH = hasContent ? (maxPY - minPY + 1) : canvasH;

  // Sample on a grid sized so the final mm-scale mesh gets a fine cell size
  // (bounded cell COUNT, same reasoning as the native app: cost scales with
  // the glyph's own size, not a fixed constant).
  const targetCellsPerAxis = 160;
  const step = Math.max(1, Math.round(Math.max(canvasW, canvasH) / targetCellsPerAxis));

  if (window.showDiag) {
    const comboKey = `${text}|${fontFamily}|${weight}|${styleStr}|${colorful}`;
    if (!loggedCombos.has(comboKey)) {
      loggedCombos.add(comboKey);
      const fontAvailable = document.fonts.check(`${weight} ${sizePx}px "${fontFamily}"`);
      let opaqueCount = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 96) opaqueCount++;
      window.showDiag(`Legend "${text}": font="${fontFamily}" weight=${weight} loaded=${fontAvailable} canvas=${canvasW}x${canvasH} content=${contentPxW}x${contentPxH} step=${step} opaquePixels=${opaqueCount}/${canvasW * canvasH} colorful=${colorful}`);
    }
  }

  // scale itself comes from the actual content size (see above); meshWidth/
  // Height stay based on the FULL canvas (not just the content) so the
  // existing horizontal/vertical centering — which centers the drawn ink
  // within the whole canvas — is unaffected by this change, just correctly
  // scaled by it.
  const scale = Math.min(targetWidth / (contentPxW / RES), targetHeight / (contentPxH / RES));
  const meshWidth = (canvasW / RES) * scale;
  const meshHeight = (canvasH / RES) * scale;

  // Non-colorful path: exactly one "slot" for everything, color left null
  // for the caller to assign — unchanged from before this feature existed.
  let slotColors = [null];
  let slotOf = () => 0;

  if (colorful) {
    // QUANT merges anti-aliasing noise (a pixel a few shades off from its
    // "true" color at a glyph edge) into the same bucket as that true
    // color, so the histogram below reflects a few dominant colors rather
    // than thousands of near-duplicates.
    const QUANT = 24;
    const freq = new Map();
    for (let py = 0; py < canvasH; py += step) {
      for (let px = 0; px < canvasW; px += step) {
        if (!isInside(px, py)) continue;
        const [r, g, b] = rgbAt(px, py);
        const key = `${Math.round(r / QUANT) * QUANT},${Math.round(g / QUANT) * QUANT},${Math.round(b / QUANT) * QUANT}`;
        freq.set(key, (freq.get(key) || 0) + 1);
      }
    }
    // Greedy clustering: repeatedly take the most frequent remaining color
    // as a new cluster's representative, absorb everything within a color
    // distance of it, repeat up to 3 times. Any pixel left over after 3
    // clusters (rare — only for genuinely 4+ color emoji) gets assigned to
    // whichever cluster is nearest at lookup time in slotOf below, so
    // nothing is ever dropped.
    const remaining = new Map(freq);
    const clusters = [];
    const MERGE_DIST = 70;
    while (clusters.length < 3 && remaining.size > 0) {
      let bestKey = null, bestCount = -1;
      for (const [k, c] of remaining) if (c > bestCount) { bestCount = c; bestKey = k; }
      const [r, g, b] = bestKey.split(',').map(Number);
      clusters.push([r, g, b]);
      for (const k of [...remaining.keys()]) {
        const [kr, kg, kb] = k.split(',').map(Number);
        if (Math.hypot(kr - r, kg - g, kb - b) < MERGE_DIST) remaining.delete(k);
      }
    }
    if (clusters.length === 0) clusters.push([255, 255, 255]);
    slotColors = clusters;
    slotOf = (px, py) => {
      const [r, g, b] = rgbAt(px, py);
      let best = 0, bestD = Infinity;
      for (let i = 0; i < slotColors.length; i++) {
        const [cr, cg, cb] = slotColors[i];
        const d = Math.hypot(r - cr, g - cg, b - cb);
        if (d < bestD) { bestD = d; best = i; }
      }
      return best;
    };
  }

  const meshes = slotColors.map(() => new Mesh());

  // Precomputed once, rather than calling isInside()/slotOf() per pixel
  // per lookup as before — needed so the diagonal-connectivity fix-up
  // below can inspect and correct the grid before any geometry is built
  // from it, and reused by the main loop below for both a cell's own
  // slot and its neighbor checks.
  const gridW = Math.ceil(canvasW / step);
  const gridH = Math.ceil(canvasH / step);
  const slotGrid = new Int8Array(gridW * gridH).fill(-1); // -1 = outside the glyph entirely
  for (let gy = 0; gy < gridH; gy++) {
    for (let gx = 0; gx < gridW; gx++) {
      const px = gx * step, py = gy * step;
      if (isInside(px, py)) slotGrid[gy * gridW + gx] = slotOf(px, py);
    }
  }

  // Diagonal-connectivity fix-up: resolves any 2x2 block of cells where
  // one diagonal pair shares a slot but the other diagonal pair doesn't
  // match it — the only two cells that could connect the pair through a
  // shared FACE, not just a shared corner point. Left alone, the per-face
  // wall logic below places 4 separate wall quads there (2 from each
  // half of the diagonal pair, all facing back toward that one corner)
  // that all converge on a single shared vertical edge, instead of the 2
  // a normal, unambiguous boundary produces elsewhere — a real,
  // non-manifold defect, not just an edge-count anomaly: confirmed
  // directly against a real slicer's own diagnostics. An earlier comment
  // elsewhere in this file called this configuration one real letter or
  // emoji shapes "essentially never" produce — checked directly against
  // all 87 quick-insert emoji and found to be wrong for the colorful
  // (multi-slot) path specifically: 48 of the 87 affected, up to 215
  // non-manifold edges for a single complex emoji (🏀). Color-region
  // boundaries create far more opportunities for this than a plain
  // single-slot glyph's inside/outside boundary ever does, which is
  // presumably why it went unnoticed for plain text and symbols.
  //
  // Fixed by reassigning ONE of the two non-matching bridge cells to the
  // diagonal pair's own slot, turning the diagonal-only connection into
  // a normal, full-face one, before any geometry is built from the grid
  // at all — so the existing, already-verified per-face wall logic below
  // never needs to know this ever happened. At this grid's resolution
  // (roughly 0.05mm per cell for a typical legend), nudging a single
  // pinch-point cell to match its neighbor is far below print-layer
  // resolution, whether that cell was previously a different color or
  // outside the glyph entirely.
  // Repeated to a fixed point (rather than a single pass) — fixing one
  // pinch can shift where the boundary sits by one cell, occasionally
  // revealing a second pinch immediately next to it that a single pass
  // wouldn't catch. Confirmed directly: a single pass alone reduced the
  // total affected-emoji count from 48/87 down to 11/87, but didn't
  // reach zero; iterating to a fixed point (this loop) reaches zero.
  // Converges quickly and safely — each pass only ever turns a mismatched
  // diagonal pair into a matched one, never the reverse, so the total
  // number of mismatches is strictly non-increasing and the loop
  // terminates as soon as a full pass makes no changes at all.
  let changed = true;
  while (changed) {
    changed = false;
    for (let gy = 0; gy < gridH - 1; gy++) {
      for (let gx = 0; gx < gridW - 1; gx++) {
        const tl = slotGrid[gy * gridW + gx];
        const tr = slotGrid[gy * gridW + (gx + 1)];
        const bl = slotGrid[(gy + 1) * gridW + gx];
        const br = slotGrid[(gy + 1) * gridW + (gx + 1)];
        if (tl >= 0 && br >= 0 && tl === br && tr !== tl && bl !== tl) {
          slotGrid[gy * gridW + (gx + 1)] = tl; // fill in the top-right bridge cell
          changed = true;
        } else if (tr >= 0 && bl >= 0 && tr === bl && tl !== tr && br !== tr) {
          slotGrid[gy * gridW + gx] = tr; // fill in the top-left bridge cell
          changed = true;
        }
      }
    }
  }

  const gridSlotAt = (gx, gy) => (gx < 0 || gy < 0 || gx >= gridW || gy >= gridH) ? -1 : slotGrid[gy * gridW + gx];

  // Small-island cleanup: a real, separate defect from the diagonal fix-up
  // above, found investigating a report that one emoji (🚀) still didn't
  // display correctly after that fix — despite that specific emoji coming
  // back with 0 open and 0 non-manifold edges on its own, confirming the
  // problem was a different KIND of defect entirely, not a remaining case
  // of the one already fixed.
  //
  // Traced to something more specific than ordinary anti-aliasing noise:
  // rendering the rocket's own canvas against a dark background (rather
  // than assuming from the RGBA data alone) revealed a faint white
  // "sparkle" decoration baked into the emoji artwork itself — invisible
  // against a white canvas background at any opacity (white-on-white
  // shows nothing regardless of alpha), which is exactly why it never
  // showed up in an ordinary preview. Its peak opacity clears the
  // isInside() alpha threshold, so it gets voxelized as a small, genuinely
  // solid, correctly-manifold island of its own — which a topology check
  // alone (0 open, 0 non-manifold edges) has no way to flag, since a tiny
  // closed box is still a perfectly valid closed box. A subtle
  // translucency effect has no equivalent in an opaque, solid-colored 3D
  // print regardless of why it's small — it would just appear as an
  // unrelated, disconnected fleck floating near the model.
  //
  // Fixed by flood-filling the grid into its actual 4-connected regions
  // (matching the connectivity the wall-building logic below actually
  // uses) and reassigning any region whose own bounding box is smaller
  // than a minimum PHYSICAL size to whichever slot is most common right
  // around its own border — merging each stray fleck into whatever real
  // region it's actually adjacent to, rather than leaving it as its own
  // island. Sized in mm (roughly a typical 3D printer's own nozzle
  // diameter), then converted to a cell count using this specific glyph's
  // own actual cell size — not a fixed cell-count threshold: cell size
  // varies per glyph (canvas size and content both vary), so a fixed cell
  // count doesn't correspond to a fixed physical size across different
  // emoji, and a first attempt using one (6 cells) missed this rocket's
  // own sparkle fragments entirely, confirmed directly. Checked by
  // component bounding box, not total cell count, since a bounding box
  // is what actually determines whether something is print-relevant —
  // total cell count could stay small for a genuinely thin sliver that's
  // still long enough to matter, and would also be a bad size proxy for
  // the very reason a fixed cell count already was: it isn't a physical
  // measurement at all.
  const MIN_FEATURE_MM = 1.0;
  const cellSizeMM = (step / RES) * scale;
  const minCellSpan = Math.max(2, Math.ceil(MIN_FEATURE_MM / cellSizeMM));
  {
    const visited = new Uint8Array(gridW * gridH);
    const idx = (gx, gy) => gy * gridW + gx;
    for (let gy = 0; gy < gridH; gy++) {
      for (let gx = 0; gx < gridW; gx++) {
        const i0 = idx(gx, gy);
        if (visited[i0] || slotGrid[i0] < 0) continue;
        const slot = slotGrid[i0];
        // Flood-fill this component (4-connectivity) via an explicit
        // stack, not recursion — a large emoji region can easily exceed
        // a safe call-stack depth with a recursive flood fill.
        const cells = [i0];
        visited[i0] = 1;
        let head = 0;
        let minGx = gx, maxGx = gx, minGy = gy, maxGy = gy;
        while (head < cells.length) {
          const cur = cells[head++];
          const cx = cur % gridW, cy = (cur / gridW) | 0;
          minGx = Math.min(minGx, cx); maxGx = Math.max(maxGx, cx);
          minGy = Math.min(minGy, cy); maxGy = Math.max(maxGy, cy);
          for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
            const nx = cx + dx, ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= gridW || ny >= gridH) continue;
            const ni = idx(nx, ny);
            if (!visited[ni] && slotGrid[ni] === slot) { visited[ni] = 1; cells.push(ni); }
          }
        }
        const spanGx = maxGx - minGx + 1, spanGy = maxGy - minGy + 1;
        if (spanGx >= minCellSpan || spanGy >= minCellSpan) continue; // real feature in at least one dimension — keep as-is
        // Too small — find the most common slot among cells bordering
        // this component (excluding the component's own cells) and
        // reassign every cell in it to that slot.
        const borderCounts = new Map();
        for (const cur of cells) {
          const cx = cur % gridW, cy = (cur / gridW) | 0;
          for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
            const nx = cx + dx, ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= gridW || ny >= gridH) continue;
            const ni = idx(nx, ny);
            if (slotGrid[ni] === slot) continue; // part of this same component
            borderCounts.set(slotGrid[ni], (borderCounts.get(slotGrid[ni]) || 0) + 1);
          }
        }
        if (borderCounts.size === 0) continue; // isolated with no border at all (shouldn't happen in practice) — leave as-is rather than guess
        let bestSlot = slot, bestCount = -1;
        for (const [s, c] of borderCounts) if (c > bestCount) { bestCount = c; bestSlot = s; }
        for (const cur of cells) slotGrid[cur] = bestSlot;
      }
    }
  }

  for (let gy = 0; gy < gridH; gy++) {
    for (let gx = 0; gx < gridW; gx++) {
      const slot = gridSlotAt(gx, gy);
      if (slot < 0) continue;
      const px = gx * step, py = gy * step;
      const mesh = meshes[slot];
      // Canvas Y grows downward; mesh Y should grow upward, and we center
      // the whole run on the origin.
      const x0 = (px / RES) * scale - meshWidth / 2;
      const x1 = ((px + step) / RES) * scale - meshWidth / 2;
      const yTop = meshHeight / 2 - (py / RES) * scale;
      const yBot = meshHeight / 2 - ((py + step) / RES) * scale;
      const y0 = Math.min(yTop, yBot), y1 = Math.max(yTop, yBot);

      // A wall is needed wherever the neighbor in that direction ISN'T
      // solid material belonging to this same mesh — either because it's
      // outside the glyph entirely, or (for a colorful emoji) because it's
      // inside the glyph but assigned to a different color's mesh, which
      // needs its own independent watertight boundary there too.
      const needsWall = (ngx, ngy) => gridSlotAt(ngx, ngy) !== slot;

      // Top and bottom stay unconditional: two side-by-side cells' top
      // faces are coplanar neighbors forming one continuous flat surface,
      // not overlapping duplicates, regardless of what's beside them.
      // (An earlier version of this function made all 6 faces
      // unconditional after a buggy neighbor-check produced disconnected-
      // looking letters. That bug turned out to be a coordinate mix-up —
      // Y is flipped between canvas and mesh space here, and the two
      // vertical-direction walls below were paired with the wrong edge:
      // this cell's y1 is computed from its OWN py, so it faces the
      // neighbor at py-step, not py+step. Verified this time with an
      // actual manifoldness test — building known shapes, including ones
      // with holes and notches, and checking every edge is shared by
      // exactly 2 triangles — rather than trusting hand-derived reasoning
      // alone a third time.)
      mesh.addQuad([x0, y0, depth], [x1, y0, depth], [x1, y1, depth], [x0, y1, depth]); // top
      mesh.addQuad([x0, y1, 0], [x1, y1, 0], [x1, y0, 0], [x0, y0, 0]); // bottom
      if (needsWall(gx - 1, gy)) mesh.addQuad([x0, y0, 0], [x0, y0, depth], [x0, y1, depth], [x0, y1, 0]); // -X
      if (needsWall(gx + 1, gy)) mesh.addQuad([x1, y1, 0], [x1, y1, depth], [x1, y0, depth], [x1, y0, 0]); // +X
      if (needsWall(gx, gy - 1)) mesh.addQuad([x0, y1, 0], [x0, y1, depth], [x1, y1, depth], [x1, y1, 0]); // faces py-step, at y1
      if (needsWall(gx, gy + 1)) mesh.addQuad([x1, y0, 0], [x1, y0, depth], [x0, y0, depth], [x0, y0, 0]); // faces py+step, at y0
    }
  }

  const toHex = ([r, g, b]) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

  return meshes
    .map((mesh, i) => ({ mesh, colorHex: colorful ? toHex(slotColors[i]) : null }))
    .filter((part) => !part.mesh.isEmpty);
}
