// Plain indexed triangle mesh in millimeters, Z-up — same convention as the
// native KeyCapForge app this was ported from.
export class Mesh {
  constructor() {
    this.vertices = []; // flat [x,y,z, x,y,z, ...]
    this.normals = [];
    this.indices = [];
  }

  append(other, tx = 0, ty = 0, tz = 0) {
    const offset = this.vertices.length / 3;
    for (let i = 0; i < other.vertices.length; i += 3) {
      this.vertices.push(other.vertices[i] + tx, other.vertices[i + 1] + ty, other.vertices[i + 2] + tz);
    }
    // Not `this.normals.push(...other.normals)` — spreading a large array
    // into push() passes every element as an individual function argument,
    // and JS engines cap how many arguments a call can take (tens of
    // thousands, varies by engine). The voxelized legend text mesh can
    // comfortably have more normals than that limit, which is exactly what
    // triggered a very real "Maximum call stack size exceeded" here. A
    // plain loop has no such limit regardless of array size.
    for (let i = 0; i < other.normals.length; i++) this.normals.push(other.normals[i]);
    for (const idx of other.indices) this.indices.push(idx + offset);
  }

  addTriangle(a, b, c) {
    const n = triangleNormal(a, b, c);
    const base = this.vertices.length / 3;
    this.vertices.push(...a, ...b, ...c);
    this.normals.push(...n, ...n, ...n);
    this.indices.push(base, base + 1, base + 2);
  }

  addQuad(a, b, c, d) {
    this.addTriangle(a, b, c);
    this.addTriangle(a, c, d);
  }

  // Returns a new mesh with every vertex at (effectively) the same
  // position merged into one shared index, remapping triangle indices to
  // match — a plain vertex weld, dropping per-vertex normals (STL/3MF
  // export never uses them; see below) rather than trying to average or
  // pick one at a shared vertex.
  //
  // This turned out to be the actual, root-cause explanation for
  // "floating regions", a joined base's own recess/cutout detail
  // vanishing under slicing, and an exported object showing exactly
  // triangleCount*3 "open edges" in Bambu Studio's own diagnostics —
  // every single edge, not some subset. addTriangle() above always
  // pushes 3 brand-new vertex entries, even when a neighboring triangle
  // built moments earlier sits at the EXACT same physical position (e.g.
  // two adjacent quads sharing an edge in the same loftShell loop) — so
  // no two triangles anywhere in this codebase have ever shared a vertex
  // INDEX, no matter how perfectly their positions coincide. That's
  // invisible to every manifoldness check used throughout this whole
  // investigation, including this project's own — they all worked by
  // rounded POSITION (exactly to work around Mesh never welding in the
  // first place), which correctly proved the underlying geometry is
  // sound, but couldn't catch or represent this at all, since it isn't a
  // geometry defect — the shape has always been genuinely watertight by
  // position. But 3MF's whole point is expressing shared topology
  // through shared vertex indices, and a checker or slicer that relies on
  // that (as it's reasonable to, given the format) sees a fully
  // unwelded mesh as completely disconnected: every triangle a private
  // island, regardless of where any of its corners physically sit. That
  // exactly explains a slicer falling back to some best-effort
  // reconstruction it can trust instead — losing internal detail,
  // merging overlapping parts incorrectly, flagging regions as floating —
  // all without any actual hole or gap ever existing in the geometry
  // itself. STL was affected identically for a related but separate
  // reason: it has no shared-vertex concept at all, by format design, so
  // this was never visible there as a defect either way — but a slicer
  // still has to weld an STL by position on import to make any sense of
  // it, and whatever heuristic or tolerance it uses for that is a very
  // different, opaque thing from this codebase choosing precisely how and
  // when to weld its own geometry deliberately. This is called once, on
  // each finished object, right before STL/3MF export — never on the
  // mesh handed to the live preview, which keeps its own per-triangle
  // (flat-shaded) normals exactly as before.
  welded(precision = 4) {
    const posToIndex = new Map();
    const newVertices = [];
    const remap = new Array(this.vertices.length / 3);
    for (let i = 0; i < this.vertices.length / 3; i++) {
      const x = this.vertices[i * 3], y = this.vertices[i * 3 + 1], z = this.vertices[i * 3 + 2];
      const key = `${x.toFixed(precision)},${y.toFixed(precision)},${z.toFixed(precision)}`;
      let idx = posToIndex.get(key);
      if (idx === undefined) {
        idx = newVertices.length / 3;
        newVertices.push(x, y, z);
        posToIndex.set(key, idx);
      }
      remap[i] = idx;
    }
    const result = new Mesh();
    result.vertices = newVertices;
    result.indices = this.indices.map((i) => remap[i]);
    return result;
  }

