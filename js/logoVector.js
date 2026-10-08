// Logo clicker, smooth logo layer: the logo's colour regions traced as
// smooth outlines and built as solid shapes, instead of a grid of square
// columns (which showed as a staircase along every curved or slanted edge).
//
//  1. The logo is resampled onto a fine grid (about 0.04mm cells) with
//     proper averaging, and each cell labelled: one of up to 3 logo colours
//     (or, for a 1-colour logo, the logo colour with its dark details cut
//     out), or "rim" for everything else.
//  2. Clean-up: specks under 0.4mm across are merged into their
//     surroundings (too small to print), and no two cells of one label may
//     touch only at a corner.
//  3. The boundaries between labels are split into chains that run from one
//     junction (where 3 or more labels meet) to the next. Each chain is
//     smoothed and simplified once, and both regions on either side of it
//     use exactly those points, so neighbouring parts meet exactly: no
//     gaps, no overlaps (slicers drop one of two overlapping parts).
//  4. Each label's chains are joined into loops (outer boundaries and
//     holes), triangulated, and built into a solid of the logo layer's
//     depth. The rim's outer boundary is the cap outline itself, so the
//     layer covers the cap's top exactly.
// Every result is checked (triangle areas must add up to each shape's
// area); if smoothing ever produces an invalid shape, the unsmoothed traced
// edges are used instead, and if that fails too, this returns null and the
// caller falls back to the square-column version.

import { Mesh } from './mesh.js';
import { logoOutlines } from './logoImport.js';

const CELL_TARGET_MM = 0.04;
const MIN_FEATURE_MM = 0.4;
const RIM = 1;          // label for everything that isn't logo
const LOGO0 = 2;        // first logo colour label

