// Bambu Lab print beds, for the see-through bed outline in the 3D view and
// the "does it fit" check. Width (X, left to right) x depth (Y, front to
// back), in mm: the printable area of the plate, from Bambu Lab's
// published specs (checked October 2026). Dual-nozzle printers list their
// whole plate; a part printed with both nozzles has a little less room
// (noted per printer).
export const PRINT_BEDS = [
  { id: 'none', name: 'No print bed', w: 0, d: 0 },
  { id: 'a1mini', name: 'A1 mini', w: 180, d: 180 },
  { id: 'a1', name: 'A1', w: 256, d: 256 },
  { id: 'a2l', name: 'A2L', w: 330, d: 320 },
  { id: 'p1', name: 'P1P / P1S', w: 256, d: 256 },
  { id: 'p2s', name: 'P2S', w: 256, d: 256 },
  { id: 'x1', name: 'X1 / X1 Carbon / X1E', w: 256, d: 256 },
  { id: 'x2d', name: 'X2D', w: 256, d: 256, note: 'with both nozzles: 235.5 × 256 mm' },
  { id: 'h2s', name: 'H2S', w: 340, d: 320 },
  { id: 'h2d', name: 'H2D / H2D Pro', w: 350, d: 320, note: 'one nozzle: 325 × 320 mm' },
  { id: 'h2c', name: 'H2C', w: 330, d: 320, note: 'left nozzle: 325 × 320, right: 305 × 320, both: 300 × 320 mm' },
];

export const DEFAULT_PRINT_BED = 'p1';

export function bedById(id) {
  return PRINT_BEDS.find((b) => b.id === id) || PRINT_BEDS.find((b) => b.id === DEFAULT_PRINT_BED);
}

// Whether a w x h footprint fits on the bed, either way round (the slicer
// can turn it), with a little room spare at the edges.
export function fitsOnBed(bed, w, h, margin = 4) {
  if (!bed || !bed.w) return null;
  const W = bed.w - margin, D = bed.d - margin;
  return (w <= W && h <= D) || (h <= W && w <= D);
}