  // Rotates in-plane around Z (through the mesh's own local origin).
  rotatedZ(degrees) {
    if (degrees % 360 === 0) return this;
    const rad = (degrees * Math.PI) / 180;
    const c = Math.cos(rad), s = Math.sin(rad);
    const m = new Mesh();
    for (let i = 0; i < this.vertices.length; i += 3) {
      const [x, y, z] = [this.vertices[i], this.vertices[i + 1], this.vertices[i + 2]];
      m.vertices.push(x * c - y * s, x * s + y * c, z);
    }
    for (let i = 0; i < this.normals.length; i += 3) {
      const [x, y, z] = [this.normals[i], this.normals[i + 1], this.normals[i + 2]];
      m.normals.push(x * c - y * s, x * s + y * c, z);
    }
    m.indices = this.indices.slice();
    return m;
  }

  translated(tx, ty, tz) {
    const m = new Mesh();
    for (let i = 0; i < this.vertices.length; i += 3) {
      m.vertices.push(this.vertices[i] + tx, this.vertices[i + 1] + ty, this.vertices[i + 2] + tz);
    }
    m.normals = this.normals.slice();
    m.indices = this.indices.slice();
    return m;
  }

  // A true 180° rotation around a line parallel to X, through Y=0 and
  // Z=capHeight/2 — not a mirror. Remaps Z from [0, capHeight] back into
  // [0, capHeight] with top and bottom swapped, and negates Y to match (a
  // real physical flip, the same as picking the part up and turning it
  // over). Since it's a rotation rather than a reflection, winding order
  // and normals both stay correct on their own — Y and Z simply negate for
  // normals too, no need to reverse triangle vertex order anywhere this
  // gets used. Exists specifically for exporting keycaps top-face-down:
  // see buildLegend's 'engraved' default in keycapBuilder.js for why a
  // flush top surface is worth printing that way in the first place.
  flippedForPrint(capHeight) {
    const m = new Mesh();
    for (let i = 0; i < this.vertices.length; i += 3) {
      m.vertices.push(this.vertices[i], -this.vertices[i + 1], capHeight - this.vertices[i + 2]);
    }
    for (let i = 0; i < this.normals.length; i += 3) {
      m.normals.push(this.normals[i], -this.normals[i + 1], -this.normals[i + 2]);
    }
    m.indices = this.indices.slice();
    return m;
  }

  get isEmpty() { return this.vertices.length === 0; }
}

export function triangleNormal(a, b, c) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz);
  return len > 1e-8 ? [nx / len, ny / len, nz / len] : [0, 0, 1];
}

// A closed 2D polygon loop (array of [x, y] points), CCW for an outer
// boundary. Direct port of Polygon2D.swift's helpers actually used here.
export class Polygon2D {
  constructor(points) { this.points = points; }

  get signedArea() {
    let sum = 0;
    const p = this.points;
    for (let i = 0; i < p.length; i++) {
      const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length];
      sum += x1 * y2 - x2 * y1;
    }
    return sum * 0.5;
  }

  get centroid() {
    let cx = 0, cy = 0;
    for (const [x, y] of this.points) { cx += x; cy += y; }
    return [cx / this.points.length, cy / this.points.length];
  }

  // Approximate inward offset for wall thickness — scales toward the
  // centroid rather than a true polygon offset (same simplification, and
  // same caveat on star/heart/flower shapes, as the native app).
  insetApprox(thickness) {
    const [cx, cy] = this.centroid;
    let avgR = 0;
    for (const [x, y] of this.points) avgR += Math.hypot(x - cx, y - cy);
    avgR /= this.points.length;
    if (avgR < 0.001) return this;
    const scale = Math.max(0.05, (avgR - thickness) / avgR);
    return new Polygon2D(this.points.map(([x, y]) => [cx + (x - cx) * scale, cy + (y - cy) * scale]));
  }

  translated(tx, ty) {
    return new Polygon2D(this.points.map(([x, y]) => [x + tx, y + ty]));
  }
}