// Returns { outlines, parts: [{ mesh, colorHex, isRim }] } in cap
// coordinates (stem at the origin, logo layer from z0 to z1), or null.
export function vectorLogo(logoCanvas, settings, { sizeMM, oneColor, capColorHex, legendColorHex, z0, z1 }) {
  const iw = logoCanvas.width, ih = logoCanvas.height;
  const longest = Math.max(iw, ih);
  const N = Math.min(1100, Math.max(300, Math.round(sizeMM / CELL_TARGET_MM)));
  const c = sizeMM / N;
  const wc = Math.max(1, Math.round((iw / longest) * N)), hc = Math.max(1, Math.round((ih / longest) * N));

  // ---- 1. Resample and label ----
  const cv = document.createElement('canvas');
  cv.width = wc; cv.height = hc;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(logoCanvas, 0, 0, wc, hc);
  const px = g.getImageData(0, 0, wc, hc).data;

  // Label grid: the logo plus a one-cell border of rim on every side.
  const W = wc + 2, H = hc + 2;
  const lab = new Int16Array(W * H).fill(RIM);
  const opaque = new Uint8Array(W * H);
  const rgb = (i, j) => { const k = ((j - 1) * wc + (i - 1)) * 4; return [px[k], px[k + 1], px[k + 2]]; };
  for (let j = 1; j <= hc; j++) for (let i = 1; i <= wc; i++) if (px[((j - 1) * wc + (i - 1)) * 4 + 3] >= 128) opaque[j * W + i] = 1;

  let colors; // hex per logo label
  if (oneColor) {
    // The logo in one colour, dark details cut out (as for 1-colour emoji):
    // a cell is a cut-out when under half the logo's median brightness.
    const lum = (r, gg, b) => (0.2126 * r + 0.7152 * gg + 0.0722 * b) / 255;
    const lums = [];
    for (let j = 1; j <= hc; j++) for (let i = 1; i <= wc; i++) if (opaque[j * W + i]) lums.push(lum(...rgb(i, j)));
    lums.sort((a, b) => a - b);
    const median = lums.length ? lums[Math.floor(lums.length / 2)] : 0;
    for (let j = 1; j <= hc; j++) for (let i = 1; i <= wc; i++) {
      if (!opaque[j * W + i]) continue;
      lab[j * W + i] = median > 0.15 && lum(...rgb(i, j)) < median * 0.5 ? RIM : LOGO0;
    }
    colors = [legendColorHex];
  } else {
    const clusters = pickColors(opaque, rgb, W, H, wc, hc);
    for (let j = 1; j <= hc; j++) for (let i = 1; i <= wc; i++) {
      if (!opaque[j * W + i]) continue;
      const [r, gg, b] = rgb(i, j);
      let best = 0, bd = Infinity;
      clusters.forEach(([cr, cg, cb], k) => { const d = (r - cr) ** 2 + (gg - cg) ** 2 + (b - cb) ** 2; if (d < bd) { bd = d; best = k; } });
      lab[j * W + i] = LOGO0 + best;
    }
    colors = clusters.map(toHex);
  }

  // ---- 2. Clean-up ----
  removeSpecks(lab, W, H, Math.max(2, Math.ceil(MIN_FEATURE_MM / c)));
  fixCornerContacts(lab, W, H);

  // ---- Outlines (cap, cavity, recess, base) from the logo's silhouette ----
  // Pooled 4x4 onto a coarser grid (about 0.16mm), which is plenty for
  // outlines that are offsets of the logo by a millimetre or more.
  const K = 4;
  const cornerX = (i) => (i - 1) * c - (wc * c) / 2; // grid corner i (label grid index) -> mm
  const cornerY = (j) => (hc * c) / 2 - (j - 1) * c;
  const fp = {
    gridW: Math.ceil(wc / K), gridH: Math.ceil(hc / K),
    xAt: (gx) => gx * K * c - (wc * c) / 2,
    yAt: (gy) => (hc * c) / 2 - gy * K * c,
    // A coarse cell counts as logo if any of its fine cells is, so even a
    // hairline feature stays inside the cap outline (a majority vote let a
    // rocket emoji's thin flame trail poke out of it).
    filled: (gx, gy) => {
      for (let dj = 0; dj < K; dj++) for (let di = 0; di < K; di++) {
        const i = gx * K + di + 1, j = gy * K + dj + 1;
        if (i >= 1 && j >= 1 && i <= wc && j <= hc && (opaque[j * W + i] || lab[j * W + i] >= LOGO0)) return true;
      }
      return false;
    },
  };
  const outlines = logoOutlines(fp, settings);
  if (!outlines || !outlines.cavity) return null;
  const [sx, sy] = outlines.stem;

  // Any logo cell outside the cap outline (only possible for a piece too
  // far from the rest to be joined to it) is dropped, so it can't leave the
  // cap's shape invalid.
  {
    const O = outlines.cap.points;
    let dropped = 0;
    for (let j = 1; j <= hc; j++) {
      const yc = (cornerY(j) + cornerY(j + 1)) / 2 - sy;
      const xs = [];
      for (let k = 0; k < O.length; k++) {
        const [ax, ay] = O[k], [bx, by] = O[(k + 1) % O.length];
        if ((ay > yc) !== (by > yc)) xs.push(ax + (yc - ay) * (bx - ax) / (by - ay));
      }
      xs.sort((a, b) => a - b);
      for (let i = 1; i <= wc; i++) {
        if (lab[j * W + i] < LOGO0) continue;
        const xc = (cornerX(i) + cornerX(i + 1)) / 2 - sx;
        let inside = false;
        for (const x of xs) { if (x < xc) inside = !inside; else break; }
        if (!inside) { lab[j * W + i] = RIM; dropped++; }
      }
    }
    if (dropped) fixCornerContacts(lab, W, H);
  }

  // ---- 3 & 4. Chains, loops, shapes ----
  for (const smooth of [true, false]) {
    const parts = buildParts(lab, W, H, (i) => cornerX(i) - sx, (j) => cornerY(j) - sy, smooth, c, outlines.cap.points, colors, capColorHex, z0, z1);
    if (parts) return { outlines, parts, cellMM: c };
  }
  return null;
}

function toHex([r, g, b]) {
  return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}

