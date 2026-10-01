// Camo marks on the base: splits the base's surface into small triangles
// and colours each one from a smooth 3D blob pattern, like painting it by
// hand in a slicer. The pattern is 3D (it depends on x, y and z), so blobs
// wrap continuously around corners and edges instead of stopping at them.
//
// The coloured triangles go into the 3MF as per-triangle colours (the same
// thing a slicer's paint tool produces) and into the preview as vertex
// colours. STL has no colour, so it keeps the plain base.

import { Mesh } from './mesh.js';

// Longest triangle edge after splitting. The base is built from very large
// triangles (a wall can be one triangle running its full height), so it's
// split into small ones before marking. Blob edges don't depend on this
// size: triangles are cut exactly along each blob's boundary (see step 3
// in subdivideMesh), so edges come out as smooth curves either way. 2mm
// looks the same as 1.5mm and needs about 51,000 triangles for a 4-cap
// base against 75,000. (Before the cuts, each triangle took one colour and
// blob edges followed the triangles' own edges: a visible staircase and
// saw-tooth, worst on the long, thin wall triangles.)
const MAX_EDGE_MM = 2.0;

// Pattern styles. `scale` is roughly the patch size (mm), `coverage` the
// share of the surface covered by marks (the base colour shows elsewhere),
// `colorScale` how slowly the mark colour varies when there's more than one
// (slower than the patches, so each patch comes out mostly one colour), and
// `warp` / `warpScale` how far (mm) and how broadly the pattern is pushed
// around by a second, slower noise, which turns round blobs into irregular,
// map-like patches.
export const PATTERN_STYLES = {
  // Camo: medium blobs in three colours, half the surface.
  camo: { scale: 10, coverage: 0.5, colorScale: 16, warp: 0 },
  // Holstein cow: bigger, irregular black patches with wavy edges, a bit
  // under half the surface.
  cow: { scale: 15, coverage: 0.4, colorScale: 16, warp: 5, warpScale: 11 },
};

