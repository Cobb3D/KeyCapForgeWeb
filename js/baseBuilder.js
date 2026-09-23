import { Mesh, Polygon2D, loftShell, ringFace, earClip, resamplePolygon, insetCellSides } from './mesh.js';
import { roundedRect, roundedRectPerCorner, regularPolygon, profileFor } from './shapeProfiles.js';

// Every profile that gets connected to another one (via ringFace/loftShell)
// in this file is resampled to this many points first, so a hexagon's 6
// points, a heart's 64, and the base's own square cell can all be used
// together — see resamplePolygon() in mesh.js for why that's necessary.
const RESAMPLE_N = 64;

// Solid floor under the switch clearance shaft: what the bottom of a
// pressed-in switch rests on. It was a fixed 0.6mm (three printed layers),
// and a switch could be pushed straight through it; it's now a setting,
// floorThicknessMM, defaulting to 2mm.
export function floorThicknessFor(settings) {
  return settings.floorThicknessMM ?? 2.0;
}

// Real MX switches need genuine vertical room below the plate for the
// lower housing to travel into before the clips can engage — this is a
// hard, non-negotiable minimum, not a nice-to-have, and it's reserved
// FIRST (bottom-up: floor, then clearance shaft, then plate thickness) —
// only whatever height remains at the top is available for the (purely
// cosmetic) recess. Exported so app.js can use the exact same formula to
// pick a sensible starting value for recessDepthMM, rather than a
// hand-picked number that could drift out of sync with this reservation
// as settings change.
export function maxSafeRecessDepth(settings) {
  const reservedBelowRecess = floorThicknessFor(settings) + settings.clearanceHeightMM + settings.plateThicknessMM;
  return Math.max(0.2, settings.baseThicknessMM - reservedBelowRecess);
}


// How much bigger than a cap's own bottom footprint its recess is cut —
// shared between buildBlock() (which cuts the recess) and the keyring
// overlap clamp (which needs to know how close that recess comes to the
// base's outer edge). These drifting out of sync is exactly how the lug
// ended up able to intersect the recess after the recess feature was
// added later without this clamp being updated to match.
const RECESS_CLEARANCE_MM = 0.6;

// How far the base's own top/bottom bevel eats into its overall
// thickness. Works correctly for both a single-cell base and a joined
// multi-cap one — each cell builds its own wall from its own localOuter
// (see buildBlock), and insetCellSides() (mesh.js) only insets the sides
// explicitly known to be on the whole block's true outer boundary,
// leaving a side shared with an adjacent cell exactly where it was.
function baseTopBevelFor(settings) {
  return Math.min(settings.baseTopBevelMM, settings.baseThicknessMM * 0.15);
}
function baseBottomBevelFor(settings) {
  return Math.min(settings.baseBottomBevelMM, settings.baseThicknessMM * 0.15);
}

export function pitchFor(settings) {
  return settings.joinedBase ? settings.baseFootprintMM : settings.baseFootprintMM + settings.joinGapMM;
}

// Returns {x, y} centers rather than plain numbers, since caps can now line
// up along either axis. Vertical layout puts cap 0 at the top (y=0) and
// each subsequent cap below it — the natural reading order when the whole
// thing is actually hanging from a ring at the top.
export function capCenters(count, settings) {
  const p = pitchFor(settings);
  const centers = [];
  for (let i = 0; i < count; i++) {
    centers.push(settings.verticalLayout ? { x: 0, y: -i * p } : { x: i * p, y: 0 });
  }
  return centers;
}