// Up to 3 colours: the most common, then the next most common that's
// clearly different, and so on. A candidate must be a real area of the
// logo: the thin band of blended colour along edges (anti-aliasing, JPEG)
// is almost never "interior" (same colour on all four sides), so it's
// skipped (the same rule the emoji path uses for imported images).
function pickColors(opaque, rgb, W, H, wc, hc) {
  const QUANT = 24, MERGE = 70;
  const freq = new Map();
  let total = 0;
  for (let j = 1; j <= hc; j++) for (let i = 1; i <= wc; i++) {
    if (!opaque[j * W + i]) continue;
    const [r, g, b] = rgb(i, j);
    const k = `${Math.round(r / QUANT) * QUANT},${Math.round(g / QUANT) * QUANT},${Math.round(b / QUANT) * QUANT}`;
    freq.set(k, (freq.get(k) || 0) + 1); total++;
  }
  const remaining = new Map(freq);
  const clusters = [];
  const dropNear = (r, g, b) => { for (const k of [...remaining.keys()]) { const [kr, kg, kb] = k.split(',').map(Number); if (Math.hypot(kr - r, kg - g, kb - b) < MERGE) remaining.delete(k); } };
  while (clusters.length < 3 && remaining.size) {
    let bk = null, bc = -1;
    for (const [k, n] of remaining) if (n > bc) { bc = n; bk = k; }
    const [r, g, b] = bk.split(',').map(Number);
    if (clusters.length) {
      const near = (i, j) => i >= 1 && j >= 1 && i <= wc && j <= hc && opaque[j * W + i] && (() => { const [pr, pg, pb] = rgb(i, j); return Math.hypot(pr - r, pg - g, pb - b) < MERGE / 2; })();
      let members = 0, interior = 0;
      for (let j = 1; j <= hc; j += 2) for (let i = 1; i <= wc; i += 2) {
        if (!near(i, j)) continue;
        members++;
        if (near(i - 1, j) && near(i + 1, j) && near(i, j - 1) && near(i, j + 1)) interior++;
      }
      if (members * 4 < total * 0.005 || interior < members * 0.3) { dropNear(r, g, b); continue; }
    }
    clusters.push([r, g, b]);
    dropNear(r, g, b);
  }
  if (!clusters.length) clusters.push([255, 255, 255]);
  // Refine each colour to the average of the cells nearest it, so it's the
  // logo's actual colour rather than one quantised shade of it.
  const sums = clusters.map(() => [0, 0, 0, 0]);
  for (let j = 1; j <= hc; j++) for (let i = 1; i <= wc; i++) {
    if (!opaque[j * W + i]) continue;
    const [r, g, b] = rgb(i, j);
    let best = 0, bd = Infinity;
    clusters.forEach(([cr, cg, cb], k) => { const d = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2; if (d < bd) { bd = d; best = k; } });
    if (bd < (MERGE / 2) ** 2) { sums[best][0] += r; sums[best][1] += g; sums[best][2] += b; sums[best][3]++; }
  }
  return clusters.map((cl, k) => (sums[k][3] ? [sums[k][0] / sums[k][3], sums[k][1] / sums[k][3], sums[k][2] / sums[k][3]] : cl));
}

// Merges every connected patch (of any label) smaller than minCells across
// in both directions into the label it borders most.
function removeSpecks(lab, W, H, minCells) {
  const seen = new Uint8Array(W * H);
  const stack = [], cells = [];
  for (let start = 0; start < W * H; start++) {
    if (seen[start]) continue;
    const L = lab[start];
    stack.length = 0; cells.length = 0;
    stack.push(start); seen[start] = 1;
    let minI = W, maxI = -1, minJ = H, maxJ = -1, touchesBorder = false;
    const around = new Map();
    while (stack.length) {
      const p = stack.pop();
      cells.push(p);
      const i = p % W, j = (p / W) | 0;
      if (i < minI) minI = i; if (i > maxI) maxI = i; if (j < minJ) minJ = j; if (j > maxJ) maxJ = j;
      if (i === 0 || j === 0 || i === W - 1 || j === H - 1) touchesBorder = true;
      for (const q of [i > 0 ? p - 1 : -1, i < W - 1 ? p + 1 : -1, j > 0 ? p - W : -1, j < H - 1 ? p + W : -1]) {
        if (q < 0) continue;
        if (lab[q] === L) { if (!seen[q]) { seen[q] = 1; stack.push(q); } }
        else around.set(lab[q], (around.get(lab[q]) || 0) + 1);
      }
    }
    if (touchesBorder || (maxI - minI + 1 >= minCells || maxJ - minJ + 1 >= minCells)) continue;
    let to = RIM, best = -1;
    for (const [l, n] of around) if (n > best) { best = n; to = l; }
    for (const p of cells) lab[p] = to;
  }
}

