# KeyCapForge — Web

*by Cobb3D*

A browser-based version of the native macOS KeyCapForge app: design keycap
fidget-toy keychains for real Cherry MX switches, right in a web page, no
install required. Pure static files (HTML/CSS/JS) — no build step, no
Node/npm needed to run or host it.

## Running it

Because this uses ES modules, opening `index.html` directly via `file://`
won't work (browsers block module imports over `file://` for security).
Serve it over plain HTTP instead:

```
cd KeyCapForgeWeb
python3 -m http.server 8080
```

Then open `http://localhost:8080`. For real deployment, any static host
works as-is: GitHub Pages, Netlify, Vercel, Cloudflare Pages, or just
dropping the folder onto existing web server. There's no backend — all
geometry generation happens client-side in the browser.

### Deploying to GitHub Pages

1. Create a new repository on GitHub (e.g. `KeyCapForge`).
2. Upload the *contents* of this folder to the repo root, so `index.html`
   sits at the top level rather than inside a `KeyCapForgeWeb/` subfolder.
   Include the hidden `.nojekyll` file: it tells GitHub Pages to serve
   every file exactly as-is instead of running it through Jekyll.
3. In the repo, go to **Settings → Pages**. Under "Build and deployment,"
   set Source to **Deploy from a branch**, pick `main` and `/ (root)`, and
   save.
4. After a minute or two the site is live at
   `https://<your-username>.github.io/<repo-name>/`.

Every path in the app is relative (`style.css`, `js/app.js`), so it works
from that `/<repo-name>/` subfolder without changes. GitHub Pages serves
over HTTPS and redirects plain `http://` requests to it, which is what ES
modules and the export downloads want anyway. Three.js and the Google
Fonts load from their CDNs, so visitors need an internet connection.

Emoji legends are rasterized from whatever color-emoji font the
*visitor's* system has (Apple Color Emoji on Mac/iPhone, Segoe UI Emoji on
Windows, Noto Color Emoji on most Linux/Android), so the same emoji can
come out with slightly different shapes and colors depending on who
exports it.

### Phones and tablets

Below 820px wide (phones, and tablets held upright) the layout stacks: the
3D view on top, taking about half the screen, with the controls scrolling
underneath. Drag with one finger to orbit, pinch to zoom, and drag with two
fingers to pan. Before this, the sidebar and 3D view were always side by
side, which on a ~390px-wide iPhone made the page wider than the screen,
pushed the 3D view off the right edge, and cut off the Export button. The
3D canvas also now resizes whenever its own container changes size
(`ResizeObserver` in scene.js), not only on browser-window resizes, since
on phones the available space often changes without a window resize
firing. Text inputs and dropdowns use 16px text on small screens, the
smallest size iPhone Safari will focus without zooming the page.

The app needs iOS 16.4 or newer on iPhone and iPad, the first Safari
version that supports the import map used to load Three.js.

## What this is a port of, and how

This is **translated logic, not translated code** — nothing about Swift,
SwiftUI, SceneKit, or CoreText runs in a browser. Every file here is a
from-scratch JavaScript implementation of the same ideas the native app
worked out:

- **`js/mesh.js`** — the `Mesh`/`Polygon2D` primitives, ear-clip
  triangulation (no holes — always safe), and the `loftShell`/`ringFace`
  helpers used everywhere a hole needs cutting via matching point-count
  correspondence rather than a general polygon-with-hole triangulator.
  `earClip`'s containment test also now uses a small epsilon rather than
  strict zero — concave shapes can produce cross products landing within
  floating-point noise of zero, which under strict comparison could reject
  every remaining valid ear and silently fall back to a naive fan
  triangulation that's only correct for convex shapes. This turned out not
  to be the cause of the star/heart display bug below (verified — the
  triangulator was already producing correct, consistently-wound output
  for both, with or without the tolerance), but it's a real robustness gap
  worth closing regardless of what it did or didn't cause here.
- **`js/shapeProfiles.js`** — the 8 parametric cap outlines, plus
  `legendFitFactor()`. Star and heart caps were reported as "not
  displaying properly" — actually testing this (running the real
  triangulator against these shapes, checking triangle counts, winding
  consistency, and NaN/Infinity in the output) turned up nothing wrong
  with the mesh generation itself. The actual cause was simpler: the
  legend's target size was computed purely from the cap's overall top
  *width*, with no regard for shape. That's a fine approximation for
  convex shapes (square/round/hexagon/pentagon/octagon genuinely do let a
  same-sized legend box sit almost entirely within their material —
  verified by sampling, ~99-100%), but star's sharp 5-point notches left
  only ~77% of that box actually inside the cap's material, and heart's
  top notch/bottom point brought it to ~92% — both measurably worse, and
  both exactly the shapes flagged as broken. Wide letters would visibly
  extend past the actual points/notches into empty space rather than
  sitting on solid material. `legendFitFactor()` applies a per-shape
  correction (star 0.62, heart 0.80, flower 0.92 for its milder rounded
  notches, everything else 1.0), tuned empirically by sampling a grid of
  points against each polygon rather than a closed-form inscribed-shape
  calculation, which would need separate derivation per shape family.
- **`js/keycapBuilder.js`** — tapered keycap body + MX stem cross socket.
  Default legend style is `engraved`, not `embossed`, on purpose: its
  legend sits flush with the cap's flat top surface (same Z-plane, just a
  different color region for multi-material printing) rather than
  protruding above it, which is what lets a cap print face-down with zero
  supports — the whole top face is one continuous flat plane. `embossed`
  would instead put the raised letters as the lowest points touching the
  bed when flipped, leaving the flat background suspended above them and
  needing support to bridge across. Landing the legend's top face exactly
  on that plane caused real Z-fighting/flickering in the live preview —
  two unrelated sets of triangles occupying the identical plane, so the
  renderer can't consistently decide which wins the depth test frame to
  frame — fixed with `FLUSH_EPSILON`, a 0.02mm offset far below both
  screen and print-layer resolution, existing purely to give the depth
  buffer an unambiguous winner without being large enough to affect print
  quality or the "flush" look either.

  That fixed head-on flickering but not the legend fully disappearing at
  oblique/near-edge-on viewing angles — WebGL's depth buffer loses enough
  precision at grazing angles that a small fixed world-space gap stops
  being enough, and the two surfaces fall back into full Z-fighting there
  too. The actual fix for two coincident-plane surfaces is a GPU-level,
  screen-space depth nudge rather than a world-space geometry change (the
  same technique games use for decals) — `scene.js`'s `meshToObject3D` now
  takes a `{ decal: true }` option that sets `polygonOffset` on the
  material, used only for the legend object. This only affects how the
  live preview rasterizes two coincident surfaces; it changes nothing about
  the actual exported geometry, which still gets its separation from
  `FLUSH_EPSILON` alone.

  Also: the "Top bevel" slider used to be a no-op at every setting. It
  split the wall's loft into two segments using `lerpProfile` evaluated at
  the exact height a continuous straight taper would already pass through
  — so both segments together were mathematically identical to one
  unsplit loft. A real chamfer needs the rim profile at the very edge to
  actually be smaller than the surrounding taper gives on its own; fixed
  by insetting the rim with `insetApprox` (the same technique used for
  wall thickness) instead of just sampling a second point along the
  existing taper. Added a matching "Bottom bevel" slider, since there
  wasn't one at all before — both default to 0.8mm.
- **`js/baseBuilder.js`** — the real Cherry MX plate mount (14mm clip hole
  in a ~1.5mm plate, wider clearance pocket below, closed floor — same
  design as the native app) and the keyring, fused into a single row. Each
  cap also gets a shallow recess in the base shaped to match that cap's own
  outline (not just a plain square) — a hexagon nests into a hexagonal
  pocket, a heart into a heart-shaped one, sized with a small clearance gap
  so the cap can be pushed in rather than forced. This needed a general
  fix in `mesh.js`: `ringFace`/`loftShell` connect two profiles by direct
  index correspondence (point 1 to point 1, point 2 to point 2...), which
  only works when both have the same point count — true everywhere else in
  this project because everything came from the same `roundedRect`
  generator, but a hexagon's 6 points and a heart's 64 don't match the
  base's square cell at all. `resamplePolygon()` resamples any polygon to a
  fixed point count via arc-length interpolation, so any two shapes can be
  connected safely. One honest caveat: for very pointy shapes (star,
  heart) at default sizing, the recess's narrowest points can come close to
  or slightly overlap the round clearance hole beneath it — the recess
  clearance and hole sizes aren't currently adjusted per-shape to guarantee
  they never conflict.
- **A real, functional bug here, since fixed: the switch clearance shaft
  could shrink to barely more than 1mm at default settings** — nowhere
  near enough vertical room for a real switch's lower housing to travel
  into before its plate clips can engage, so it would physically hit
  bottom before snapping into place. The root cause was budgeting order:
  the (purely cosmetic) recess was reserving its depth first, and the
  clearance shaft got whatever height happened to be left over — which
  could shrink to almost nothing once the recess got deeper. Fixed by
  reserving the functional stack first instead (floor, then a hard
  4mm-minimum clearance shaft, then plate thickness — all non-negotiable
  for a switch to physically fit), with the recess only getting whatever
  height remains above that. Also bumped the default base thickness from
  6mm to 9mm, since 6mm genuinely isn't enough room to fit a deep recess
  *and* an adequate clearance shaft at the same time regardless of how the
  budget is ordered — the numbers just don't fit in that little material.
