import { Mesh, Polygon2D, loftShell, ringFace, earClip, resamplePolygon } from './mesh.js';
import { profileFor, regularPolygon, legendFitFactor } from './shapeProfiles.js';
import { rasterizeLegend } from './textVoxel.js';

// See buildLegend()'s 'engraved' case below for why this exists — avoids
// Z-fighting between two coincident-plane surfaces without being anywhere
// near large enough to matter for print quality or visual appearance.
const FLUSH_EPSILON = 0.02;

// The stem boss: the round post on the underside that holds the cross-
// shaped socket. Its wall is stemBossWallMM thick, measured straight out
// from the end of each cross arm, so its width across is
// stemCavityWidthMM + 2 x stemBossWallMM (6.2mm at the 4.2mm / 1mm
// defaults). That width is what has to slide inside the round or square
// ring surrounding the stem on box-style switches. It used to be a fixed
// 90% of the cross width as a radius (7.6mm across, about a 1.7mm wall),
// too wide to fit inside those rings. The boss is a 24-sided polygon, so
// the returned corner radius is scaled up by 1/cos(180/24 deg) to put its
// flat sides, its thinnest points, at exactly the requested wall.
const STEM_BOSS_SIDES = 24;
function stemBossRadius(settings) {
  const wall = settings.stemBossWallMM ?? 0.65;
  return (settings.stemCavityWidthMM / 2 + wall) / Math.cos(Math.PI / STEM_BOSS_SIDES);
}

export function buildKeycap(cap, settings) {
  const bottomProfile = profileFor(cap.shape, settings.capWidthMM, settings.cornerRadiusMM);
  const topProfile = profileFor(cap.shape, settings.capTopWidthMM, settings.cornerRadiusMM * (settings.capTopWidthMM / settings.capWidthMM));

  const height = settings.capHeightMM;
  // A real chamfer needs the rim profile at the very edge to be genuinely
  // smaller than the surrounding taper would give on its own — not just a
  // second interpolation point sampled along the same straight line, which
  // is what this used to do. lerpProfile(bottomProfile, topProfile, t)
  // evaluated at the height where the bevel begins gives exactly the point
  // a continuous taper would already pass through there, so splitting the
  // loft into two segments at that point changed nothing about the shape —
  // the "Top bevel" slider had no visible effect at any setting. Insetting
  // the rim profile itself (insetApprox, the same technique used for wall
  // thickness) is what actually cuts the corner. Bevel height matches
  // bevel size for a natural ~45° chamfer rather than adding separate
  // sliders for an effect this subtle.
  const topBevel = Math.min(settings.topBevelMM, height * 0.3, settings.capTopWidthMM * 0.3);
  const bottomBevel = Math.min(settings.bottomBevelMM, height * 0.3, settings.capWidthMM * 0.3);
  const topRim = topBevel > 0.01 ? topProfile.insetApprox(topBevel) : topProfile;
  const bottomRim = bottomBevel > 0.01 ? bottomProfile.insetApprox(bottomBevel) : bottomProfile;

  const body = new Mesh();
  body.append(loftShell(bottomRim, bottomProfile, 0, bottomBevel));
  body.append(loftShell(bottomProfile, topProfile, bottomBevel, height - topBevel));
  body.append(loftShell(topProfile, topRim, height - topBevel, height));

  const innerBottom = bottomProfile.insetApprox(settings.wallThicknessMM);
  const innerTop = topProfile.insetApprox(settings.wallThicknessMM);
  // Solid top ("crown") above the hollow interior: topThicknessMM, default
  // 1.5mm. It used to be half the legend depth, 0.3mm at defaults, one or
  // two printed layers. It's never allowed thinner than the legend needs
  // (an engraved legend sinks legendDepth into it, a shine-through one
  // twice that) plus 0.4mm of body material underneath.
  const legendNeeds = (cap.legendStyle === 'shineThrough' ? 2 : cap.legendStyle === 'embossed' ? 0 : 1) * settings.legendDepthMM;
  const topThickness = Math.max(settings.topThicknessMM ?? 1.5, legendNeeds + 0.4);
  const ceilingZ = Math.max(1.0, height - topThickness);
  body.append(loftShell(innerBottom, innerTop, 0, ceilingZ, true));
  body.append(ringFaceBottomRim(bottomRim, innerBottom));

  const bossOuter = regularPolygon(STEM_BOSS_SIDES, stemBossRadius(settings));
  // Resampled to innerTop's own point count (not the reverse) — innerTop
  // is already used, unresampled, by the cavity wall loft above, and
  // resampling it here would generate a slightly different set of points
  // that no longer exactly matches that wall's own boundary, breaking
  // that seam instead of keeping this one closed (tried and confirmed
  // wrong: it produced MORE open edges, not fewer).
  const bossOuterR = resamplePolygon(bossOuter, innerTop.points.length);
  const { mesh: bossMesh, ceilingBoundary } = stemBoss(settings, ceilingZ, bossOuterR, innerTop);

  // Ceiling face closing the gap between the hollow cavity's own wall
  // (innerTop) and the stem boss's outer wall (bossOuter) at ceilingZ.
  // Without this, the top of the hollow interior was left completely
  // open — confirmed with an actual manifoldness check on a real export:
  // 72 open edges landing at exactly ceilingZ, tracing innerTop's own
  // boundary exactly. The stem boss only fills a small central cylinder;
  // it was never meant to reach all the way out to the cavity wall, so
  // nothing was closing the annular gap between the two. `ceilingBoundary`
  // (not plain bossOuterR) — the boss's actual boundary at ceilingZ,
  // which is wider than bossOuterR itself whenever the reinforcing fillet
  // below is active, since that flares the boss outward as it nears the
  // ceiling. Using bossOuterR here regardless would leave this ring's
  // inner edge short of where the boss's own flared top actually ends,
  // opening a gap at exactly that flare — same category of defect as the
  // point-count mismatch this ring already exists to avoid, just from a
  // radius mismatch instead. facingDown matches ringFaceBottomRim below:
  // both represent a solid surface whose normal points toward the
  // adjacent empty/hollow space.
  body.append(ringFace(innerTop, ceilingBoundary, ceilingZ, true));

  // Solid top cap — topRim, not topProfile, since the actual outer edge at
  // full height is the beveled (smaller) rim, not the un-beveled taper
  // profile.
  const { points, triangles } = earClip(topRim);
  for (const [a, b, c] of triangles) {
    body.addTriangle([points[a][0], points[a][1], height], [points[b][0], points[b][1], height], [points[c][0], points[c][1], height]);
  }

  body.append(bossMesh);

  const legendParts = buildLegend(cap, settings, height);
  return { body, legendParts };
}