// ---- Noise: smooth, repeatable (seeded) 3D value noise ----
function hash3(ix, iy, iz, seed) {
  let h = (ix * 374761393 + iy * 668265263 + iz * 1274126177 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function valueNoise(x, y, z, seed) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const s = (t) => t * t * (3 - 2 * t);
  const ux = s(fx), uy = s(fy), uz = s(fz);
  const lerp = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => hash3(ix + dx, iy + dy, iz + dz, seed);
  return lerp(
    lerp(lerp(c(0, 0, 0), c(1, 0, 0), ux), lerp(c(0, 1, 0), c(1, 1, 0), ux), uy),
    lerp(lerp(c(0, 0, 1), c(1, 0, 1), ux), lerp(c(0, 1, 1), c(1, 1, 1), ux), uy),
    uz
  );
}
// Two octaves: broad blobs with slightly irregular edges.
function field(p, scale, seed) {
  const [x, y, z] = [p[0] / scale, p[1] / scale, p[2] / scale];
  return 0.7 * valueNoise(x, y, z, seed) + 0.3 * valueNoise(x * 2.3, y * 2.3, z * 2.3, seed + 7);
}

// Where marks go, for a style: the patch noise, sampled at a point pushed
// around by the warp noise when the style has any.
function markFieldFor(style) {
  if (!style.warp) return (p) => field(p, style.scale, 1);
  const ws = style.warpScale;
  return (p) => {
    const x = p[0] / ws, y = p[1] / ws, z = p[2] / ws;
    const q = [
      p[0] + style.warp * (valueNoise(x, y, z, 21) * 2 - 1),
      p[1] + style.warp * (valueNoise(x, y, z, 22) * 2 - 1),
      p[2] + style.warp * (valueNoise(x, y, z, 23) * 2 - 1),
    ];
    return field(q, style.scale, 1);
  };
}
function colorFieldFor(style) { return (p) => field(p, style.colorScale, 2); }

// Thresholds come from the fields' own spread (sampled), so marks cover
// the style's coverage and the mark colours split the marks about evenly,
// whatever the noise's exact distribution. Worked out once per style and
// number of mark colours.
const thresholdCache = new Map();
function thresholdsFor(style, markCount) {
  const k = JSON.stringify(style) + '|' + markCount;
  if (thresholdCache.has(k)) return thresholdCache.get(k);
  const markField = markFieldFor(style), colorField = colorFieldFor(style);
  const a = [], b = [];
  let r = 12345;
  const rnd = () => ((r = (Math.imul(r, 1103515245) + 12345) >>> 0) / 4294967296) * 200 - 100;
  for (let i = 0; i < 20000; i++) { const p = [rnd(), rnd(), rnd()]; a.push(markField(p)); if (markCount > 1) b.push(colorField(p)); }
  a.sort((x, y) => x - y); b.sort((x, y) => x - y);
  const q = (arr, f) => arr[Math.floor(f * (arr.length - 1))];
  const colorCuts = [];
  for (let i = 1; i < markCount; i++) colorCuts.push(q(b, i / markCount));
  const result = { mark: q(a, 1 - style.coverage), colorCuts };
  thresholdCache.set(k, result);
  return result;
}


// Splits every edge longer than maxEdge at its midpoint, repeatedly,
// longest first, but only edges touching a triangle for which
// isOuter(triangle) is true (the visible outside); inside faces stay as
// they are. Each split divides every triangle sharing that edge, so
// neighbouring triangles always agree on their shared vertices and no gaps
// open up, including where fine outside faces meet coarse inside ones.
// Works on the welded mesh (so shared edges are recognised) and returns
// plain triangles plus which of them are on the outside.
//
// Zero-area triangles (thinner than a micron) are removed first.
// ringFaceBetween() uses them to close runs of in-line points: each has
// its middle point lying on its long edge. Splitting that long edge at the middle point (in the real
// triangle on its other side) makes the sliver collapse, so it can be
// dropped with the surface still closed. Left in, subdividing near them
// stacked slivers on top of each other and produced non-manifold edges.
// A midpoint that lands within 3 microns of an existing vertex reuses it.
export function subdivideMesh(mesh, isOuter = () => true, maxEdge = MAX_EDGE_MM, contours = []) {
  const w = mesh.welded();
  const P = [];
  // Along slanted edges a midpoint can land a couple of microns from an
  // existing vertex that's really the same point; making a second vertex
  // there left non-manifold edges once slicers (or checks) merged the two.
  // findNear() below finds the ones that are safe to reuse.
  const NEAR = 0.003;
  const addPoint = (p) => { P.push(p); return P.length - 1; };
  // Only the far corner of a triangle on the edge being split counts: then
  // it's the tip of a hair-thin sliver lying along the edge, and splitting
  // there collapses the sliver cleanly. Any other nearby vertex could be on
  // a different surface (a joined base's cap cells overlap, so a midpoint
  // can land near the next cell's buried wall) or already form a triangle
  // with the edge's ends and far corner; reusing either stacked mirrored
  // duplicate triangles.
  const findNear = (p, a, b, near = NEAR) => {
    const tris = edgeTris.get(key(a, b));
    if (!tris) return undefined;
    for (const t of tris) for (const idx of T[t]) {
      if (idx === a || idx === b) continue;
      if (Math.hypot(P[idx][0] - p[0], P[idx][1] - p[1], P[idx][2] - p[2]) < near) return idx;
    }
    return undefined;
  };
  for (let i = 0; i < w.vertices.length; i += 3) addPoint([w.vertices[i], w.vertices[i + 1], w.vertices[i + 2]]);

  const key = (a, b) => (a < b ? a * 4194304 + b : b * 4194304 + a); // unique for < 4M vertices
  const edgeTris = new Map();
  const addEdge = (a, b, t) => { const k = key(a, b); let s = edgeTris.get(k); if (!s) edgeTris.set(k, (s = new Set())); s.add(t); };
  const removeEdge = (a, b, t) => { const k = key(a, b); const s = edgeTris.get(k); if (s) { s.delete(t); if (!s.size) edgeTris.delete(k); } };
  const T = [];       // triangles as vertex-index triples; null once removed
  const outer = [];   // whether each triangle is on the outside
  const setTri = (t, tri) => {
    if (tri[0] === tri[1] || tri[1] === tri[2] || tri[2] === tri[0]) { T[t] = null; return; } // collapsed
    T[t] = tri;
    addEdge(tri[0], tri[1], t); addEdge(tri[1], tri[2], t); addEdge(tri[2], tri[0], t);
  };
  for (let i = 0; i < w.indices.length; i += 3) {
    const tri = [w.indices[i], w.indices[i + 1], w.indices[i + 2]];
    outer.push(isOuter(tri.map((k) => P[k])));
    T.push(null);
    setTri(T.length - 1, tri);
  }

  // Splits edge a-b at vertex m in every triangle that has that edge.
  const splitEdge = (a, b, m) => {
    const tris = edgeTris.get(key(a, b));
    if (!tris) return;
    for (const t of [...tris]) {
      let [u, v, x] = T[t];
      // Rotate so the split edge comes first, keeping the winding.
      while (!((u === a && v === b) || (u === b && v === a))) [u, v, x] = [v, x, u];
      removeEdge(u, v, t); removeEdge(v, x, t); removeEdge(x, u, t);
      setTri(t, [u, m, x]);
      T.push(null); outer.push(outer[t]);
      setTri(T.length - 1, [m, v, x]);
    }
  };

  // 1. Remove zero-area slivers by splitting their long edge at their
  //    middle point.
  const cross2 = (a, b, c) => {
    const ux = P[b][0] - P[a][0], uy = P[b][1] - P[a][1], uz = P[b][2] - P[a][2];
    const vx = P[c][0] - P[a][0], vy = P[c][1] - P[a][1], vz = P[c][2] - P[a][2];
    return (uy * vz - uz * vy) ** 2 + (uz * vx - ux * vz) ** 2 + (ux * vy - uy * vx) ** 2;
  };
  const dist = (a, b) => Math.hypot(P[a][0] - P[b][0], P[a][1] - P[b][1], P[a][2] - P[b][2]);
  for (let round = 0; round < 8; round++) {
    let found = false;
    for (let t = 0; t < T.length; t++) {
      const tri = T[t];
      if (!tri) continue;
      // The middle point is the one not on the longest side. It counts as
      // a sliver when that point is within a micron of the long side:
      // along a slanted edge, rounding keeps "in-line" points from being
      // exactly in line, and missing those left points a couple of
      // microns apart once the long side was split at its midpoint.
      const sides = [[tri[0], tri[1], tri[2]], [tri[1], tri[2], tri[0]], [tri[2], tri[0], tri[1]]]
        .sort((p, q) => dist(q[0], q[1]) - dist(p[0], p[1]));
      const [a, b, mid] = sides[0];
      const longSide = dist(a, b);
      if (longSide === 0 || Math.sqrt(cross2(a, b, mid)) / longSide > 1e-3) continue;
      splitEdge(a, b, mid);
      found = true;
    }
    if (!found) break;
  }

  // 2. Split long outside edges at their midpoints.
  const len2 = (a, b) => (P[a][0] - P[b][0]) ** 2 + (P[a][1] - P[b][1]) ** 2 + (P[a][2] - P[b][2]) ** 2;
  const max2 = maxEdge * maxEdge;
  for (let pass = 0; pass < 64; pass++) {
    const long = [];
    for (const [k, tris] of edgeTris) {
      let touchesOuter = false;
      for (const t of tris) if (outer[t]) { touchesOuter = true; break; }
      if (!touchesOuter) continue;
      const a = Math.floor(k / 4194304), b = k % 4194304;
      const l = len2(a, b);
      if (l > max2) long.push([l, a, b]);
    }
    if (!long.length) break;
    long.sort((x, y) => y[0] - x[0]);
    for (const [, a, b] of long) {
      if (!edgeTris.has(key(a, b))) continue; // already split this pass
      const mp = [(P[a][0] + P[b][0]) / 2, (P[a][1] + P[b][1]) / 2, (P[a][2] + P[b][2]) / 2];
      let m = findNear(mp, a, b);
      if (m === undefined) m = addPoint(mp);
      if (m === a || m === b) continue; // too short to split
      splitEdge(a, b, m);
    }
  }

  // 3. Cut along boundaries. For each contour ({ field, threshold, skip }),
  //    every outside edge whose ends lie on opposite sides of the threshold
  //    is split exactly where the field crosses it (by linear
  //    interpolation along the edge). Neighbouring triangles share that
  //    point, and a boundary crossing a triangle crosses two of its edges,
  //    so after the splits the boundary runs along triangle edges as a
  //    smooth line through the crossing points: no triangle straddles it.
  //    Without this, each triangle took one colour and blob edges followed
  //    the triangles' own edges, a visible staircase (worst where triangles
  //    are long and thin). New points are exactly on the threshold, so the
  //    edges they create never cross it again: one pass per contour does.
  //    A crossing within 0.05mm of an edge's end isn't split (the boundary
  //    then passes through that corner), to avoid hair-thin slivers and
  //    points a hair apart, which some slicers merge.
  for (const { field, threshold, skip } of contours) {
    const value = new Map();
    const f = (idx) => { let v = value.get(idx); if (v === undefined) { v = field(P[idx]); value.set(idx, v); } return v; };
    const crossing = [];
    for (const [k, tris] of edgeTris) {
      let touchesOuter = false;
      for (const t of tris) if (outer[t]) { touchesOuter = true; break; }
      if (!touchesOuter) continue;
      const a = Math.floor(k / 4194304), b = k % 4194304;
      const fa = f(a) - threshold, fb = f(b) - threshold;
      if (fa * fb >= 0) continue;
      if (skip && skip(P[a], P[b])) continue;
      crossing.push([a, b, fa / (fa - fb)]);
    }
    for (const [a, b, t] of crossing) {
      if (!edgeTris.has(key(a, b))) continue;
      const p = [P[a][0] + (P[b][0] - P[a][0]) * t, P[a][1] + (P[b][1] - P[a][1]) * t, P[a][2] + (P[b][2] - P[a][2]) * t];
      const len = Math.sqrt(len2(a, b));
      if (t * len < 0.05 || (1 - t) * len < 0.05) continue;
      // A sliver's tip lying on this edge near the crossing is really the
      // same point: cut there instead, collapsing the sliver, rather than
      // leaving two points a hair apart.
      let m = findNear(p, a, b, 0.02);
      if (m === undefined) m = addPoint(p);
      splitEdge(a, b, m);
    }
  }

  const out = new Mesh();
  const outerFlags = [];
  T.forEach((tri, t) => {
    if (!tri) return;
    out.addTriangle(P[tri[0]], P[tri[1]], P[tri[2]]);
    outerFlags.push(outer[t]);
  });
  return { mesh: out, outerFlags };
}

// The base with camo marks: the subdivided mesh plus one colour per
// triangle (in triangle order). Only the outside is marked and subdivided:
// the outer walls, the top and bottom faces, and the keyring. Inside faces
// (the recesses, plate, and switch space) stay coarse and in the base
// colour; nobody sees marks there, and subdividing them too more than
// tripled the triangle count. `layout` gives the caps' centres, the base
// cell's half-width, and the base's thickness, which decide what counts as
// outside. Cached, since the preview rebuilds on every slider change and
// the base often hasn't changed.
let cache = null;
export function camoBase(mesh, backgroundHex, markHexes, layout, style = PATTERN_STYLES.camo) {
  const { centers, halfFootprint, thickness } = layout;
  let sum = 0;
  for (let i = 0; i < mesh.vertices.length; i += 7) sum += mesh.vertices[i] * ((i % 13) + 1);
  const cacheKey = `${mesh.vertices.length}:${sum.toFixed(6)}:${backgroundHex}:${markHexes.join(',')}:${JSON.stringify(style)}`;
  if (cache && cache.key === cacheKey) return cache.result;

  // A face is on the outside if stepping a little off it, in the direction
  // it faces, lands in open air: beside the base (outside every cap cell's
  // square), above its top, or below its bottom. Faces pointing into a
  // cell (the recess, plate, and switch-space walls, the recess floor)
  // don't qualify, and neither do the walls buried inside a joined base
  // where neighbouring cells overlap, which point into the next cell.
  const insideCells = (x, y, z) => {
    if (z <= 0 || z >= thickness) return false;
    for (const c of centers) if (Math.max(Math.abs(x - c.x), Math.abs(y - c.y)) < halfFootprint) return true;
    return false;
  };
  const isOuter = ([A, B, C]) => {
    const cx = (A[0] + B[0] + C[0]) / 3, cy = (A[1] + B[1] + C[1]) / 3, cz = (A[2] + B[2] + C[2]) / 3;
    const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const nl = Math.hypot(nx, ny, nz);
    if (nl < 1e-12) return false; // zero-area: no direction to test
    const step = 0.3 / nl;
    return !insideCells(cx + nx * step, cy + ny * step, cz + nz * step);
  };

  // Cut along the pattern's boundaries: where marks start, and (with more
  // than one mark colour) the thresholds that pick a mark's colour, skipped
  // where both ends of an edge are in the unmarked background, where
  // they'd change nothing.
  const markField = markFieldFor(style);
  const colorField = colorFieldFor(style);
  const TH = thresholdsFor(style, markHexes.length);
  const inBackground = (p) => markField(p) < TH.mark;
  const contours = [
    { field: markField, threshold: TH.mark },
    ...TH.colorCuts.map((threshold) => ({ field: colorField, threshold, skip: (a, b) => inBackground(a) && inBackground(b) })),
  ];
  const { mesh: fine, outerFlags } = subdivideMesh(mesh, isOuter, MAX_EDGE_MM, contours);

  // Each triangle's colour comes from the fields' average over its three
  // corners: after the cuts, every triangle lies on one side of each
  // boundary (corners on a boundary sit exactly at its threshold), so the
  // average is on the right side without sampling the centre.
  const colors = [];
  const v = fine.vertices;
  for (let t = 0, i = 0; i < v.length; i += 9, t++) {
    if (!outerFlags[t]) { colors.push(backgroundHex); continue; }
    const corners = [[v[i], v[i + 1], v[i + 2]], [v[i + 3], v[i + 4], v[i + 5]], [v[i + 6], v[i + 7], v[i + 8]]];
    const a = (markField(corners[0]) + markField(corners[1]) + markField(corners[2])) / 3;
    if (a < TH.mark) { colors.push(backgroundHex); continue; }
    if (markHexes.length === 1) { colors.push(markHexes[0]); continue; }
    const b = (colorField(corners[0]) + colorField(corners[1]) + colorField(corners[2])) / 3;
    let idx = 0;
    while (idx < TH.colorCuts.length && b >= TH.colorCuts[idx]) idx++;
    colors.push(markHexes[idx]);
  }
  const result = { mesh: fine, triangleColors: colors };
  cache = { key: cacheKey, result };
  return result;
}
