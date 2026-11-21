# KeyCapForge Patch Notes

Every update, newest first. The version matches the top of README.md, the
"What's new" pop-up, and bug reports: month/day/year plus a letter for each
update that day. (Versions before 10/15/2026a were written year-month-day,
e.g. 2026-10-08b; they're shown here in the current format.)

---

## 11/21/2026a

- **14 new fonts** (21 in all). The font menu is now grouped:
  - Bold & block: the original seven, plus Bowlby One (extra heavy) and
    Alfa Slab One (heavy slab serif).
  - Rounded & fun: Fredoka, Lilita One, Titan One, Luckiest Guy, Bangers.
  - Retro & tech: Bungee, Righteous, Orbitron, Black Ops One (stencil),
    Press Start 2P (pixel).
  - Hand-drawn & script: Permanent Marker, Pacifico.
  All are heavy enough for a legend on a 0.4 mm nozzle. Fredoka and
  Orbitron respond to Bold; the rest come in one weight. Design codes
  carry the new fonts, so Etsy orders using them open correctly.
- Fixed: picking a font that hadn't been used yet could build the
  legend once in a fallback font. The app now loads the font first and
  builds again when it arrives.

## 11/15/2026d

- **Display piece: Height setting.** A percentage of the full blown-up
  height, for both the base and the cap, so the piece sits lower on a
  table and prints faster. Use this instead of scaling Z in the slicer:
  scaling there also squashes the switch sockets, wells, plates and shafts,
  and the switches no longer fit or latch. With the setting, only the plain
  part of the base under the switches and the cap's walls, posts and stops
  get shorter; everything a switch touches stays real size. At 42% and
  6.5x the base is 48 mm tall (286 g sliced) and the cap 32 mm (83 g with
  9 switches, 56 g with 5). It won't go lower than a 24 mm base and a
  22 mm cap.

## 11/15/2026c

Display piece: reworked so it can be hit at events, and checked against a
slicer and Cherry's switch data.

- **A hit no longer goes through the switches.** After 3.4 mm of travel
  the cap's rim and four round pillars inside it land on the base, just
  before the switches reach the end of their own 4 mm. The posts and
  switches then only ever carry the springs' force (about 1 N each),
  however hard the cap is hit. Each switch now sits in its own well in the
  recess floor so that floor can be the landing surface.
- **The cap can't be knocked sideways.** It rests 1.5 mm inside the
  recess, and the recess walls are 0.6 mm from it (the gap used to be the
  normal one blown up, about 3 mm).
- **9 switches by default, 5 as an option.** A switch's spring holds up
  30 cN before the key moves (Cherry MX2A Red, Black and Brown; MX Green
  and Grey are 25 cN), so 5 switches hold 153 g and 9 hold 275 g. With 9
  the cap gets 2 mm walls, a 3 mm top and stiffening fins; with 5 it stays
  a 1.2 mm shell.
- **Weights from a slicer** (PrusaSlicer 2.7.4, 0.2 mm layers, 3 walls,
  12% gyroid, PLA) at 6.5x: 9-switch cap 177 g (64% of what its switches
  hold), 5-switch cap 112 g (73%), base 608 g. The export and preview
  notes now give the cap's weight next to what the switches hold, and say
  when it is too close.
- Fixed: the cap's cavity came out through the big top bevel, and its rim
  bevel was wider than its wall. The cavity now follows the bevel.

## 11/15/2026b

- **3D preview for every Maker tools export.** The base plate, the letter
  caps plate and the display piece each have a Preview button next to
  Export. It shows what the file will contain in the 3D view, on the print
  bed outline, without downloading anything: the bases side by side with
  their theme, the caps as they're laid out on the plate (the first plate,
  when there are several), and the display piece put together with its cap
  on. Exporting shows the same preview. A bar over the view says what's
  being previewed; "Back to the design" (or any change to the design)
  returns to the normal view.
- Caps on a plate print face-down, so the preview shows their undersides;
  each letter is drawn through the cap so you can tell them apart.

## 11/15/2026a

