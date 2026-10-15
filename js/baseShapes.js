// Outline shapes for a fused base (the "Base shape" menu): the outside of
// the base seen from above, around a row of key pockets.
//
//   rect    — rounded rectangle, the original (built in baseBuilder.js)
//   soft    — rectangle with big rounded corners
//   pill    — fully round ends
//   bubbles — the outline bulges around each key, dipping between them
//   chamfer — angled corners
//   tag     — a pointed end with the keyring hole built into the base
//
// Every shape keeps at least as much wall around every pocket as the
// rectangle does (the Extra outer wall setting included), so the faint
// divider lines fixed by that wall can't come back at a corner or a dip:
// shapes whose corners would cut in (soft, pill, chamfer) grow longer at the
// ends until they don't, and bubbles are checked the same way (smaller
// bulges and corner radii are tried if a cap shape needs it). See
// baseOutlineFor().
//
// at(inset) gives the outline shrunk by `inset` (for the top and bottom
// bevels), always with the same number of points in the same order, so the
// bevel can be lofted point to point between the wall and its rim.

import { Polygon2D } from './mesh.js';

export const BASE_SHAPES = ['rect', 'soft', 'pill', 'bubbles', 'chamfer', 'tag'];

// Records how many points each piece of an outline gets the first time it
// is built (at inset 0), and reuses those counts for every inset.
class PathBuilder {
  constructor(counts) { this.counts = counts; this.k = 0; this.pts = []; }
  count(make) {
    if (this.counts[this.k] === undefined) this.counts[this.k] = make();
    return this.counts[this.k++];
  }
  // Straight piece, start point included, end point left to the next piece.
  line(a, b) {
    const n = this.count(() => Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2)));
    for (let j = 0; j < n; j++) this.pts.push([a[0] + (b[0] - a[0]) * j / n, a[1] + (b[1] - a[1]) * j / n]);
  }
  // Arc around c from angle a0 to a1 (radians), start included.
  arc(c, r, a0, a1) {
    const n = this.count(() => Math.max(3, Math.ceil(Math.abs(a1 - a0) * Math.max(r, 1) / 0.8)));
    for (let j = 0; j < n; j++) {
      const a = a0 + (a1 - a0) * j / n;
      this.pts.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]);
    }
  }
}

const D90 = Math.PI / 2;

// Rounded rectangle centred on 0, half-length L (along u), half-width A,
// corner radius R. Counter-clockwise, starting at the bottom-left corner.
function roundedRectPath(pb, L, A, R) {
  R = Math.max(0.05, Math.min(R, A - 0.01, L - 0.01));
  pb.arc([-L + R, -A + R], R, Math.PI, 3 * D90);
  pb.line([-L + R, -A], [L - R, -A]);
  pb.arc([L - R, -A + R], R, 3 * D90, 4 * D90);
  pb.line([L, -A + R], [L, A - R]);
  pb.arc([L - R, A - R], R, 0, D90);
  pb.line([L - R, A], [-L + R, A]);
  pb.arc([-L + R, A - R], R, D90, Math.PI);
  pb.line([-L, A - R], [-L, -A + R]);
}

function chamferPath(pb, L, A, c) {
  c = Math.max(0.05, Math.min(c, A - 0.05, L - 0.05));
  const P = [[-L + c, -A], [L - c, -A], [L, -A + c], [L, A - c], [L - c, A], [-L + c, A], [-L, A - c], [-L, -A + c]];
  for (let j = 0; j < P.length; j++) pb.line(P[j], P[(j + 1) % P.length]);
}

