// Logo clicker, part 1: turning an imported image into a clean logo (its
// background removed) and the outlines the cap and base are built from.
//
// Outlines all come from one signed distance field of the logo's footprint
// on the legend's own grid (the grid rasterizeLegend() builds the logo's
// coloured parts on), so they line up with the printed logo exactly:
//   cap     = logo grown by the rim margin, plus a square around the stem
//             (so the cap always covers the switch, whatever the logo's shape)
//   cavity  = cap shrunk by the wall thickness (the cap's hollow underside)
//   recess  = cap grown by a fit clearance, plus the switch's square
//   base    = recess grown by the base wall
// Each is traced with marching squares, with linear interpolation between
// samples, so edges come out smooth rather than in pixel steps. Holes are
// filled (only the outer boundary is kept): a ring-shaped logo gets a solid
// cap, its centre in the cap colour.

import { Polygon2D } from './mesh.js';
import { profileFor, roundedRect, regularPolygon } from './shapeProfiles.js';

// ---------- 1. Loading the image and removing its background ----------

const MAX_IMAGE_PX = 900; // longest side, after scaling down big images

// Reads an image file (PNG, JPG, SVG, WebP, GIF) and returns a canvas of
// just the logo: background made transparent and cropped to the logo.
// An image with real transparency keeps it. One without (a JPG, or a PNG
// on a solid colour) has its background found from the colour around its
// border and removed by flood-filling inward from the edges, so the same
// colour inside the logo (say, white letters on a white page, if they're
// enclosed by the logo) is kept.
export async function loadLogoFile(file) {
  const img = await loadImage(file);
  let w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  if (!w || !h) throw new Error("That image has no size; it may be an SVG without a width and height.");
  const k = Math.min(1, MAX_IMAGE_PX / Math.max(w, h));
  w = Math.max(1, Math.round(w * k)); h = Math.max(1, Math.round(h * k));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;

  // Transparent background? Count clearly see-through pixels on the border.
  let border = 0, clear = 0;
  const eachBorder = (fn) => {
    for (let x = 0; x < w; x++) { fn(x, 0); fn(x, h - 1); }
    for (let y = 1; y < h - 1; y++) { fn(0, y); fn(w - 1, y); }
  };
  eachBorder((x, y) => { border++; if (d[(y * w + x) * 4 + 3] < 128) clear++; });
  const hadTransparency = clear > border * 0.2;

  if (!hadTransparency) {
    // Background colour: the most common (quantised) border colour.
    const freq = new Map();
    eachBorder((x, y) => {
      const i = (y * w + x) * 4;
      const key = `${d[i] >> 4},${d[i + 1] >> 4},${d[i + 2] >> 4}`;
      freq.set(key, (freq.get(key) || 0) + 1);
    });
    let bgKey = null, best = -1;
    for (const [key, n] of freq) if (n > best) { best = n; bgKey = key; }
    const [br, bg, bb] = bgKey.split(',').map((v) => Number(v) * 16 + 8);
    const TOL = 60; // colour distance counted as background (also takes JPG noise and edge shading)
    const isBg = (i) => Math.hypot(d[i] - br, d[i + 1] - bg, d[i + 2] - bb) < TOL;
    // Flood fill from every background-coloured border pixel.
    const seen = new Uint8Array(w * h);
    const stack = [];
    eachBorder((x, y) => { const p = y * w + x; if (!seen[p] && isBg(p * 4)) { seen[p] = 1; stack.push(p); } });
    while (stack.length) {
      const p = stack.pop();
      d[p * 4 + 3] = 0;
      const x = p % w, y = (p / w) | 0;
      if (x > 0) visit(p - 1);
      if (x < w - 1) visit(p + 1);
      if (y > 0) visit(p - w);
      if (y < h - 1) visit(p + w);
    }
    function visit(q) { if (!seen[q] && isBg(q * 4)) { seen[q] = 1; stack.push(q); } }
    ctx.putImageData(imgData, 0, 0);
  }

  // Crop to the logo itself.
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (d[(y * w + x) * 4 + 3] < 128) continue;
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  if (maxX < 0) throw new Error("Couldn't find a logo in that image: it looks empty, or all background.");
  const out = document.createElement('canvas');
  out.width = maxX - minX + 1; out.height = maxY - minY + 1;
  out.getContext('2d').drawImage(canvas, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
  return { canvas: out, hadTransparency };
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("That file couldn't be opened as an image. Try a PNG or JPG.")); };
    img.src = url;
  });
}