- **Display piece (Maker tools).** Blows the first key of the current
  design up to fill the print bed, as a working desk piece, and downloads
  two files: one for the base, one for the cap. Leave Size empty for as big
  as the bed fits (6.5x on a 256 mm bed at default sizes: base 159 x 247 mm
  with its keyring loop and 113 mm tall, cap 117 mm square and 77 mm tall),
  or type a smaller size.
  - It takes 5 real switches: one in the middle and one toward each corner
    of the cap, so the giant key is carried level and still presses. The
    base's recess floor has five normal switch pockets; the cap has five
    posts from its ceiling, each ending in a normal stem socket.
  - The cap is a thin shell (1.2 mm walls, 2 mm top) rather than walls
    blown up with the rest, to keep it light enough for the switches'
    springs to hold up (about 75 g at 6.5x). The export note gives the
    weight; use medium or heavy switches.
  - The base's outline, thickness, bevels and keyring loop, and the cap's
    outline, height and legend are all the normal design at the larger
    size. The legend is built on a finer grid so its edges stay smooth.
- **Logo on the display cap.** In Display piece, set "On the cap" to
  "A logo" and choose an image: the logo goes in the center of the cap's
  face (up to 3 of its colors) instead of the key's letter. If no image is
  chosen there, the one loaded in Logo mode is used.

## 11/13/2026a

- **Caps plates are grouped by letter.** In Maker tools, a plate of letter
  caps now has all the A's next to each other, then all the B's, and so on
  (front-left first, row by row), instead of A to Z repeated set after set.
  Each letter comes off the bed as one block, so the caps are easier to
  sort. The number of caps and sets per plate is unchanged.

## 11/10/2026d

- **3D emoji.** Emoji now stand up from the cap's face instead of sitting
  flush. Faces, animals, balls, food and the like are rounded: a basketball
  is a dome, an animal's head is pillowed with its ears and legs lower, up
  to 1.2mm above the face. Simple shapes (hearts, stars, the moon,
  lightning, snowflake, sparkles, 100, notes, paw prints, confetti) are
  raised 0.4mm with a softened edge. On by default; untick "3D emoji" in
  the Text panel for flat emoji as before. Works with 1-color emoji too.
  Shine-through emoji stay flat.
- **Rounded emoji are bigger.** They fill at least 80% of the cap's top
  width (letters stay at the Legend size setting, 62% by default).
- **Caps with a 3D emoji print face-up.** Like embossed legends, they're
  exported rim-down instead of flipped onto their face, since the emoji
  stands above the face. Letter caps in the same set still print face-down.
- **Shading removed from emoji.** A lighter or darker shade of a color the
  emoji already uses (the shadow side of a ball, a highlight) now prints in
  that color, and so does the thin blended fringe along dark lines. The
  basketball is one orange plus its lines (it used to take a third, brown
  filament for the fringe). The freed filament goes to a real detail where
  there is one: the sheep gets its face, the cow its eyes.
- **Design codes** carry the 3D emoji setting. Codes made before this
  update open with flat emoji, as they were designed.
- Fixed: on four emoji (sleeping face, crab, fries, rocket) the pocket in
  the cap had one edge where two colors touched only at a corner.

## 11/10/2026c