// One rounded-square bulge per key (half-size B, corner radius rb), joined
// where neighbouring bulges' corners cross, halfway between the keys.
function bubblesPath(pb, us, B, rb) {
  const K = us.length - 1;
  const off = B - rb; // corner-centre offset from the key centre
  // Where two neighbours' corner arcs meet, as an angle on the right-hand
  // arc (0 = level with the corner centre, pointing along +u).
  const junction = (k) => {
    const dx = (us[k + 1] - us[k]) / 2 - off;
    return Math.acos(Math.max(-1, Math.min(1, dx / rb)));
  };
  // Bottom edge, left to right.
  for (let k = 0; k <= K; k++) {
    pb.arc([us[k] - off, -off], rb, k === 0 ? Math.PI : Math.PI + junction(k - 1), 3 * D90);
    pb.line([us[k] - off, -B], [us[k] + off, -B]);
    pb.arc([us[k] + off, -off], rb, 3 * D90, k === K ? 4 * D90 : 4 * D90 - junction(k));
  }
  pb.line([us[K] + B, -off], [us[K] + B, off]);
  // Top edge, right to left.
  for (let k = K; k >= 0; k--) {
    pb.arc([us[k] + off, off], rb, k === K ? 0 : junction(k), D90);
    pb.line([us[k] + off, B], [us[k] - off, B]);
    pb.arc([us[k] - off, off], rb, D90, k === 0 ? Math.PI : Math.PI - junction(k - 1));
  }
  pb.line([us[0] - B, off], [us[0] - B, -off]);
}

// Rectangle from -L to the body end Lb, then a nose around (xc, 0) of
// radius rn, joined by straight lines tangent to the nose.
function tagPath(pb, L, A, Lb, xc, rn, R) {
  R = Math.max(0.05, Math.min(R, A - 0.01));
  const tangent = (sy) => {
    const px = Lb - xc, py = sy * A, d = Math.hypot(px, py);
    const phi = Math.atan2(py, px), t = Math.acos(Math.min(1, rn / d));
    return sy > 0 ? phi - t : phi + t;
  };
  const bot = tangent(-1), top = tangent(1);
  pb.arc([-L + R, -A + R], R, Math.PI, 3 * D90);
  pb.line([-L + R, -A], [Lb, -A]);
  const pBot = [xc + rn * Math.cos(bot), rn * Math.sin(bot)];
  pb.line([Lb, -A], pBot);
  pb.arc([xc, 0], rn, bot, top);
  pb.line([xc + rn * Math.cos(top), rn * Math.sin(top)], [Lb, A]);
  pb.line([Lb, A], [-L + R, A]);
  pb.arc([-L + R, A - R], R, D90, Math.PI);
  pb.line([-L, A - R], [-L, -A + R]);
}