// ---------- 2. Outlines from the logo's footprint ----------

// Sizes (mm) used to derive the outlines.
export const LOGO_FIT = {
  rimMM: 1.2,             // cap rim around the logo
  capSquareMM: 16.8,      // cap always covers this square around the stem:
                          // a 14mm hollow for the switch top + 1.4mm walls
  capSquareRadiusMM: 2.5,
  clearanceMM: 0.3,       // gap between the cap and the base recess
  switchPocketMM: 16.2,   // the switch housing (15.6mm) + 0.3mm each side
  baseWallMM: 2.5,        // base wall around the recess
};

// fp: the logo legend's footprint (rasterizeLegend). Returns the stem
// position (the centre of the logo's area, in the legend's coordinates)
// and the outlines, all as counter-clockwise Polygon2Ds centred on the stem.
export function logoOutlines(fp, settings) {
  const cell = Math.abs(fp.xAt(1) - fp.xAt(0));
  // Cell centres in legend coordinates.
  const cx = (gx) => (fp.xAt(gx) + fp.xAt(gx + 1)) / 2;
  const cy = (gy) => (fp.yAt(gy) + fp.yAt(gy + 1)) / 2;

  // Stem position: the logo's centre of area.
  let sx = 0, sy = 0, n = 0;
  for (let gy = 0; gy < fp.gridH; gy++) for (let gx = 0; gx < fp.gridW; gx++) {
    if (fp.filled(gx, gy)) { sx += cx(gx); sy += cy(gy); n++; }
  }
  if (!n) return null;
  sx /= n; sy /= n;

  // A basic cap shape instead of the logo's outline (settings.logoShape):
  // the shape grows to hold the whole logo with the rim around it, centred
  // on the logo, with the stem at its centre.
  const F0 = LOGO_FIT;
  const shapePoly = settings.logoShape && settings.logoShape !== 'outline' ? fitShape(settings.logoShape, fp, cell, F0) : null;
  if (shapePoly) { sx = shapePoly.centre[0]; sy = shapePoly.centre[1]; }

  // Grid covering everything the outlines can reach: the logo grown by
  // rim + clearance + base wall, and the base square around the stem.
  const F = LOGO_FIT;
  // (+ CLOSE_MAX_MM: room for joining separate pieces of a logo, below)
  const reach = F.rimMM + F.clearanceMM + F.baseWallMM + 1 + CLOSE_MAX_MM;
  const squareReach = Math.max(F.capSquareMM / 2 + F.clearanceMM, F.switchPocketMM / 2) + F.baseWallMM + 1;
  let gx0 = 0, gx1 = fp.gridW - 1, gy0 = 0, gy1 = fp.gridH - 1;
  const padCells = Math.ceil(reach / cell) + 2;
  gx0 -= padCells; gx1 += padCells; gy0 -= padCells; gy1 += padCells;
  // Extend to cover the stem square (xAt grows with gx, yAt shrinks with gy).
  const gxAtX = (x) => Math.floor((x - fp.xAt(0)) / (fp.xAt(1) - fp.xAt(0)));
  const gyAtY = (y) => Math.floor((y - fp.yAt(0)) / (fp.yAt(1) - fp.yAt(0)));
  gx0 = Math.min(gx0, gxAtX(sx - squareReach) - 2); gx1 = Math.max(gx1, gxAtX(sx + squareReach) + 2);
  gy0 = Math.min(gy0, gyAtY(sy + squareReach) - 2); gy1 = Math.max(gy1, gyAtY(sy - squareReach) + 2);
  if (shapePoly) {
    // ...and the shape, plus clearance and base wall.
    const extra = F0.clearanceMM + F0.baseWallMM + 1;
    const xs = shapePoly.points.map((q) => q[0]), ys = shapePoly.points.map((q) => q[1]);
    gx0 = Math.min(gx0, gxAtX(Math.min(...xs) - extra) - 2); gx1 = Math.max(gx1, gxAtX(Math.max(...xs) + extra) + 2);
    gy0 = Math.min(gy0, gyAtY(Math.max(...ys) + extra) - 2); gy1 = Math.max(gy1, gyAtY(Math.min(...ys) - extra) + 2);
  }
  const W = gx1 - gx0 + 1, H = gy1 - gy0 + 1;

  // Signed distance (mm) from each cell centre to the logo's edge:
  // negative inside the logo, positive outside.
  const inside = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const gx = gx0 + i, gy = gy0 + j;
    if (gx >= 0 && gy >= 0 && gx < fp.gridW && gy < fp.gridH && fp.filled(gx, gy)) inside[j * W + i] = 1;
  }
  const sdfOf = (mask) => {
    const dOut = edt(mask, W, H, 1); // distance to the nearest inside cell
    const dIn = edt(mask, W, H, 0);  // distance to the nearest outside cell
    const f = new Float32Array(W * H);
    for (let k = 0; k < W * H; k++) f[k] = mask[k] ? -(Math.sqrt(dIn[k]) - 0.5) * cell : (Math.sqrt(dOut[k]) - 0.5) * cell;
    return f;
  };
  const sdfLogo = sdfOf(inside);

  // Signed distance to a rounded square centred on the stem.
  const sdfSquare = (x, y, size, r) => {
    const qx = Math.abs(x - sx) - (size / 2 - r), qy = Math.abs(y - sy) - (size / 2 - r);
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
  };
  const field = (fn) => {
    const f = new Float32Array(W * H);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) f[j * W + i] = fn(sdfLogo[j * W + i], cx(gx0 + i), cy(gy0 + j));
    return f;
  };
  // Each outline is "where this field is negative".
  let capField = field((s, x, y) => Math.min(s - F.rimMM, sdfSquare(x, y, F.capSquareMM, F.capSquareRadiusMM)));
  if (shapePoly) {
    // The chosen shape (which already holds the logo, its rim, and the
    // switch square).
    const mask = new Uint8Array(W * H);
    const P = shapePoly.points;
    for (let j = 0; j < H; j++) {
      const yc = cy(gy0 + j);
      const xs = [];
      for (let k = 0; k < P.length; k++) {
        const [ax, ay] = P[k], [bx, by] = P[(k + 1) % P.length];
        if ((ay > yc) !== (by > yc)) xs.push(ax + (yc - ay) * (bx - ax) / (by - ay));
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i < W; i++) {
        const xc = cx(gx0 + i);
        let inside = false;
        for (const x of xs) { if (x < xc) inside = !inside; else break; }
        if (inside) mask[j * W + i] = 1;
      }
    }
    const shapeField = sdfOf(mask);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const k = j * W + i;
      capField[k] = Math.min(shapeField[k], sdfSquare(cx(gx0 + i), cy(gy0 + j), F.capSquareMM, F.capSquareRadiusMM));
    }
  }
  // A logo in separate pieces (an icon with text under it, say) gives a cap
  // in separate pieces, and only one can be the cap: the others' logo
  // would be left off it. So the cap is "closed": grown outward by d until
  // it's one piece, then shrunk back by d, which joins the pieces with a
  // smooth bridge and leaves the rim the same width everywhere else. d is
  // the smallest that works, from 0.5mm up to CLOSE_MAX_MM.
  for (const d of [0.5, 1, 1.5, 2, 3, 4, 6, 8, CLOSE_MAX_MM]) {
    if (shapePoly || countPieces(capField, W, H) <= 1) break;
    const grown = new Uint8Array(W * H);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const k = j * W + i;
      if (Math.min(sdfLogo[k] - F.rimMM, sdfSquare(cx(gx0 + i), cy(gy0 + j), F.capSquareMM, F.capSquareRadiusMM)) - d < 0) grown[k] = 1;
    }
    capField = sdfOf(grown).map((v) => v + d);
  }
  const wall = settings.wallThicknessMM;
  const cavityField = capField.map((v) => v + wall);
  const recessField = field((s, x, y) => sdfSquare(x, y, F.switchPocketMM, 0.5));
  for (let k = 0; k < W * H; k++) recessField[k] = Math.min(capField[k] - F.clearanceMM, recessField[k]);
  const baseField = recessField.map((v) => v - F.baseWallMM);

  const toMM = (pi, pj) => [cx(gx0) + pi * cell - sx, cy(gy0) - pj * cell - sy]; // fractional grid -> mm, stem at origin
  const loops = (f) => marchingSquares(f, W, H).map((loop) => loop.map(([pi, pj]) => toMM(pi, pj)));
  const outerLoop = (f) => orientCCW(simplify(largest(loops(f)), 0.02));
  const cavityLoops = loops(cavityField).filter((l) => pointInPolygon([0, 0], l));
  const cavity = cavityLoops.length ? orientCCW(simplify(largest(cavityLoops), 0.02)) : null;
  return {
    stem: [sx, sy], // in the legend's coordinates
    cellMM: cell,
    cap: new Polygon2D(outerLoop(capField)),
    cavity: cavity && new Polygon2D(cavity),
    recess: new Polygon2D(outerLoop(recessField)),
    base: new Polygon2D(outerLoop(baseField)),
  };
}

