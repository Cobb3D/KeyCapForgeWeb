// Display piece: a one-key keychain blown up to fill a print bed, as a
// working desk piece. Two prints, the base and the cap.
//
// Everything you see is the normal design multiplied by `scale`: the
// base's outline, thickness, bevels and keyring loop, and the cap's
// outline, height and legend. What isn't scaled is everything that has to
// fit real MX switches, five of them (one under each corner of the cap and
// one in the middle) so a cap that size is carried level and doesn't tip
// when pressed off-centre:
//
//   base  The recess is the cap's blown-up outline, but only deep enough
//         for the cap's 4mm of travel. Its floor is the switch plate, with
//         five real plate holes and switch shafts (see buildJoinedBlock in
//         baseBuilder.js).
//   cap   A thin shell (SHELL_WALL_MM walls, SHELL_TOP_MM top), not walls
//         blown up with everything else: the springs of five switches hold
//         up roughly 150-250g, and a 10mm-thick wall would weigh more than
//         that. Five posts hang from its ceiling to the rim, each ending in
//         a real stem socket (see displayPost in keycapBuilder.js).
//
// Heights: an unpressed switch's stem tops out 11.6mm above the plate, and
// the cap's socket is stemCavityDepthMM deep from its rim, so the rim rests
// 11.6 - depth above the plate. The plate is put RIM_ABOVE_BASE_MM less
// than that below the base's top, so the cap's rim sits just above the top
// of the base, as on the real keychain, and sinks into the recess when
// pressed.
import { buildBaseParts, buildBase } from './baseBuilder.js';
import { buildKeycap, printsFaceDown } from './keycapBuilder.js';
import { profileFor } from './shapeProfiles.js';
import { MX_SWITCH } from './switchModel.js';

