// Display piece: a one-key keychain blown up to fill a print bed, as a
// working desk piece people can hit. Two prints, the base and the cap.
//
// Everything you see is the normal design multiplied by `scale`: the
// base's outline, thickness, bevels and keyring loop, and the cap's
// outline, height and legend. What isn't scaled is everything that has to
// fit real MX switches, 9 or 5 of them (the middle, one toward each
// corner, and with 9 one toward each side), so a cap that size is carried
// level and doesn't tip when pressed off-centre.
//
//   base  The recess is the cap's outline plus a small real gap
//         (SIDE_CLEARANCE_MM), so its walls keep the cap from being
//         knocked sideways on the switches. Its floor is where the cap
//         lands at the end of its travel. Each switch sits in a well in
//         that floor, on a real plate hole and switch shaft (see
//         buildJoinedBlock in baseBuilder.js).
//   cap   A thin shell, not walls blown up with everything else: the
//         switches' springs have to hold it up (see below). A post hangs
//         from the ceiling over each switch, ending in a real stem socket
//         (displayPost in keycapBuilder.js), and fins between the posts
//         stiffen the top (displayFin).
//
// Hits. Pressed STOP_TRAVEL_MM, the cap's rim and four round stop pillars
// (displayStop) land on the recess floor, just before the switches reach the end
// of their own travel. So however hard the cap is hit, the posts and the
// switches only ever carry the springs' force (about 1 N each); the hit
// goes through the rim and the stops into the base.
//
// Weight. A switch's spring pushes up with its "initial force" before the
// key moves: 30 cN for Cherry MX2A Red, Black and Brown (25 cN for MX Green
// and Grey), from Cherry's data sheets. So 5 switches hold up 150 cN, 153
// grams, and 9 hold 275 g; a heavier cap sinks. Sliced in PrusaSlicer 2.7.4
// (0.2mm layers, 3 walls, 12% gyroid, PLA at 1.24 g/cm3) at 6.5x: the 5-switch
// cap is 112 g and the 9-switch one 177 g, 73% and 64% of what their
// switches hold; the base is 608 g. `info.capGrams` estimates this from
// the mesh for other sizes (CAP_WEIGHT_FIT, within about 8% of the slicer).
//
// Heights, from the cap's rim at rest: RIM_BELOW_TOP_MM inside the recess,
// STOP_TRAVEL_MM above the recess floor, and (stem top 11.6 - socket
// depth) above the plate at the bottom of each well.
import { buildBaseParts, buildBase } from './baseBuilder.js';
import { buildKeycap, printsFaceDown } from './keycapBuilder.js';
import { profileFor } from './shapeProfiles.js';
import { MX_SWITCH } from './switchModel.js';

// The cap's shell and stiffening (mm) for each number of switches: more
// switches hold up a heavier cap, so 9 get thicker walls, top and fins.
export const DISPLAY_PRESETS = {
  9: { switches: 9, wall: 2.0, top: 3.0, finT: 2.0, finDepth: 15, stopR: 5 },
  5: { switches: 5, wall: 1.2, top: 2.0, finT: 0, finDepth: 15, stopR: 4 },
};
export const DISPLAY_DEFAULTS = DISPLAY_PRESETS[9];
const LEGEND_DEPTH_MM = 0.8;
// The cap's rim rests this far inside the recess, so the recess walls
// (SIDE_CLEARANCE_MM from the cap) stop it being knocked sideways.
const RIM_BELOW_TOP_MM = 1.5, SIDE_CLEARANCE_MM = 0.6;
// The rim and the stops land on the recess floor after this much
// travel, a little before a switch reaches the end of its own 4mm
// (3.6mm at the short end of Cherry's tolerance).
const STOP_TRAVEL_MM = 3.4;
const WELL_MM = 16.6;          // the square well each switch sits in
// The least height a base (recess, well, plate, switch shaft and a floor)
// and a cap (socket, post taper, top) can be squashed to.
const MIN_BASE_MM = 24, MIN_CAP_MM = 22;
const BED_MARGIN_MM = 8;       // spare room on the bed, in all
const MAX_PRINT_HEIGHT_MM = 240;
const PLA_G_PER_MM3 = 0.00124;
const POST_FILL = 0.7, CAP_WEIGHT_FIT = 1.08;
// What one MX switch's spring pushes up with before the key moves:
// Cherry's "initial force", 30 cN for MX2A Red, Black and Brown.
const SWITCH_INITIAL_CN = 30;