- **Base top/bottom bevel, matching the cap's** — now genuinely works for
  both a single-cell base and a joined multi-cap one (the default the
  moment a set has more than one letter). Getting there took several
  rounds, documented here since the underlying fix ended up mattering for
  a much more serious, separately-reported problem too (see below).

  First pass only bevel'd a single-cell base correctly and left a joined
  multi-cap base's bevel inactive, reasoning that correctly beveling a
  joined block's top-face ring per-cell would leave gaps at the boundary
  BETWEEN adjacent cells. `Polygon2D.insetOuterFacing()` (mesh.js) fixed
  the immediate issue that reasoning was based on — it insets only the
  points that actually lie on the whole block's true outer boundary,
  leaving points on a shared inter-cell boundary exactly where they were —
  but building an actual manifoldness test (rather than trusting the
  geometry by inspection) surfaced a deeper, pre-existing problem that had
  nothing to do with the bevel at all: **288 open edges on a plain 4-cap
  joined base with the bevel feature entirely uninvolved.**

  Root cause: `outer` (the whole block's ~84mm-perimeter outline) and
  `localOuter` (each cell's own ~21mm-perimeter square) were two
  *separately* arc-length-resampled polygons. Even matching their point
  counts and fixing which corners round (`roundedRectPerCorner()` in
  shapeProfiles.js, added along the way — a cell's corner should only
  round where it's genuinely on the block's outer edge, not at a boundary
  shared with a neighbor) didn't fix it: 288 open edges, all at the true
  top, persisted unchanged through both of those fixes. Confirmed the
  actual defect was vertex POSITIONS along a boundary the two shapes are
  supposed to share exactly, not point count or corner shape — arc-length
  resampling two different-sized perimeters places points at different
  physical positions even where the local geometry matches, a textbook
  T-junction (two surfaces that touch without sharing vertices). Verified
  this specifically: forcing a much finer resampling (300 points) made the
  gap *worse*, not better, and testing with sharp corners on both shapes
  still left a measurable 0.66mm gap — ruling out both resolution and
  corner treatment as the actual cause before landing on the real one.

  The fix that actually resolved it: stop building the outer wall from a
  separate whole-block `outer` shape at all. Each cell now builds its own
  complete wall — bevel segments included — from its OWN `localOuter` (and
  `localTopRim`/`localBottomRim` derived from that same polygon when
  beveled), the identical object its own top-face ring and bottom cap
  already used. Two shapes independently generated to *coincide* can't be
  trusted to actually match; the same object obviously matches itself.
  Adjacent cells' walls now overlap exactly at their shared internal
  boundary — expected and harmless, since that overlap is fully enclosed
  inside the fused block and never an exposed surface, the same
  overlapping-solids pattern already used elsewhere in this codebase (the
  voxel-grid legend technique). Verified directly: 0 open edges across
  every configuration tested — single-cell, joined multi-cap, vertical and
  horizontal layout, default/zero/deliberately-extreme bevel input — where
  the joined multi-cap case had never gotten below 288 through any of the
  earlier, more targeted fixes. `outer` is still passed into `buildBlock`
  for `insetOuterFacing()`'s own reference, but no longer used to build any
  actual wall geometry itself.

  Along the way, also fixed: the base's solid bottom cap was placed at
  `Z=bottomBevel` using `bottomRim` (the smaller, beveled shape that
  belongs at the true bottom tip, `Z=0`) — backwards on both counts,
  leaving the bevel's actual bottom tip open and creating a second,
  separate size mismatch at `Z=bottomBevel`. And: `loftShell` calls for a
  bevel that's effectively zero (the common case) were being made with a
  zero-height range instead of skipped outright, producing degenerate,
  zero-area triangles — edges shared by 6 triangles instead of 2 — sitting
  on top of the real geometry around them.
- **The same investigation traced back to, and fully resolved, a separate,
  more serious regression**: exported files losing detail entirely once
  sliced in Bambu Studio — the base coming out as a plain rectangle, caps
  losing their legends and switch-mount socket, "floating regions"
  warnings, and this happening in *both* the STL and 3MF exports (a real
  clue: STL is just a flat merged mesh with no concept of separate
  objects at all, so whatever was wrong couldn't be specific to how 3MF
  structures multi-part files). Two contributing causes, found and fixed
  separately:

  First, a 3MF-specific one: an earlier change had wrapped every part
  (base, each cap body, each legend) in a single parent "Keychain" object
  via 3MF's `<components>` mechanism, specifically to make Bambu Studio
  stop asking "should this be treated as a single object with multiple
  parts?" on import. That fixed the prompt but likely caused the "floating
  regions" symptom: this project never does true CSG/boolean union
  anywhere (every cavity — the base's recess, the plate-mount hole — is
  carved directly into a single part's own mesh via matched-point-count
  `ringFace`/`loftShell`, never by subtracting a separate object), so
  these parts need to stay independent solids through slicing. A
  `<components>` assembly is exactly what invites a slicer to attempt
  merging them instead, which a thin, coincident-surface part like the
  flush legend can't survive intact — it only touches the cap body at a
  surface, not real volumetric overlap, so a merge treats it as
  disconnected and drops it. Reverted back to independent top-level
  `<build>` items in `threeMFExport.js`: one extra confirmation click on
  import is a far smaller cost than print-breaking geometry loss.

  Second, and more fundamental (explaining why STL was affected too): the
  base geometry's own T-junction problem described above. A mesh with
  hundreds of open edges concentrated at its top surface is exactly the
  kind of defect a slicer's own auto-repair logic can "fix" by filling in
  or simplifying the surrounding surface — which matches the reported
  symptom (recess and switch-mount detail vanishing, base becoming a
  plain block) far better than a coincidence would. This affects STL and
  3MF identically, since both export the same underlying mesh — confirming
  the base geometry fix above wasn't just about bevels working correctly,
  it was the actual fix for this regression too.
- **Reported next: a visible "little cut" in both sides of the sidewall,
  right after a joined multi-cap base's first cell.** Traced to
  `insetOuterFacing()` (mesh.js) itself, the geometric helper the previous
  fix introduced: it decided whether a point was "outer-facing" (and so
  should be inset for the bevel) purely from its distance to the
  whole-block reference shape's boundary. That's ambiguous exactly at a
  corner where one adjacent edge is genuinely outer-facing and the other
  is an internal boundary shared with a neighboring cell — that corner
  point sits on both at once, and a pure distance check can't tell them
  apart. Confirmed directly: the shared boundary's X range came out as
  roughly [-9.5, 10.0] instead of the true, symmetric [-10.5, 10.5] — a
  partial, asymmetric inset landing right at that corner, matching the
  reported visual exactly.

  Fixed by replacing the geometric guess with direct knowledge:
  `insetCellSides()` (mesh.js) takes explicit `{left, right, top, bottom}`
  flags for which of a cell's 4 sides are genuinely outer-facing, derived
  the same way `cornerRadii` already was — from the cell's position in the
  row (first/middle/last) and the layout direction — rather than inferred
  from a reference shape after the fact. A corner where only one adjacent
  side is outer-facing now insets along just that one axis, resolving the
  ambiguity outright instead of approximating it. Also fixed in the same
  pass: `resamplePolygon()` was placing its 64 evenly-spaced arc-length
  samples close to but not exactly on a shape's genuinely sharp corners —
  confirmed directly, a plain unbeveled 21mm cell's resampled bottom edge
  ranged from about -9.5 to +10.0, not the true ±10.5 corners at all. Two
  adjacent cells with different corner rounding could each miss their
  shared corner by a different amount even though the underlying geometry
  coincides there exactly. `resamplePolygon()` now detects sharp corners
  in the original polygon and snaps the nearest regular sample to that
  exact position, so any two shapes sharing a true corner will always
  agree on it regardless of their different perimeters or point
  distributions. Verified directly: the shared boundary's X range is now
  the full, symmetric [-10.5, 10.5] with the bevel active, and every
  earlier open/non-manifold-edge check still passes (0 open edges) on top
  of it.
- **Reported next: a joined multi-cap base's top comes out fully covered
  once sliced** (Bambu Studio: a plain solid rectangle, no recess or
  cutout detail at all — plus the same "floating regions" warning as the
  earlier regression). All the fixes above had already brought the
  base's own open-edge count to 0, so this needed a genuinely different
  kind of check: a plain open-edge count can't see this failure mode at
  all, because it isn't one. Each cell's own wall, top-face ring, and
  bottom cap were, by the T-junction fix's own design, built into a
  fully closed, independent solid on their own — which meant two
  adjacent cells were two SEPARATE watertight solids that only touched
  at an exact, zero-volume shared plane, never actually fused into one
  continuous solid. Every individual edge was properly closed (confirmed
  again: still 0 open), but a slicer's own inside/outside test can treat
  two solids that only touch at a knife-edge coincident surface as
  ambiguous or disconnected — exactly matching "floating regions" and a
  base that gets simplified down to its outer envelope.

  First attempt: keep every cell's wall as one fully closed solid, but
  surgically drop just the wall faces that sit on a side shared with a
  neighbor (`loftShellCellSides`, tried in mesh.js), reasoning that a
  plane with solid material on both sides shouldn't carry a surface at
  all. Reverted — this made it measurably worse (72 open edges up to
  136). Root cause: adjacent cells have different corner rounding (an
  end cell rounds 2 of its own outer corners, a middle cell has none at
  all), so arc-length resampling gives them different point densities
  along the very side they're supposed to share. Dropping wall quads
  based on per-point side membership left dangling, unmatched vertical
  edges exactly at the transition points where "shared" meets "outer" on
  each cell — genuinely open, since the two cells' transition points
  don't even land at the same X position to match each other.

  The fix that actually worked: change what geometry exists instead of
  which of an already-built set of edges gets kept. Each cell's own
  shared (non-outer-facing) sides are now extended slightly outward —
  0.2mm, via `insetCellSides` reused with a negative amount and the
  *inverse* of the outer-side flags — before any of that cell's wall,
  top-face ring, or bottom cap geometry is built from it. Outer-facing
  sides are completely untouched, so the whole block's outer silhouette
  is pixel-for-pixel identical to before. Two neighboring cells now
  genuinely overlap in volume across a real, if tiny, 0.4mm-wide band,
  rather than meeting at an exact coincident surface — confirmed
  directly: one cell's corner sits at 0.2mm past the true boundary in
  one direction, its neighbor's corner at 0.2mm past it in the other.

  (`insetCellSides` needed one more fix along the way: its own early-
  return guard was `if (amount < 0.01) return polygon`, meant to skip an
  effectively-zero bevel — but a *negative* amount, used here to extend
  a side outward rather than inset it, is always less than 0.01 too, so
  the guard silently no-opped the entire extension. Fixed to check
  `Math.abs(amount)` instead, which is what "effectively zero" actually
  means and doesn't change behavior for the existing, always-positive
  bevel calls at all.)

  This also turned out strictly cleaner than the version it replaced:
  with genuinely offset (not exactly coincident) walls, the non-manifold
  edge count from that duplicate overlapping geometry drops to 0 as well
  (down from 127), not just the open-edge count, which was already 0
  either way.

- **The actual root cause behind this entire string of regressions,
  found after the reported symptom persisted despite every fix above**:
  a screenshot of Bambu Studio's own object diagnostics showed 209,182
  triangles and *exactly* 627,546 "open edges" on a single object —
  precisely triangleCount × 3. That number is the signature of a mesh
  where literally no two triangles share a single vertex INDEX anywhere,
  regardless of whether their positions coincide: every triangle a
  private, disconnected island. Confirmed directly by rebuilding the
  same base and checking edges by vertex index instead of this project's
  own usual position-based check: 16,080 raw vertices for 5,360
  triangles (exactly 3× — trace it and every single one is its own
  unique entry) and exactly 16,080 index-based open edges, matching the
  reported ratio precisely.

  Root cause: `Mesh.addTriangle()` (mesh.js) has always pushed 3
  brand-new vertex entries on every call — including when a triangle
  built moments earlier, in the very same loftShell loop, sits at the
  exact same physical position for a shared edge. No two triangles
  anywhere in this whole codebase have ever shared a vertex index, no
  matter how perfectly their positions coincide. This is completely
  invisible to every manifoldness check used throughout this entire
  investigation, including this project's own: they all deliberately
  work by rounded POSITION rather than index specifically to work around
  Mesh never welding in the first place, so they correctly proved the
  underlying geometry is genuinely sound at every step — and they
  weren't wrong. But that's not what a real 3MF consumer sees. 3MF's
  entire point is expressing shared topology through shared vertex
  indices, and a slicer that relies on that (reasonably, given the
  format) sees a fully unwelded mesh as completely disconnected —
  every triangle an island regardless of where its corners physically
  sit — which is exactly consistent with a slicer falling back to some
  best-effort reconstruction instead of trusting the file's explicit
  topology: losing internal recess/cutout detail, merging overlapping
  parts incorrectly, flagging regions as floating, all without an
  actual hole or gap ever existing in the geometry at any point in this
  investigation. STL was affected identically for a related but
  separate reason — it has no shared-vertex concept at all, by format
  design, so lack of welding was never visible as a defect there either
  — but a slicer still has to weld an STL by position on import to make
  any sense of it at all, and whatever heuristic or tolerance it uses
  for that is a very different, opaque thing from this project choosing
  precisely how and when to weld its own geometry deliberately.

  Fixed with `Mesh.welded(precision)` (mesh.js): merges every vertex at
  the same rounded position into one shared index and remaps triangle
  indices to match, dropping per-vertex normals entirely in the
  process. That's safe for both export formats specifically because
  neither actually uses them: `meshToSTL` (stlExport.js) computes a flat
  normal per facet from raw positions via `triangleNormal()`, never
  reading `mesh.normals` at all, and this project's own `<vertex>`
  element in the 3MF writer (threeMFExport.js) carries no normal
  attribute in the first place. Verified directly: welding the same
  5,360-triangle base mesh collapses it to 2,688 vertices and brings the
  index-based open-edge count from 16,080 down to exactly 0. Applied
  once, right before export, in `app.js`: on the whole `combined` mesh
  for STL (fine to weld across every part together there, since STL has
  no separate-object concept to preserve anyway), and independently, per
  object, for every entry in `threeMFObjects` for 3MF (never merged
  across objects, since those need to stay separate, independently
  colored printable parts — see the earlier `<components>` revert).
  Deliberately NOT applied to the mesh the live preview uses — Three.js
  is handed the same per-triangle, flat-shaded mesh as before, since
  welding would only matter for what an external file format's
  triangles reference, not for anything the live viewport renders.

- **Reported next: the stem cavity (the socket a real MX switch's stem
  clips into, on the underside of each cap) needs to open at the exact
  same plane as the cap's own outer skirt/ridge, not somewhere well
  above it — otherwise the skirt bottoms out against the switch (or
  this project's own base) before the socket can ever reach the stem,
  and it needs to stay correct if `capHeightMM` or the socket's own
  depth setting changes.** Confirmed the reported problem directly: the
  socket's opening was previously anchored to `ceilingZ - depth`
  (`stemBoss()`, keycapBuilder.js) — at default settings, Z≈6.2mm — while
  the skirt's own bottom rim is at Z=0. A real switch's stem is only
  about 3.5-4mm tall above its own housing, nowhere near enough to
  bridge a 6.2mm gap before the skirt itself would already be resting on
  whatever's below it.

  Fixed by anchoring the socket's own opening to Z=0 — the exact same
  plane the outer skirt's bottom rim sits at — with its usable depth
  measured from there via `stemCavityDepthMM` directly, independent of
  `capHeightMM`/`ceilingZ` entirely (clamped to never exceed the
  ceiling, for a very short cap or a deliberately oversized depth
  value). The boss's own outer wall still needs to reach the ceiling
  regardless, to stay connected to the ceiling ring above it — so it's
  now built in two segments split exactly at the socket's own depth,
  with a matching vertex ring for the dead-end cap to attach to at that
  same Z-level, rather than one continuous loft with no vertices at any
  intermediate height at all (confirmed this was needed directly: a
  single continuous loft left the dead-end ring's own boundary
  completely open, tracing bossOuter's shape exactly at the socket's
  depth). When the socket's own depth doesn't reach the ceiling — the
  common case — the region above the dead end, still inside the boss's
  outer wall, is left as a second, separate enclosed void with its own
  cap at the top, rather than filled solid, keeping material usage the
  same as before.

  Verified directly across the full reachable range: 0 open edges at
  default settings, at every `capHeightMM` the UI's own slider allows
  (6, 10, 16), and at several `stemCavityDepthMM` values including one
  larger than the ceiling to confirm the clamp actually engages (50mm,
  clamped down safely). What remains is 72 non-manifold edges — two
  T-junctions, one at the socket's own depth and one at the ceiling,
  each an internal shelf (the dead-end cap / the general ceiling ring)
  meeting a continuous outer wall at a shared edge. Traced through
  directly why this isn't the same category of risk the base's own
  cell-fusion issue was: that was two SEPARATE watertight solids
  touching at a zero-volume surface, genuinely ambiguous to a slicer's
  inside/outside test; this is one single, already-continuous solid
  with an internal shelf attached to it — a standard, well-supported
  CSG-union pattern, and (traced through the same math) one of these two
  T-junctions already existed in the previous, working design at the
  ceiling — this fix duplicates that same already-tolerated pattern at
  the new opening position rather than introducing a new kind of defect.
  `stemCavityDepthMM` isn't exposed in the UI at all currently (fixed at
  3.5mm) and `capHeightMM`'s own slider only reaches down to 6mm — nowhere
  near where the clamp would actually engage in practice — so this fix
  covers the entire range reachable through the interface as it stands
  today.

- **Requested next: a reinforcing bevel/fillet where the stem boss meets
  the ceiling, for extra strength.** This is the actual load path for
  every keypress — force travels from the switch's stem, through the
  socket, through the boss's own wall, into the ceiling and the rest of
  the cap — so a plain 90° junction there is both a stress concentration
  and a thin, unsupported horizontal overhang to print, exactly where a
  real keycap would be most likely to crack loose under repeated use.

  Added a taper (a straight chamfer/gusset, not a true circular fillet —
  consistent with every other "bevel" already in this codebase, which are
  all straight tapers via `insetApprox` rather than actual arcs) that
  widens the boss as it nears the ceiling. Deliberately confined to the
  region strictly above the socket's own depth (`stemBoss()`,
  keycapBuilder.js) — the socket's actual bore and the stem it grips are
  completely unaffected; only the segment between the socket's dead end
  and the ceiling gets wider, by up to `wallThicknessMM` of extra radius
  (roughly a 45° taper, matched in height), so the joint ends up
  meaningfully thicker than the boss's own nominal wall elsewhere without
  touching stem fit at all.

  Safety-clamped two ways, both engaging automatically rather than
  needing their own settings: against `innerTop` (the cavity wall the
  boss sits inside of) via each of its points' own distance from center
  — not a single "radius" that would be wrong for a non-round cap shape
  like square or star, where the tightest constriction is what actually
  limits how far the boss can flare — with 0.3mm of clearance kept beyond
  that; and against whatever room the (depth to ceiling) segment actually
  has, for a short cap or a deliberately deep socket that leaves little
  or none. `buildKeycap()` now takes the boss's own actual top boundary
  back from `stemBoss()` (`ceilingBoundary` — bossOuter unchanged when no
  fillet applies, the wider flared shape otherwise) for its own ceiling
  ring to connect to, rather than assuming that boundary is always
  bossOuter unconditionally, which would leave a gap at exactly the
  flare whenever one is active.

  Found and fixed one real bug along the way: the taper's own starting
  Z was computed with an extra, independent -0.01mm buffer baked into
  the fillet-height clamp, separate from the epsilon used to decide
  whether the plain straight wall segment below it was worth building at
  all — for a specific, narrow band of settings, those two independent
  buffers could collide and leave a genuine, if razor-thin, open gap
  between them (the straight segment skipped because the gap was "too
  small to bother," the taper starting just above where that gap actually
  needed covering). Confirmed directly: exactly this, at Z≈3.51 for a
  5mm-tall cap at otherwise-default settings — 36 open edges, 0 at every
  other cap height tested. Fixed by computing the segment boundary once
  and using a much smaller (1e-6) degeneracy epsilon, so the two
  potentially-adjacent segments always meet exactly rather than each
  independently deciding they're covered by the other.

  Verified across default settings, round and square cap shapes, cap
  heights from 3mm to 16mm, wall thicknesses from 0.6mm to 3mm, cap top
  widths down to 8mm, a stem width large enough to noticeably shrink the
  fillet's safety margin, and a socket depth deliberately set to consume
  the entire ceiling (leaving no room for a fillet at all, the correct
  no-op case): 0 open edges in every one.

- **Reported next: real switches were hitting the bottom of the base
  before their retention clips could engage — need more void below the
  plate, and 50% recess depth as a starting point.** The switch-clearance
  void's height was a hardcoded, non-adjustable constant
  (`minClearanceShaftMM = 4.0`, buildBlock() in baseBuilder.js) — too
  shallow for the switches actually being used, and with no way to tune
  it without a code change for whichever switch needed more room next.

  Raised to 5.5mm and exposed as its own setting
  (`clearanceHeightMM`/"Switch clearance" slider) rather than kept as an
  internal constant, since exactly how much a real switch's lower housing
  needs varies by manufacturer and this project has no way to know every
  model's spec in advance — the point isn't that 5.5mm is definitely
  enough for everyone, it's that it's now something the person hitting
  this problem can adjust themselves.

  The second half of the request interacts directly with the first,
  which is why they were asked for together rather than as two
  independent tweaks: recess depth and switch clearance both draw from
  the same fixed `baseThicknessMM` budget (`maxSafeRecessDepth()`,
  baseBuilder.js — the reservation logic refactored into its own
  exported function so app.js can reuse the exact formula rather than a
  hand-derived number that could drift out of sync with it). Raising
  switch clearance alone, without also raising base thickness, would
  have silently shrunk the achievable recess to near nothing — at the
  old 9mm default, the increased 5.5mm clearance alone leaves only 1.4mm
  safely available for recess, nowhere near a meaningful 50%.
  `baseThicknessMM` raised to 16mm (from 9mm) specifically so a
  50%-of-thickness recess (8.0mm) fits on top of the increased clearance
  requirement with a bit of room to spare — verified directly:
  `maxSafeRecessDepth()` at these settings is 8.4mm, comfortably above
  the 8.0mm default, so it isn't silently clamped away the moment
  someone opens the app.

  Also added a dynamic hint (`updateRecessDepthHint()`, app.js, same
  pattern as the corner-radius and (now-removed) base-bevel hints
  earlier) that surfaces the clamp explicitly — with the exact capped
  value — whenever the current combination of settings pushes
  recessDepthMM past what's actually safe, rather than leaving the
  slider silently showing a number the geometry doesn't actually use.
  Verified directly: 0 open edges at the new defaults, for both a
  single-cap and a joined 4-cap base, with `maxSafeRecessDepth()`
  correctly reporting 8.4mm.

- **Requested next: a scale reference overlaid on the 3D render, sized
  correctly for the actual current zoom.** Implemented as a "map-style"
  scale bar (`Viewport._updateScaleBar()`, scene.js) — a small labeled
  bar in the bottom-left corner of the canvas, similar to the scale
  reference in Google Maps or most CAD viewers, rather than a ruler
  object placed in the 3D scene itself. A 3D ruler would need its own
  careful positioning to avoid being obscured by the model from some
  orbit angles, and would foreshorten or tilt away from a straight-on
  read the moment the camera isn't looking at it face-on; an HTML
  overlay stays flat, legible, and in the same screen corner regardless
  of orbit angle.

  Recalculated every single frame in the render loop (`_animate()`)
  from the camera's actual current distance to the OrbitControls target
  — not computed once when the model is first framed and left stale.
  That's what "stays accurate" actually requires: the standard
  perspective-camera relationship (`2 × distance × tan(vFov/2)` gives
  the world-space height visible at that distance, divided by the
  canvas's own CSS pixel height gives mm-per-pixel) is recomputed fresh
  every frame, so zooming, panning, or orbiting are all automatically
  reflected on the very next rendered frame with no special-casing for
  which kind of camera movement caused the change — the same guarantee
  the render loop already provides for the model itself. Snapped to a
  round, legible length (10mm, 20mm, 50mm, ...) via the standard "nice
  number" technique chart and map scale bars use, rather than showing an
  exact but unreadable computed value like "37mm" — verified by hand
  across a wide range of simulated distances (50mm to 1000mm): the
  labeled length changes correctly with zoom while the bar's own on-
  screen pixel width stays in a consistent, comfortable range throughout,
  exactly the behavior a real map application's scale bar has. Skips its
  own DOM writes on a frame where the rounded label/width haven't
  actually changed, rather than touching the DOM 60 times a second
  regardless.

- **Requested next: shrink the keyring/lug's own material — reported
  directly that it shouldn't be the same thickness as the base — with
  25% of the base's total height as the actual target.** A first attempt
  at this also added a reinforcing taper below a thin top-flush loop; that
  was explicitly reverted (undoing both the thin loop and the taper) in
  favor of a simpler, single change: just the loop's own thickness, with
  the taper dropped entirely and no assumption made about flush-top vs.
  flush-bottom placement.

  `keyringFeature()` (baseBuilder.js) now builds the loop at
  `baseThicknessMM × 0.25` tall instead of the full `baseThicknessMM` —
  still a single uniform-diameter loft, same structure as before, just
  shorter. Centered on the base's own mid-height by default, since no
  particular side was specified this time: the function builds the loop
  centered at its own local Z=0, and the existing translation (already
  in place, unchanged) that positions it within the base naturally lands
  it in the middle of the base's own height, with equal empty space above
  and below it in the reach beyond the base's own footprint — a one-line
  change (in the two `loftShell`/`ringFace` Z-arguments) if flush-top or
  flush-bottom is actually wanted instead.

  Verified across every keyring side, joined and single-cap bases, a much
  thinner base, and a larger keyring size: 0 open AND 0 non-manifold
  edges in every case — cleaner even than the plain full-height version
  it replaced, since a simple loop with no taper introduces no overlap
  seam of its own at all. Confirmed the loop's actual Z-range directly:
  exactly [6, 10] at default settings (16mm base) — a 4mm loop, centered,
  precisely 25% of the total height.

- **Reported next: put the loop flush against the same plane as "the
  back" so it doesn't need support to print.** The centered placement
  above was the actual problem being described: the base prints with its
  own Z=0 (the flat, featureless side — the "back," as opposed to the
  recess/plate-mount side at Z=thickness, the "front") resting directly
  on the print bed. A loop centered within the base's height leaves its
  own bottom face floating with nothing underneath it out in the reach
  area beyond the base's own footprint — a horizontal overhang no slicer
  can print without adding support material there.

  Moved to be flush with Z=0 instead of centered — `keyringFeature()`
  now builds the loop directly in its final [0, loopHeight] range rather
  than centered at its own local origin, and the translation that places
  it (baseBuilder.js) no longer adds the thickness/2 offset that used to
  re-center it. Its bottom face now sits on the exact same plane the rest
  of the base already starts printing from, rather than merely being
  closer to it — eliminating the overhang outright instead of just
  shrinking it.

  Verified across every keyring side, joined and single-cap bases, a
  thinner base, and a larger keyring size: 0 open and 0 non-manifold
  edges in every case, same as before this change. Confirmed the actual
  Z-range directly: exactly [0, 4] at default settings (16mm base) — the
  same 4mm/25% loop as before, now flush with the bottom instead of
  centered.

- **`js/textVoxel.js`** — legend text, but built completely differently
  than natively. Rather than parsing font files for vector glyph outlines
  (which needs a font-parsing library and exact font-file URLs I can't
  verify from this environment), this renders text to an offscreen
  `<canvas>` using the browser's own font rendering — any CSS
  `font-family`, including Google Fonts loaded via a normal `<link>` tag —
  then reads back the alpha channel to build a small "inside/outside" grid,
  extruding each filled cell. This is the same voxel-grid technique the
  native app used as a bulletproof fallback for tricky letter counters,
  applied here to *every* glyph. It can't ever "lose" a hole in a letter,
  because there's no polygon-with-hole triangulation involved at all. This
  also means symbols "just work" with no special-casing — the browser's
  normal font-fallback chain substitutes a system emoji font for any
  character the chosen text font doesn't cover.

  Emoji now support up to 3 colors, not just the single legend color used
  for everything else. `rasterizeLegend` takes a `colorful` option: when
  set, the canvas is read back in full RGB (not just alpha), and opaque
  pixels get grouped into up to 3 color clusters via greedy nearest-color
  merging — repeatedly take the most common remaining color as a new
  cluster's representative, absorb every pixel within a color-distance
  threshold of it, repeat. The function's return type changed to match:
  always an array of `{ mesh, colorHex }` parts now (exactly one, with
  colorHex: null meaning "caller decides," for ordinary text/symbols; up
  to 3, each carrying its own detected color, for a colorfulEmoji cap).
  `keycapBuilder.js`'s `buildLegend` and `buildKeycap` were updated to
  thread `legendParts` (plural) through instead of a single `legend`
  mesh, and both the live preview and the 3MF export now create one
  object per part — STL has no color anyway, so every part there just
  merges into the one combined mesh regardless of how many there are. A
  cap only gets colorfulEmoji: true when added via the quick-insert emoji
  palette, not for symbols or typed text, which keep the ordinary
  single-color legend matching normal keycap conventions.

  Reported afterward: emoji were coming out wildly oversized, with more
  distinct colors than expected. Root cause was the scale calculation —
  it derived the mesh's size from `canvasW`/`canvasH`, which come from
  `probe.measureText()`'s reported ascent/descent/width. For ordinary text
  those metrics closely track what's actually drawn, since the requested
  font itself defines the glyph. An emoji isn't drawn by the requested
  font at all, though — it's substituted via the browser's own system
  emoji fallback, drawing a color bitmap/COLR glyph that doesn't
  necessarily follow the same metric conventions as a vector glyph in
  whatever font was actually requested. When those metrics don't match
  what's actually on the canvas, canvasW/H come out wrong — and since
  scale is targetWidth/Height divided by canvasW/H, a too-small canvas
  size produces a too-large scale. Fixed by measuring the actual rendered
  opaque pixel bounding box directly and using that for the scale
  calculation instead of trusting font metrics at all — sidesteps
  metric-reliability questions entirely, since the mesh always ends up
  sized to whatever pixels actually got drawn. `meshWidth`/`meshHeight`
  (used for centering) still derive from the full canvas dimensions, not
  just the content bounding box, so the existing centering fixes are
  unaffected — everything just scales correctly by the new factor rather
  than the centering math needing to change too. The oversized rendering
  plausibly explains the color complaint as well, even though it wasn't
  separately investigated: a legend enormously larger than intended makes
  the voxel grid's own step-size artifacts (small color/shading
  variations at cell boundaries) far more visually obvious than they'd be
  at the correct, letter-scale size, on top of whatever the 4-color export
  cap already resolves.

  The quick-insert palette itself is now a fixed 4-row-tall scrolling
  strip (`max-height` + `overflow-y: auto` in the CSS, not something that
  grows the sidebar taller as more get added) with a substantially larger
  set — 24 symbols plus 87 emoji spanning faces, hearts/hands, animals,
  food, nature/weather, and common activities/objects, covering what's
  actually common across modern phone keyboards rather than a small
  arbitrary sample. Clicking one still just calls the same `appendCap()`
  as the Add Cap button, since a cap is already just "one character" in
  the data model regardless of what that character is or how many colors
  it renders in.

  Horizontal centering had a real, if subtle, bug: canvas sizing and text
  positioning used `metrics.width` (the font's *advance* width — how far
  the text cursor moves) rather than the actual visible ink extent. Those
  two are close for plain upright text in most fonts, but italic slant can
  make ink overhang the advance box asymmetrically, bold strokes can
  extend past it, and left/right side bearing is often unequal for an
  arbitrary string regardless of style — so the drawn ink didn't
  necessarily fill that symmetric padding evenly, leaving legends visibly
  a little off-center without anything being outright broken. Same *class*
  of bug as an earlier vertical one (underline space being reserved even
  when no underline was drawn, throwing off vertical symmetry) — this is
  the horizontal-axis counterpart. Fixed by centering against
  `actualBoundingBoxLeft`/`actualBoundingBoxRight` (the true ink extent)
  instead, falling back to an even split of the advance width if a browser
  doesn't report them.

  That fix itself shipped with a bug: the fallback used `||`
  (`metrics.actualBoundingBoxLeft || textWidthPx / 2`), which treats *any*
  falsy value — including a legitimate `0` — as "missing, use the
  fallback." Simple left-aligned capital letters routinely have their ink
  start exactly at the fillText anchor, meaning `actualBoundingBoxLeft`
  genuinely is `0` — and `||` was silently overriding that correct value
  with a large bogus one, visibly shoving text rightward. Switched to `??`
  (nullish coalescing), which only falls back on `null`/`undefined`, for
  all four metrics this function reads this way (ascent, descent, and both
  ink-extent values) — descent has the same failure mode for any all-caps
  word with no descenders, which is an extremely common case for keycap
  legends.
- **Requested next: go through every quick-insert emoji one by one and
  make sure they all display correctly once exported into a slicer** —
  reported as a widespread problem, not an isolated one. This called for
  actually testing all 87 rather than reasoning about the code in the
  abstract, so a real headless-browser test harness (Playwright, driving
  an actual Chromium instance against the app served locally) ran
  `rasterizeLegend()` for every quick-insert emoji with `colorful: true`
  and checked each result's actual mesh topology, not just whether
  something visibly rendered.

  Found a real, widespread defect: 48 of the 87 emoji (55%) came back
  with non-manifold edges — from 1 up to 215 for a single complex emoji
  (🏀, a basketball). This is a classic voxel-meshing ambiguity: wherever
  two DIAGONALLY-touching cells share a color slot, but the two cells
  that could otherwise connect them through a shared FACE (not just a
  shared corner point) both belong to a different slot or lie outside the
  glyph entirely, the existing per-face wall logic places 4 separate wall
  quads there — 2 from each half of the diagonal pair, all facing back
  toward that one corner — that all converge on a single shared vertical
  edge, instead of the 2 a normal, unambiguous boundary produces
  elsewhere. A comment already in this file (about the plain, single-slot
  text path) had called this configuration one real letter or emoji
  shapes "essentially never" produce — checked directly and found to be
  wrong specifically for the colorful multi-slot path: color-region
  boundaries create far more opportunities for a diagonal-only connection
  than a plain single-slot glyph's inside/outside boundary ever does,
  which is presumably why it went unnoticed for plain text and symbols
  for as long as it did.

  Fixed with a diagonal-connectivity pre-pass (`rasterizeLegend()`,
  textVoxel.js) that resolves this before any geometry is built at all,
  rather than trying to patch the geometry afterward: the pixel grid is
  precomputed into an explicit slot array first (rather than calling
  `isInside()`/`slotOf()` per pixel on demand, as before), then every 2x2
  block of cells is checked for a diagonal pair sharing a slot with two
  non-matching bridge cells — and when found, one of the two bridge cells
  is reassigned to the pinching pair's own slot, turning the diagonal-only
  connection into a normal, full-face one. The existing, already-verified
  per-face wall logic below never needs to know this happened. Run to a
  fixed point (repeated until a full pass makes no further changes), not
  just once — confirmed directly that a single pass alone reduced the
  affected-emoji count from 48/87 down to 11/87 but didn't reach zero,
  since resolving one pinch can shift the boundary by one cell and reveal
  a second pinch immediately next to it; iterating to a fixed point
  reaches zero. Safe to iterate this way because each pass only ever
  turns a mismatched diagonal pair into a matched one, never the reverse,
  so the total mismatch count is strictly non-increasing and the loop
  reliably terminates.

  Verified directly, across all 87 quick-insert emoji: 0 open and 0
  non-manifold edges in every case after the fix, versus 48 affected
  before it. Also confirmed the fix isn't overly aggressive: comparing
  before and after, not one of the 87 emoji had its detected color-part
  count change (nothing got merged away), and the largest triangle-count
  shift across all 87 was 0.46% — consistent with a fix that only ever
  nudges a small number of isolated pinch-point cells, not one that
  reshapes anything at the scale a person would actually notice.
- **Reported next: the rocket emoji (🚀) still didn't display correctly**
  — even though it came back clean (0 open, 0 non-manifold edges) from
  the fix just above, confirming this was a genuinely different defect,
  not a remaining case of the one already fixed. Checked connected-
  component sizes directly this time (not just topology) and found two
  of the rocket's three colors each had one large, legitimate shape plus
  4-5 small, disconnected fragments.

  Rendering the emoji's own canvas against a dark background (rather than
  assuming from the raw pixel data) showed exactly what these were: a
  faint white "sparkle" decoration baked into Noto Color Emoji's own
  rocket artwork — invisible against a white canvas background at any
  opacity, since white-on-white shows nothing regardless of alpha, which
  is exactly why it never appeared in an ordinary preview screenshot.
  Its peak opacity still clears `isInside()`'s alpha threshold, so it
  gets voxelized as a small but genuinely valid, fully-manifold island of
  its own — invisible to a topology check for exactly the reason a tiny
  closed box is still a perfectly valid closed box. A subtle translucency
  effect has no equivalent in an opaque, solid-colored 3D print; it would
  just appear as an unrelated, disconnected fleck floating near the model
  regardless of why it's there.

  First fix attempt used a fixed cell-count threshold (merge any 4-
  connected region under 6 cells into its neighbor) — reduced but didn't
  fully resolve the rocket's own fragments, confirmed directly. Root
  cause: cell size varies per emoji (canvas size and content both vary),
  so a fixed cell COUNT doesn't correspond to a fixed physical size
  across different emoji — the same defect in spirit as trusting font
  metrics over actually-rendered pixels elsewhere in this file. Switched
  to a physical-size threshold instead (roughly 1mm, in the same spirit
  as a typical 3D printer's own practical minimum feature size): flood-
  fill the grid into its real 4-connected regions (matching the wall-
  logic's own connectivity), and merge any region whose bounding box is
  smaller than that threshold IN BOTH DIMENSIONS into whichever slot is
  most common right around its border — checked by bounding box, not
  total cell count, since a thin sliver could stay small in cell count
  while still being long enough in one dimension to matter.

  Verified directly: the rocket's own fragment count dropped from 8/4/7
  per color down to 2/4/2 — each remaining component 1.1mm or larger,
  consistent with real design elements (main body plus a highlight, four
  separate flame licks, lower body plus a shading detail) rather than
  sparkle noise. Re-ran the full 87-emoji suite after this change to
  check for side effects: 0 errors, 0 topology issues (confirming this
  didn't reopen the diagonal-connectivity fix above), and reasonable,
  explicable component counts throughout — including emoji that
  legitimately keep many same-color patches on purpose, like the soccer
  ball and basketball's own seam patterns (7-9 components each), which
  the size-based threshold correctly leaves alone rather than merging
  away.
- **Reported next: a real Bambu Studio export of "LENA" + the rocket
  emoji still showed 360 non-manifold edges and a "reversed faces
  detected" warning.** The 360 itself checked out immediately as already
  expected — exactly 72 (the stem boss's own documented count) × 5 caps —
  but "reversed faces" hadn't been re-checked against a real winding
  test since the dead-end ring's own winding was fixed several turns
  earlier, so it was treated as a live question rather than assumed
  fixed.

  Built a proper directed-edge winding check (do the two triangles
  sharing each edge traverse it in opposite directions) and confirmed a
  second, genuinely separate winding bug at the boss's ceiling — not a
  remaining case of the dead-end one, a different location and root
  cause entirely. The ceiling void's own cap (`stemBoss()`,
  keycapBuilder.js) was built with `addTriangle(a, c, b)` — a swapped
  order picked earlier on the reasoning that "this cap faces downward,
  into the void below." That reasoning was never actually checked
  against the wall it needs to agree with, in a function that had
  already had one confirmed-backwards `facingDown` assumption — checked
  directly this time: the wall's own top segment, built in isolation,
  agrees with the UN-swapped order (0 conflicts), not the swapped one
  (36, a full mismatch around the entire boundary). Fixed by removing the
  swap.

  That fix alone didn't change the reported 360, which led to checking
  something the "72 per cap" figure had never actually verified before:
  whether it's genuinely one indivisible number, or two separate
  36-edge problems from two different locations, one fixable and one
  not. Traced it to two distinct locations — the dead-end (Z≈3.5) and
  the ceiling (Z≈9.7) — and found the ceiling boundary has a THIRD
  surface meeting it that hadn't been accounted for before: a separate
  ceiling ring built in `buildKeycap()` itself (connecting the cap's own
  cavity wall to the boss), not just the wall and the boss's own cap.
  Checked all three pairwise: the wall agrees with the (now-fixed)
  cap (0 conflicts) AND the wall agrees with the ring (0 conflicts) —
  but the cap and ring conflict with EACH OTHER (36), which is
  mathematically forced once three separate surfaces share one edge:
  with only two possible directions available for three occurrences,
  at least one pair must land on the same one. Confirmed this
  numerically, not just structurally: the total conflict count at this
  location is exactly 36 regardless of which of the two orientations the
  ceiling cap takes — the fix doesn't (and structurally can't) change
  that number, it only decides which pair ends up the one that
  disagrees.

  This means the 360 total is the same category of thing as the dead-end
  ring's own already-documented outer-boundary count: an inherent,
  unavoidable property of a wall, a ring, and a cap all meeting at one
  shared edge — not a fixable bug the way the dead-end ring's INNER
  boundary genuinely was a few turns back. Genuinely eliminating it would
  mean restructuring how the boss's ceiling is built (merging the boss's
  own cap and the separate ceiling ring into one continuous, unsplit
  surface, rather than two independent pieces meeting at a shared
  boundary) — a real change, not a flag flip, and one deliberately not
  attempted here given this exact function's own history of introducing
  worse regressions (a genuine open-edge defect, twice) from confident-
  looking but insufficiently-tested geometric changes. Verified the
  actual fix made doesn't regress anything: 0 open edges across square,
  round, and star cap shapes, same as before it.
- **Requested next: a comprehensive re-check of every quick-insert emoji
  for open/non-manifold edges, reporting the frog (🐸) as a specific
  example with open edges.** Re-verified from scratch rather than
  trusting the previous investigation's result: ran the same topology
  check across all 87 emoji again, at five different legend sizes from
  5mm to 18mm, and added a winding-consistency check on top (never
  previously run on legend geometry, only ever on the stem boss) — 0
  open edges, 0 non-manifold edges, 0 winding conflicts, in every one of
  87 × 5 = 435 combinations, including the frog specifically at every
  size tested.

  That result is accurate for the legend in isolation, but isolation
  turned out to be exactly the gap: every previous check (this one
  included, at first) tested each color's own mesh independently, the
  same way 3MF export keeps them — but STL export welds the cap body and
  every legend part into one single combined mesh, which had never
  actually been checked. It should have been: welding merges coincident
  vertices, and the legend is deliberately positioned to sit flush
  against (i.e. touching/overlapping) the cap's own crown surface, which
  is exactly the kind of adjacency a combined-mesh check needs to look
  at that a per-part check structurally cannot.

  Checked it directly: the frog's own body and all three legend parts are
  still individually clean (0 open, 0 non-manifold) — but the combined,
  welded mesh (matching STL export exactly) shows 1,070 non-manifold
  edges, concentrated at the legend's own top and bottom faces (665 and
  333 respectively) — precisely where the voxel legend overlaps the
  crown underneath it. Re-ran this combined check across all 87 emoji:
  0 emoji with any OPEN edges (every single one, still), but non-manifold
  counts scaling from 72 (the already-known stem-boss figure alone, for
  the simplest single-color glyphs) up to 3,666 for the most complex
  multi-color emoji — scaling with how much color-region detail there
  is to overlap the crown with, not a sign of a defect that scales with
  it.

  This is the same category already established and accepted elsewhere
  in this project for base cells and the keyring: genuinely overlapping,
  independent solids (never true CSG/boolean union anywhere in this
  codebase) necessarily produce shared-edge counts above 2 wherever they
  overlap, and that's expected, not a hole — the open-edge count, which
  would indicate an actual gap, stays at 0 throughout. This particular
  instance (legend voxels overlapping the crown) simply hadn't been
  checked at the combined-mesh level before, since every prior
  investigation checked parts the way 3MF keeps them, not the way STL
  merges them. If what's actually being seen is labeled "non-manifold"
  rather than "open" specifically, this is very likely it — worth
  double-checking which label a given slicer is actually showing, since
  the two carry a very different risk profile and this investigation
  found zero instances of the more serious one.
