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
// Share of an imported image's extra colour that must be interior (not
// a thin edge band) for it to get its own filament; see the clustering.
const IMAGE_MIN_INTERIOR = 0.3;

// Width / height of the ink of `text` in this font, measured the same way
// rasterizeLegend draws it (same weight and style rules). Cached.
// CIE Lab, for comparing colours the way they look rather than by raw RGB.
function rgbToLab(r, g, b) {
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const R = lin(r), G = lin(g), B = lin(b);
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047);
  const y = f(0.2126 * R + 0.7152 * G + 0.0722 * B);
  const z = f((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
// How different two colours are, counting a difference in lightness for
// less than a difference in hue. Shading on an emoji (the darker side of a
// ball, a highlight) is the same colour lighter or darker, so this puts it
// with its base colour, while a detail in another colour (dark lines, eyes,
// a tongue) still stands apart.
const SHADE_L_WEIGHT = 0.5;
function shadeDist(a, b) {
  const A = rgbToLab(a[0], a[1], a[2]), B = rgbToLab(b[0], b[1], b[2]);
  return Math.hypot((A[0] - B[0]) * SHADE_L_WEIGHT, A[1] - B[1], A[2] - B[2]);
}

// A highlight (the same colour washed out toward white) differs from its
// base mostly in strength of colour, which shadeDist counts in full. So two
// colours of the same hue (within SAME_HUE_DEG) and not too far apart in
// lightness are shades of each other too, as long as both are real colours
// (greys have no hue to compare).
const SAME_HUE_DEG = 12, SAME_HUE_MAX_DL = 30, MIN_CHROMA = 20;
function sameHueShade(a, b) {
  const A = rgbToLab(a[0], a[1], a[2]), B = rgbToLab(b[0], b[1], b[2]);
  if (Math.hypot(A[1], A[2]) < MIN_CHROMA || Math.hypot(B[1], B[2]) < MIN_CHROMA) return false;
  let dh = Math.abs(Math.atan2(A[2], A[1]) - Math.atan2(B[2], B[1])) * 180 / Math.PI;
  if (dh > 180) dh = 360 - dh;
  return dh < SAME_HUE_DEG && Math.abs(A[0] - B[0]) < SAME_HUE_MAX_DL;
}
// Whether colour p sits on the straight line between colours a and b: the
// blend of the two that anti-aliasing leaves along their shared edge.
function blendOf(p, a, b) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const len2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2];
  if (len2 < 1) return false;
  const t = (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / len2;
  if (t < 0.15 || t > 0.85) return false;
  return Math.hypot(ap[0] - t * ab[0], ap[1] - t * ab[1], ap[2] - t * ab[2]) < 40;
}

const aspectCache = new Map();
export function glyphAspect(text, { fontFamily, bold, italic }) {
  const weight = SINGLE_WEIGHT_FONTS.has(fontFamily) ? '400' : (bold ? '700' : '400');
  const style = italic ? 'italic' : 'normal';
  const key = `${text}|${fontFamily}|${weight}|${style}`;
  if (aspectCache.has(key)) return aspectCache.get(key);
  const c = document.createElement('canvas').getContext('2d');
  c.font = `${style} ${weight} 200px "${fontFamily}"`;
  const m = c.measureText(text);
  const w = (m.actualBoundingBoxLeft ?? 0) + (m.actualBoundingBoxRight ?? m.width);
  const h = (m.actualBoundingBoxAscent ?? 150) + (m.actualBoundingBoxDescent ?? 0);
  const aspect = h > 0 ? w / h : 1;
  // Only cache once the font has loaded, or a fallback font's shape sticks.
  if (document.fonts.check(c.font)) aspectCache.set(key, aspect);
  return aspect;
}

export function rasterizeLegend(text, { fontFamily, bold, italic, underline, targetWidth, targetHeight, maxWidth = null, depth, colorful = false, stencil = false, image = null, relief = null }) {
  if (!text && !image) return [];

  const RES = 12; // canvas px per mm — plenty for a legend a few mm tall
  const pad = 8; // px padding so strokes near the edge aren't clipped

  // `image` (a canvas whose background is already transparent, e.g. an
  // imported logo from logoImport.js) is drawn in place of text; everything
  // after this (colour clustering, clean-up passes, meshing, footprint) is
  // shared, so a logo is treated exactly like a colourful emoji.
  let canvasW, canvasH, ctx, weight = '400', styleStr = 'normal';
  if (image) {
    canvasW = image.width + pad * 2;
    canvasH = image.height + pad * 2;
    const canvas = document.createElement('canvas');
    canvas.width = canvasW;
    canvas.height = canvasH;
    ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, pad, pad);
  } else {
    const probe = document.createElement('canvas').getContext('2d');
    weight = SINGLE_WEIGHT_FONTS.has(fontFamily) ? '400' : (bold ? '700' : '400');
    styleStr = italic ? 'italic' : 'normal';
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

    canvasW = Math.ceil(contentWidth) + pad * 2;
    canvasH = Math.ceil(ascent + descent + underlineH + underlineGap) + pad * 2;

    const canvas = document.createElement('canvas');
    canvas.width = canvasW;
    canvas.height = canvasH;
    ctx = canvas.getContext('2d');
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
  // About 160 cells across suits a letter or emoji (around 0.05mm cells on
  // a 10mm cap). An imported logo can be 50mm across, where 160 cells would
  // be 0.3mm each, too coarse for fine lettering, so images get enough
  // cells for about 0.15mm, up to 340 across.
  const targetCellsPerAxis = image ? Math.max(160, Math.min(340, Math.round(Math.max(targetWidth, targetHeight) / 0.15))) : 160;
  const step = Math.max(1, Math.round(Math.max(canvasW, canvasH) / targetCellsPerAxis));

  if (window.showDiag) {
    const comboKey = `${text}|${fontFamily}|${weight}|${styleStr}|${colorful}|${stencil}`;
    if (!loggedCombos.has(comboKey)) {
      loggedCombos.add(comboKey);
      const fontAvailable = image ? 'n/a (image)' : document.fonts.check(`${weight} 200px "${fontFamily}"`);
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
  // maxWidth (when given) lets a wide glyph run wider than targetWidth
  // before it has to shrink, so W and M come out as tall as the other
  // letters instead of being scaled down to fit a square box.
  const widthLimit = Math.max(targetWidth, maxWidth || 0);
  const scale = Math.min(widthLimit / (contentPxW / RES), targetHeight / (contentPxH / RES));
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
    // Emoji only: a candidate colour that's a lighter or darker shade of a
    // colour already picked (shadeDist under SHADE_DIST) doesn't become a
    // colour of its own. It joins that colour (`shadeOf`), so shading
    // prints as one flat colour and the slot it would have used stays free
    // for a real detail colour. Imported logos keep their colours as drawn.
    const SHADE_DIST = 18;
    const shades = []; // { rgb, slot }: extra representatives of a slot
    let totalPx = 0;
    for (const c of freq.values()) totalPx += c;
    while (clusters.length < 3 && remaining.size > 0 && shades.length < 12) {
      let bestKey = null, bestCount = -1;
      for (const [k, c] of remaining) if (c > bestCount) { bestCount = c; bestKey = k; }
      const [r, g, b] = bestKey.split(',').map(Number);
      // Imported images (not emoji): an extra colour must be a real area of
      // the logo, not the thin band of blended pixels along its edges
      // (anti-aliasing, JPEG compression), which would otherwise claim a
      // filament slot for scattered specks. Share alone can't tell them
      // apart (a JPG's edge band measured 2.1% of a logo, a real accent
      // dot 2.7%), but shape can: a band is a pixel or two wide, so almost
      // none of it is interior (with the same colour on all four sides),
      // while a real area mostly is. Rejected candidates are dropped and
      // the next one is tried.
      const thinBand = () => {
        const near = (px, py) => {
          if (px < 0 || py < 0 || px >= canvasW || py >= canvasH || !isInside(px, py)) return false;
          const [pr, pg, pb] = rgbAt(px, py);
          return Math.hypot(pr - r, pg - g, pb - b) < MERGE_DIST / 2;
        };
        let members = 0, interior = 0;
        for (let py = 0; py < canvasH; py += step) for (let px = 0; px < canvasW; px += step) {
          if (!near(px, py)) continue;
          members++;
          if (near(px - step, py) && near(px + step, py) && near(px, py - step) && near(px, py + step)) interior++;
        }
        return members < totalPx * 0.005 || interior < members * IMAGE_MIN_INTERIOR;
      };
      if (image && clusters.length > 0 && thinBand()) {
        for (const k of [...remaining.keys()]) {
          const [kr, kg, kb] = k.split(',').map(Number);
          if (Math.hypot(kr - r, kg - g, kb - b) < MERGE_DIST) remaining.delete(k);
        }
        continue;
      }
      let shadeOf = image ? -1 : clusters.findIndex((c) => shadeDist(c, [r, g, b]) < SHADE_DIST || sameHueShade(c, [r, g, b]));
      // Emoji: the thin band of blended pixels where two picked colours
      // meet (the brown fringe along a basketball's black lines) isn't a
      // colour either. It goes with whichever of the two it's nearer.
      if (!image && shadeOf < 0 && clusters.length >= 2) {
        let isBlend = false;
        for (let i = 0; i < clusters.length && !isBlend; i++) for (let j = i + 1; j < clusters.length; j++) if (blendOf([r, g, b], clusters[i], clusters[j])) { isBlend = true; break; }
        if (isBlend && thinBand()) {
          let bd = Infinity;
          clusters.forEach((c, i) => { const d = Math.hypot(c[0] - r, c[1] - g, c[2] - b); if (d < bd) { bd = d; shadeOf = i; } });
        }
      }
      if (shadeOf >= 0) shades.push({ rgb: [r, g, b], slot: shadeOf });
      else clusters.push([r, g, b]);
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
      for (const sh of shades) {
        const d = Math.hypot(r - sh.rgb[0], g - sh.rgb[1], b - sh.rgb[2]);
        if (d < bestD) { bestD = d; best = sh.slot; }
      }
      return best;
    };
  } else if (stencil) {
    // One-colour emoji: the emoji's shape in a single colour (the cap's
    // legend colour), with its dark details (eyes, mouth) cut out like a
    // stencil, so it stays recognisable. Its plain outline alone would lose
    // them: a smiley would be a filled circle. A pixel counts as a dark
    // detail when it's under half the emoji's median brightness (the
    // brightness of its typical pixel). The median, not the most common
    // colour: a shaded face spreads over several similar yellows, and 😎's
    // flat dark sunglasses out-counted each one, so they were taken as the
    // main colour and nothing got cut. Emoji that are dark overall (a black
    // heart) have a dark median, so they aren't hollowed out. (Cutting only
    // dark areas enclosed by the emoji, keeping ones that touch its edge,
    // was tried too: it lost 😎's sunglasses and blanked the soccer ball
    // and basketball, whose dark lines reach the edge.)
    //
    // Cut-outs are held as a temporary second slot (1) while the
    // diagonal-contact fix-up and small-feature cleanup below run, so they
    // get the same treatment as a colour region (specks under 1mm merged
    // away, no corner-only contacts), and only then turned into holes.
    const lum = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    const lums = [];
    for (let py = 0; py < canvasH; py += step) {
      for (let px = 0; px < canvasW; px += step) {
        if (isInside(px, py)) lums.push(lum(...rgbAt(px, py)));
      }
    }
    lums.sort((a, b) => a - b);
    const medianLum = lums.length ? lums[Math.floor(lums.length / 2)] : 0;
    slotOf = (px, py) => (medianLum > 0.15 && lum(...rgbAt(px, py)) < medianLum * 0.5 ? 1 : 0);
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
  // The same goes for two filled cells of DIFFERENT colours that touch only
  // at a corner, with the other two cells empty: each colour's own mesh is
  // fine, but the pocket the cap body cuts for the legend follows the
  // filled/empty outline, and gets four walls meeting on that one edge
  // (found on 😴 🦀 🍟 🚀). One of the empty cells is filled too.
  const fixDiagonals = () => {
    let changed = true;
    while (changed) {
      changed = false;
      for (let gy = 0; gy < gridH - 1; gy++) {
        for (let gx = 0; gx < gridW - 1; gx++) {
          const tl = slotGrid[gy * gridW + gx];
          const tr = slotGrid[gy * gridW + (gx + 1)];
          const bl = slotGrid[(gy + 1) * gridW + gx];
          const br = slotGrid[(gy + 1) * gridW + (gx + 1)];
          if (tl >= 0 && br >= 0 && ((tl === br && tr !== tl && bl !== tl) || (tr < 0 && bl < 0))) {
            slotGrid[gy * gridW + (gx + 1)] = tl; // fill in the top-right bridge cell
            changed = true;
          } else if (tr >= 0 && bl >= 0 && ((tr === bl && tl !== tr && br !== tr) || (tl < 0 && br < 0))) {
            slotGrid[gy * gridW + gx] = tr; // fill in the top-left bridge cell
            changed = true;
          }
        }
      }
    }
  };
  fixDiagonals();

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

  fixDiagonals(); // the clean-up above can leave new corner contacts

  // Relief (3D emoji): instead of a flat top, the legend's top surface rises
  // above `depth` by a height that depends on how far each point is from the
  // legend's outline, so it stands proud of the cap. `relief` is
  // { lift, rise, round }, in mm:
  //   lift   the straight step up at the outline, the same all round
  //   rise   how much higher than that the surface gets
  //   round  true: the height keeps growing all the way to the middle of
  //          the shape along a quarter-circle curve, so a ball becomes a
  //          dome and an animal's head a pillow, its thin parts (ears, legs)
  //          staying lower. false: the height is reached within
  //          RELIEF_EDGE_MM of the outline and the rest is flat, a raised
  //          plaque with a softened edge.
  // Heights are held per grid CORNER, shared by the cells around it, so the
  // top is one continuous surface across cells and across colours: cells of
  // the same colour need no wall between them, and the wall between two
  // colours has the same top edge on both sides. Corners on the outline sit
  // at exactly `lift`. Measured from the whole silhouette, before the
  // one-colour cut-outs become holes, so eyes and mouths don't dent it.
  let cornerH = null;
  if (relief) {
    const RELIEF_EDGE_MM = 0.45;
    const INF = 1e12;
    // Exact squared distance (in cells) from each cell to the nearest cell
    // outside the legend: Felzenszwalb & Huttenlocher's two-pass transform.
    const d2 = new Float64Array(gridW * gridH);
    for (let i = 0; i < d2.length; i++) d2[i] = slotGrid[i] < 0 ? 0 : INF;
    const pass = (n, get, set) => {
      const v = new Int32Array(n), z = new Float64Array(n + 1), f = new Float64Array(n);
      for (let q = 0; q < n; q++) f[q] = get(q);
      let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
      for (let q = 1; q < n; q++) {
        let sx;
        do { const pq = v[k]; sx = ((f[q] + q * q) - (f[pq] + pq * pq)) / (2 * q - 2 * pq); } while (sx <= z[k] && --k >= 0);
        k++; v[k] = q; z[k] = sx; z[k + 1] = INF;
      }
      k = 0;
      for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; set(q, (q - v[k]) * (q - v[k]) + f[v[k]]); }
    };
    // The canvas edge counts as outside too (a legend never touches it: pad).
    for (let gx = 0; gx < gridW; gx++) pass(gridH, (q) => d2[q * gridW + gx], (q, val) => { d2[q * gridW + gx] = val; });
    for (let gy = 0; gy < gridH; gy++) pass(gridW, (q) => d2[gy * gridW + q], (q, val) => { d2[gy * gridW + q] = val; });
    let maxD = 0;
    const dist = new Float64Array(gridW * gridH);
    for (let i = 0; i < dist.length; i++) {
      // -0.5: the nearest outside cell's edge, not its centre.
      dist[i] = slotGrid[i] < 0 ? 0 : Math.max(0, Math.sqrt(Math.min(d2[i], INF)) - 0.5) * cellSizeMM;
      if (dist[i] > maxD) maxD = dist[i];
    }
    const reach = relief.round ? Math.max(maxD, RELIEF_EDGE_MM) : RELIEF_EDGE_MM;
    let h = new Float64Array(gridW * gridH);
    for (let i = 0; i < h.length; i++) {
      if (slotGrid[i] < 0) continue;
      const t = Math.min(1, dist[i] / reach);
      h[i] = relief.rise * Math.sqrt(1 - (1 - t) * (1 - t));
    }
    // A light blur takes the crease off the ridges where two slopes meet
    // (down the middle of an ear or a leg).
    const blurCells = Math.max(1, Math.round(0.15 / cellSizeMM));
    for (let it = 0; it < 2; it++) {
      const out = new Float64Array(h.length);
      for (let gy = 0; gy < gridH; gy++) for (let gx = 0; gx < gridW; gx++) {
        if (slotGrid[gy * gridW + gx] < 0) continue;
        let sum = 0, n = 0;
        for (let y = Math.max(0, gy - blurCells); y <= Math.min(gridH - 1, gy + blurCells); y++) {
          for (let x = Math.max(0, gx - blurCells); x <= Math.min(gridW - 1, gx + blurCells); x++) { sum += h[y * gridW + x]; n++; }
        }
        out[gy * gridW + gx] = sum / n;
      }
      h = out;
    }
    cornerH = new Float64Array((gridW + 1) * (gridH + 1));
    for (let cy = 0; cy <= gridH; cy++) for (let cx = 0; cx <= gridW; cx++) {
      let sum = 0, edge = false;
      for (const [dx, dy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
        const gx = cx + dx, gy = cy + dy;
        if (gx < 0 || gy < 0 || gx >= gridW || gy >= gridH || slotGrid[gy * gridW + gx] < 0) { edge = true; break; }
        sum += h[gy * gridW + gx];
      }
      cornerH[cy * (gridW + 1) + cx] = relief.lift + (edge ? 0 : sum / 4);
    }
  }

  // One-colour emoji: the cut-outs, held as slot 1 through the clean-ups
  // above, become holes.
  if (stencil) {
    for (let i = 0; i < slotGrid.length; i++) if (slotGrid[i] === 1) slotGrid[i] = -1;
    fixDiagonals();
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
      // Top heights at this cell's four corners: all `depth` for a flat
      // legend, depth + the relief height for a 3D one. Named by mesh
      // corner: y1 is the canvas row gy (upper), y0 the row gy + 1.
      const zc = (cx, cy) => (cornerH ? depth + cornerH[cy * (gridW + 1) + cx] : depth);
      const z00 = zc(gx, gy + 1), z10 = zc(gx + 1, gy + 1), z11 = zc(gx + 1, gy), z01 = zc(gx, gy);
      mesh.addQuad([x0, y0, z00], [x1, y0, z10], [x1, y1, z11], [x0, y1, z01]); // top
      mesh.addQuad([x0, y1, 0], [x1, y1, 0], [x1, y0, 0], [x0, y0, 0]); // bottom
      if (needsWall(gx - 1, gy)) mesh.addQuad([x0, y0, 0], [x0, y0, z00], [x0, y1, z01], [x0, y1, 0]); // -X
      if (needsWall(gx + 1, gy)) mesh.addQuad([x1, y1, 0], [x1, y1, z11], [x1, y0, z10], [x1, y0, 0]); // +X
      if (needsWall(gx, gy - 1)) mesh.addQuad([x0, y1, 0], [x0, y1, z01], [x1, y1, z11], [x1, y1, 0]); // faces py-step, at y1
      if (needsWall(gx, gy + 1)) mesh.addQuad([x1, y0, 0], [x1, y0, z10], [x0, y0, z00], [x0, y0, 0]); // faces py+step, at y0
    }
  }

  const toHex = ([r, g, b]) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

  const parts = meshes
    .map((mesh, i) => ({ mesh, colorHex: colorful ? toHex(slotColors[i]) : null }))
    .filter((part) => !part.mesh.isEmpty);
  // The legend's footprint on its grid: which cells are filled (by any
  // colour) and where the grid lines sit, using exactly the same
  // expressions as the cells above, so geometry built from it lines up with
  // the legend's own walls to the last bit. keycapBuilder uses it to cut a
  // pocket in the cap exactly the legend's shape, so the two parts don't
  // overlap (slicers keep only one of two overlapping parts, and could drop
  // the legend). xAt/yAt accept grid lines just outside the grid too.
  // How far the top rises above `depth` at its highest (0 for a flat legend).
  let reliefHeight = 0;
  if (cornerH) for (let i = 0; i < cornerH.length; i++) if (cornerH[i] > reliefHeight) reliefHeight = cornerH[i];
  parts.reliefHeight = reliefHeight;
  parts.footprint = {
    gridW, gridH,
    filled: (gx, gy) => gridSlotAt(gx, gy) >= 0,
    slotAt: gridSlotAt,
    xAt: (g) => ((g * step) / RES) * scale - meshWidth / 2,
    yAt: (g) => meshHeight / 2 - ((g * step) / RES) * scale,
  };
  return parts;
}