// The basic cap shapes offered instead of the logo's outline, as outlines
// 1mm across centred on the origin (scaled up to fit), except 'rect',
// which follows the logo's proportions.
export const LOGO_SHAPES = {
  circle: () => regularPolygon(96, 0.5),
  roundsquare: () => roundedRect(1, 1, 0.18),
  square: () => roundedRect(1, 1, 0.02),
  hexagon: () => profileFor('hexagon', 1, 0),
  octagon: () => profileFor('octagon', 1, 0),
  heart: () => profileFor('heart', 1, 0),
  star: () => profileFor('star', 1, 0),
};

// The chosen shape, in the logo's coordinates: centred on the middle of
// the logo's bounding box and scaled just enough to hold every logo cell
// plus the rim, and the switch square around its centre. Returns
// { points, centre }.
function fitShape(shape, fp, cell, F) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const edgeCells = [];
  for (let gy = 0; gy < fp.gridH; gy++) for (let gx = 0; gx < fp.gridW; gx++) {
    if (!fp.filled(gx, gy)) continue;
    const x0 = fp.xAt(gx), x1 = fp.xAt(gx + 1), y0 = fp.yAt(gy + 1), y1 = fp.yAt(gy);
    minX = Math.min(minX, x0); maxX = Math.max(maxX, x1); minY = Math.min(minY, y0); maxY = Math.max(maxY, y1);
    if (!fp.filled(gx - 1, gy) || !fp.filled(gx + 1, gy) || !fp.filled(gx, gy - 1) || !fp.filled(gx, gy + 1)) edgeCells.push([(x0 + x1) / 2, (y0 + y1) / 2]);
  }
  const C = [(minX + maxX) / 2, (minY + maxY) / 2];
  const half = F.capSquareMM / 2;
  if (shape === 'rect') {
    const hw = Math.max((maxX - minX) / 2 + F.rimMM, half), hh = Math.max((maxY - minY) / 2 + F.rimMM, half);
    const pts = roundedRect(2 * hw, 2 * hh, Math.min(3, hw, hh)).points.map(([x, y]) => [x + C[0], y + C[1]]);
    return { points: pts, centre: C };
  }
  const make = LOGO_SHAPES[shape] || LOGO_SHAPES.circle;
  // The logo goes at the shape's roomiest point (the centre of the
  // largest circle that fits inside it), not its middle: for a heart
  // that's up between the lobes, and centring on the middle made a round
  // logo's heart cap more than three times wider than needed.
  const raw = make().points;
  const pole = roomiestPoint(raw);
  const P = raw.map(([x, y]) => [x - pole[0], y - pole[1]]);
  // Distance from the centre to the unit outline along direction a.
  const reach = (a) => {
    const dx = Math.cos(a), dy = Math.sin(a);
    let best = 0;
    for (let k = 0; k < P.length; k++) {
      const [x1, y1] = P[k], [x2, y2] = P[(k + 1) % P.length];
      const ex = x2 - x1, ey = y2 - y1, den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-15) continue;
      const t = (x1 * ey - y1 * ex) / den, u = (x1 * dy - y1 * dx) / den;
      if (t > 0 && u >= -1e-9 && u <= 1 + 1e-9) best = Math.max(best, t);
    }
    return best || 1e-9;
  };
  let scale = 0;
  const need = (x, y, margin) => { const r = Math.hypot(x, y); if (r > 1e-9) scale = Math.max(scale, (r + margin) / reach(Math.atan2(y, x))); };
  for (const [x, y] of edgeCells) need(x - C[0], y - C[1], F.rimMM + cell * 0.71);
  // The switch square (rounded corners) around the centre.
  const r = F.capSquareRadiusMM;
  for (const [ux, uy] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) for (let k = 0; k <= 8; k++) {
    const a = (Math.atan2(uy, ux) - Math.PI / 4) + (k / 8) * (Math.PI / 2);
    need(ux * (half - r) + r * Math.cos(a), uy * (half - r) + r * Math.sin(a), 0.05);
  }
  scale *= 1.002;
  return { points: P.map(([x, y]) => [x * scale + C[0], y * scale + C[1]]), centre: C };
}

