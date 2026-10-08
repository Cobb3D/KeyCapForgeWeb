// Logo clicker, part 2: building the logo-shaped cap and its matching base
// from the outlines logoImport.js derives. Everything is centred on the
// stem (the centre of the logo's area), with the switch underneath it.
//
// The cap:
//   body  - straight walls following the cap outline, a hollow underside
//           (the cavity outline) with the same stem post and socket as the
//           letter caps, and a flat top just below the cap's full height
//   logo  - the logo's coloured parts (up to 3 colours, or 1 in the legend
//           colour with dark details cut out), filling the top layer, flush
//           with the top: smooth traced shapes (logoVector.js), or, if
//           tracing fails, square columns on a grid (rasterizeLegend)
//   rim   - the rest of the top layer, around and inside the logo, in the
//           cap colour, sharing the logo's exact edges
// The logo and rim sit on the body's top, touching but never overlapping
// it (slicers keep only one of two overlapping parts).
//
// The base: straight walls following the base outline, the recess the cap
// sits in (the cap outline plus clearance, plus the switch's square), the
// same plate, switch space and floor as the letter bases, and the keyring
// lug on the chosen side.

import { Mesh, loftShell, ringFace, ringFaceBetween, earClip, resamplePolygon } from './mesh.js';
import { roundedRect, regularPolygon } from './shapeProfiles.js';
import { rasterizeLegend } from './textVoxel.js';
import { stemBoss, stemBossRadius, STEM_BOSS_SIDES } from './keycapBuilder.js';
import { baseStackFor, keyringFeature } from './baseBuilder.js';
import { logoOutlines } from './logoImport.js';
import { vectorLogo } from './logoVector.js';

// opts: { sizeMM, oneColor, capColorHex, legendColorHex }
export function buildLogoClicker(logoCanvas, settings, opts) {
  const H = settings.capHeightMM;
  // The logo layer is the whole top cover: it runs the full Top thickness,
  // from the hollow underneath up to the face, so the logo's colours print
  // several layers deep instead of one thin skin. Below z0 the cap body is
  // just the side walls and the stem post, both of which the logo layer
  // closes over.
  const depth = Math.min(Math.max(settings.topThicknessMM ?? 1.5, 0.8), H - 1.0);
  const z0 = H - depth;

  // The logo layer: smooth traced outlines (logoVector.js), or, if tracing
  // fails on some unusual image, the square-column version (each grid cell
  // a column), which always works but shows a staircase along slanted and
  // curved edges.
  let outlines, capParts;
  const vec = vectorLogo(logoCanvas, settings, { ...opts, z0, z1: H });
  if (vec) {
    outlines = vec.outlines;
    capParts = vec.parts;
  } else {
    const parts = rasterizeLegend('logo', {
      image: logoCanvas, targetWidth: opts.sizeMM, targetHeight: opts.sizeMM, depth,
      colorful: !opts.oneColor, stencil: !!opts.oneColor,
    });
    const fp = parts.footprint;
    if (!fp) return null;
    outlines = logoOutlines(fp, settings);
    if (!outlines || !outlines.cavity) return null;
    const [sx, sy] = outlines.stem;
    capParts = parts.map((p) => ({ mesh: p.mesh.translated(-sx, -sy, z0), colorHex: p.colorHex || opts.legendColorHex }));
    const rim = buildRim(fp, outlines.cap, sx, sy, z0, H);
    if (!rim.isEmpty) capParts.push({ mesh: rim, colorHex: opts.capColorHex, isRim: true });
  }

  // ---- Cap body ----
  // Two closed solids that both end flat at z0, right under the logo layer:
  // the side walls (outline O outside, cavity C inside) and the stem post.
  const O = outlines.cap, C = outlines.cavity;
  const body = new Mesh();
  body.append(loftShell(O, O, 0, z0));
  body.append(ringFaceBetween(O, C, z0, false));
  body.append(ringFaceBetween(O, C, 0, true));
  body.append(loftShell(C, C, 0, z0, true));
  const boss = stemBoss(settings, z0, regularPolygon(STEM_BOSS_SIDES, stemBossRadius(settings)), C);
  body.append(boss.mesh);
  addFlatFace(body, boss.ceilingBoundary, z0, false);

  return {
    capBody: body,
    capParts,
    base: buildLogoBase(outlines, settings),
    outlines,
    traced: !!vec,
  };
}