// No label may touch itself only at a corner (two cells diagonal, the
// other two different): the shape would pinch to a point there. Fills one
// of the other two cells with the diagonal's label (never a border cell,
// which must stay rim), to a fixed point.
function fixCornerContacts(lab, W, H) {
  const border = (i, j) => i === 0 || j === 0 || i === W - 1 || j === H - 1;
  for (let changed = true, guard = 0; changed && guard < 100; guard++) {
    changed = false;
    for (let j = 0; j < H - 1; j++) for (let i = 0; i < W - 1; i++) {
      const tl = lab[j * W + i], tr = lab[j * W + i + 1], bl = lab[(j + 1) * W + i], br = lab[(j + 1) * W + i + 1];
      let L = null, cand = null;
      if (tl === br && tr !== tl && bl !== tl) { L = tl; cand = [[i + 1, j], [i, j + 1]]; }
      else if (tr === bl && tl !== tr && br !== tr) { L = tr; cand = [[i, j], [i + 1, j + 1]]; }
      if (L === null) continue;
      const pick = L === RIM ? cand[0] : cand.find(([x, y]) => !border(x, y));
      if (!pick) continue;
      lab[pick[1] * W + pick[0]] = L;
      changed = true;
    }
  }
}

// Builds every part. X(i), Y(j) map grid corner indices to cap coordinates.
function buildParts(lab, W, H, X, Y, smooth, c, capOutline, colors, capColorHex, z0, z1) {
  const CW = W + 1;
  const L = (i, j) => (i < 0 || j < 0 || i >= W || j >= H) ? RIM : lab[j * W + i];
  // Boundary edges: horizontal edge (i,j)-(i+1,j) and vertical (i,j)-(i,j+1).
  const hB = (i, j) => j > 0 && j < H && i >= 0 && i < W && L(i, j - 1) !== L(i, j);
  const vB = (i, j) => i > 0 && i < W && j >= 0 && j < H && L(i - 1, j) !== L(i, j);
  // The four steps out of corner (i,j): [di, dj, isBoundary, edgeId, left label, right label]
  const steps = (i, j) => [
    [1, 0, hB(i, j), 2 * (j * CW + i), L(i, j - 1), L(i, j)],            // east
    [-1, 0, hB(i - 1, j), 2 * (j * CW + i - 1), L(i - 1, j), L(i - 1, j - 1)], // west
    [0, 1, vB(i, j), 2 * (j * CW + i) + 1, L(i, j), L(i - 1, j)],        // south (down the grid)
    [0, -1, vB(i, j - 1), 2 * ((j - 1) * CW + i) + 1, L(i - 1, j - 1), L(i, j - 1)], // north
  ];
  const degree = (i, j) => steps(i, j).filter((s) => s[2]).length;

  const visited = new Set();
  const chains = [];
  const walk = (i0, j0, first) => {
    const pts = [[i0, j0]];
    let [di, dj, , eid, left, right] = first;
    let i = i0, j = j0;
    visited.add(eid);
    while (true) {
      i += di; j += dj;
      pts.push([i, j]);
      if ((i === i0 && j === j0) || degree(i, j) !== 2) break;
      const next = steps(i, j).find((s) => s[2] && !(s[0] === -di && s[1] === -dj));
      if (visited.has(next[3])) break;
      visited.add(next[3]);
      [di, dj] = next;
    }
    chains.push({ pts, left, right, startId: j0 * CW + i0, endId: j * CW + i, closed: i === i0 && j === j0 && degree(i0, j0) === 2 });
  };
  // Chains from junctions first, then the closed loops with no junction.
  for (let j = 0; j <= H; j++) for (let i = 0; i <= W; i++) {
    if (degree(i, j) < 3) continue;
    for (const s of steps(i, j)) if (s[2] && !visited.has(s[3])) walk(i, j, s);
  }
  for (let j = 0; j <= H; j++) for (let i = 0; i <= W; i++) {
    if (degree(i, j) !== 2) continue;
    for (const s of steps(i, j)) if (s[2] && !visited.has(s[3])) walk(i, j, s);
  }

  // Smooth and simplify each chain once, in cap coordinates.
  for (const ch of chains) {
    let p = ch.pts.map(([i, j]) => [X(i), Y(j)]);
    if (ch.closed) p.pop();
    if (smooth) {
      for (let it = 0; it < 4; it++) {
        const q = p.map((v) => v.slice());
        const n = p.length;
        for (let k = 0; k < n; k++) {
          if (!ch.closed && (k === 0 || k === n - 1)) continue;
          const a = p[(k - 1 + n) % n], b = p[(k + 1) % n];
          q[k] = [(a[0] + 2 * p[k][0] + b[0]) / 4, (a[1] + 2 * p[k][1] + b[1]) / 4];
        }
        p = q;
      }
    }
    ch.mm = ch.closed ? simplifyClosed(p, smooth ? 0.012 : 1e-9) : simplifyOpen(p, smooth ? 0.012 : 1e-9);
  }

  // Loops for one label: chains with that label on their left (forward) or
  // right (reversed), joined end to start.
  const loopsFor = (label) => {
    const out = [];
    const open = new Map();
    for (const ch of chains) {
      if (ch.left !== label && ch.right !== label) continue;
      const pts = ch.left === label ? ch.mm : ch.mm.slice().reverse();
      if (ch.closed) { out.push(pts); continue; }
      const s = ch.left === label ? ch.startId : ch.endId, e = ch.left === label ? ch.endId : ch.startId;
      open.set(s, { pts, e });
    }
    while (open.size) {
      const [s0] = open.keys();
      const loop = [];
      let s = s0, guard = 0;
      while (open.has(s) && guard++ < 1e6) {
        const { pts, e } = open.get(s);
        open.delete(s);
        for (let k = 0; k < pts.length - 1; k++) loop.push(pts[k]);
        s = e;
      }
      if (s !== s0) return null; // didn't close: inconsistent boundary
      out.push(loop);
    }
    return out;
  };

  const labels = new Set();
  for (let k = 0; k < W * H; k++) if (lab[k] >= LOGO0) labels.add(lab[k]);
  const parts = [];
  const shapesFor = (label, mainOuter) => {
    const loops = loopsFor(label);
    if (!loops) return null;
    const outers = [], holes = [];
    for (const lp of loops) { if (lp.length < 3) continue; (area(lp) > 0 ? outers : holes).push(lp); }
    const polys = outers.map((o) => ({ outer: o, holes: [], a: area(o) }));
    const main = mainOuter ? { outer: mainOuter, holes: [], a: area(mainOuter) } : null;
    for (const h of holes) {
      const m = [(h[0][0] + h[1][0]) / 2, (h[0][1] + h[1][1]) / 2];
      let best = null;
      for (const pg of polys) if ((!best || pg.a < best.a) && pointIn(m, pg.outer)) best = pg;
      if (best) best.holes.push(h);
      else if (main) main.holes.push(h);
      else return null;
    }
    if (main) polys.push(main);
    const mesh = new Mesh();
    for (const pg of polys) {
      const tris = triangulate(pg.outer, pg.holes);
      if (!tris) return null;
      let covered = 0;
      for (const [a, b, cc] of tris) covered += (b[0] - a[0]) * (cc[1] - a[1]) - (cc[0] - a[0]) * (b[1] - a[1]);
      const want = 2 * (area(pg.outer) + pg.holes.reduce((s, h) => s + area(h), 0));
      if (Math.abs(covered - want) > 1e-6 * Math.max(1, Math.abs(want))) return null;
      for (const [a, b, cc] of tris) {
        mesh.addTriangle([a[0], a[1], z1], [b[0], b[1], z1], [cc[0], cc[1], z1]);
        mesh.addTriangle([a[0], a[1], z0], [cc[0], cc[1], z0], [b[0], b[1], z0]);
      }
      for (const lp of [pg.outer, ...pg.holes]) {
        for (let k = 0; k < lp.length; k++) {
          const a = lp[k], b = lp[(k + 1) % lp.length];
          mesh.addQuad([a[0], a[1], z0], [b[0], b[1], z0], [b[0], b[1], z1], [a[0], a[1], z1]);
        }
      }
    }
    return mesh;
  };
  for (const label of [...labels].sort((a, b) => a - b)) {
    const mesh = shapesFor(label, null);
    if (!mesh) return null;
    if (!mesh.isEmpty) parts.push({ mesh, colorHex: colors[label - LOGO0] });
  }
  const rim = shapesFor(RIM, capOutline);
  if (!rim) return null;
  parts.push({ mesh: rim, colorHex: capColorHex, isRim: true });
  return parts;
}