- **Stem boss sized for box-style switches, plus new keyring defaults.**
  The stem boss (the post holding the cross-shaped socket) used to be a
  fixed 90% of the cross width as a radius: 7.6mm across, about a 1.7mm
  wall. That's too wide to slide into the round or square ring around the
  stem on box-style switches. It's now built from a wall thickness,
  `stemBossWallMM` (default 1.0mm, "Stem wall" slider, 0.6-1.6mm),
  measured straight out from the end of each cross arm, so the boss is
  `stemCavityWidthMM + 2 x stemBossWallMM` across: 6.2mm by default.
  `stemBossRadius()` in keycapBuilder.js is the one place that formula
  lives; both the boss itself and its reinforcing fillet use it. The boss
  is a 24-sided polygon, sized so its flat sides (the thinnest points) sit
  at exactly the requested wall. Verified by measuring the built geometry:
  6.21-6.25mm across at 1mm, 5.41mm at 0.6mm, 7.41mm at 1.6mm, with 0 open
  edges at every setting. For reference, typical commercial keycaps use a
  boss around 5.5mm across (about a 0.65mm wall on this cross), so if 6.2mm
  won't fit a particular switch's ring, that's the direction to go.

  Keyring lug defaults changed to 10.7mm lug size and a 6.6mm hole (was
  14mm / 6mm). Both bases (joined and single) still come out with 0 open
  and 0 non-manifold edges at the new size.

  Known, pre-existing edge case found while checking this: at the
  minimum 0.8mm cap wall thickness, the default 0.8mm bottom bevel is as
  deep as the wall, and the skirt's bottom edge folds onto the inner wall,
  adding 36 non-manifold edges at Z=0 (108 instead of the usual 72). Same
  count with the old boss size, so it predates this change. Keeping the
  bottom bevel smaller than the wall thickness avoids it.