function bbox(mesh) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z1 = -Infinity;
  const V = mesh.vertices;
  for (let i = 0; i < V.length; i += 3) {
    if (V[i] < x0) x0 = V[i]; if (V[i] > x1) x1 = V[i];
    if (V[i + 1] < y0) y0 = V[i + 1]; if (V[i + 1] > y1) y1 = V[i + 1];
    if (V[i + 2] > z1) z1 = V[i + 2];
  }
  return { x0, x1, y0, y1, w: x1 - x0, h: y1 - y0, z: z1 };
}

// Whether a circle fits inside a polygon.
function circleInside(poly, cx, cy, r) {
  const P = poly.points;
  let inside = false, minD = Infinity;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, yi] = P[i], [xj, yj] = P[j];
    if (((yi > cy) !== (yj > cy)) && (cx < (xj - xi) * (cy - yi) / (yj - yi) + xi)) inside = !inside;
    const ex = xj - xi, ey = yj - yi, len2 = ex * ex + ey * ey;
    const t = len2 ? Math.max(0, Math.min(1, ((cx - xi) * ex + (cy - yi) * ey) / len2)) : 0;
    minD = Math.min(minD, Math.hypot(cx - xi - t * ex, cy - yi - t * ey));
  }
  return inside && minD >= r;
}

// The one-key settings a display piece is built from: one fused key.
function oneKey(settings) {
  return { ...settings, joinedBase: true, baseOuterWallExtraMM: settings.joinedBase ? settings.baseOuterWallExtraMM : 0 };
}

// The largest scale at which the base (with its keyring loop) fits the
// bed, either way round, and neither print is taller than the printer.
export function maxDisplayScale(cap, settings, bed) {
  const b = bbox(buildBase([cap], oneKey(settings)));
  const W = bed.w - BED_MARGIN_MM, Dp = bed.d - BED_MARGIN_MM;
  const fit = Math.max(Math.min(W / b.w, Dp / b.h), Math.min(W / b.h, Dp / b.w));
  return Math.min(fit, MAX_PRINT_HEIGHT_MM / settings.baseThicknessMM, MAX_PRINT_HEIGHT_MM / settings.capHeightMM);
}