function area(p) {
  let a = 0;
  for (let k = 0; k < p.length; k++) { const u = p[k], v = p[(k + 1) % p.length]; a += u[0] * v[1] - v[0] * u[1]; }
  return a / 2;
}
function pointIn([x, y], pts) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) c = !c;
  }
  return c;
}
function segDist([px0, py0], [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  if (!l2) return Math.hypot(px0 - ax, py0 - ay);
  const t = Math.max(0, Math.min(1, ((px0 - ax) * dx + (py0 - ay) * dy) / l2));
  return Math.hypot(px0 - ax - t * dx, py0 - ay - t * dy);
}
function simplifyOpen(p, tol) {
  if (p.length <= 2) return p;
  const keep = new Uint8Array(p.length);
  keep[0] = keep[p.length - 1] = 1;
  const stack = [[0, p.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let far = -1, fd = tol;
    for (let k = a + 1; k < b; k++) { const d = segDist(p[k], p[a], p[b]); if (d > fd) { fd = d; far = k; } }
    if (far >= 0) { keep[far] = 1; stack.push([a, far], [far, b]); }
  }
  return p.filter((_, k) => keep[k]);
}
function simplifyClosed(p, tol) {
  if (p.length < 6) return p;
  let far = 0, fd = -1;
  for (let k = 1; k < p.length; k++) { const d = Math.hypot(p[k][0] - p[0][0], p[k][1] - p[0][1]); if (d > fd) { fd = d; far = k; } }
  const a = simplifyOpen(p.slice(0, far + 1), tol);
  const b = simplifyOpen([...p.slice(far), p[0]], tol);
  return [...a, ...b.slice(1, -1)];
}

// ---- Triangulating a polygon with holes ----
// Outer counter-clockwise, holes clockwise. Each hole is joined to the
// outline by a bridge from its rightmost point to the nearest visible point
// to its right (holes taken right to left, so later holes can't block
// earlier bridges), giving one outline; that's then ear-clipped, using a
// spatial grid so each ear test only looks at nearby points. Returns
// triangles as point triples (counter-clockwise), or null on failure.
function triangulate(outer, holes) {
  let poly = outer.slice();
  const hs = holes.map((h) => { let m = 0; for (let k = 1; k < h.length; k++) if (h[k][0] > h[m][0]) m = k; return { h, m }; })
    .sort((a, b) => b.h[b.m][0] - a.h[a.m][0]);
  for (const { h, m } of hs) {
    const M = h[m];
    const crosses = (P, Q, A, B) => {
      const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
      if (P === A || P === B || Q === A || Q === B) return false;
      const d1 = o(P, Q, A), d2 = o(P, Q, B), d3 = o(A, B, P), d4 = o(A, B, Q);
      return d1 * d2 < 0 && d3 * d4 < 0;
    };
    const visible = (P) => {
      for (let k = 0; k < poly.length; k++) if (crosses(M, P, poly[k], poly[(k + 1) % poly.length])) return false;
      for (let k = 0; k < h.length; k++) if (crosses(M, P, h[k], h[(k + 1) % h.length])) return false;
      return true;
    };
    // Whether the bridge leaves poly[k] into the polygon's inside. A point
    // already used by an earlier bridge appears twice in the outline, and
    // only one of its two copies faces this hole; splicing at the other one
    // made the outline cross itself (seen on a letter with 3 holes).
    const locallyInside = (k) => {
      const A = poly[(k - 1 + poly.length) % poly.length], V = poly[k], C = poly[(k + 1) % poly.length];
      const d = [M[0] - V[0], M[1] - V[1]];
      const cr = (u, v) => u[0] * v[1] - u[1] * v[0];
      const l1 = cr([V[0] - A[0], V[1] - A[1]], d) > 0, l2 = cr([C[0] - V[0], C[1] - V[1]], d) > 0;
      return cr([V[0] - A[0], V[1] - A[1]], [C[0] - V[0], C[1] - V[1]]) >= 0 ? (l1 && l2) : (l1 || l2);
    };
    const order = poly.map((P, k) => k).filter((k) => poly[k][0] > M[0])
      .sort((a, b) => Math.hypot(poly[a][0] - M[0], poly[a][1] - M[1]) - Math.hypot(poly[b][0] - M[0], poly[b][1] - M[1]));
    const p = order.find((k) => locallyInside(k) && visible(poly[k]));
    if (p === undefined) return null;
    poly = [...poly.slice(0, p + 1), ...h.slice(m), ...h.slice(0, m + 1), ...poly.slice(p)];
  }
  return earClip(poly);
}

function earClip(P) {
  const n = P.length;
  if (n < 3) return null;
  const prev = new Int32Array(n), next = new Int32Array(n), alive = new Uint8Array(n).fill(1);
  for (let k = 0; k < n; k++) { prev[k] = (k - 1 + n) % n; next[k] = (k + 1) % n; }
  // Spatial grid of points.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of P) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  const G = Math.max(1, Math.ceil(Math.sqrt(n / 4)));
  const cw = (maxX - minX) / G || 1, chh = (maxY - minY) / G || 1;
  const cellOf = (x, y) => [Math.min(G - 1, Math.max(0, Math.floor((x - minX) / cw))), Math.min(G - 1, Math.max(0, Math.floor((y - minY) / chh)))];
  const grid = Array.from({ length: G * G }, () => []);
  P.forEach(([x, y], k) => { const [a, b] = cellOf(x, y); grid[b * G + a].push(k); });
  const cross = (a, b, c) => (P[b][0] - P[a][0]) * (P[c][1] - P[a][1]) - (P[b][1] - P[a][1]) * (P[c][0] - P[a][0]);
  const same = (a, b) => P[a][0] === P[b][0] && P[a][1] === P[b][1];
  const EPS = 1e-12;
  const isEar = (b, allowFlat) => {
    const a = prev[b], c = next[b];
    const cr = cross(a, b, c);
    if (allowFlat ? cr < -EPS : cr <= EPS) return false;
    const x0 = Math.min(P[a][0], P[b][0], P[c][0]), x1 = Math.max(P[a][0], P[b][0], P[c][0]);
    const y0 = Math.min(P[a][1], P[b][1], P[c][1]), y1 = Math.max(P[a][1], P[b][1], P[c][1]);
    const [ga, gb] = cellOf(x0, y0), [gc, gd] = cellOf(x1, y1);
    for (let gy = gb; gy <= gd; gy++) for (let gx = ga; gx <= gc; gx++) {
      for (const q of grid[gy * G + gx]) {
        if (!alive[q] || q === a || q === b || q === c || same(q, a) || same(q, b) || same(q, c)) continue;
        const [x, y] = P[q];
        if (x < x0 || x > x1 || y < y0 || y > y1) continue;
        // Inside the triangle, or exactly on its new edge a-c: traced
        // outlines have many points on a regular grid, so a cut can pass
        // exactly through another point, which pinches the outline there
        // and later inverts it.
        if (cross(a, b, q) > EPS && cross(b, c, q) > EPS && cross(c, a, q) >= -EPS) return false;
      }
    }
    return true;
  };
  const tris = [];
  let count = n, cur = 0, stall = 0, allowFlat = false;
  while (count > 3) {
    if (isEar(cur, allowFlat)) {
      const a = prev[cur], c = next[cur];
      tris.push([P[a], P[cur], P[c]]);
      alive[cur] = 0; next[a] = c; prev[c] = a; count--;
      cur = a; stall = 0; allowFlat = false;
    } else {
      cur = next[cur];
      if (++stall > count) { if (allowFlat) return null; allowFlat = true; stall = 0; }
    }
  }
  const a = prev[cur], c = next[cur];
  if (cross(a, cur, c) >= -EPS) tris.push([P[a], P[cur], P[c]]);
  else return null;
  return tris;
}