- **Closest IIID Max color for every other color.** When a design uses a
  Bambu Lab, Sunlu or Polymaker color, or a custom one, the order email
  (its filament list and "Colors needed") and the filament list after an
  export add the nearest IIID Max filament and how close it is, e.g.
  "Sunlu PLA Cyan (#65fdfd) → closest IIID Max: High Speed PLA+ Matte
  Glacier Blue (#85b9be), nearest, but clearly different (ΔE 17.4)".
  Closeness is measured the way the eye sees it (CIEDE2000): under 1 the
  same color, under 3 very close, under 6 close, under 12 noticeably
  different, above that clearly different. IIID Max colors are shown as
  they are.

## 11/10/2026b

- **Order emails say which color goes in each filament.** Send to Print
  emails now start with "In Bambu Studio, set the filaments to:" and the
  list for the attached file (Filament 1 = ..., 2 = ...), the same list
  the app shows after an export. The 3MF only says which filament each
  part uses, so Bambu Studio still opens it with its own filament colors;
  set them from this list.

## 11/10/2026a

- **Design code box in Maker tools.** "Open a design code" at the top of
  the Maker tools panel: paste the code from an Etsy order (the whole
  Personalization text is fine) and click **Open design** (or press
  Enter). The design opens exactly as the buyer made it, ready to export.
  The same thing still works from the Copy design code window.

## 11/7/2026a

- **New default cap size:** Top width **15.5mm** (was 13.5) and Height
  **11.8mm** (was 10). Base width (18mm), walls, top thickness, corner
  radius, bevels and stem wall are unchanged. With the wider top, the
  letters come out bigger at the same Legend size.
- Design codes made before this still open at their old sizes.

## 11/6/2026f

- Filament names no longer repeat the brand ("Polymaker PLA Pro White",
  not "Polymaker Polymaker PLA Pro White") in the filament list and in
  orders.
- Checked logo clicker 3MF exports with a 3-color logo: base on filament
  1, cap body and rim on 2, each logo color on its own filament (a logo
  color that matches the base or cap shares its filament), and the list
  after export says which color goes in each.

## 11/6/2026e

- **All letters the same height, in every font.** Checked every capital
  and lowercase letter in all 7 fonts. Anton, Bebas Neue, Oswald and
  Fjalla One were already even; Archivo Black, Russo One and Roboto still
  had short wide letters (W, and lowercase m and w). Now every letter A-Z
  in a font is one height, and every letter a-z another: the height the
  font's widest letters (M W, m w) can reach on the cap. At the default
  size, capitals are 8.4mm in Anton, Bebas Neue, Oswald, Roboto and
  Fjalla One, 7.8mm in Russo One and 7.7mm in Archivo Black (was 8.4mm
  with a smaller W). Lowercase letters are shorter than capitals in the
  wide fonts (6.2mm in Archivo Black, 6.5mm in Russo One, 7.8mm in
  Roboto). Use Legend size to make them all bigger or smaller.
  Symbols, numbers, emoji and underlined letters are unchanged.

## 11/6/2026d

- **W and M no longer look small.** Every letter was sized to fit the
  same square box, so wide letters were shrunk until their width fit and
  came out shorter than the rest (W at about 70% of the height, M at
  80%). On square caps a wide letter may now run wider than the box, up to
  the flat part of the cap top (inside the bevel, with 0.4mm to spare
  each side): at the default size M is full height and W is 94% (it's too
  wide to go further without reaching the bevel). Round, hexagon,
  pentagon, octagon, heart, flower and star caps are unchanged, since
  their tops narrow toward the edges. Other letters are unchanged.

## 11/6/2026c

- **Caps plates: one file per plate.** With Plates set above 1, the caps
  plate now downloads as separate files (…_plate1of2.3mf,
  …_plate2of2.3mf), each laid out and centered for one bed. Bambu Studio
  only keeps multiple plates in its own project files; it opened our
  single file with every plate's caps on plate 1, hanging over the edge.
  Your browser may ask once whether to allow several downloads.

## 11/6/2026b

- **Filament list after every 3MF export.** A note on the 3D view (and,
  for Maker tools plates, in the plate's note) lists what to load as each
  filament: "Filament 1 = white (#f4f4f4), Filament 2 = black (#1b1b1b)",
  or the filament's full name when it's one from the palette ("Bambu Lab
  PLA Basic Jade White"). The file only says which filament each part and
  pattern uses, so Bambu Studio opens it with whatever colors its
  filaments already have; a pattern can look invisible until filament 2
  is set to a different color from filament 1.
- Tried and dropped: exporting as a Bambu Studio project so the colors
  come in already set. Bambu Studio rejected the test file ("Invalid
  configuration file"), and a project file would be tied to one printer
  and to Bambu's settings format of the day.

## 11/6/2026a

- **Caps plate fixed in Bambu Studio.** Opening a Maker tools caps plate
  put every cap and letter on filament 1, left infill density blank, and
  dropped some caps off the plate ("Outside"). Bambu Studio splits
  repeated copies of an object in a 3MF from another app into separate
  objects and loses their part settings on the way. Each cap on the plate
  is now its own object (cap_A_1, cap_A_2, ...) with its body on filament
  1, its letter on filament 2, and the infill and wall settings; the file
  is the same size.
- **Themed base plates.** Maker tools has a **Theme** menu for the base
  plate: Plain (the base color) or a patterned theme: **Cow**, **Camo
  (Woodland)**, **Camo (Navy)** or **Camo (Snow)**. Each base gets the
  theme's base color with its pattern on, like a themed design's Export.
  Base plates are now compressed (a Cow plate is about 10 MB).
- **Patterns as slicer paint.** Camo and cow marks now go into the 3MF as
  Bambu Studio / OrcaSlicer paint (and PrusaSlicer's), instead of colors:
  the base is on filament 1 with the marks painted on filaments 2, 3, 4.
  A patterned file no longer goes through Bambu Studio's new color step,
  so a camo or cow design keeps its caps and letters on their own
  filaments too. Set each filament's color in Bambu Studio (Cow: 1 white,
  2 black).

## 11/4/2026a

- **Current IIID Max colors.** The IIID Max palette now comes from IIID
  Max's own Filament Color Guide (3 Nov 2026), with their hex codes:
  **High Speed PLA+** (55 colors) and **Classic PLA+** (14), in two groups
  like the other brands. The old list (from a HueForge library) is gone,
  so its discontinued colors (Candy Red, Key Lime, Navy Blue, Teal...)
  are no longer offered; a design that still uses one shows it as a
  custom color in orders.

## 11/3/2026a

- **Fix for the latest Bambu Studio: letters were lost.** Its new 3MF
  import sends colored files from other apps through a color-matching step
  that drops each part's filament, so the base, caps and letters all ended
  up on filament 1. Exported 3MF files no longer carry the app's colors;
  each part keeps its own filament (base 1, then caps and letters 2, 3,
  4), and Bambu Studio adds filaments if the project has fewer. Set each
  filament to the color you want (or pick from your AMS). Works the same
  in older Bambu Studio, OrcaSlicer and PrusaSlicer. Covers Export, Send
  to Print and both Maker tools plates.
- Camo and cow bases still carry their pattern as colors, so a patterned
  design still goes through Bambu Studio's color step for now.

## 11/1/2026a

- **Maker tools for everyone.** A **Maker tools** link at the bottom of the
  side menu opens the panel (unfolded, scrolled into view) for anyone; the
  browser remembers it, and the same link (now "Hide maker tools") or the
  link inside the panel hides it again. `?maker` on the address still
  works. The link is hidden in Logo clicker mode, since the maker plates
  are for letter caps.

## 10/30/2026a

- **Copy design code.** A new button next to Export makes a short code for
  the whole letter-caps design (letters, emoji, every cap's shape, font,
  style and colors, the base, keyring and every slider), copies it, and
  shows it. About 25 characters for an unchanged design, roughly 80 to 200
  for a customised one. Etsy buyers paste it into the Personalization box
  on the listing. Logo clicker designs can't be coded (the logo image is
  too big); the button says so.
- **Open a design from a code**, in every version of the site: in the
  design code window, "Have a design code? Open it here". It finds the
  code inside a whole pasted Etsy personalization text, catches codes that
  were cut short or mistyped, and rebuilds the design exactly (tested: the
  rebuilt design's 3MF is byte-for-byte the same). A link with
  ?design=<code> on the end opens that design too.
- **Send to Print emails include the design code** at the top.
- **Three versions of the site, from one app**, picked by the address:
  - **Etsy:** ?for=etsy, or the short link **/etsy/**
    (https://cobb3d.github.io/KeyCapForgeWeb/etsy/). Copy design code is
    the main button, a note at the top of the menu explains pasting it
    into the Etsy Personalization box, and Send to Print is hidden. The
    browser remembers it, so a reload or a later visit still shows the
    Etsy version (?for=web switches back).
  - **Your store:** inside your own store page (an embedded frame) or
    ?for=store. Shows **Add design to cart**, which hands the design code
    to the store page; Send to Print is hidden. The store page side still
    has to be connected (README.md).
  - **Everywhere else:** Send to Print as before, plus Copy design code.
- On phones, the top buttons wrap onto a second row instead of running off
  the screen.

## 10/27/2026d

- **Brand menu in the color palette.** Click any color box, then pick a
  brand: **IIID Max** (37 PLA+ colors), **Bambu Lab** (166), **Sunlu**
  (381) or **Polymaker** (222). Each brand's PLA colors are grouped by
  product line (PLA Basic, PLA Matte, Silk, Panchroma...), largest line
  first. The palette opens on the brand of the color already in the box,
  otherwise the brand you used last.
- **Multi-color filaments** (dual-color silk, gradients, rainbow) show all
  their colors on the swatch; the 3D view and the 3MF use the first one.
- **Orders name the brand and line**, e.g. "Bambu Lab PLA Matte Charcoal
  (#000000)".
- Bambu Lab, Sunlu and Polymaker colors come from the open-source Open
  Filament Database (MIT license). Their hex codes are the published or
  community-entered ones, not measured from spools.

## 10/27/2026c

- **Drag to rearrange the side menu.** Each section title has a grip (⋮⋮)
  on its left: drag it up or down to move the whole section, with a mouse
  or a finger. Dragging near the top or bottom of the menu scrolls it. On
  a keyboard, tab to the grip and use the up and down arrow keys.
- Your browser remembers the order. **Reset menu order** at the bottom of
  the menu puts the sections back in the standard order.
- Folding sections with − / + works as before.

## 10/27/2026b

- **Base settings come first.** The Base & Fit section (base color, shape,
  fuse and layout) moved up the side menu, right after Theme and before
  Caps in this set, so the base can be picked before the keys. In Logo
  clicker mode it's right after Logo. Keyring stays near the bottom.

## 10/27/2026a

- **IIID Max PLA+ colors.** Clicking any color box (cap, letters, base,
  logo, and each cap in the list) opens a palette of the 37 IIID Max PLA+
  colors. Hover a swatch to see its name; click to use it. **Custom
  color…** opens the normal color picker for anything else. Hovering a
  color box shows which filament it is.
- **Send to Print orders name the filament** for every color ("IIID Max
  Candy Red PLA+ (#a92a30)", or "custom"), with a **Colors needed** list at
  the end, one line per spool.
- The colors come from a HueForge IIID Max library, so a few (Fluorescent
  Yellow, Vintage Rose, the metallics) may look a little different from
  the real spool.

## 10/23/2026e

- **Print settings in the 3MF.** Every exported 3MF (Export, Send to Print
  and both Maker tools plates) now opens with **gyroid infill at 12%** and
  **3 wall loops**, instead of the slicer's default grid infill. Works in
  Bambu Studio, OrcaSlicer and PrusaSlicer.
- They're set on each object, so your printer, filament and process
  presets aren't touched, and you can still change them per object in the
  slicer (they show under the object in the object list).
- In Bambu Studio, open the file (drag it in, or File > Open). File >
  Import > "Import geometry only" leaves them off.

## 10/23/2026d

- **Browser tab icon:** the Cobb3D printer, in blue, on the page's tab and
  bookmarks. Saved to an iPhone or iPad home screen, it's a white printer
  on a blue square.

## 10/23/2026c

- **Renamed "KeyCapForge Beta"** (was "KeyCapForge Beta Pre Release"): the
  tag beside the name, the browser tab, the sidebar footer, bug report
  emails, and the name written into exported STL and 3MF files.

## 10/23/2026b

- **Cobb3D logo at the top left.** The hexagon next to the KeyCapForge
  name is replaced by the printer from the Cobb3D logo, in the page's
  blue, in both the light and dark looks.

## 10/23/2026a

- **Soft corners is the default base shape** (it was Rounded rectangle).
  New designs start with it; Rounded rectangle and the other shapes are
  still in the Base shape menu. With 4 keys the base is about 89mm long
  (was 87mm) and still fits every bed. In Maker tools, "Same as Base &
  Fit" follows it too.

## 10/22/2026b

- **Blue instead of orange**, in both looks: the Export and Send to Print
  buttons, the selected mode, sliders, checkboxes, the STL/3MF/Both
  choice, hover outlines, the logo mark and badge, and the cap count. The
  buttons now have white text. Dark look: #2f6fdb (lighter #6fa3ff for
  blue text). Light look: a deeper #1f5fcc so it reads on white.

## 10/22/2026a

- **Light and dark looks for the whole page.** A light-bulb button at the
  bottom right of the 3D view switches between them (the bulb lights up
  in the light look). The light look uses warm light greys with the same
  orange. The first time, the page follows the device's own light/dark
  setting; after a click, the browser remembers the choice. Everything
  follows it: the sidebar, toolbar, buttons, pop-ups, the 3D view's
  background, the faint Cobb3D logo and the print bed outline. The
  exported files don't change.

## 10/20/2026f

- **Shorter side menu.** Each section shows just the basics: mode, text and
  symbols, theme, the caps, cap shape, legend size, base color, base shape,
  fuse and layout, keyring style and side, and the logo settings. The
  fine-tuning sliders (sizes, walls, bevels, clearances, legend depth, lug
  size and hole) are under **More settings +** at the bottom of their
  section; click it again (**Fewer settings −**) to hide them.
- **Every section folds away** with the **−** button on its title, and
  opens again with **+**. Maker tools starts folded.
- Your browser remembers which sections and "More settings" you left open.

## 10/20/2026e

- **Maker tools: pick the base shape for the base plate.** New **Shape**
  menu under "Bases for": rounded rectangle, soft corners, pill, bubbles,
  chamfered ends or tag end, or "Same as Base & Fit" (the default). Picking
  a shape makes the plate's bases fused in that shape without changing the
  design you're working on. The file name ends with the shape
  (KeyCapForge_bases_2-7keys_pill.3mf). Every shape's 2–7 key plate fits a
  P1S (largest: bubbles, 195 × 165 mm).

## 10/20/2026d

- **Maker tools: caps plate over several plates.** New **Plates** box (1 to
  4, starts at 2) next to Letters and Copies. "Export caps plate" makes one
  3MF with full sets of the letters (A–Z by default) shared evenly over the
  plates, so each plate can be printed on its own. Leave Copies empty to
  fill the plates. On a P1S each plate holds 4 full A–Z sets (104 caps), so
  2 plates make 8 of each letter (208 caps); 3 copies of each comes out as
  2 sets on plate 1 and 1 on plate 2. The note says how much room is left.
  Each plate keeps its back-right corner free for the prime tower.
- **Bambu Studio and plates:** Bambu Studio keeps plates only in its own
  project files, so a 3MF from anywhere else opens with everything moved
  together. With more than one plate, press **Arrange (A)** after opening
  and it fills plate 1 and adds the next plates itself.
- **Much smaller file:** each letter is one object (cap + letter) with all
  its copies as instances, and the file is compressed: 208 caps is about
  5 MB (it would have been over 300 MB).

## 10/20/2026c

- **Base plate is always plain bases.** Themed bases (camo and cow
  patterns) are print-to-order, so the Maker tools base plate now leaves
  the pattern off even when one is switched on, and every base keeps its
  filament editable in the slicer. Themed bases still come from the normal
  Export.

## 10/20/2026b

- **Maker tools (just for Cobb3D, hidden from customers).** Open the site
  once with `?maker` on the end (https://cobb3d.github.io/KeyCapForgeWeb/?maker)
  and a Maker tools panel appears in the sidebar; your browser remembers it.
  "Hide maker tools" (or `?maker=off`) turns it off again.
- **Export base plate (3MF):** one click makes a single 3MF with one base
  for each key count, 2 to 7 by default (any range from 1 to 12), using the
  current base settings (shape, layout, walls, clearance, bevels, keyring,
  colors). Each base is its own object named for its key count
  (base_2keys ... base_7keys), with its filament editable in the slicer,
  laid out side by side 6mm apart. With the default settings the plate is
  about 177 × 162 mm and fits the P1S; the panel shows the size and whether
  it fits the bed picked above the view. Camo bases come out painted, as in
  a normal export.

## 10/20/2026a

- **See-through print bed in the 3D view.** A "Print bed" picker above the
  view shows your printer's bed under the model (a faint plate with a 10mm
  grid and an outline, to scale). Every current Bambu Lab printer is
  listed: A1 mini (180 × 180 mm), A1 (256 × 256), A2L (330 × 320),
  P1P / P1S (256 × 256), P2S (256 × 256), X1 / X1 Carbon / X1E (256 × 256),
  X2D (256 × 256), H2S (340 × 320), H2D / H2D Pro (350 × 320) and H2C
  (330 × 320), or none. It starts on P1P / P1S and remembers your choice in
  your browser. It's hidden in Cross Section view, and never affects the
  exported file.
- **Fit check:** under the picker, whether the exported parts (the base,
  with the caps laid out beside it) fit on that bed, with their size. On
  the dual-nozzle printers (X2D, H2D, H2C) the hover text gives the smaller
  area for printing with both nozzles.

## 10/19/2026e

- **Send to Print is switched on.** The Google Apps Script web app is
  connected (ORDER_ENDPOINT in js/printOrder.js), so the Send to Print
  button now shows next to Export and orders go to Cobb3D's order inbox.
- If the script is ever redeployed as a new deployment (instead of a new
  version of the same one), its URL changes and must be updated in
  js/printOrder.js.

## 10/19/2026d

- **Three.js is now part of the app** (vendor/three/: three.js 0.160.0,
  the same version as before, its OrbitControls add-on, and its MIT
  licence). The 3D view no longer loads code from jsDelivr or esm.sh, so it
  doesn't depend on those sites being up, and no outside server can change
  the code the page runs. Upload the new vendor folder with everything else.
- The only outside site the app still uses is Google Fonts, for the
  letter fonts.

## 10/19/2026c

- **Send to Print only emails genuine 3MF files.** The order script opens
  each attachment and checks it's a real 3MF (a ZIP holding only a 3MF
  model, its content-type and relationship files, and slicer settings, with
  a real 3MF model inside). Anything else, like a program, a document, a
  ZIP hiding other files or a renamed file, is refused. Attachments are
  always named .3mf.
- **Bot trap on the Send to Print form:** a hidden field that people never
  see (bots fill it in) and a check that the form wasn't filled in under 3
  seconds. Bot orders are dropped silently and don't count toward the
  30-an-hour limit, so they can't block real orders.
- **Re-deploy the script after updating it:** paste the new OrderEmail.gs
  into your Apps Script project, then Deploy > Manage deployments > Edit >
  Version: New version > Deploy (the URL stays the same).

## 10/19/2026b

- **Send to Print** (needs a one-time setup, see below): a button next to
  Export opens a short form (name, email, notes). Send emails the design's
  3MF (the same file Export makes) to Cobb3D's order inbox, with the
  customer's details, a summary of the design (keys, shapes and colors) and
  the settings to recreate it. Replying to the email goes to the customer.
- It works through a free Google Apps Script on the Cobb3D Google account
  (google-apps-script/OrderEmail.gs), since a website can't send email with
  an attachment by itself. Until its web app URL is pasted into
  js/printOrder.js (ORDER_ENDPOINT), the button stays hidden. It refuses
  anything that isn't a KeyCapForge order, files over 18MB, and more than
  30 orders an hour.

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
- Report a Bug button; reports go to Cobb3D by email.
- Renamed "KeyCapForge Beta Pre Release" (9/28/2026).
- Cobb3D logo in the 3D view's background.
- Color themes, camo marks on the base (smooth edges; Woodland, Navy and
  Snow), cow patches.
- Letters missing after slicing: legends now sit in pockets.
- 1-color emoji option.
- "What's new" pop-up after each update.
- Emoji palette review: every emoji checked against its printed version.