// `cap` may carry logoCanvas (an imported logo image) to put a logo on the
// cap's face instead of its letter. `opts.switches` is 5 or 9.
// Builds both prints. Returns { scale, base: [objects], cap: [objects],
// info }, the objects ready for buildThreeMF, each print centred on the
// origin. Throws an Error with a plain-words message if it can't be built.
export function buildDisplayPiece(cap, settings, bed, scaleWanted = 0, opts = {}) {
  const o = { ...(DISPLAY_PRESETS[opts.switches] || DISPLAY_DEFAULTS), ...opts };
  const one = oneKey(settings);
  const max = maxDisplayScale(cap, settings, bed);
  const k = scaleWanted > 0 ? Math.min(scaleWanted, max) : Math.floor(max * 10) / 10;
  if (!(k >= 2)) throw new Error('The display piece has to be at least 2 times normal size.');

  // Height: `opts.height` (0.2 to 1) makes both prints that fraction of
  // their full blown-up height, for a flatter piece that prints faster.
  // Only the plain stretch of the base under the switches and the cap's
  // walls, posts and stops get shorter: the sockets, wells, plates and
  // travel are built real size after the squash. (Scaling Z in the slicer
  // instead squashes those too, and the switches no longer fit.) Not below
  // what the base needs under its switches or the cap needs for its posts.
  const hf = Math.max(Math.min(1, o.height > 0 ? o.height : 1), MIN_BASE_MM / (one.baseThicknessMM * k), MIN_CAP_MM / (one.capHeightMM * k));
  one.baseThicknessMM *= hf;

  // The cap: outline blown up, shell and sockets real size.
  const postRadius = Math.max(4, Math.min(8, 0.8 * k));
  const capSettings = {
    ...one,
    capWidthMM: one.capWidthMM * k, capTopWidthMM: one.capTopWidthMM * k, capHeightMM: one.capHeightMM * k * hf,
    cornerRadiusMM: one.cornerRadiusMM * k, topBevelMM: one.topBevelMM * k,
    // The rim's bevel stays inside the thin wall.
    bottomBevelMM: Math.min(one.bottomBevelMM * k, o.wall * 0.5),
    wallThicknessMM: o.wall, topThicknessMM: o.top,
    // An engraved legend is a real-size inlay; an embossed one stands up
    // from the face, so its height is blown up with the cap.
    legendDepthMM: cap.legendStyle === 'embossed' ? one.legendDepthMM * k : LEGEND_DEPTH_MM,
  };
  const capHeight = capSettings.capHeightMM;
  // The cavity's outline at the rim and at the ceiling, as buildKeycap
  // makes them (the ceiling's follows the top bevel when that's deeper
  // than the top is thick).
  const topBevel = Math.min(capSettings.topBevelMM, capHeight * 0.3, capSettings.capTopWidthMM * 0.3);
  const ceilingZ = capHeight - Math.max(o.top, (cap.legendStyle === 'shineThrough' ? 2 : cap.legendStyle === 'embossed' ? 0 : 1) * capSettings.legendDepthMM + 0.4);
  const followsBevel = capHeight - topBevel - 0.41 * o.wall < ceilingZ - 0.01;
  const topProfile = profileFor(cap.shape, capSettings.capTopWidthMM, capSettings.cornerRadiusMM * (capSettings.capTopWidthMM / capSettings.capWidthMM));
  const innerBottom = profileFor(cap.shape, capSettings.capWidthMM, capSettings.cornerRadiusMM).insetApprox(o.wall);
  const innerTop = topProfile.insetApprox(followsBevel ? topBevel - (capHeight - ceilingZ) + 1.41 * o.wall : o.wall);
  // Where the outer switches go: as far out toward the corners as a post
  // fits against the ceiling and a switch's well fits inside the cap's rim.
  const postRoom = postRadius * 1.6 + 1.5, switchRoom = (WELL_MM / 2) * Math.SQRT2 + 1.5;
  const fits = (d) => [[d, d], [-d, d], [-d, -d], [d, -d]].every(([x, y]) => circleInside(innerTop, x, y, postRoom) && circleInside(innerBottom, x, y, switchRoom));
  let d = capSettings.capTopWidthMM / 2;
  while (d > 0 && !fits(d)) d -= 0.25;
  // The outer switches' wells must also stay clear of the middle one's.
  const minD = WELL_MM + 3;
  if (d < minD) throw new Error(`At ${k.toFixed(1)} times size this cap shape has no room for a switch under each corner. Try a bigger print bed or a square cap.`);
  const nine = o.switches === 9;
  const spots = [[0, 0], [d, d], [-d, d], [-d, -d], [d, -d]].concat(nine ? [[d, 0], [0, d], [-d, 0], [0, -d]] : []);
  // Between the posts, four stops (round pillars that land on the base at
  // the end of the travel) just outside the middle switch, and beyond each
  // a stiffening fin under the ceiling: along the axes for 5 switches,
  // along the diagonals (between the middle and corner switches) for 9,
  // where the axes have switches on them.
  const dirs = nine ? [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([x, y]) => [x * Math.SQRT1_2, y * Math.SQRT1_2]) : [[1, 0], [0, 1], [-1, 0], [0, -1]];
  const stopAt = (WELL_MM / 2) * (nine ? Math.SQRT2 : 1) + 2 + o.stopR * 1.6;
  const finStart = stopAt + o.stopR * 1.6 + 1.5;
  const stops = o.stopR > 0 ? dirs.map(([ux, uy]) => ({ c: [ux * stopAt, uy * stopAt], r: o.stopR })) : [];
  const fins = [];
  if (o.finT > 0) {
    for (const [ux, uy] of dirs) {
      let end = nine ? d * Math.SQRT2 - (WELL_MM / 2) * Math.SQRT2 - 2.5 : capSettings.capTopWidthMM / 2;
      while (end > finStart + 6 && !circleInside(innerTop, ux * end, uy * end, o.finT / 2 + 1.5)) end -= 0.5;
      if (end > finStart + 6) fins.push({ a: [ux * finStart, uy * finStart], b: [ux * end, uy * end], t: o.finT, depth: o.finDepth });
    }
  }
  if (stops.some((q) => !circleInside(innerTop, q.c[0], q.c[1], q.r * 1.6 + 1))) stops.length = 0;
  // If the ceiling can't be built around everything (an odd cap shape),
  // leave out the fins, then the stops; the rim still lands on the base.
  let built = null;
  for (const drop of [0, 1, 2]) {
    if (drop >= 1) fins.length = 0;
    if (drop >= 2) stops.length = 0;
    capSettings.display = { scale: k, stems: spots, postRadius, fins, stops, legendCells: 400 };
    try { built = buildKeycap(cap, capSettings); break; } catch (err) { if (drop === 2) throw err; }
  }
  const { body, legendParts } = built;
  const faceDown = printsFaceDown(cap, capSettings);
  const orient = (m) => (faceDown ? m.flippedForPrint(capHeight) : m);
  const capObjects = [{ mesh: orient(body), colorHex: cap.bodyColorHex, name: 'cap_body', group: 'cap', translation: [0, 0, 0] }]
    .concat(legendParts.map((p, j) => ({ mesh: orient(p.mesh), colorHex: p.colorHex, name: `cap_legend_${j}`, group: 'cap', translation: [0, 0, 0] })));

  // The base. Heights, from the cap's rim at rest: the rim sits
  // RIM_BELOW_TOP_MM inside the recess, STOP_TRAVEL_MM above the recess
  // floor it lands on, and (stem top - socket depth) above the plate, which
  // puts the plate at the bottom of a well under each switch.
  const rimAbovePlate = MX_SWITCH.stemTopAbovePlate - Math.min(one.stemCavityDepthMM, capHeight);
  const baseSettings = { ...one, display: {
    scale: k, switches: spots, sideClearance: SIDE_CLEARANCE_MM,
    recessDepth: RIM_BELOW_TOP_MM + STOP_TRAVEL_MM, wellDepth: rimAbovePlate - STOP_TRAVEL_MM, wellSize: WELL_MM,
  } };
  const parts = buildBaseParts([cap], baseSettings);
  const whole = bbox({ vertices: parts.flatMap((p) => p.mesh.vertices) });
  const cx = (whole.x0 + whole.x1) / 2, cy = (whole.y0 + whole.y1) / 2;
  const baseObjects = parts.map((p) => ({ mesh: p.mesh, colorHex: settings.baseColorHex, name: p.name, group: 'base', translation: [-cx, -cy, 0] }));

  // What the cap weighs printed in PLA, and what the switches can hold
  // (see Weight at the top of this file).
  const postVolume = (spots.length * postRadius * postRadius + stops.length * o.stopR * o.stopR) * Math.PI * Math.max(0, capHeight - o.top - 6);
  const capVolume = body.volume + legendParts.reduce((sum, p) => sum + p.mesh.volume, 0);
  const capGrams = (capVolume - postVolume * (1 - POST_FILL)) * PLA_G_PER_MM3 * CAP_WEIGHT_FIT;
  const holdGrams = spots.length * SWITCH_INITIAL_CN / 0.980665;

  const capBox = bbox(body);
  // For the 3D preview: the two put together, the cap the right way up on
  // its switches over the key's centre (the base is centred with its loop).
  const restZ = one.baseThicknessMM * k - RIM_BELOW_TOP_MM;
  const assembled = baseObjects.concat(
    [{ mesh: body, colorHex: cap.bodyColorHex, translation: [-cx, -cy, restZ] }],
    legendParts.map((p) => ({ mesh: p.mesh, colorHex: p.colorHex, translation: [-cx, -cy, restZ], decal: true })),
  );
  return {
    scale: k, maxScale: max, height: hf, base: baseObjects, cap: capObjects, assembled,
    info: {
      baseW: whole.w, baseH: whole.h, baseZ: whole.z,
      capW: capBox.w, capH: capBox.h, capZ: capHeight,
      capGrams, holdGrams, faceDown, switches: spots.length, cornerOffset: d, fins: fins.length, stops: stops.length,
    },
  };
}