function ringFaceBottomRim(outer, inner) {
  return ringFace(outer, inner, 0, true);
}

// Returns an array of { mesh, colorHex } parts rather than a single mesh —
// plain text/symbols always come back as exactly one part (colored with
// the cap's own legendColorHex), but colorfulEmoji caps can come back with
// up to 3, each already carrying its own detected color. See
// rasterizeLegend() in textVoxel.js for how those colors get picked.
function buildLegend(cap, settings, topZ) {
  if (!cap.text) return [];
  const safeSize = settings.capTopWidthMM * settings.legendSizeFraction * legendFitFactor(cap.shape);
  const depth = settings.legendDepthMM;

  let baseZ;
  if (cap.legendStyle === 'engraved') {
    // The legend's top face lands a hair above topZ — not exactly AT it —
    // flush with the cap body's own flat top surface for every practical
    // (and printing) purpose, but not bit-for-bit coincident with it. The
    // cap body is built independently of the legend and is already flat
    // at topZ regardless of style; 'engraved' overlaps a differently-
    // colored volume into that same top-surface plane rather than
    // displacing it. Landing EXACTLY at topZ caused real Z-fighting/
    // flickering in the live preview — two unrelated sets of triangles
    // occupying the identical plane, so the renderer can't consistently
    // decide which one wins the depth test frame to frame. FLUSH_EPSILON
    // is far below both screen resolution and print-layer resolution, so
    // it's invisible either place; it only exists to give the depth buffer
    // an unambiguous winner. 'embossed' (legend above topZ) would instead
    // put the raised letters as the lowest points touching the bed when
    // flipped, leaving the flat background suspended above them.
    baseZ = topZ + FLUSH_EPSILON - depth;
  } else if (cap.legendStyle === 'shineThrough') baseZ = topZ - depth * 2;
  else baseZ = topZ; // embossed

  const parts = rasterizeLegend(cap.text, {
    fontFamily: cap.fontFamily, bold: cap.isBold, italic: cap.isItalic, underline: cap.isUnderline,
    targetWidth: safeSize, targetHeight: safeSize, depth, colorful: !!cap.colorfulEmoji,
  });
  return parts.map(({ mesh, colorHex }) => ({
    mesh: mesh.translated(0, 0, baseZ),
    // colorHex is only non-null for the colorful-emoji path (each of its
    // up to 3 parts already carries its own detected color there); the
    // plain-text path always returns colorHex: null, meaning "use the
    // cap's own chosen legend color," same as before this feature existed.
    colorHex: colorHex || cap.legendColorHex,
  }));
}

