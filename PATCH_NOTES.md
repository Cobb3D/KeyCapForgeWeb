# KeyCapForge Patch Notes

Every update, newest first. The version matches the top of README.md, the
"What's new" pop-up, and bug reports: month/day/year plus a letter for each
update that day. (Versions before 10/15/2026a were written year-month-day,
e.g. 2026-10-08b; they're shown here in the current format.)

---

## 10/19/2026a

- **"Same color for every cap" checkbox** under Caps in this set. Tick it
  and pick one cap color and one letter color; every cap uses them,
  including caps added later, and the per-cap color boxes are hidden. It
  starts from the first cap's colors. Untick it to color caps one by one
  again (they keep the shared colors until you change them). Choosing a
  color theme turns it off.

## 10/18/2026b

- **More room around each key.** The gap between a keycap and the wall of
  its pocket in the base is now 0.45mm per side (was 0.3mm), because caps
  sometimes rubbed the walls. New **Key clearance** slider (Base & Fit,
  0.3–1.5mm) to tune it; it applies to the logo clicker's base too.
- **Extra outer wall default raised to 1.7mm** (from 1.5mm) so the wall
  beside each key stays about 2.7mm, which keeps the faint divider lines
  hidden. The base is 0.4mm wider and longer. The walls between keys are
  now 2.1mm (were 2.4mm).

## 10/18/2026a

- **Your app colors come through to Bambu Studio and OrcaSlicer again,
  without locking them.** Opening the 3MF shows the slicer's "Standard 3mf
  Import color" window with your app colors. Click **Color match** to map
  each one to the closest filament loaded in your AMS (or **Append** to add
  them as new filaments), then OK. Every part ends up assigned to a
  filament, not painted, so you can still change any part's filament or a
  filament's color afterwards. Cancel keeps filaments 1, 2, 3 in the order
  of the app's colors.
- **Every object has at least two parts**, which is what lets the slicer
  assign filaments instead of painting: each cap is its body and letter;
  the logo cap is its body, rim and logo; the base is the base plus its
  keyring loop, or (with no loop, or the tag shape) the bottom half of its
  floor plus the rest. The parts touch exactly and the slicer joins them.
- **Logo clicker base** now has the same clip-only undercut under the
  switch plate as letter bases (it still had the full ledge).
- Camo bases are still painted (their marks are per-triangle colors).

## 10/15/2026c

- **Plate undercut only where the switch clips go.** The ledge under each
  switch plate overhung the opening below it all the way around, and slicers
  print that layer as an overhang (slower, more fan), which left a line
  around the outside of the base about 7–8mm up. The full undercut is now
  only in the middle 8mm of each side, where a switch's clips catch (all
  four sides, so a switch goes in any way round). Toward the corners, the
  top 1.2mm of the opening slopes in instead, which prints without an
  overhang. About half the overhang is gone; if a faint line remains, turn
  off "Slow down for overhangs" and match the overhang fan speed to your
  normal fan speed in the slicer.

## 10/15/2026b

- **New Base shape menu** for fused bases: rounded rectangle (the
  original), soft corners, pill, bubbles, chamfered ends, and tag end.
- **Every shape keeps the full wall around each key**, including the Extra
  outer wall, so the faint divider lines stay hidden. Shapes with rounded or
  angled ends get a little longer so their corners don't cut in near the end
  pockets (with 4 keys: rectangle 87mm, soft 89, chamfered 91, bubbles 90
  and 27mm wide, tag 96, pill 100).
- **Tag end** puts the keyring hole through the base itself, on the
  keyring's end, with a 3mm ring, instead of adding a separate loop. The
  bevels stop short of the ring so it stays strong on the first and last
  layers.
- **Keyring loop** on the other shapes now meets the real outline (for
  example the dip between keys on Bubbles).
- **Export layout** places the caps clear of the larger shaped bases.
- Unfused bases ignore the shape (the menu is greyed out).

## 10/15/2026a

- **Extra outer wall** (new setting, 1.5mm by default) thickens the outside
  of a fused base without moving the keys apart. A test print still showed
  faint lines on the outside wherever a wall between two keys met the thin
  (1.2mm) outer wall; at 2.7mm the outer wall lines run unbroken. The base
  is 3mm wider and longer. Single-key fused bases get it too.