- **Stronger keyring lug joint.** A real print snapped at the lug. The
  loop only overlapped the base by 0.9mm, and the base's 0.8mm bottom
  bevel cut that to about 0.1mm on the first layers; the loop is round, so
  the contact was a thin lens-shaped sliver. The 0.9mm cap came from an
  overlap limit written when the loop was full height, which always kept
  it clear of the cap recess near the top of the base. The loop is now
  only the bottom 25%, well below the recess, where the wall around the
  switch shaft is 2.6mm thick.

  `keyringFeature()` now builds a "D" shape: the loop's round outer end
  plus a straight neck as wide as the loop, running back into the base.
  The overlap limit checks the wall at the loop's own height (the recess
  only counts if the loop is tall enough to reach it), giving 2.3mm of
  overlap at defaults, 0.3mm short of the switch shaft. The loop sits one
  full outer radius beyond the base edge, so the hole keeps a full
  ring-wall of material (about 2mm) between it and the base. It's still
  flat, 25% of the base height, and flush with the bottom, so it prints
  without support. Verified on all four sides, joined and single bases,
  large lugs, a thin base, and horizontal layout: the lug is a closed,
  outward-facing solid (0 open, 0 non-manifold, 0 winding conflicts), and
  the base with it has 0 open edges.
- **Push-through fixes: solid stem post, thicker keycap top, thicker base
  floor; stem wall default 0.65mm.** Two parts could be pushed through by
  hand on a real print.

  Keycap: the solid top above the hollow interior was half the legend
  depth, 0.3mm, one or two printed layers. Worse, the stem socket wasn't
  closed at its top: a ring capped only the solid wall around the cross,
  so the cross-shaped hole opened into an empty space inside the stem post
  that ran right up to that 0.3mm top. A vertical ray straight up the
  socket confirmed it: empty all the way to 9.7mm on a 10mm cap. Now the
  post is solid above the socket, with a flat roof over the cross at the
  socket depth (3.5mm), and the top is `topThicknessMM` thick ("Top
  thickness" slider, default 1.5mm, never thinner than the legend plus
  0.4mm). The same ray now finds solid material from 3.5mm to the top.
  Removing the open ring and the hollow post's own ceiling cap also
  removed both three-way junctions that caused the 72 non-manifold edges
  per keycap: the keycap body is now 0 open, 0 non-manifold, and 0
  winding conflicts across every shape, height, and thickness tested.
  (The one exception is the known thinnest-wall case, 0.8mm cap wall with
  a 0.8mm bottom bevel, documented above.)

  Base: the floor under the switch was a fixed 0.6mm. It's now
  `floorThicknessMM` ("Base floor" slider, default 2mm, via
  `floorThicknessFor()` in baseBuilder.js). The extra 1.4mm is added
  underneath: base thickness default 16 -> 17.4mm, so the switch shaft
  (5.9mm), plate, and 8mm recess sit exactly where they did relative to
  the top of the base. The recess still isn't capped (8.4mm is the safe
  maximum at these settings), and all bases come out clean.

  Stem wall default is now 0.65mm, a 5.5mm-wide stem, about the size of
  commercial keycaps'.
