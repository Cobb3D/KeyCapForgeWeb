import { Mesh, loftShell, ringFace, earClip, resamplePolygon, insetCellSides } from './mesh.js';
import { roundedRect, roundedRectPerCorner, regularPolygon, profileFor } from './shapeProfiles.js';

// Every profile that gets connected to another one (via ringFace/loftShell)
// in this file is resampled to this many points first, so a hexagon's 6
// points, a heart's 64, and the base's own square cell can all be used
// together — see resamplePolygon() in mesh.js for why that's necessary.
const RESAMPLE_N = 64;

// Real MX switches need genuine vertical room below the plate for the
// lower housing to travel into before the clips can engage — this is a
// hard, non-negotiable minimum, not a nice-to-have, and it's reserved
// FIRST (bottom-up: floor, then clearance shaft, then plate thickness) —
// only whatever height remains at the top is available for the (purely
// cosmetic) recess. Exported so app.js can use the exact same formula to
// pick a sensible starting value for recessDepthMM, rather than a
// hand-picked number that could drift out of sync with this reservation
// as settings change.
export const MIN_FLOOR_MM = 0.6;
export function maxSafeRecessDepth(settings) {
  const reservedBelowRecess = MIN_FLOOR_MM + settings.clearanceHeightMM + settings.plateThicknessMM;
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
    // How much solid wall actually exists between the base's outer edge and
    // the nearest cutout, on whichever side the ring attaches — checked
    // against whichever is larger, the clearance hole or the shape-matching
    // recess. The recess (added after this clamp was first written) is
    // sized from capWidthMM and can be — and at default settings, is —
    // bigger than the clearance hole, so checking clearance alone let the
    // lug reach past the recess's actual edge without anything catching it.
    // A fixed overlap distance can reach past whichever wall is thinnest
    // entirely depending on settings — the lug's material would then
    // genuinely intersect that cutout instead of just fusing into solid
    // material outside it. Clamping to what's actually available (with a
    // small safety margin) fixes that regardless of footprint/clearance/
    // recess/side.
    const limitingHoleSize = Math.max(settings.clearanceMM, settings.capWidthMM + RECESS_CLEARANCE_MM);
    const wallThickness = (footprint - limitingHoleSize) / 2;
    const safetyMargin = 0.3;
    const maxSafeOverlap = Math.max(0.5, wallThickness - safetyMargin);
    const overlap = Math.min(3.0, maxSafeOverlap);
    const reach = outerR - overlap;

    let anchorX = midX, anchorY = midY;
    switch (settings.keyringSide) {
      case 'right': anchorX = maxX + reach; break;
      case 'left': anchorX = minX - reach; break;
      case 'top': anchorY = maxY + reach; break;
      case 'bottom': anchorY = minY - reach; break;
    }
    mesh.append(keyringFeature(settings).translated(anchorX, anchorY, 0));
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

    const plateThickness = Math.min(settings.plateThicknessMM, recessFloorZ - MIN_FLOOR_MM - 0.5);
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
    const floorZ = MIN_FLOOR_MM;
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

function keyringFeature(settings) {
  const outerR = settings.keyringOuterMM / 2;
  const holeR = settings.keyringHoleMM / 2;
  const outer = regularPolygon(32, outerR);
  const hole = regularPolygon(outer.points.length, holeR);
  // The functional loop only needs to be a fraction of the base's own
  // thickness — reported directly: a real keyring clipped through it
  // doesn't need the full base height of material to grip, and using the
  // full thickness was excess material for no functional benefit.
  //
  // Flush with the base's own Z=0 (the "back" — the flat, featureless
  // side that sits directly on the print bed; the recess/plate-mount
  // side at Z=thickness is the "front"), not centered. Reported directly:
  // a centered loop leaves its own bottom face floating in mid-air over
  // the reach area beyond the base's own footprint — there's no material
  // underneath it there at all, since the base block itself doesn't
  // extend into that region — which is a horizontal overhang a slicer
  // can't print without support. Flush with Z=0 puts that same bottom
  // face on the exact plane the rest of the base already starts printing
  // from, eliminating the overhang outright rather than just shrinking
  // it.
  const loopHeight = settings.baseThicknessMM * 0.25;

  const mesh = new Mesh();
  mesh.append(loftShell(outer, outer, 0, loopHeight));
  mesh.append(ringFace(outer, hole, loopHeight, false));
  mesh.append(ringFace(outer, hole, 0, true));
  mesh.append(loftShell(hole, hole, 0, loopHeight, true));
  return mesh;
}