// Small boss on the underside of the cap with a cross-shaped socket that
// clips onto a Cherry-MX-style stem. bossOuter is passed in (not
// recomputed here) so buildKeycap can reuse the exact same polygon for
// the ceiling face above that closes the gap around this boss — same
// shape, same object, no risk of it drifting out of sync with a
// duplicated formula. Returns { mesh, ceilingBoundary } rather than a
// plain mesh — ceilingBoundary is whatever polygon the boss's own top
// actually ends at, which buildKeycap's own ceiling ring needs to match
// exactly; see the fillet below for why that isn't always just bossOuter
// itself.
function stemBoss(settings, ceilingZ, bossOuter, innerTop) {
  const t = settings.stemCavityThicknessMM, w = settings.stemCavityWidthMM;
  // The socket's OWN opening — where a real switch's cross-shaped stem
  // actually enters — is anchored to Z=0, the exact same plane the
  // outer skirt's own bottom rim sits at, not to ceilingZ. Reported
  // directly: with the previous ceilingZ-anchored version, the opening
  // sat around Z=6.2mm at default settings while the skirt's own bottom
  // is at Z=0 — a real switch's stem (only ~3.5-4mm tall above its own
  // housing) would need the housing to already be sunk ~6mm into
  // whatever the cap is being pressed onto before the socket could even
  // begin to engage it, meaning the skirt's own bottom rim would hit
  // the switch housing (or this project's own base) long before the
  // socket ever reached the stem at all. Anchoring to Z=0 instead means
  // the socket starts reaching for the stem from the very first moment
  // the skirt makes contact with anything below it — matching how a
  // real keycap's own socket relates to its own skirt. Depth is
  // measured from that same Z=0 plane too, so `stemCavityDepthMM`
  // continues to mean the socket's own actual usable depth regardless
  // of `capHeightMM` — clamped to the ceiling so it can never poke
  // through the solid crown/legend material above it if depth is set
  // larger than the available room (a short cap, or a deliberately
  // large depth value).
  const depth = Math.min(settings.stemCavityDepthMM, ceilingZ);
  // Resampled to bossOuter's own point count (now 36, to match innerTop,
  // rather than its original 24) — otherwise this ring face pairs a
  // 36-point bossOuter against a 12-point crossOuter, and the resulting
  // min(36,12)=12-point connection leaves 24 of bossOuter's own points
  // disconnected at this boundary, which is exactly what happened when
  // this was tried without the resample first.
  const crossOuter = resamplePolygon(crossProfile(w, t), bossOuter.points.length);

  // Reinforcing fillet where the boss meets the ceiling — the actual
  // load path for every keypress: force travels from the switch's stem,
  // through this socket, through the boss's own wall, into the ceiling
  // and the rest of the cap. A plain 90° junction there (a thin boss
  // wall meeting a thin ceiling at a sharp corner) is both a stress
  // concentration and a thin, unsupported horizontal overhang to print —
  // exactly where a real keycap would be most likely to crack loose
  // under repeated use. Widening the boss as it nears the ceiling, over
  // some height right below it, turns that sharp corner into a gradual
  // taper (a chamfer/gusset, not a true circular fillet — consistent
  // with every other "bevel" in this codebase, which are all straight
  // tapers via insetApprox rather than actual arcs) so the wall
  // thickness at the joint itself is meaningfully greater than the
  // boss's own nominal wall thickness elsewhere.
  //
  // Deliberately confined to the region strictly above the socket's own
  // depth — the boss's actual bore and the stem it grips are completely
  // unaffected by this; only the (usually hollow) segment between the
  // socket's dead end and the ceiling gets wider. bossRadius comes from
  // stemBossRadius(), the same formula bossOuter itself was built from,
  // rather than re-measured from bossOuter's
  // own (already-resampled) points, which for a regular polygon
  // resampled by arc length can drift very slightly off the true
  // circumradius — this project's own settings are the authoritative
  // source for boss size, not a re-derivation from already-approximated
  // geometry.
  const bossRadius = stemBossRadius(settings);
  // Roughly matches the boss's own nominal wall thickness scale by
  // default, capped so it can never flare past the boss's own radius
  // (which would invert the shape at its center).
  const targetFilletMM = Math.min(settings.wallThicknessMM, bossRadius * 0.5);
  // Safety clamp against innerTop — the actual cavity wall this boss
  // sits inside of. innerTop's points aren't all equidistant from the
  // center for a non-round cap shape (square, star, etc.), so the
  // tightest constriction anywhere around it is what actually limits how
  // far the boss can safely flare without touching or crossing that
  // wall; 0.3mm of clearance is kept beyond that on top.
  const innerTopMinRadius = Math.min(...innerTop.points.map(([x, y]) => Math.hypot(x, y)));
  const maxFilletMM = Math.max(0, innerTopMinRadius - bossRadius - 0.3);
  const filletMM = Math.min(targetFilletMM, maxFilletMM);
  // How much of the (depth to ceiling) segment the taper itself
  // consumes — roughly a 45° taper by matching filletMM, clamped to
  // whatever room that segment actually has above the socket's own
  // depth. A segment with no room at all (a very short cap, or a
  // deliberately deep socket already reaching the ceiling) reduces this
  // to 0, which the `filletMM > 0.05` check below then treats the same
  // as no fillet at all.
  const filletHeight = Math.min(filletMM, Math.max(0, ceilingZ - depth));
  const filletActive = depth < ceilingZ - 0.01 && filletMM > 0.05 && filletHeight > 0.05;
  const bossOuterFlared = filletActive
    ? new Polygon2D(bossOuter.points.map(([x, y]) => {
        const scale = (bossRadius + filletMM) / bossRadius;
        return [x * scale, y * scale];
      }))
    : bossOuter;
  // What the boss's own top actually ends at — bossOuter unchanged when
  // there's no fillet (or no room for one), the flared shape otherwise.
  // buildKeycap's own ceiling ring needs this exact boundary, not
  // bossOuter unconditionally, or it would leave a gap at the flare.
  const ceilingBoundary = filletActive ? bossOuterFlared : bossOuter;

  const mesh = new Mesh();
  // The boss's outer wall, in up to three segments: 0 to the socket depth,
  // then straight up to where the reinforcing taper starts, then the taper
  // to the ceiling. Nothing attaches to the wall at the socket depth any
  // more (the post is solid above the socket), so the split there is just
  // a row of shared vertices between two wall segments; it's kept because
  // it's harmless and the taper still needs its own boundary.
  mesh.append(loftShell(bossOuter, bossOuter, 0, depth));
  if (depth < ceilingZ - 0.01) {
    // taperStartZ is computed once and used as the exact boundary for
    // whichever segments actually get built — critical when filletHeight
    // consumes the segment's ENTIRE remaining room (taperStartZ lands
    // exactly on depth): the straight segment is then correctly skipped
    // (zero height), and the taper itself starts exactly at depth with
    // no gap between them. An earlier version computed this boundary
    // with an extra, independent -0.01 buffer baked into filletHeight's
    // own clamp, which could collide with this segment-degeneracy check
    // and land the taper's start 0.01mm above depth while ALSO skipping
    // the straight segment meant to cover that exact 0.01mm — a real,
    // if razor-thin, open gap in the wall. Confirmed directly: exactly
    // this, for a 5mm-tall cap at otherwise-default settings, tracing
    // bossOuter's own boundary at Z≈3.51. A single shared boundary value
    // and a much smaller degeneracy epsilon (1e-6, not 0.01) removes the
    // possibility of that collision entirely.
    const taperStartZ = filletActive ? Math.max(depth, ceilingZ - filletHeight) : ceilingZ;
    if (taperStartZ > depth + 1e-6) mesh.append(loftShell(bossOuter, bossOuter, depth, taperStartZ));
    if (filletActive) mesh.append(loftShell(bossOuter, bossOuterFlared, taperStartZ, ceilingZ));
  }
  // The socket's own opening — the annular lip a real switch's plastic
  // housing would sit against once the stem is seated — now at Z=0.
  mesh.append(ringFace(bossOuter, crossOuter, 0, true));
  mesh.append(loftShell(crossOuter, crossOuter, 0, depth, true));
  // The socket's roof: a flat cap over the cross-shaped hole at its full
  // depth, with the post solid above it all the way up to the crown. This
  // is what actually stops a switch stem. The post used to be hollow above
  // the socket: a ring closed off only the solid wall around the cross, so
  // the cross-shaped hole opened straight into an empty space inside the
  // post that ran up to the crown, which was just 0.3mm thick. Pushed in
  // hard, a stem went up through the socket and out the top of the cap.
  //
  // With the post solid, the boss's outer wall now meets only the crown's
  // ceiling ring at the top and nothing at the socket depth, so the two
  // three-way junctions that used to be there (72 non-manifold edges per
  // keycap) are gone too.
  //
  // Triangles are (a, c, b), the reverse of the cross outline's own
  // counter-clockwise order, so the roof faces down into the socket, the
  // empty side; checked with a winding-consistency test against the
  // socket walls rather than assumed.
  {
    const { points, triangles } = earClip(crossOuter);
    for (const [ia, ib, ic] of triangles) {
      mesh.addTriangle([points[ia][0], points[ia][1], depth], [points[ic][0], points[ic][1], depth], [points[ib][0], points[ib][1], depth]);
    }
  }
  return { mesh, ceilingBoundary };
}

function crossProfile(armLength, armThickness) {
  const h = armLength / 2, t = armThickness / 2;
  return new Polygon2D([
    [t, h], [-t, h], [-t, t], [-h, t], [-h, -t], [-t, -t],
    [-t, -h], [t, -h], [t, -t], [h, -t], [h, t], [t, t],
  ]);
}