function addFlatFace(mesh, polygon, z, facingDown) {
  const { points, triangles } = earClip(polygon);
  for (const [a, b, c] of triangles) {
    const pa = [points[a][0], points[a][1], z], pb = [points[b][0], points[b][1], z], pc = [points[c][0], points[c][1], z];
    if (facingDown) mesh.addTriangle(pa, pc, pb); else mesh.addTriangle(pa, pb, pc);
  }
}

// The rim: every cell of the logo's grid whose centre is inside the cap
// outline and that the logo doesn't fill, as solid columns from z0 to z1
// (one quad per cell face, exactly like the logo's own parts, so the two
// meet cell edge to cell edge).
function buildRim(fp, O, sx, sy, z0, z1) {
  const xAt = (g) => fp.xAt(g) - sx, yAt = (g) => fp.yAt(g) - sy;
  const cell = Math.abs(fp.xAt(1) - fp.xAt(0));
  const pts = O.points;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of pts) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  // Grid index range covering the outline (xAt increases with g, yAt decreases).
  const gxOf = (x) => Math.floor((x + sx - fp.xAt(0)) / (fp.xAt(1) - fp.xAt(0)));
  const gyOf = (y) => Math.floor((y + sy - fp.yAt(0)) / (fp.yAt(1) - fp.yAt(0)));
  const gx0 = gxOf(minX) - 2, gx1 = gxOf(maxX) + 2, gy0 = gyOf(maxY) - 2, gy1 = gyOf(minY) + 2;
  const W = gx1 - gx0 + 1, Hh = gy1 - gy0 + 1;
  const R = new Uint8Array(W * Hh);   // 1 = rim cell
  const L = new Uint8Array(W * Hh);   // 1 = logo cell
  for (let j = 0; j < Hh; j++) {
    const gy = gy0 + j;
    const yc = (yAt(gy) + yAt(gy + 1)) / 2;
    // Where this row's centre line crosses the outline.
    const xs = [];
    for (let k = 0; k < pts.length; k++) {
      const [ax, ay] = pts[k], [bx, by] = pts[(k + 1) % pts.length];
      if ((ay > yc) !== (by > yc)) xs.push(ax + (yc - ay) * (bx - ax) / (by - ay));
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i < W; i++) {
      const gx = gx0 + i;
      if (fp.filled(gx, gy)) { L[j * W + i] = 1; continue; }
      const xc = (xAt(gx) + xAt(gx + 1)) / 2;
      let inside = false;
      for (const x of xs) { if (x < xc) inside = !inside; else break; }
      if (inside) R[j * W + i] = 1;
    }
  }
  // Two rim cells touching only at a corner would share just one edge
  // point, which isn't a valid solid. Fill one of the two cells beside
  // them when it's empty; when both are logo cells, drop one rim cell
  // (leaving a 0.15mm pit, invisible in print).
  const at = (i, j) => (i < 0 || j < 0 || i >= W || j >= Hh) ? 0 : R[j * W + i];
  const logoAt = (i, j) => (i < 0 || j < 0 || i >= W || j >= Hh) ? 0 : L[j * W + i];
  for (let changed = true, guard = 0; changed && guard < 50; guard++) {
    changed = false;
    for (let j = -1; j < Hh; j++) for (let i = -1; i < W; i++) {
      const tl = at(i, j), tr = at(i + 1, j), bl = at(i, j + 1), br = at(i + 1, j + 1);
      let pair = null;
      if (tl && br && !tr && !bl) pair = [[i + 1, j], [i, j + 1], [i, j], [i + 1, j + 1]];
      else if (tr && bl && !tl && !br) pair = [[i, j], [i + 1, j + 1], [i + 1, j], [i, j + 1]];
      if (!pair) continue;
      const [b1, b2, d1] = pair;
      const fillable = [b1, b2].find(([x, y]) => x >= 0 && y >= 0 && x < W && y < Hh && !logoAt(x, y));
      if (fillable) R[fillable[1] * W + fillable[0]] = 1;
      else R[d1[1] * W + d1[0]] = 0;
      changed = true;
    }
  }
  const mesh = new Mesh();
  for (let j = 0; j < Hh; j++) for (let i = 0; i < W; i++) {
    if (!R[j * W + i]) continue;
    const gx = gx0 + i, gy = gy0 + j;
    const x0 = xAt(gx), x1 = xAt(gx + 1);
    const yTop = yAt(gy), yBot = yAt(gy + 1);
    const y0 = Math.min(yTop, yBot), y1 = Math.max(yTop, yBot);
    const wall = (ni, nj) => !at(ni, nj);
    mesh.addQuad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]); // top
    mesh.addQuad([x0, y1, z0], [x1, y1, z0], [x1, y0, z0], [x0, y0, z0]); // bottom
    if (wall(i - 1, j)) mesh.addQuad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]);
    if (wall(i + 1, j)) mesh.addQuad([x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [x1, y0, z0]);
    if (wall(i, j - 1)) mesh.addQuad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]);
    if (wall(i, j + 1)) mesh.addQuad([x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [x0, y0, z0]);
  }
  return mesh;
}