- **Version shown at the top of README.md**, and downloads named with the
  version (KeyCapForge_10-15-2026a.zip). Version format changed to
  month/day/year.

## 10/14/2026c

- **Each keycap opens as one object in Bambu Studio and OrcaSlicer**, with
  its letter (or logo) as a part, so the cap and its letter move together
  on the plate. Each part keeps its own filament. (PrusaSlicer still loads
  them as separate objects.)

## 10/14/2026b

- **Colors can be changed in the slicer.** Parts used to carry their color
  painted on every triangle, which Bambu Studio turned into paint that
  overrode the part's filament. Each color now gets a filament number (1 to
  4, base on filament 1) and each part is assigned to it, for Bambu Studio,
  OrcaSlicer and PrusaSlicer. Camo bases are still painted (their marks are
  per-triangle colors).

## 10/14/2026a

- **Fused base is one solid piece.** It used to be one block per key, each
  overlapping the next by 0.2mm; slicers printed extra walls at every
  overlap, which showed as rough patches and dark bands at each wall between
  keys. It's now one solid with all the key pockets cut into it.
- **Top bevel stops short of the key pockets**, so a big bevel or
  heart-shaped keys no longer cut into it.

## 10/9/2026a

- **39 more animal emoji** in the quick-insert palette, each checked against
  its 3-color print version (tiger, lion, cow, chicken, penguin, owl, eagle,
  wolf, horse, bee, butterfly, ladybug, turtle, dinosaurs, octopus, dolphin,
  whale, shark, giraffe, elephant, sloth, flamingo, parrot, peacock, paw
  prints and more).

## 10/8/2026d

- **Logo clicker: the logo is printed the full Top thickness** (1.5mm by
  default) instead of one thin layer. The Top thickness slider sets it; the
  Legend panel is hidden in logo mode.

## 10/8/2026c

- **Logo clicker: Cap shape menu.** Keep the logo's outline, or pick a
  circle, rounded square, rounded rectangle, square, hexagon, octagon, heart
  or star. The base follows the chosen shape.

## 10/8/2026b

- **New Logo clicker mode**: import your own logo image (switch modes at the
  top of the sidebar).
- **Logos are traced with smooth edges** and fine detail instead of a
  blocky grid, with truer colors and much smaller files.
- **Logos made of separate pieces** (like an icon with text under it) keep
  every piece on the cap.
- The cap is shaped like the logo, and the base follows the same outline.
- Logos print in up to 3 of their own colors, or 1 color on the cap color.
- Plain image backgrounds are removed automatically; transparent PNGs work
  best.

---

## Earlier versions

Version numbers weren't recorded before 10/8/2026b. The main changes, roughly
oldest first (README.md has the full details of each):

- Switch clearance shaft fixed: it could shrink to barely more than 1mm.
- Base top and bottom bevels, for single and fused bases.
- Fixed a cut in the sidewall after the first key of a fused base.
- Fixed a fused base's top slicing as a solid block with no pockets.
- Mesh welding: the root cause of a run of slicer problems (floating
  regions, missing cutouts, thousands of open edges).
- Stem socket opens at the cap's bottom edge, so it reaches the switch.
- Reinforcing fillet where the stem post meets the cap's ceiling.
- More room below the plate so switches clip in before bottoming out.
- Scale bar on the 3D view.
- Smaller keyring loop (25% of the base height), flush with the base's
  bottom so it prints without support.
- Emoji export fixes (rocket, frog and others): no open or non-manifold
  edges in the slicer.
- Stem post sized for box-style switches; new keyring defaults.
- Stronger keyring loop joint (a print had snapped there).
- Solid stem post, thicker keycap top and base floor, so nothing pushes
  through by hand.
- Heart shape was upside down.
- "Show KeySwitch" in exploded view.
- Fixed a ragged patch around the socket in Bambu Studio.
- Switches fit every cap shape's recess.
- Cross Section and X-Ray views.
- Report a Bug button; reports go to Cobb3dPrinting@gmail.com.
- Renamed "KeyCapForge Beta Pre Release" (9/28/2026).
- Cobb3D logo in the 3D view's background.
- Color themes, camo marks on the base (smooth edges; Woodland, Navy and
  Snow), cow patches.
- Letters missing after slicing: legends now sit in pockets.
- 1-color emoji option.
- "What's new" pop-up after each update.
- Emoji palette review: every emoji checked against its printed version.