// `caps` is the array of cap designs (needs each one's `.shape`) — the
// recess each cap nests into is shaped to match, not just a plain square.
export function buildBase(caps, settings) {
  const count = caps.length;
  const centers = capCenters(count, settings);
  const footprint = settings.baseFootprintMM;
  const thickness = settings.baseThicknessMM;
  const mesh = new Mesh();

  const cells = centers.map((c, i) => ({ cx: c.x, cy: c.y, shape: caps[i]?.shape || 'square' }));

  if (settings.joinedBase && count > 1) {
    const pitch = pitchFor(settings);
    const spanLong = pitch * (count - 1) + footprint;
    const midX = (centers[0].x + centers[count - 1].x) / 2;
    const midY = (centers[0].y + centers[count - 1].y) / 2;
    // Resampled to RESAMPLE_N, same as localOuter inside buildBlock — this
    // was the actual bug behind a serious reported regression (exported
    // files losing detail entirely once sliced): outer here kept its
    // native ~36-point roundedRect structure while localOuter was
    // explicitly resampled to 64 points, and loftShell/ringFace connect
    // profiles by direct index correspondence using
    // Math.min(bottom.length, top.length) — so the wall's top edge (from
    // outer) and the top-face ring's own boundary (from localOuter) never
    // actually matched up, even at identical corner radii, because arc-
    // length resampling to a different point count places points at
    // different physical positions along the same perimeter. Confirmed
    // directly: 64 open edges tracing an entire straight side of a plain
    // single-cap base's own top face, with the bevel feature switched off
    // entirely — a base with its own top perimeter this open is exactly
    // the kind of defect a slicer's auto-repair could "fix" by filling in
    // or simplifying the whole top surface, matching the reported symptom.
    const outer = resamplePolygon(settings.verticalLayout
      ? roundedRect(footprint, spanLong, Math.min(footprint * 0.08, 0.6)).translated(midX, midY)
      : roundedRect(spanLong, footprint, Math.min(footprint * 0.08, 0.6)).translated(midX, midY), RESAMPLE_N);
    mesh.append(buildBlock(outer, cells, thickness, settings));
  } else {
    for (const cell of cells) {
      const outer = resamplePolygon(roundedRect(footprint, footprint, Math.min(footprint * 0.08, 0.6)).translated(cell.cx, cell.cy), RESAMPLE_N);
      mesh.append(buildBlock(outer, [cell], thickness, settings));
    }
  }

  if (settings.keyringStyle !== 'none' && centers.length > 0) {
    const xs = centers.map((c) => c.x), ys = centers.map((c) => c.y);
    const minX = Math.min(...xs) - footprint / 2, maxX = Math.max(...xs) + footprint / 2;
    const minY = Math.min(...ys) - footprint / 2, maxY = Math.max(...ys) + footprint / 2;
    const midX = (minX + maxX) / 2, midY = (minY + maxY) / 2;
    const outerR = settings.keyringOuterMM / 2;
    // How far the lug's neck can reach into the base wall without breaking
    // into a cutout. It's checked against the cutouts that exist at the
    // lug's own height: the lug is only the bottom 25% of the base, where
    // the only cutout is the switch clearance shaft (2.6mm of wall at
    // defaults). The cap recess only counts if the lug is tall enough to
    // reach its floor. This used to always check against the recess, left
    // over from when the loop was full height; since the recess is almost
    // as wide as the base, that capped the overlap at 0.9mm, which the
    // base's own 0.8mm bottom bevel cut down to about 0.1mm on the first
    // printed layers. That's why the printed lug barely held on.
    const loopHeight = keyringLoopHeight(settings);
    const recessDepth = Math.min(settings.recessDepthMM, maxSafeRecessDepth(settings), thickness * 0.5);
    const lugReachesRecess = loopHeight > thickness - recessDepth - 0.01;
    const limitingHoleSize = lugReachesRecess
      ? Math.max(settings.clearanceMM, settings.capWidthMM + RECESS_CLEARANCE_MM)
      : settings.clearanceMM;
    const wallThickness = (footprint - limitingHoleSize) / 2;
    const safetyMargin = 0.3;
    const overlap = Math.min(3.0, Math.max(0.5, wallThickness - safetyMargin));
    // The ring sits one full outer radius beyond the base edge (just
    // touching it), so the hole keeps a full ring-wall of material between
    // it and the base; the neck bridges that gap at full width and
    // continues `overlap` into the base.
    const reach = outerR;

    let anchorX = midX, anchorY = midY, rotation = 0;
    switch (settings.keyringSide) {
      case 'right': anchorX = maxX + reach; rotation = -90; break;
      case 'left': anchorX = minX - reach; rotation = 90; break;
      case 'top': anchorY = maxY + reach; rotation = 0; break;
      case 'bottom': anchorY = minY - reach; rotation = 180; break;
    }
    mesh.append(keyringFeature(settings, reach + overlap).rotatedZ(rotation).translated(anchorX, anchorY, 0));
  }

  return mesh;
}