// The point inside a polygon farthest from its edges (grid search, then a
// finer search around the best point).
function roomiestPoint(P) {
  const edgeDist = (x, y) => {
    let m = Infinity;
    for (let k = 0; k < P.length; k++) {
      const [ax, ay] = P[k], [bx, by] = P[(k + 1) % P.length];
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
      const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
      m = Math.min(m, Math.hypot(x - ax - t * dx, y - ay - t * dy));
    }
    return m;
  };
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of P) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  let best = [0, 0], bd = -1;
  let step = Math.max(maxX - minX, maxY - minY) / 40;
  let x0 = minX, x1 = maxX, y0 = minY, y1 = maxY;
  for (let round = 0; round < 3; round++) {
    for (let x = x0; x <= x1; x += step) for (let y = y0; y <= y1; y += step) {
      if (!pointInPolygon([x, y], P)) continue;
      const d = edgeDist(x, y);
      if (d > bd) { bd = d; best = [x, y]; }
    }
    x0 = best[0] - step; x1 = best[0] + step; y0 = best[1] - step; y1 = best[1] + step; step /= 8;
  }
  return best;
}

// The largest gap (mm) the cap outline will bridge to join separate pieces
// of a logo; pieces farther apart than about twice this are left off.
const CLOSE_MAX_MM = 12;