// The base, following the logo: outer wall, top, recess, plate, switch
// space, floor, and the keyring lug.
function buildLogoBase(outlines, settings) {
  const T = settings.baseThicknessMM;
  const { recessFloorZ, plateZ, floorZ } = baseStackFor(settings);
  const B = outlines.base, R = outlines.recess;
  const N = 64;
  const plateHole = resamplePolygon(roundedRect(settings.plateHoleMM, settings.plateHoleMM, 0.4), N);
  const clearanceHole = resamplePolygon(roundedRect(settings.clearanceMM, settings.clearanceMM, 0.6), N);

  const mesh = new Mesh();
  addFlatFace(mesh, B, 0, true);                                   // bottom
  mesh.append(loftShell(B, B, 0, T));                              // outer wall
  mesh.append(ringFaceBetween(B, R, T, false));                    // top
  mesh.append(loftShell(R, R, recessFloorZ, T, true));             // recess wall
  mesh.append(ringFaceBetween(R, plateHole, recessFloorZ, false)); // recess floor
  mesh.append(loftShell(plateHole, plateHole, plateZ, recessFloorZ, true));
  mesh.append(ringFace(clearanceHole, plateHole, plateZ, true));   // plate underside
  mesh.append(loftShell(clearanceHole, clearanceHole, floorZ, plateZ, true));
  addFlatFace(mesh, clearanceHole, floorZ, false);                 // floor

  if (settings.keyringStyle !== 'none') mesh.append(logoKeyringLug(B, settings));
  return mesh;
}

// The keyring lug, centred on the stem's line on the chosen side. Worked
// out with that side turned to face +Y: the loop sits just beyond the
// base's farthest point within the lug's width (so the hole is never
// blocked by the base), and its neck reaches back into the base's wall,
// stopping clear of the switch space.
function logoKeyringLug(B, settings) {
  const rot = { top: 0, right: -90, left: 90, bottom: 180 }[settings.keyringSide] ?? 0;
  const rad = (-rot * Math.PI) / 180, c = Math.cos(rad), s = Math.sin(rad);
  const pts = B.points.map(([x, y]) => [x * c - y * s, x * s + y * c]); // side now faces +Y
  const outerR = settings.keyringOuterMM / 2;
  // Highest and lowest top edge of the base across the lug's width.
  let yMax = -Infinity, yMin = Infinity;
  for (let x = -outerR; x <= outerR + 1e-9; x += 0.25) {
    let top = -Infinity;
    for (let k = 0; k < pts.length; k++) {
      const [ax, ay] = pts[k], [bx, by] = pts[(k + 1) % pts.length];
      if ((ax > x) !== (bx > x)) top = Math.max(top, ay + (x - ax) * (by - ay) / (bx - ax));
    }
    if (top > -Infinity) { yMax = Math.max(yMax, top); yMin = Math.min(yMin, top); }
  }
  const centreY = yMax + outerR;
  const neckBottomY = Math.max(yMin - 2.5, settings.clearanceMM / 2 + 0.5);
  return keyringFeature(settings, centreY - neckBottomY).translated(0, centreY, 0).rotatedZ(rot);
}