function buildBlock(outer, cells, thickness, settings) {
  const cellSize = settings.baseFootprintMM;
  const mesh = new Mesh();
  const topBevel = baseTopBevelFor(settings);
  const bottomBevel = baseBottomBevelFor(settings);

  cells.forEach(({ cx, cy, shape }, i) => {
    // Each cell's own square used to round all 4 of its corners
    // unconditionally, as if every cell were sized to the whole block —
    // a confirmed, real bug: the per-cell top-face ring curved at an
    // INTERNAL cell boundary (shared with an adjacent cell) where the
    // outer wall stays straight/flat, since that's not one of the whole
    // block's own true corners. That mismatch left real, unfilled gaps —
    // confirmed directly: edges shared by only 1 triangle, clustered
    // right around the curved corner region, for a joined multi-cap base
    // with the bevel feature entirely uninvolved (same defect exists at
    // zero bevel) — exactly the kind of open geometry a slicer's repair
    // pass could "fix" by simplifying away real detail, matching a
    // reported regression. Only a cell's ACTUALLY outer-facing corners
    // should round now — the two sides perpendicular to the row are
    // always outer-facing (the row is one cell wide), but a side parallel
    // to the row is outer-facing only for the first cell's leading edge
    // and the last cell's trailing edge; every other same-direction
    // boundary is shared with a neighbor and needs to stay sharp. A
    // corner only rounds when BOTH edges meeting there are outer-facing —
    // rounding it based on just one would cut into the other, which is
    // supposed to stay straight.
    const isFirst = i === 0, isLast = i === cells.length - 1;
    const r = Math.min(cellSize * 0.08, 0.6);
    // Corner order matches roundedRectPerCorner: top-right, top-left,
    // bottom-left, bottom-right.
    const cornerRadii = settings.verticalLayout
      ? [isFirst ? r : 0, isFirst ? r : 0, isLast ? r : 0, isLast ? r : 0]
      : [isLast ? r : 0, isFirst ? r : 0, isFirst ? r : 0, isLast ? r : 0];
    // Which of this cell's 4 sides are actually on the whole block's
    // outer boundary — known directly from its position in the row and
    // the layout direction, the same information cornerRadii above is
    // built from, rather than inferred geometrically from a reference
    // shape (see insetCellSides in mesh.js for why that geometric
    // approach was ambiguous exactly at a shared-boundary corner).
    const outerSides = settings.verticalLayout
      ? { left: true, right: true, top: isFirst, bottom: isLast }
      : { left: isFirst, right: isLast, top: true, bottom: true };
    // Every side that ISN'T outer-facing is shared with a neighboring
    // cell — extended slightly outward (a negative inset via
    // insetCellSides, reusing the same side-flag mechanism the bevel
    // uses) so adjacent cells genuinely overlap in volume there rather
    // than meeting at an exact, knife-edge coincident surface. This
    // directly answers a reported regression that persisted even after
    // the base's open-edge count was independently confirmed at zero: a
    // joined multi-cap base coming out with "floating regions" and its
    // own recess/cutout detail vanishing once sliced. Each cell's wall,
    // top-face ring, and bottom cap are a genuinely closed, independent
    // solid on their own (by design, for the T-junction fix that
    // eliminated the open-edge count) — meaning two adjacent cells were
    // two SEPARATE watertight solids that only touched at a zero-volume
    // shared plane, never actually fused into one continuous solid. A
    // slicer's own inside/outside test can treat that as ambiguous or
    // disconnected even though every individual edge is properly closed,
    // which a plain open-edge count can't detect at all — that failure
    // mode needs genuine overlapping volume, not just a touching surface,
    // to resolve outright. Tried first removing the coincident wall faces
    // at the shared boundary entirely instead of overlapping through it —
    // reverted: adjacent cells have different corner rounding (an end
    // cell rounds 2 outer corners, a middle one has none), so their
    // resampled point densities along the very side they're supposed to
    // share differ, and dropping edges based on per-point membership left
    // dangling, unmatched vertical edges exactly at the transition points
    // where "shared" met "outer" — confirmed directly: open-edge count
    // went UP (72 to 136), not down. Extending the shape itself sidesteps
    // that failure mode entirely, since it changes what geometry exists
    // rather than which of an already-fixed set of edges gets kept.
    const CELL_OVERLAP_MM = 0.2;
    const sharedSides = {
      left: !outerSides.left, right: !outerSides.right,
      top: !outerSides.top, bottom: !outerSides.bottom,
    };
    const extendedShape = insetCellSides(
      roundedRectPerCorner(cellSize, cellSize, cornerRadii), cellSize / 2, -CELL_OVERLAP_MM, sharedSides
    );
    const rawLocal = resamplePolygon(extendedShape, RESAMPLE_N);
    const localOuter = rawLocal.translated(cx, cy);
    const localTopRim = insetCellSides(rawLocal, cellSize / 2, topBevel, outerSides).translated(cx, cy);
    const localBottomRim = insetCellSides(rawLocal, cellSize / 2, bottomBevel, outerSides).translated(cx, cy);

    // Each cell builds its OWN complete wall (and, further below, its own
    // bottom cap) from ITS OWN localOuter/localTopRim/localBottomRim now —
    // not from a separately-generated whole-block `outer` shape the way
    // this used to. That whole-block wall was the actual, deeper cause of
    // a serious confirmed regression (exported files losing the recess,
    // legends, and switch mount entirely once sliced): its top edge came
    // from `outer` (arc-length resampled from the WHOLE block's ~84mm
    // perimeter) while the top-face ring's boundary came from `localOuter`
    // (independently resampled from just one cell's ~21mm perimeter).
    // Matching their point counts and fixing which corners round didn't
    // touch this — 288 open edges (72 per cap, all at the true top)
    // persisted unchanged through both of those fixes, confirming the
    // actual defect was vertex POSITIONS along a boundary the two shapes
    // are supposed to share exactly, not point count or corner shape:
    // arc-length-resampling two different-sized perimeters places points
    // at different physical positions even when the local geometry
    // (radius, count) matches at any given spot — a textbook T-junction,
    // two surfaces that touch without sharing vertices. Building the wall
    // and the ring from the identical polygon object removes the
    // possibility of a mismatch by construction, rather than trying to
    // make two independently-generated shapes agree after the fact.
    //
    // loftShellCellSides (not plain loftShell) specifically skips a wall
    // edge that lies entirely on a side SHARED with a neighboring cell —
    // building every cell's own full closed perimeter, unconditionally,
    // left two coincident faces (one from each neighboring cell's own
    // loop, facing opposite directions) sitting at the exact same
    // physical plane at every inter-cell boundary. That plane has solid
    // material on both sides in the finished part and should carry no
    // surface at all — leaving one in made each cell a technically-
    // separate watertight solid only touching its neighbor at a zero-
    // volume shared plane, not one genuinely fused solid, which is
    // exactly the kind of thing a slicer's own inside/outside test can
    // misread as disconnected "floating" geometry even at 0 open edges.
    //
    // That specific fix (loftShellCellSides, dropping the coincident wall
    // edges outright) was tried and reverted: adjacent cells have
    // different corner rounding (an end cell rounds 2 outer corners, a
    // middle one has none), so their resampled point densities along the
    // very side they're supposed to share differ, and dropping wall
    // quads based on per-point membership left dangling, unmatched
    // vertical edges exactly at the transition points where "shared" met
    // "outer" — confirmed directly: open-edge count went UP (72 to 136),
    // not down, since half of a dropped quad's boundary had nothing on
    // the other side to close it. The actual fix (see extendedShape,
    // sharedSides, CELL_OVERLAP_MM above) changes what geometry exists
    // instead of which of an already-built set of edges gets kept: each
    // cell's own shared sides are extended slightly outward before any of
    // its wall/ring/cap geometry is built from them, so two neighboring
    // cells now genuinely overlap in volume across a real, if tiny, band
    // — confirmed directly (one cell's corner past the true boundary in
    // one direction, its neighbor's corner past it in the other) — rather
    // than meeting at an exact, knife-edge coincident surface a slicer's
    // own inside/outside test could still treat as ambiguous. This is
    // also strictly cleaner than the plain-unconditional-loftShell
    // version it replaced: with genuinely offset (not coincident) walls,
    // the non-manifold edge count from that duplicate overlapping
    // geometry drops to 0 as well, not just the open-edge count.
    // Skipping a loft call outright when its bevel is (effectively) zero,
    // rather than calling it with a zero-height range, also avoids
    // separately-confirmed degenerate zero-area triangles that a real
    // bevel elsewhere on the same cell would otherwise leave behind.
    if (bottomBevel > 0.01) mesh.append(loftShell(localBottomRim, localOuter, 0, bottomBevel));
    mesh.append(loftShell(localOuter, localOuter, bottomBevel, thickness - topBevel));
    if (topBevel > 0.01) mesh.append(loftShell(localOuter, localTopRim, thickness - topBevel, thickness));

    const plateHole = resamplePolygon(roundedRect(settings.plateHoleMM, settings.plateHoleMM, 0.4), RESAMPLE_N).translated(cx, cy);
    const clearanceHole = resamplePolygon(roundedRect(settings.clearanceMM, settings.clearanceMM, 0.6), RESAMPLE_N).translated(cx, cy);

    // Real MX switches need genuine vertical room below the plate for the
    // lower housing to travel into before the clips can engage — this is
    // a hard, non-negotiable minimum, not a nice-to-have. It's reserved
    // FIRST (bottom-up: floor, then clearance shaft, then plate thickness),
    // and only whatever height remains at the top is available for the
    // (purely cosmetic) recess. That's backwards from an earlier version
    // of this function, which reserved the recess first and let the
    // clearance shaft take whatever was left over — that could shrink to
    // barely more than 1mm at default settings, nowhere near enough for a
    // switch to actually seat, which is exactly the bug this fixes.
    //
    // clearanceHeightMM (settings, user-adjustable) — not a hardcoded
    // constant — since real switches vary: reported directly that a fixed
    // 4.0mm was not enough for the switches actually being used, hitting
    // bottom before the clips could engage rather than leaving room for
    // them to. Raised to a more generous 5.5mm default and exposed as its
    // own slider so it can be tuned further per switch model rather than
    // needing another code change for the next switch that also doesn't
    // fit — this project has no way to know every switch's exact
    // below-plate housing depth in advance.
    const maxSafeRecess = maxSafeRecessDepth(settings);

    // The recess a cap physically nests into — shaped to match that cap's
    // own outline (not always a plain square), a little larger than its
    // actual bottom footprint for clearance so it can be pushed in rather
    // than needing to be forced. User-adjustable (recessDepthMM), but
    // clamped to whatever's safely available above the reserved functional
    // stack below it.
    const recessDepth = Math.min(settings.recessDepthMM, maxSafeRecess, thickness * 0.5);
    const recessOutline = resamplePolygon(
      profileFor(shape, settings.capWidthMM + RECESS_CLEARANCE_MM, settings.cornerRadiusMM),
      RESAMPLE_N
    ).translated(cx, cy);
    const recessFloorZ = thickness - recessDepth;

    const plateThickness = Math.min(settings.plateThicknessMM, recessFloorZ - floorThicknessFor(settings) - 0.5);
    const plateZ = recessFloorZ - plateThickness;

    // Flat top outside the recess, the recess's own inward-facing wall, and
    // its floor (recess outline minus the plate hole) — all at/relative to
    // recessFloorZ rather than the true top, since the recess itself
    // occupies the top recessDepth of material. The ring's OUTER boundary
    // is localTopRim — the same polygon object the wall above ends at, so
    // there's no gap or overhang between them by construction.
    mesh.append(ringFace(localTopRim, recessOutline, thickness, false));
    mesh.append(loftShell(recessOutline, recessOutline, recessFloorZ, thickness, true));
    mesh.append(ringFace(recessOutline, plateHole, recessFloorZ, false));

    mesh.append(loftShell(plateHole, plateHole, plateZ, recessFloorZ, true));
    mesh.append(ringFace(clearanceHole, plateHole, plateZ, true));

    // Closed floor at the reserved minimum height — see README: real
    // switches don't need a floor for retention (the plate clips do
    // that), but an open-through design lets you see straight to the
    // switch, which isn't wanted here.
    const floorZ = floorThicknessFor(settings);
    mesh.append(loftShell(clearanceHole, clearanceHole, floorZ, plateZ, true));
    const { points, triangles } = earClip(clearanceHole);
    for (const [a, b, c] of triangles) {
      mesh.addTriangle([points[a][0], points[a][1], floorZ], [points[b][0], points[b][1], floorZ], [points[c][0], points[c][1], floorZ]);
    }

    // Bottom cap for this cell, using its own localBottomRim — the same
    // polygon object the wall's own bottom tip ends at, same reasoning as
    // the top-face ring above.
    const { points: bp, triangles: bt } = earClip(localBottomRim);
    for (const [a, b, c] of bt) {
      mesh.addTriangle([bp[a][0], bp[a][1], 0], [bp[c][0], bp[c][1], 0], [bp[b][0], bp[b][1], 0]);
    }
  });

  return mesh;
}