// Distance from point p to segment ab.
function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
export function pointInPolygon2(p, P) {
  let inside = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, yi] = P[i], [xj, yj] = P[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
// Thinnest wall between any of the `inner` outlines and the outline O: the
// smallest gap in either direction (inner points to O's edges, O's points
// to the inner edges), or -1 if an inner outline pokes outside O.
export function minWall(O, inner) {
  let m = Infinity;
  for (const P of inner) {
    for (const p of P) {
      if (!pointInPolygon2(p, O)) return -1;
      for (let j = 0; j < O.length; j++) m = Math.min(m, segDist(p, O[j], O[(j + 1) % O.length]));
    }
    for (const q of O) for (let j = 0; j < P.length; j++) m = Math.min(m, segDist(q, P[j], P[(j + 1) % P.length]));
  }
  return m;
}

// The outline for a fused base.
//   shape   one of BASE_SHAPES (anything else, or 'rect', returns null: the
//           caller keeps its own rectangle)
//   frame   { cx, cy, vertical, pos } — the row's centre, its direction
//           (vertical rows run along y), and each key's position along the
//           row relative to the centre
//   L0, A0  the rectangle's half-length and half-width (footprint plus
//           extra wall)
//   recesses the key pockets, world coordinates
//   tagEnd  +1 or -1: which end of the row the tag's nose points to
//   keyring { holeR, outerR } for the tag's built-in hole, or null for none
// Returns { at(inset) -> Polygon2D (counter-clockwise), holes: [Polygon2D]
// (through-holes, counter-clockwise), wall (its thinnest wall), maxBevel }
// or null.
export function baseOutlineFor(shape, frame, L0, A0, recesses, tagEnd, keyring) {
  if (!BASE_SHAPES.includes(shape) || shape === 'rect') return null;
  const { cx, cy, vertical, pos } = frame;
  const flip = shape === 'tag' ? tagEnd : 1;
  const us = pos.map((p) => p * flip).sort((a, b) => a - b);
  // local (u, v) -> world. Vertical rows run along y; the tag's nose end is
  // handled by mirroring u.
  const toWorld = ([u, v]) => (vertical ? [cx + v, cy + flip * u] : [cx + flip * u, cy + v]);
  const recPts = recesses.map((r) => r.points);

  const make = (build) => {
    const counts = [];
    const at = (inset) => {
      const pb = new PathBuilder(counts);
      build(pb, inset);
      let pts = pb.pts.map(toWorld);
      // Mirroring or swapping axes reverses the direction; keep it CCW.
      let area = 0;
      for (let j = 0; j < pts.length; j++) { const a = pts[j], b = pts[(j + 1) % pts.length]; area += a[0] * b[1] - b[0] * a[1]; }
      if (area < 0) pts = pts.reverse();
      return new Polygon2D(pts);
    };
    return at;
  };

  // The rectangle's own thinnest wall, which every shape has to match.
  const rectAt = make((pb, i) => roundedRectPath(pb, L0 - i, A0 - i, 0.6 - i));
  const target = minWall(rectAt(0).points, recPts) - 0.02;
  const ok = (at, extra = []) => minWall(at(0).points, recPts.concat(extra)) >= target;

  // For shapes whose corners cut in at the ends: the smallest end extension
  // that keeps the wall (bisection; 20mm always does).
  const extended = (build) => {
    let lo = 0, hi = 20;
    if (ok(make((pb, i) => build(pb, i, lo)))) return make((pb, i) => build(pb, i, lo));
    for (let it = 0; it < 14; it++) {
      const mid = (lo + hi) / 2;
      if (ok(make((pb, i) => build(pb, i, mid)))) hi = mid; else lo = mid;
    }
    return make((pb, i) => build(pb, i, hi));
  };

  let at, holes = [], maxBevel = Infinity;
  if (shape === 'soft') {
    at = extended((pb, i, e) => roundedRectPath(pb, L0 + e - i, A0 - i, 6 - i));
  } else if (shape === 'pill') {
    at = extended((pb, i, e) => roundedRectPath(pb, L0 + e - i, A0 - i, A0 - i));
  } else if (shape === 'chamfer') {
    const c = Math.min(5, A0 * 0.45);
    at = extended((pb, i, e) => chamferPath(pb, L0 + e - i, A0 - i, c - i * (2 - Math.SQRT2)));
  } else if (shape === 'bubbles') {
    at = null;
    outer: for (const bulge of [1.5, 1.0, 0.5]) {
      for (const rb of [7, 6, 5, 4, 3]) {
        const B = A0 + bulge;
        if (rb > B - 0.5) continue;
        const cand = make((pb, i) => bubblesPath(pb, us, B - i, Math.max(0.3, rb - i)));
        if (ok(cand)) { at = cand; break outer; }
      }
    }
    if (!at) return null; // nothing fits: the caller falls back to the rectangle
  } else if (shape === 'tag') {
    const holeR = keyring ? keyring.holeR : 0;
    // 3mm of ring around the hole (the loop it replaces has about 2mm).
    const RING = 3;
    const rn = keyring ? Math.max(keyring.outerR, holeR + RING) : Math.min(A0 * 0.5, 6);
    // The bevels shrink the nose too; they stop at 1.5mm, so the ring keeps
    // at least 1.5mm on the first and last layers.
    maxBevel = keyring ? rn - holeR - 1.5 : Infinity;
    const xc = L0 + holeR + 2.5; // hole starts 2.5mm past the body's end
    at = make((pb, i) => tagPath(pb, L0 - i, A0 - i, L0, xc, Math.max(0.3, rn - i), 0.6 - i));
    if (keyring) {
      const N = 48, h = [];
      for (let j = 0; j < N; j++) { const a = (j / N) * Math.PI * 2; h.push(toWorld([xc + holeR * Math.cos(a), holeR * Math.sin(a)])); }
      let area = 0;
      for (let j = 0; j < N; j++) { const a = h[j], b = h[(j + 1) % N]; area += a[0] * b[1] - b[0] * a[1]; }
      holes = [new Polygon2D(area < 0 ? h.reverse() : h)];
    }
  }
  const wall = minWall(at(0).points, recPts.concat(holes.map((h) => h.points)));
  return { at, holes, wall, maxBevel };
}
