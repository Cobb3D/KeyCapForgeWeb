// A simplified Cherry MX-style switch, for the 3D preview only (the "Show
// KeySwitch" option in exploded view). It's never exported: it's built
// from Three.js primitives and added to the preview scene in app.js,
// entirely separate from the printable meshes.
//
// Built Z-up with its origin at the centre of the plate's top surface,
// where the top housing's flange rests once the switch is clipped in.
// Dimensions are Cherry MX nominal values:
//   - top housing: 15.6mm square where it rests on the plate, tapering to
//     about 12mm square at its top, 6.6mm above the plate
//   - stem: the cross (4.1mm arms, 1.17mm thick) tops out 11.6mm above the
//     plate when unpressed
//   - bottom housing: fits the 14mm plate hole and reaches 5.0mm below the
//     plate's top surface (where a keyboard's PCB would sit)
//   - centre post: 4mm diameter, 3.0mm below the bottom housing
// No metal pins: they're cut off before a switch goes into a keychain.
// Real switches vary by brand (box switches add a ring around the stem,
// 5-pin switches add two plastic posts), so treat it as a reference, not an
// exact replica of any one model.

export const MX_SWITCH = {
  stemTopAbovePlate: 11.6,
  housingTopAbovePlate: 6.6,
  bottomHousingBelowPlate: 5.0,
  postLength: 3.0,
  // Lowest point of the switch below the plate's top surface (the centre
  // post's tip; the pins are cut off).
  lowestBelowPlate: 5.0 + 3.0,
};

export function buildSwitchObject(THREE) {
  const group = new THREE.Group();
  const mat = (color, extra = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.05, ...extra });

  const housingWhite = mat('#eceff1');
  const clearHousing = mat('#dbe7ef', { transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide });
  const stemBlue = mat('#2f6fdb');

  // Box helper: size in X, Y, Z; placed by its bottom face at zBottom.
  const box = (sx, sy, sz, zBottom, material, x = 0, y = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
    m.position.set(x, y, zBottom + sz / 2);
    return m;
  };
  // Cylinder helper (Three.js cylinders run along Y; rotated to run along Z).
  const cyl = (r, h, zBottom, material, x = 0, y = 0) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 20), material);
    m.rotation.x = Math.PI / 2;
    m.position.set(x, y, zBottom + h / 2);
    return m;
  };

  // Bottom housing, below the plate.
  group.add(box(13.9, 13.9, MX_SWITCH.bottomHousingBelowPlate, -MX_SWITCH.bottomHousingBelowPlate, housingWhite));

  // Top housing: a square frustum. A 4-sided cylinder is a square pyramid
  // frustum whose corners point along the axes; rotating it 45 degrees lines
  // its faces up with X and Y. Radii are the square's half-width times sqrt(2).
  const h = MX_SWITCH.housingTopAbovePlate;
  const frustum = new THREE.CylinderGeometry((12.0 / 2) * Math.SQRT2, (15.6 / 2) * Math.SQRT2, h, 4, 1);
  frustum.rotateY(Math.PI / 4);
  frustum.rotateX(Math.PI / 2);
  const top = new THREE.Mesh(frustum, clearHousing);
  top.position.set(0, 0, h / 2);
  group.add(top);

  // Stem: the slider body (seen through the clear housing, with a short
  // shoulder above it), then the cross a keycap presses onto.
  const crossBottom = h + 1.0;
  group.add(box(7.2, 5.6, crossBottom - 2.0, 2.0, stemBlue));
  const crossH = MX_SWITCH.stemTopAbovePlate - crossBottom;
  group.add(box(4.1, 1.17, crossH, crossBottom, stemBlue));
  group.add(box(1.17, 4.1, crossH, crossBottom, stemBlue));

  // Centre post, below the bottom housing.
  const under = -MX_SWITCH.bottomHousingBelowPlate;
  group.add(cyl(2.0, MX_SWITCH.postLength, under - MX_SWITCH.postLength, housingWhite));

  // Draw the clear housing after the solid parts so they show through it.
  top.renderOrder = 1;
  return group;
}