// Number of separate pieces of the region where f < 0 (4-connected).
function countPieces(f, W, H) {
  const seen = new Uint8Array(W * H);
  let n = 0;
  const stack = [];
  for (let s = 0; s < W * H; s++) {
    if (seen[s] || !(f[s] < 0)) continue;
    n++;
    seen[s] = 1; stack.push(s);
    while (stack.length) {
      const p = stack.pop(), i = p % W, j = (p / W) | 0;
      for (const q of [i > 0 ? p - 1 : -1, i < W - 1 ? p + 1 : -1, j > 0 ? p - W : -1, j < H - 1 ? p + W : -1]) {
        if (q >= 0 && !seen[q] && f[q] < 0) { seen[q] = 1; stack.push(q); }
      }
    }
  }
  return n;
}

// Squared Euclidean distance transform (Felzenszwalb & Huttenlocher): for
// each cell, the squared distance (in cells) to the nearest cell whose
// value equals `target`.
function edt(grid, W, H, target) {
  const INF = 1e20;
  const f = new Float64Array(W * H);
  for (let k = 0; k < W * H; k++) f[k] = grid[k] === target ? 0 : INF;
  const N = Math.max(W, H);
  const v = new Int32Array(N), z = new Float64Array(N + 1), col = new Float64Array(N), out = new Float64Array(N);
  const sq = (q) => col[q] + q * q;
  const pass = (len, get, set) => {
    for (let q = 0; q < len; q++) col[q] = get(q);
    let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
    for (let q = 1; q < len; q++) {
      let s = (sq(q) - sq(v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) { k--; s = (sq(q) - sq(v[k])) / (2 * q - 2 * v[k]); }
      k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
    }
    k = 0;
    for (let q = 0; q < len; q++) { while (z[k + 1] < q) k++; out[q] = (q - v[k]) * (q - v[k]) + col[v[k]]; }
    for (let q = 0; q < len; q++) set(q, out[q]);
  };
  for (let x = 0; x < W; x++) pass(H, (y) => f[y * W + x], (y, val) => { f[y * W + x] = val; });
  for (let y = 0; y < H; y++) pass(W, (x) => f[y * W + x], (x, val) => { f[y * W + x] = val; });
  return f;
}

// Marching squares: closed loops where the field crosses zero, in
// fractional grid coordinates (i across, j down). The field must be
// positive along the grid's border, which the padding above guarantees.
function marchingSquares(f, W, H) {
  const val = (i, j) => f[j * W + i];
  const edgePoint = (i0, j0, i1, j1) => {
    const a = val(i0, j0), b = val(i1, j1), t = a / (a - b);
    return [i0 + (i1 - i0) * t, j0 + (j1 - j0) * t];
  };
  // Segments keyed by their start edge, so loops can be chained. Edge ids:
  // horizontal edge (i,j)-(i+1,j) and vertical edge (i,j)-(i,j+1).
  const hId = (i, j) => `h${i},${j}`, vId = (i, j) => `v${i},${j}`;
  const next = new Map(), pos = new Map();
  const seg = (e0, p0, e1, p1) => { next.set(e0, e1); pos.set(e0, p0); pos.set(e1, p1); };
  for (let j = 0; j < H - 1; j++) for (let i = 0; i < W - 1; i++) {
    // Corners: a top-left, b top-right, c bottom-right, d bottom-left. "In" = negative.
    const a = val(i, j) < 0, b = val(i + 1, j) < 0, c = val(i + 1, j + 1) < 0, d = val(i, j + 1) < 0;
    const code = (a ? 8 : 0) | (b ? 4 : 0) | (c ? 2 : 0) | (d ? 1 : 0);
    if (code === 0 || code === 15) continue;
    const T = () => [hId(i, j), edgePoint(i, j, i + 1, j)];
    const R = () => [vId(i + 1, j), edgePoint(i + 1, j, i + 1, j + 1)];
    const B = () => [hId(i, j + 1), edgePoint(i, j + 1, i + 1, j + 1)];
    const L = () => [vId(i, j), edgePoint(i, j, i, j + 1)];
    // Segments run with the inside on the left (in grid coordinates,
    // j down), giving consistently oriented loops.
    const add = (p, q) => seg(p[0], p[1], q[0], q[1]);
    switch (code) {
      case 1: add(L(), B()); break;
      case 2: add(B(), R()); break;
      case 3: add(L(), R()); break;
      case 4: add(R(), T()); break;
      case 6: add(B(), T()); break;
      case 7: add(L(), T()); break;
      case 8: add(T(), L()); break;
      case 9: add(T(), B()); break;
      case 11: add(T(), R()); break;
      case 12: add(R(), L()); break;
      case 13: add(R(), B()); break;
      case 14: add(B(), L()); break;
      case 5: case 10: {
        // Saddle: decide by the centre value.
        const centreIn = (val(i, j) + val(i + 1, j) + val(i + 1, j + 1) + val(i, j + 1)) / 4 < 0;
        if (code === 5) { if (centreIn) { add(L(), T()); add(R(), B()); } else { add(L(), B()); add(R(), T()); } }
        else { if (centreIn) { add(T(), R()); add(B(), L()); } else { add(T(), L()); add(B(), R()); } }
        break;
      }
    }
  }
  const loops = [];
  const used = new Set();
  for (const start of next.keys()) {
    if (used.has(start)) continue;
    const loop = [];
    let e = start;
    while (e !== undefined && !used.has(e)) { used.add(e); loop.push(pos.get(e)); e = next.get(e); }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}

function signedArea(pts) {
  let a = 0;
  for (let k = 0; k < pts.length; k++) { const p = pts[k], q = pts[(k + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; }
  return a / 2;
}
function largest(loops) {
  let best = null, bestA = -1;
  for (const l of loops) { const a = Math.abs(signedArea(l)); if (a > bestA) { bestA = a; best = l; } }
  return best;
}
function orientCCW(pts) { return signedArea(pts) < 0 ? pts.slice().reverse() : pts; }
export function pointInPolygon([x, y], pts) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) c = !c;
  }
  return c;
}

// Douglas-Peucker on a closed loop: drops points within `tol` mm of the
// line through their neighbours, which removes the hundreds of nearly
// collinear points marching squares leaves along straight and gently
// curved edges.
function simplify(pts, tol) {
  if (pts.length < 8) return pts;
  // Split the loop at its two farthest-apart points.
  let a = 0, b = 0, best = -1;
  for (let k = 0; k < pts.length; k++) { const d = (pts[k][0] - pts[0][0]) ** 2 + (pts[k][1] - pts[0][1]) ** 2; if (d > best) { best = d; b = k; } }
  const keep = new Uint8Array(pts.length);
  keep[a] = keep[b] = 1;
  const dp = (i0, i1) => {
    // indices along the loop from i0 to i1 (wrapping)
    const n = pts.length;
    const span = (i1 - i0 + n) % n;
    if (span < 2) return;
    const [x0, y0] = pts[i0], [x1, y1] = pts[i1];
    const len = Math.hypot(x1 - x0, y1 - y0) || 1e-12;
    let far = -1, farD = -1;
    for (let s = 1; s < span; s++) {
      const k = (i0 + s) % n;
      const d = Math.abs((x1 - x0) * (y0 - pts[k][1]) - (x0 - pts[k][0]) * (y1 - y0)) / len;
      if (d > farD) { farD = d; far = k; }
    }
    if (farD > tol) { keep[far] = 1; dp(i0, far); dp(far, i1); }
  };
  dp(a, b); dp(b, a);
  return pts.filter((_, k) => keep[k]);
}