export const DISPLAY_SWITCHES = 5;
const SHELL_WALL_MM = 1.2, SHELL_TOP_MM = 2.0, LEGEND_DEPTH_MM = 0.8;
const RIM_ABOVE_BASE_MM = 0.5;
const BED_MARGIN_MM = 8;       // spare room on the bed, in all
const MAX_PRINT_HEIGHT_MM = 240;
const PLA_G_PER_MM3 = 0.00124;
const SWITCH_SHAFT_HALF_MM = 7.9; // half the switch shaft's width

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
// cap's face instead of its letter.
// Builds both prints. Returns { scale, base: [objects], cap: [objects],
// info }, the objects ready for buildThreeMF, each print centred on the
// origin. Throws an Error with a plain-words message if it can't be built.
export function buildDisplayPiece(cap, settings, bed, scaleWanted = 0) {
  const one = oneKey(settings);
  const max = maxDisplayScale(cap, settings, bed);
  const k = scaleWanted > 0 ? Math.min(scaleWanted, max) : Math.floor(max * 10) / 10;
  if (!(k >= 2)) throw new Error('The display piece has to be at least 2 times normal size.');

  // The cap: outline blown up, shell and sockets real size.
  const postRadius = Math.max(4, Math.min(8, 0.8 * k));
  const capSettings = {
    ...one,
    capWidthMM: one.capWidthMM * k, capTopWidthMM: one.capTopWidthMM * k, capHeightMM: one.capHeightMM * k,
    cornerRadiusMM: one.cornerRadiusMM * k, topBevelMM: one.topBevelMM * k, bottomBevelMM: one.bottomBevelMM * k,
    wallThicknessMM: SHELL_WALL_MM, topThicknessMM: SHELL_TOP_MM,
    // An engraved legend is a real-size inlay; an embossed one stands up
    // from the face, so its height is blown up with the cap.
    legendDepthMM: cap.legendStyle === 'embossed' ? one.legendDepthMM * k : LEGEND_DEPTH_MM,
  };
  // Where the corner switches go: as far out toward the corners as a post
  // fits against the ceiling and a switch fits inside the cap's walls.
  const innerBottom = profileFor(cap.shape, capSettings.capWidthMM, capSettings.cornerRadiusMM).insetApprox(SHELL_WALL_MM);
  const innerTop = profileFor(cap.shape, capSettings.capTopWidthMM, capSettings.cornerRadiusMM * (capSettings.capTopWidthMM / capSettings.capWidthMM)).insetApprox(SHELL_WALL_MM);
  const postRoom = postRadius * 1.6 + 1.5, switchRoom = SWITCH_SHAFT_HALF_MM * Math.SQRT2 + 1.5;
  const fits = (d) => [[d, d], [-d, d], [-d, -d], [d, -d]].every(([x, y]) => circleInside(innerTop, x, y, postRoom) && circleInside(innerBottom, x, y, switchRoom));
  let d = capSettings.capTopWidthMM / 2;
  while (d > 0 && !fits(d)) d -= 0.25;
  // The corner switches' shafts must also stay clear of the middle one's.
  const minD = 2 * SWITCH_SHAFT_HALF_MM + 2;
  if (d < minD) throw new Error(`At ${k.toFixed(1)} times size this cap shape has no room for a switch under each corner. Try a bigger print bed or a square cap.`);
  const spots = [[0, 0], [d, d], [-d, d], [-d, -d], [d, -d]];
  capSettings.display = { scale: k, stems: spots, postRadius, legendCells: 400 };

  const { body, legendParts } = buildKeycap(cap, capSettings);
  const capHeight = capSettings.capHeightMM;
  const faceDown = printsFaceDown(cap, capSettings);
  const orient = (m) => (faceDown ? m.flippedForPrint(capHeight) : m);
  const capObjects = [{ mesh: orient(body), colorHex: cap.bodyColorHex, name: 'cap_body', group: 'cap', translation: [0, 0, 0] }]
    .concat(legendParts.map((p, j) => ({ mesh: orient(p.mesh), colorHex: p.colorHex, name: `cap_legend_${j}`, group: 'cap', translation: [0, 0, 0] })));

  // The base.
  const recessDepth = MX_SWITCH.stemTopAbovePlate - Math.min(one.stemCavityDepthMM, capHeight) - RIM_ABOVE_BASE_MM;
  const baseSettings = { ...one, display: { scale: k, switches: spots, recessDepth } };
  const parts = buildBaseParts([cap], baseSettings);
  const whole = bbox({ vertices: parts.flatMap((p) => p.mesh.vertices) });
  const cx = (whole.x0 + whole.x1) / 2, cy = (whole.y0 + whole.y1) / 2;
  const baseObjects = parts.map((p) => ({ mesh: p.mesh, colorHex: settings.baseColorHex, name: p.name, group: 'base', translation: [-cx, -cy, 0] }));

  // Roughly what the cap weighs printed in PLA: the shell prints solid,
  // the posts mostly hollow (counted at half).
  const postVolume = spots.length * Math.PI * postRadius * postRadius * Math.max(0, capHeight - SHELL_TOP_MM - 6);
  const capVolume = body.volume + legendParts.reduce((s, p) => s + p.mesh.volume, 0);
  const capGrams = (capVolume - postVolume * 0.5) * PLA_G_PER_MM3;

  const capBox = bbox(body);
  // For the 3D preview: the two put together, the cap the right way up on
  // its switches over the key's centre (the base is centred with its loop).
  const restZ = one.baseThicknessMM * k + RIM_ABOVE_BASE_MM;
  const assembled = baseObjects.concat(
    [{ mesh: body, colorHex: cap.bodyColorHex, translation: [-cx, -cy, restZ] }],
    legendParts.map((p) => ({ mesh: p.mesh, colorHex: p.colorHex, translation: [-cx, -cy, restZ], decal: true })),
  );
  return {
    scale: k, maxScale: max, base: baseObjects, cap: capObjects, assembled,
    info: {
      baseW: whole.w, baseH: whole.h, baseZ: whole.z,
      capW: capBox.w, capH: capBox.h, capZ: capHeight,
      capGrams, faceDown, switches: spots.length, cornerOffset: d,
    },
  };
}