// Insets a cell's own outline — still centered at the origin, before
// translation to its actual (cx, cy) position — along specific
// axis-aligned sides only, given explicitly (which of a rectangular
// cell's 4 sides are outer-facing is known directly from its position in
// a row, never ambiguous), rather than inferring it from a geometric
// "is this point near some reference shape's boundary" check. That
// geometric approach (an earlier version, insetOuterFacing) was
// ambiguous exactly at a corner where one adjacent edge is outer-facing
// and the other is an internal boundary shared with a neighboring cell —
// that corner point sits on both at once, a distance-based check can't
// cleanly tell them apart, and it produced a partial, asymmetric inset
// exactly at the corner (confirmed directly: an X range of roughly
// [-9.5, 10.0] where a clean, fully-inset or fully-uninset corner would
// give a symmetric range) — visible as a small notch right at that
// corner, precisely where reported. Knowing directly which sides are
// outer-facing resolves the ambiguity outright: a corner where only one
// adjacent side is outer-facing insets along just that one axis, not both.
export function insetCellSides(polygon, halfSize, amount, { left, right, top, bottom }) {
  if (Math.abs(amount) < 0.01) return polygon;
  const EPS = 0.05;
  return new Polygon2D(polygon.points.map(([x, y]) => {
    let nx = x, ny = y;
    if (left && Math.abs(x + halfSize) < EPS) nx = x + amount;
    if (right && Math.abs(x - halfSize) < EPS) nx = x - amount;
    if (top && Math.abs(y - halfSize) < EPS) ny = y - amount;
    if (bottom && Math.abs(y + halfSize) < EPS) ny = y + amount;
    return [nx, ny];
  }));
}