// The keyring loop is the bottom 25% of the base's thickness, flush with
// its bottom (the side on the print bed), so it prints without support.
function keyringLoopHeight(settings) {
  return settings.baseThicknessMM * 0.25;
}

// The keyring lug: a flat loop plus a straight neck joining it to the base,
// built in a local frame with the loop centred on the origin and the base
// toward -Y (buildBase rotates it to face the right side). neckLength is
// the distance from the loop's centre to the neck's inner end, inside the
// base wall.
//
// The outline is a "D": a half-circle on the outer side, and a rectangle as
// wide as the loop running back into the base. Before this the loop was a
// plain ring whose circle just clipped the base's edge, so the joint was a
// thin lens-shaped sliver, and it broke there on a real print. The joint
// is now a straight line the full width of the loop.
//
// Outline and hole are sampled at the same angles from the centre, with
// the two rectangle corners included exactly, so ringFace() and
// loftShell() can pair their points one-to-one. That works because the
// "D" is star-shaped around the centre: every ray from the centre crosses
// its boundary exactly once.
function keyringFeature(settings, neckLength) {
  const outerR = settings.keyringOuterMM / 2;
  const holeR = settings.keyringHoleMM / 2;
  const loopHeight = keyringLoopHeight(settings);
  const L = Math.max(neckLength, outerR * 0.5);

  const N = 64;
  const angles = [];
  for (let i = 0; i < N; i++) angles.push((i / N) * Math.PI * 2);
  const cornerA = Math.atan2(-L, -outerR) + Math.PI * 2; // lower-left corner
  const cornerB = Math.atan2(-L, outerR) + Math.PI * 2;  // lower-right corner
  for (const a of [cornerA, cornerB]) {
    if (!angles.some((x) => Math.abs(x - a) < 1e-6)) angles.push(a);
  }
  angles.sort((a, b) => a - b);

  const radiusAt = (a) => {
    const c = Math.cos(a), sn = Math.sin(a);
    if (sn >= 0) return outerR; // outer half: the round end of the loop
    // Base-facing half: the rectangle x in [-outerR, outerR], y in [-L, 0].
    const toSide = Math.abs(c) > 1e-9 ? outerR / Math.abs(c) : Infinity;
    const toEnd = L / Math.abs(sn);
    return Math.min(toSide, toEnd);
  };
  const outer = new Polygon2D(angles.map((a) => { const r = radiusAt(a); return [Math.cos(a) * r, Math.sin(a) * r]; }));
  const hole = new Polygon2D(angles.map((a) => [Math.cos(a) * holeR, Math.sin(a) * holeR]));

  const mesh = new Mesh();
  mesh.append(loftShell(outer, outer, 0, loopHeight));
  mesh.append(ringFace(outer, hole, loopHeight, false));
  mesh.append(ringFace(outer, hole, 0, true));
  mesh.append(loftShell(hole, hole, 0, loopHeight, true));
  return mesh;
}