- **`js/scene.js`** — Three.js scene/camera, using its built-in
  `OrbitControls` rather than hand-rolled mouse handling. The native app
  burned a lot of time on custom camera code fighting AppKit focus/window
  issues; a browser has none of that — using the standard library here
  sidesteps the entire category of bugs.

  Reported: clicking Reset View while the browser window is fullscreen
  puts the model almost entirely below the visible frame instead of
  centered. First fix attempt (below, kept for the record since it's a
  real robustness improvement even though it wasn't the whole story) was
  `resetView()` calling `resize()` on itself before framing, plus guarding
  `resize()` against a zero/negative height — reasoning that `camera.aspect`
  is only ever updated on the `window resize` event, and a fullscreen
  transition could plausibly fire that mid-transition with a wrong,
  transient size. Follow-up screenshots showed the actual failure mode
  more precisely: an extreme, distorted close-up (the classic look of a
  camera positioned much too close with a wide FOV), not simply "model
  below the frame" — which pointed at the *distance* calculation itself
  rather than just a stale aspect ratio. That distance came from a
  hand-tuned heuristic (`spanLong * 1.3`, spanLong computed from cap count
  and pitch) with no direct connection to the model's actual rendered
  size — reasonable for the original horizontal-row layout it was written
  for, but with no guarantee of staying correct across every shape, base
  configuration, or the vertical-layout mode added later. Replaced
  `setTarget(x, y, z, distance)` — which took those pre-computed numbers —
  with `frameToModel()`, which measures the model's ACTUAL rendered
  bounding box directly (`THREE.Box3().setFromObject`), so it can't be
  wrong about the model's real size the way a formula guessing at it from
  unrelated settings could be. Uses a standard fit-to-bounding-sphere
  technique (radius/sin(fov/2) is how far back the camera needs to be for
  a sphere of that radius to exactly fill a given field of view), checked
  for both the vertical and horizontal FOV and taking whichever needs more
  distance — verified this trigonometry directly: for a fixed model size,
  distance stays constant across every aspect ratio at or above 1.0 (where
  vertical FOV is always the binding constraint) and correctly increases
  for narrower-than-square viewports (where horizontal FOV becomes the
  tighter one), confirming the formula responds correctly on both sides
  rather than only being checked against one aspect ratio. Also fixed an
  ordering bug caught while implementing this: `frameToModel()` computes
  the horizontal FOV from `camera.aspect` itself, so `resize()` needs
  refreshing at the START of that function, not just inside `resetView()`
  afterward — otherwise the distance calculation could still run against
  a stale aspect ratio even after the fix that was supposed to address
  that. The Reset View button now calls `frameToModel(true)` instead of
  `resetView()` directly, so every click re-measures whatever's actually
  in the scene rather than replaying a possibly-stale stored distance.
  Couldn't verify the visual result directly — no real browser available
  to reproduce this in the sandboxed environment these changes were made
  in — so this is the best-diagnosed fix given the available screenshots
  rather than a confirmed one; worth confirming it actually resolves the
  reported behavior.

  Requested afterward: pull the camera back more, and tilt the default
  view more upright/vertical rather than looking down at the model from
  as steep an angle. Two independent numbers in `resetView()`/
  `frameToModel()`: `margin` (how much farther back than the tight
  bounding-sphere fit the camera sits) went from 1.15 to 1.4 for more
  breathing room around the model; the viewing direction's Z component
  (how much the camera looks down from above versus straight-on) went
  from 0.55 to 0.28, roughly halving the elevation angle (~29° to ~16°)
  so a model reads as upright rather than foreshortened by a steep
  downward-looking angle. Confirmed as an improvement via a screenshot at
  that ~16° tilt, with a follow-up: "needs to be at 90 degrees like this."
  Misread that as "flatten it further to fully level" and set Z to 0
  exactly — wrong: legends sit on each cap's flat TOP face, so a truly
  level view puts them edge-on and invisible, which doesn't match "like
  this" pointing at a screenshot where they were clearly readable. A
  separate follow-up to view from the opposite side (Y from -1 to 1,
  keeping Z at the wrong value of 0) came before the mistake was caught.
  Caught by a later reference screenshot showing letters clearly legible
  and the keyring showing visible depth rather than a flat edge-on line —
  only possible with a real elevation angle, not Z=0. Corrected Z back to
  0.28, the value the originally-confirmed screenshot was actually taken
  at, keeping Y at the earlier-requested 1 — turned out that side was
  still wrong for the intended default, flipped back to -1 on direct
  feedback.

  Final request in that sequence: keep the same distance, but a true
  top-down view showing the tops of the keycaps directly, no tilt at all.
  First attempt kept `camera.up` at this app's normal Z-up (0,0,1) and
  used a viewing direction of (0, 0.001, 1) — reasoning that an exact
  (0,0,1) direction would be exactly parallel to that up vector, a
  degenerate case leaving the camera's horizontal orientation
  mathematically undefined, and that a tiny epsilon would dodge the
  singularity while staying visually indistinguishable from true
  top-down. That avoided the crash-y kind of undefined behavior but not
  the actual problem: when the viewing direction is nearly parallel to
  `up`, the on-screen orientation is still essentially arbitrary rather
  than predictable — confirmed by the keyring landing at the bottom of
  the screen instead of the top. `camera.up` now actually changes to
  (0,1,0) for this view, and the direction simplifies back to exactly
  (0,0,1) since up is now perpendicular to it (no more singularity to
  dodge). Y rather than -Y because it's toward the first cap for a
  vertical layout, which is where a 'top'-side keyring sits by default —
  putting it at the top of the screen as intended. This does mean
  `camera.up` stays (0,1,0) for any manual orbiting done right after
  resetting to top-down, rather than this app's usual Z-up — an accepted
  trade against leaving the actual requested view undefined.

  Getting Three.js itself to load reliably from a CDN took a few real,
  diagnosed-not-guessed iterations, worth knowing the history of:
  1. A single hardcoded jsdelivr URL was the first attempt. Static
     top-level imports can't be wrapped in try/catch at all, so any
     failure there is silent and unrecoverable — the page just stays
     blank with nothing in the console, which is genuinely hard to
     diagnose remotely.
  2. Switched to dynamic `import()` (which *can* be caught) trying
     several CDN mirrors — but the real bug turned out to be something a
     retry loop can't fix: modern Three.js addon files (like
     `OrbitControls.js`) import Three itself via a bare specifier
     (`import ... from 'three'`), which cannot resolve to any URL at all
     without an **import map**. jsdelivr and unpkg both failed with
     exactly that error, on a network that could reach both CDNs fine.
  3. A third-party CDN (esm.sh) that auto-rewrites bare imports "worked"
     in the sense that both files loaded — but then caused a stack
     overflow, most likely because it loaded Three.js as two separate
     module instances (one direct, one via its rewritten internal
     import), which broke Three's rotation/quaternion sync.
  4. The actual, correct fix: an **import map** in `index.html`
     (`"three"` → jsdelivr's `three.module.js`, `"three/addons/"` → its
     `examples/jsm/` folder) — the officially documented way to use
     Three.js from a CDN without a bundler, which guarantees the main
     module and every addon resolve to the exact same instance. esm.sh
     is kept as a fallback only for if jsdelivr itself is unreachable.

  `index.html` also has an inline, non-module diagnostic script that puts
  any startup error directly on the page as a visible banner (plus a
  direct fetch of `app.js` reporting its actual HTTP status/MIME type,
  and a timeout fallback for failures that don't fire a normal `error`
  event) — no dev-tools step needed to see what went wrong, which is what
  actually made steps 1–4 above possible to diagnose at all.