// Resamples any polygon to exactly `n` points via arc-length interpolation.
// ringFace()/loftShell() connect two profiles by direct index correspondence
// (point i of one to point i of the other) rather than any general
// polygon-with-hole triangulation — deliberately, since that's the
// technique that's proven reliable throughout this project. That only
// works when both profiles have the same point count, which was always
// true before (everything came from the same roundedRect generator).
// Connecting a cap's own shape — a hexagon's 6 points, a heart's 64, a
// pentagon's 5 — to the base's square cell outline needed a general way to
// make any two shapes compatible, hence this.
export function resamplePolygon(polygon, n) {
  const pts = polygon.points;
  const m = pts.length;
  if (m === 0) return polygon;
  const cum = [0];
  for (let i = 0; i < m; i++) {
    const a = pts[i], b = pts[(i + 1) % m];
    cum.push(cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const total = cum[m] || 1;

  // Detects sharp corners (a significant direction change) in the
  // ORIGINAL polygon and force-preserves their exact position in the
  // resampled output — snapping the single nearest regular sample to it —
  // rather than relying purely on evenly-spaced arc-length sampling,
  // which can land arbitrarily close to a sharp corner without ever
  // landing exactly on it. That matters specifically when two
  // DIFFERENTLY-SHAPED polygons are supposed to share an exact boundary
  // corner — two adjacent base cells with different corner rounding, say:
  // each one's independent resampling can miss that shared point by a
  // different amount even though the underlying geometry coincides
  // exactly there, which showed up as a small visible notch/cut right at
  // that corner. Confirmed directly: an unbeveled 21mm cell's resampled
  // bottom edge (a plain straight, sharp-cornered line) ranged from
  // roughly -9.5 to +10.0, not the true corners at ±10.5 at all — the
  // exact corner vertices simply weren't among the 64 evenly-spaced
  // arc-length samples. Snapping guarantees any polygon with a genuinely
  // sharp vertex at a given (x,y) will include that EXACT position in its
  // resampled output, so two shapes that share that corner will always
  // agree there regardless of their different overall perimeters/point
  // distributions — even though the two shapes' resampled points won't
  // necessarily land at the SAME INDEX for that shared corner (their
  // total perimeters differ, so the corner falls at a different
  // fractional position along each one), which doesn't matter here since
  // adjacent cells build fully independent, self-contained walls rather
  // than being connected to each other via index correspondence at all —
  // what matters is that both shapes trace the exact same boundary line,
  // not that their internal point ordering matches.
  const sharpIndices = [];
  for (let i = 0; i < m; i++) {
    const prev = pts[(i - 1 + m) % m], cur = pts[i], next = pts[(i + 1) % m];
    const v1x = cur[0] - prev[0], v1y = cur[1] - prev[1];
    const v2x = next[0] - cur[0], v2y = next[1] - cur[1];
    const len1 = Math.hypot(v1x, v1y), len2 = Math.hypot(v2x, v2y);
    if (len1 < 1e-9 || len2 < 1e-9) continue;
    const cosAngle = (v1x * v2x + v1y * v2y) / (len1 * len2);
    // A turn of more than ~15° (cos < ~0.966) counts as sharp — catches
    // genuine corners (90°, etc.) while leaving the fine near-straight
    // segments that make up an already-rounded arc alone.
    if (cosAngle < 0.966) sharpIndices.push(i);
  }

  const result = new Array(n);
  const usedSlots = new Set();
  for (const i of sharpIndices) {
    const idealK = Math.round((cum[i] / total) * n) % n;
    let slot = idealK, offset = 0;
    while (usedSlots.has(slot) && offset <= n) {
      offset++;
      slot = (idealK + offset) % n;
    }
    usedSlots.add(slot);
    result[slot] = [pts[i][0], pts[i][1]];
  }
  for (let k = 0; k < n; k++) {
    if (result[k]) continue;
    const target = (k / n) * total;
    let i = 0;
    while (i < m && cum[i + 1] < target) i++;
    const segStart = cum[i], segLen = cum[i + 1] - segStart;
    const t = segLen > 1e-9 ? (target - segStart) / segLen : 0;
    const a = pts[i], b = pts[(i + 1) % m];
    result[k] = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }
  return new Polygon2D(result);
}

// Simple ear-clip triangulation for a polygon with NO holes — always safe
// (no bridging, no risk of the hole-cutting bugs the native app fought).
// Returns an array of [i, j, k] index triples into `polygon.points`.
export function earClip(polygon) {
  const pts = polygon.points;
  if (pts.length < 3) return [];
  // Ensure CCW.
  let working = pts.slice();
  if (polygon.signedArea < 0) working.reverse();
  let indices = working.map((_, i) => i);
  const triangles = [];
  const cross2 = (ax, ay, bx, by) => ax * by - ay * bx;
  // A small tolerance, not exact zero, on both the convexity test below and
  // this containment test — this is the actual fix for star/heart shapes
  // rendering incorrectly. Concave shapes with points near the polygon's
  // own centroid (a star's inner valleys, a heart's inner notch) routinely
  // produce cross products that land within floating-point noise of zero
  // rather than cleanly positive or negative. A strict zero-tolerance
  // comparison can then reject every remaining valid ear at some point in
  // the clip — and when that happens, the loop below silently falls back
  // to a naive fan triangulation that only produces correct geometry for
  // convex shapes, drawing triangles that cut outside the actual concave
  // boundary instead. Widening the tolerance here is what keeps the real
  // ear-clipping algorithm running to completion instead of hitting that
  // fallback in the first place.
  const EPS = 1e-7;
  const pointInTri = (p, a, b, c) => {
    const d1 = cross2(b[0] - a[0], b[1] - a[1], p[0] - a[0], p[1] - a[1]);
    const d2 = cross2(c[0] - b[0], c[1] - b[1], p[0] - b[0], p[1] - b[1]);
    const d3 = cross2(a[0] - c[0], a[1] - c[1], p[0] - c[0], p[1] - c[1]);
    const hasNeg = d1 < -EPS || d2 < -EPS || d3 < -EPS;
    const hasPos = d1 > EPS || d2 > EPS || d3 > EPS;
    return !(hasNeg && hasPos);
  };
  const maxIter = indices.length * indices.length + 8;
  let guard = 0;
  while (indices.length > 3 && guard < maxIter) {
    guard++;
    let earFound = false;
    for (let i = 0; i < indices.length; i++) {
      const iPrev = indices[(i - 1 + indices.length) % indices.length];
      const iCur = indices[i];
      const iNext = indices[(i + 1) % indices.length];
      const a = working[iPrev], b = working[iCur], c = working[iNext];
      if (cross2(b[0] - a[0], b[1] - a[1], c[0] - a[0], c[1] - a[1]) <= EPS) continue;
      let contains = false;
      for (const j of indices) {
        if (j === iPrev || j === iCur || j === iNext) continue;
        if (pointInTri(working[j], a, b, c)) { contains = true; break; }
      }
      if (contains) continue;
      triangles.push([iPrev, iCur, iNext]);
      indices.splice(i, 1);
      earFound = true;
      break;
    }
    if (!earFound) break;
  }
  if (indices.length === 3) triangles.push([indices[0], indices[1], indices[2]]);
  else if (indices.length > 3) {
    // Reaching here means the tolerance above still wasn't enough for some
    // pathological remaining shape — extremely unlikely now, but this
    // fallback is only ever a last resort, not a routine path the way it
    // was before this fix.
    for (let i = 1; i < indices.length - 1; i++) triangles.push([indices[0], indices[i], indices[i + 1]]);
  }
  return { points: working, triangles };
}

// Extrudes an outer polygon (no holes) into a solid prism: top, bottom, and
// side walls following the boundary edges of its triangulation.
export function extrudeSolid(polygon, z0, z1) {
  const { points, triangles } = earClip(polygon);
  const mesh = new Mesh();
  for (const [a, b, c] of triangles) {
    mesh.addTriangle([points[a][0], points[a][1], z1], [points[b][0], points[b][1], z1], [points[c][0], points[c][1], z1]);
    mesh.addTriangle([points[a][0], points[a][1], z0], [points[c][0], points[c][1], z0], [points[b][0], points[b][1], z0]);
  }
  const edgeCount = new Map(), edgeOrder = new Map();
  const key = (i, j) => `${Math.min(i, j)}_${Math.max(i, j)}`;
  for (const [a, b, c] of triangles) {
    for (const [i, j] of [[a, b], [b, c], [c, a]]) {
      const k = key(i, j);
      edgeCount.set(k, (edgeCount.get(k) || 0) + 1);
      edgeOrder.set(k, [i, j]);
    }
  }
  for (const [k, count] of edgeCount) {
    if (count !== 1) continue;
    const [i, j] = edgeOrder.get(k);
    const pi = points[i], pj = points[j];
    mesh.addQuad([pi[0], pi[1], z0], [pj[0], pj[1], z0], [pj[0], pj[1], z1], [pi[0], pi[1], z1]);
  }
  return mesh;
}

// Lofts side walls between two profiles of matching point count.
export function loftShell(bottom, top, z0, z1, flip = false) {  const mesh = new Mesh();
  const n = Math.min(bottom.points.length, top.points.length);
  for (let i = 0; i < n; i++) {
    const i2 = (i + 1) % n;
    const b0 = [bottom.points[i][0], bottom.points[i][1], z0];
    const b1 = [bottom.points[i2][0], bottom.points[i2][1], z0];
    const t0 = [top.points[i][0], top.points[i][1], z1];
    const t1 = [top.points[i2][0], top.points[i2][1], z1];
    if (flip) mesh.addQuad(b1, b0, t0, t1);
    else mesh.addQuad(b0, b1, t1, t0);
  }
  return mesh;
}

// Flat ring face between two matching-point-count profiles at the same Z —
// used for the base's top/bottom faces around a hole (plate mount, keyring)
// instead of any hole-triangulating algorithm.
export function ringFace(outer, inner, z, facingDown) {
  const mesh = new Mesh();
  const n = Math.min(outer.points.length, inner.points.length);
  for (let i = 0; i < n; i++) {
    const i2 = (i + 1) % n;
    const o0 = [outer.points[i][0], outer.points[i][1], z];
    const o1 = [outer.points[i2][0], outer.points[i2][1], z];
    const in0 = [inner.points[i][0], inner.points[i][1], z];
    const in1 = [inner.points[i2][0], inner.points[i2][1], z];
    if (facingDown) mesh.addQuad(o1, o0, in0, in1);
    else mesh.addQuad(o0, o1, in1, in0);
  }
  return mesh;
}

// A flat ring between two outlines at height z (outer surrounding inner),
// for when their points don't line up one-to-one. ringFace() above pairs
// point i with point i, which only works when the two outlines' points sit
// at matching angles; when they don't (a round stem boss against a cross,
// or a round recess against a square base cell), the pairings cross each
// other and the ring folds over itself, which slicers render as a ragged,
// flickering patch.
//
// This uses the standard method for a polygon with a hole: cut a "bridge"
// from the inner outline's rightmost point to the nearest outer point it
// can see, which turns the ring into one outline (outer counter-clockwise,
// across the bridge, inner clockwise, back across the bridge), then
// ear-clip that outline. It handles any two nested outlines, with
// different point counts, concave notches, and corners, which two
// step-by-step pairing methods tried first did not: both still left a few
// folded triangles at the base's corners. Only points strictly inside a
// candidate triangle block it, because the bridge's two ends appear twice
// in the joined outline, sitting exactly on the corners of triangles next
// to the bridge. Both outlines must run counter-clockwise.
//
// The result is checked: its triangles must cover exactly the area between
// the two outlines. That fails only when inner doesn't lie inside outer,
// which happens where two shapes genuinely collide (a star cap's stem boss
// overlapping its cavity wall, or a switch's square plate hole reaching
// past a round recess): no flat ring can be valid there. Then this falls
// back to ringFaceZipper(), which always produces a closed surface (no
// open edges), matching what these spots looked like before, overlapping
// itself where the shapes collide. `center` is only used by that fallback.
export function ringFaceBetween(outer, inner, z, facingDown, center = [0, 0]) {
  const O = outer.points, I = inner.points, n = O.length, m = I.length;
  const area2 = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
  const same = (a, b) => Math.abs(a[0] - b[0]) < 1e-12 && Math.abs(a[1] - b[1]) < 1e-12;
  const crosses = (p, q, a, b) => {
    if (same(p, a) || same(p, b) || same(q, a) || same(q, b)) return false;
    const d1 = area2(p, q, a), d2 = area2(p, q, b), d3 = area2(a, b, p), d4 = area2(a, b, q);
    return d1 * d2 < 0 && d3 * d4 < 0;
  };
  const clear = (p, q) => {
    for (let k = 0; k < n; k++) if (crosses(p, q, O[k], O[(k + 1) % n])) return false;
    for (let k = 0; k < m; k++) if (crosses(p, q, I[k], I[(k + 1) % m])) return false;
    return true;
  };
  // Bridge: the inner outline's rightmost point, to the nearest outer point
  // whose connecting segment crosses neither outline.
  let bi = 0;
  for (let k = 1; k < m; k++) if (I[k][0] > I[bi][0]) bi = k;
  const order = O.map((p, k) => k).sort((a, b) =>
    ((O[a][0] - I[bi][0]) ** 2 + (O[a][1] - I[bi][1]) ** 2) - ((O[b][0] - I[bi][0]) ** 2 + (O[b][1] - I[bi][1]) ** 2));
  const bo = order.find((k) => clear(I[bi], O[k])) ?? order[0];

  // Joined outline: outer from the bridge point all the way round and back
  // to it, then inner clockwise from its bridge point back to it.
  const pts = [];
  for (let k = 0; k <= n; k++) pts.push(O[(bo + k) % n]);
  for (let k = 0; k <= m; k++) pts.push(I[((bi - k) % m + m) % m]);

  const tris = [];
  const idx = pts.map((_, k) => k);
  const EPS = 1e-10;
  const strictlyInside = (p, a, b, c) =>
    !same(p, a) && !same(p, b) && !same(p, c) && area2(a, b, p) > EPS && area2(b, c, p) > EPS && area2(c, a, p) > EPS;
  // Ear-clips the joined outline. Normally only proper ears (convex
  // corners) are clipped. Straight edges have runs of points in a line,
  // though, and those can be left over at the end as a flat sliver with no
  // proper ear; leaving it would leave its edges open, so then a flat
  // corner is clipped instead, closing it with a zero-area triangle.
  const tryClip = (allowFlat) => {
    for (let k = 0; k < idx.length; k++) {
      const ia = idx[(k - 1 + idx.length) % idx.length], ib = idx[k], ic = idx[(k + 1) % idx.length];
      const a = pts[ia], b = pts[ib], c = pts[ic];
      const ar = area2(a, b, c);
      if (allowFlat ? ar < -EPS : ar <= EPS) continue; // reflex (or flat, unless allowed)
      let blocked = false;
      for (const q of idx) {
        if (q === ia || q === ib || q === ic) continue;
        if (strictlyInside(pts[q], a, b, c)) { blocked = true; break; }
      }
      if (blocked) continue;
      tris.push([a, b, c]);
      idx.splice(k, 1);
      return true;
    }
    return false;
  };
  let guard = idx.length * idx.length;
  while (idx.length > 3 && guard-- > 0) {
    if (!tryClip(false) && !tryClip(true)) break;
  }
  if (idx.length === 3 && area2(pts[idx[0]], pts[idx[1]], pts[idx[2]]) >= -EPS) tris.push(idx.map((k) => pts[k]));

  const polyArea2 = (P) => { let a = 0; for (let k = 0; k < P.length; k++) { const p = P[k], q = P[(k + 1) % P.length]; a += p[0] * q[1] - q[0] * p[1]; } return a; };
  const ringArea2 = polyArea2(O) - polyArea2(I);
  const covered2 = tris.reduce((t, [a, b, c]) => t + area2(a, b, c), 0);
  if (tris.length !== n + m || Math.abs(covered2 - ringArea2) > 1e-6 * Math.max(1, Math.abs(ringArea2))) {
    return ringFaceZipper(outer, inner, z, facingDown, center);
  }

  const mesh = new Mesh();
  for (const [a, b, c] of tris) { // each runs counter-clockwise (facing up)
    const pa = [a[0], a[1], z], pb = [b[0], b[1], z], pc = [c[0], c[1], z];
    if (facingDown) mesh.addTriangle(pa, pc, pb); else mesh.addTriangle(pa, pb, pc);
  }
  return mesh;
}

// Fallback for ringFaceBetween(): walks both outlines counter-clockwise
// around `center`, each step adding a triangle that advances whichever
// outline's next point comes first by angle. Every edge of both outlines
// is used exactly once, so the surface is always closed, but it can
// overlap itself where the outlines aren't nested.
function ringFaceZipper(outer, inner, z, facingDown, center) {
  const angleOf = ([x, y]) => { const a = Math.atan2(y - center[1], x - center[0]); return a < 0 ? a + 2 * Math.PI : a; };
  const prepare = (P) => {
    let s = 0;
    for (let k = 1; k < P.length; k++) if (angleOf(P[k]) < angleOf(P[s])) s = k;
    const pts = [];
    for (let k = 0; k <= P.length; k++) pts.push(P[(s + k) % P.length]);
    const angles = pts.map(angleOf);
    for (let k = 1; k < angles.length; k++) while (angles[k] < angles[k - 1]) angles[k] += 2 * Math.PI;
    return { pts, angles };
  };
  const A = prepare(outer.points), B = prepare(inner.points);
  const n = outer.points.length, m = inner.points.length;
  const mesh = new Mesh();
  const emit = (a, b, c) => { // a, b, c as they'd run counter-clockwise on a valid ring
    const pa = [a[0], a[1], z], pb = [b[0], b[1], z], pc = [c[0], c[1], z];
    if (facingDown) mesh.addTriangle(pa, pc, pb); else mesh.addTriangle(pa, pb, pc);
  };
  let i = 0, j = 0;
  while (i < n || j < m) {
    const nextA = i < n ? A.angles[i + 1] : Infinity, nextB = j < m ? B.angles[j + 1] : Infinity;
    if (nextA <= nextB) { emit(A.pts[i], A.pts[i + 1], B.pts[j]); i++; }
    else { emit(B.pts[j + 1], B.pts[j], A.pts[i]); j++; }
  }
  return mesh;
}

function lerp(a, b, t) { return a + (b - a) * t; }

export function lerpProfile(a, b, t) {
  const n = Math.min(a.points.length, b.points.length);
  const pts = [];
  for (let i = 0; i < n; i++) pts.push([lerp(a.points[i][0], b.points[i][0], t), lerp(a.points[i][1], b.points[i][1], t)]);
  return new Polygon2D(pts);
}