- **`js/stlExport.js`** — binary STL writer, same format/logic as the
  native Swift version.
- **Reported next: 288 non-manifold edges in a real Bambu Studio export,
  alongside a "reversed faces detected" warning that hadn't shown up
  before.** The 288 itself checked out immediately as already-expected:
  it's exactly 72 (the stem boss's own known, already-documented
  T-junction non-manifold count per cap) × 4 caps — not a new problem.
  But "reversed faces" is a different kind of defect than an edge-count
  anomaly, and wasn't something any of this project's own manifoldness
  checks (which all work by vertex position, matching how they're used
  everywhere else in this codebase) can detect at all — position-based
  checks can prove a shape is watertight without saying anything about
  whether adjacent triangles agree on which way is "outside."

  Built a genuine winding-consistency check for the first time (do the
  two triangles sharing every edge traverse it in opposite directions —
  the correct condition for consistent orientation) and found a real,
  previously invisible bug: the stem boss's dead-end ring (where the
  socket's own cavity stops partway up, `stemBoss()` in keycapBuilder.js)
  was built with `ringFace(..., true)`, and its inner edge (against the
  socket's own inner wall) turned out to be backwards — 72 genuine
  same-direction conflicts per cap, confirmed directly, and consistent
  with what a slicer's "reversed faces" check would flag.

  Getting to the actual fix took a wrong turn worth being honest about.
  First fix attempt: a custom, hand-built ring quad ordering, specifically
  designed to make BOTH the ring's inner and outer edges conflict-free at
  once. It reduced the reported conflict count and looked correct in an
  isolated, narrow check — but it wasn't actually one of the two
  geometrically valid corner orderings for a ring segment, and while its
  individual triangles weren't degenerate, its segments didn't correctly
  chain together edge-to-edge around the full loop. Caught by broadening
  the same check to also count open edges, which a narrower "do these two
  specific surfaces agree" test had missed entirely: it introduced 72
  genuine NEW open edges that hadn't existed before — a real regression,
  not the fix it first appeared to be. Reverted immediately.

  The actual, correct fix turned out to be simpler: `ringFace(..., false)`
  instead of `true` — one of the two ORIGINAL, always-valid options,
  just the other one. Confirmed this was actually correct (not just
  "doesn't conflict") by computing real triangle normals rather than
  reasoning about index order alone: `facingDown=true`'s own normal
  averaged -0.33 in Z — it was genuinely facing down into solid material,
  backwards — while `facingDown=false` averaged +0.33, correctly facing
  up into the hollow space above it. `facingDown=true` had only ever
  looked "consistent" with the wall above it by coincidence.

  That also explained why the ring's OUTER edge could never be made
  conflict-free no matter which option was chosen: it sits at a genuine
  three-way T-junction (the boss's outer wall is already one continuous,
  correctly outward-facing tube spanning past this point on its own —
  confirmed directly, 0 conflicts between its own two segments — and this
  ring's outer edge is a third face landing on that same edge), which
  will always register as a same-direction "conflict" against one of the
  two existing directions, regardless of orientation, simply because only
  two directions exist for three occurrences. That's an inherent,
  unavoidable property of this kind of internal-shelf junction — not a
  defect, and not something "facingDown" should be chosen to satisfy.

  Verified across default settings, round and square shapes, cap heights
  from 6mm to 16mm, and thin walls: 0 open edges in every case (confirming
  the false-start regression is gone), and non-manifold/winding-conflict
  counts back down to exactly 72 per cap (36 at the dead-end depth, 36 at
  the ceiling) — matching the pre-existing, already-documented,
  already-accepted T-junction baseline precisely, with the genuine,
  avoidable bug actually gone rather than just hidden.

## What's simplified or not yet ported (be upfront about this)

- **Row or column layout, not a full grid.** The native app's grid/custom-
  pattern layout engine (`LayoutEngine`, `GridOutline`, per-cap rotation)
  isn't ported — every set here is one straight fused line, horizontal or
  vertical (`verticalLayout` in settings). Extending to a full 2D grid
  would mean porting `GridOutline`'s boundary-tracing algorithm, which is a
  reasonably self-contained follow-up.
- **3MF and STL are both supported now** (`js/threeMFExport.js` — a
  from-scratch ZIP writer + multi-object, multi-color 3MF XML). Pick the
  format with the STL/3MF/Both toggle next to Export. A real bug here,
  now fixed: color was originally declared via the plain core-spec
  `<basematerials>` element (matching what the native app's writer did),
  which is meant more for actual material types (PLA/ABS/etc.) — while it
  technically supports a `displaycolor` attribute, real-world 3MF
  consumers (Bambu Studio, OrcaSlicer, PrusaSlicer's AMS/MMU color
  assignment) reliably import it as one flat, uncolored model instead of
  respecting per-part color. Switched to the Materials and Properties
  Extension's `<m:colorgroup>`, which is what those tools actually expect
  for a pure color (not material) hint — declared both per-triangle and
  as each object's own default, for the widest compatibility.
  One real design decision worth knowing about separately: **the exported
  file's layout is deliberately different from the live preview's.** On
  screen, caps sit stacked on their base socket, matching what the
  finished keychain actually looks like. But that's not how you'd want
  the *file* laid out — caps need to sit flat on the print bed as their
  own parts, not floating above the base. `computeExportLayout()` in
  `app.js` arranges every cap in a line clear of the base's footprint
  instead (to the side for a vertical layout, above for horizontal), so
  the exported file is print-ready without manual rearranging in a slicer
  first. STL exports one merged mesh (no color in that format anyway);
  3MF keeps every part — base, each cap body, each legend — as its own
  object with its own color, ready to assign filaments to in a slicer.
  The exported filename is derived from the actual keychain text (e.g.
  "LENA.stl"), sanitized to safe filesystem characters.

  Exported caps are also flipped top-face-down now (`Mesh.flippedForPrint`
  in `mesh.js`), which is what actually delivers on 'engraved' being the
  default legend style. That default makes the legend flush with the
  cap's top surface specifically so it can sit flat against the bed with
  no supports — but the export was still placing caps bottom-down (rim on
  the bed, same orientation as the live preview) before this, so the
  flush surface was never actually being used for anything. This is
  per-cap, not global, since legend style is itself a per-cap setting: a
  cap only flips when its own legendStyle is 'engraved' or
  'shineThrough' — both have a genuinely flat top surface (shineThrough's
  legend sits entirely below topZ, so the body's own top face is just as
  flat as engraved's). An 'embossed' cap stays rim-down, unflipped, same
  orientation as before this feature existed — flipping it face-down
  would recreate exactly the problem this feature exists to avoid: the
  raised letters becoming the lowest points touching the bed, with the
  flat background suspended above them needing support to bridge across.
  The flip itself is a true 180° rotation about a line parallel to X
  through the cap's own mid-height, not a mirror — verified with an actual
  test (asymmetric shape, checked that total surface area is exactly
  preserved under the transform, and that flipping twice returns to
  bit-identical original vertex positions) — so winding and normals both
  stay correct on their own, and a physically-flipped-back finished print
  reads correctly rather than mirrored. Applied identically to a cap's
  body and every one of its legend parts so they stay aligned with each
  other post-flip. One minor honest trade-off on a flipped cap: the stem
  cavity (the cross-shaped switch-clip socket) ends up near the bed after
  flipping rather than near the open top, meaning its own small internal
  opening prints as a short bridge instead of overhanging freely upward
  — well within normal FDM bridging capability for a feature this size,
  but worth knowing about.

  Every part used to be its own independent top-level `<build>` item with
  no declared relationship between them, which left slicers to guess
  whether a base plus several cap bodies plus several legends were meant
  as one assembly or just a coincidental pile of objects — reported as a
  real annoyance: Bambu Studio prompting "should this be treated as a
  single object with multiple parts?" on every single import. Fixed using
  3MF's actual mechanism for this, `<components>`: every part is still its
  own object with its own mesh, but none of them are `<build>` items
  anymore — instead, one parent "Keychain" object (no mesh of its own)
  references all of them as `<component>` children, each carrying the
  transform that used to sit directly in `<build>`, and `<build>` now has
  just that one parent item at the identity transform. States the
  relationship directly in the file instead of leaving a slicer to infer
  it. Verified by actually generating a file with this structure and
  parsing it back with Python's XML library rather than trusting the
  string-templated output by inspection — confirmed well-formed XML, each
  part object correctly has a mesh and no `<components>`, the parent
  object correctly has `<components>` and no mesh, and `<build>` contains
  exactly one item.

  The 3MF export's total distinct color count is now capped at 4 via
  `limitDistinctColors()`. A set with several multi-color emoji legends
  (each already limited to 3 colors on its own, in `rasterizeLegend`) can
  still add up to far more than 4 distinct colors once multiple emoji, cap
  bodies, and the base are all counted together — reported as a real
  problem in Bambu Studio: it detected up to 18 distinct colors, prompted
  to reduce them on import, and separately reported an enormous open-edge
  count. The color side of that is what this fixes — via agglomerative
  clustering (repeatedly merge whichever pair of remaining colors is
  closest in RGB distance, weighted by how many original colors have
  already folded into each side, until only 4 clusters remain) rather than
  just letting every distinct color get its own filament slot regardless
  of how many that ends up being. No priority is given to user-picked
  colors over algorithm-detected emoji ones in the merge — if a set
  already uses more than 4 intentional colors on its own, some of those
  will get merged too, since the point is a hard global cap, not a
  reshuffling that protects certain sources.

  The open-edges count from the same report is fixed separately, in
  `textVoxel.js`. Every filled cell used to get a complete, unconditional
  6-face box regardless of its neighbors — a previous neighbor-checking
  attempt had produced disconnected-looking letters, and rather than debug
  that further at the time, making every face unconditional sidestepped
  the whole bug category at the cost of massive overlapping internal
  faces (432 triangles for a 6×6 test block, with 165 non-manifold edges).
  Revisited this time with an actual manifoldness test instead of just
  hand-derived reasoning a third time — building known shapes (solid
  blocks, shapes with holes, L-shapes, irregular blobs with notches) and
  checking that every edge comes out shared by exactly 2 triangles. That
  found the real bug: Y is flipped between canvas and mesh space here, and
  the two vertical-direction walls were paired with the wrong edge — a
  cell's `y1` is computed from its own `py` and so faces the neighbor at
  `py - step`, not `py + step`, which is backwards from what an earlier
  draft assumed. Top and bottom faces stay unconditional on purpose —
  two side-by-side cells' top faces are coplanar neighbors forming one
  continuous flat surface, not overlapping duplicates — only the 4 side
  walls are now conditional on an actual exposed-neighbor check. Retested
  with the exact production coordinate math (including the Y-flip and
  realistic non-1 step/scale values): the same 6×6 block now produces 192
  triangles with 0 open and 0 non-manifold edges. For colorful (multi-part
  emoji) legends, the neighbor check also treats a differently-colored
  neighbor as "not solid for this mesh," so each color's part stays
  independently watertight at the boundary with another color, not just
  at the outer silhouette — verified separately with a synthetic 2-color
  split, including an irregular diagonal boundary. One rare edge case,
  intentionally left as-is: cells that touch only diagonally (corner to
  corner, not edge to edge) produce a handful of non-manifold vertices at
  that pinch point — real letter/emoji shapes essentially never produce
  this configuration, and handling it would need diagonal neighbor checks
  for a case with no practical impact.
- **7 fonts, not 10, and no PostScript-name matching.** Font choice here is
  just a CSS `font-family` string resolved by the browser, so anything
  loaded via the `<link>` in `index.html` works — swap or add Google Fonts
  there and in `FONTS` in `app.js`.
- **No exploded-view camera reframing, but Reset View works.** Toggling
  Exploded View moves the caps; it doesn't currently pull the camera back
  to keep them in frame the way an earlier native iteration briefly did
  (and later removed for being disruptive) — Reset View re-centers on the
  current set at any time.
- **Wall-thickness offset is the same centroid-scaling approximation** as
  native (`Polygon2D.insetApprox`), with the same caveat on the
  star/heart/flower shapes.
- **No true CSG.** Same as native — every cavity (plate mount, clearance
  hole, MX stem socket) is built constructively, not via boolean
  subtraction.
- **Not tested against a real switch or a real print** — same honest
  caveat as the native app's README. Nominal Cherry MX dimensions, worth
  test-fitting.

## Browser support

Needs a browser with ES module and WebGL support — any current version of
Chrome, Firefox, Safari, or Edge. `TextMetrics.actualBoundingBoxAscent`
(used for sizing the legend canvas) has been broadly supported for years,
but if you see clipped legends on an unusually old browser, that's the
first thing to check.
