import { Polygon2D } from './mesh.js';

export function profileFor(shape, width, cornerRadius) {
  switch (shape) {
    case 'square': return roundedRect(width, width, Math.min(cornerRadius, width * 0.45));
    case 'round': return regularPolygon(48, width / 2);
    case 'hexagon': return regularPolygon(6, width / 2, 90);
    case 'pentagon': return regularPolygon(5, width / 2, 90);
    case 'octagon': return regularPolygon(8, width / 2, 22.5);
    case 'heart': return heart(width);
    case 'flower': return lobed(width, 6, 0.72, false);
    case 'star': return lobed(width, 5, 0.5, true);
    default: return roundedRect(width, width, cornerRadius);
  }
}

// How much a legend's target bounding box needs shrinking to actually fit
// within a given shape's real material, rather than overhanging into the
// empty space of its concave notches. Every other shape here is convex
// enough that a square legend box sized from the cap's overall width lands
// almost entirely inside it — verified by sampling: square/round/hexagon/
// octagon are ~100%, pentagon ~99%. Star and heart are the outliers: star's
// sharp 5-point notches (innerRatio 0.5) leave only ~77% of a same-sized
// box actually inside the material, and heart's top notch/bottom point
// bring it to ~92% — both measurably worse, and exactly why those two
// specifically were the ones reported as "not displaying properly": their
// legends were sized as if the shape were as forgiving as a square, then
// visibly extended past the actual points/notches into thin air. flower's
// notches are much shallower (rounded, innerRatio 0.72) than star's sharp
// ones but still slightly concave, so it gets a light correction too. These
// factors were tuned empirically (sampling a grid of points against each
// polygon) to bring the fit back up to ~99-100% rather than computed from
// a closed-form inscribed-shape formula, which would need to be re-derived
// per shape family — a reasonable trade for how small and self-contained
// the correction is.
export function legendFitFactor(shape) {
  switch (shape) {
    case 'star': return 0.62;
    case 'heart': return 0.80;
    case 'flower': return 0.92;
    default: return 1.0;
  }
}

export function roundedRect(width, height, radius) {
  const hw = width / 2, hh = height / 2;
  const r = Math.max(0, Math.min(radius, Math.min(hw, hh)));
  const pts = [];
  const corners = [
    [[hw - r, hh - r], 0],
    [[-hw + r, hh - r], 90],
    [[-hw + r, -hh + r], 180],
    [[hw - r, -hh + r], 270],
  ];
  const segments = 8;
  for (const [[cx, cy], startDeg] of corners) {
    for (let s = 0; s <= segments; s++) {
      const deg = startDeg + (s / segments) * 90;
      const rad = (deg * Math.PI) / 180;
      pts.push([cx + Math.cos(rad) * r, cy + Math.sin(rad) * r]);
    }
  }
  return new Polygon2D(pts);
}

// Same as roundedRect, but each of the 4 corners gets its own radius
// (order: top-right, top-left, bottom-left, bottom-right — matching
// roundedRect's own internal corner order). Exists specifically for a
// single cell within a joined multi-cap base row: only that cell's
// actually-outer-facing corners should round to match the outer wall's
// real shape there, while its corners shared with an adjacent cell need
// to stay sharp (radius 0) — the outer wall is simply straight/flat at an
// internal cell boundary, not rounded, since that's not one of the whole
// block's own true corners. Rounding every cell's own corners
// unconditionally (as if every cell were sized to the whole block) was a
// confirmed, real bug: the per-cell top-face ring curved where the outer
// wall stayed straight, leaving gaps at internal boundaries — exactly the
// kind of thing a slicer's manifold repair could misinterpret.
export function roundedRectPerCorner(width, height, radii) {
  const hw = width / 2, hh = height / 2;
  const maxR = Math.min(hw, hh);
  const rs = radii.map((r) => Math.max(0, Math.min(r, maxR)));
  const pts = [];
  const corners = [
    [[hw, hh], 0, rs[0]],
    [[-hw, hh], 90, rs[1]],
    [[-hw, -hh], 180, rs[2]],
    [[hw, -hh], 270, rs[3]],
  ];
  const segments = 8;
  for (const [[cornerX, cornerY], startDeg, r] of corners) {
    if (r < 0.001) {
      // Sharp corner: just the corner point itself, no arc.
      pts.push([cornerX, cornerY]);
      continue;
    }
    const signX = cornerX >= 0 ? -1 : 1, signY = cornerY >= 0 ? -1 : 1;
    const cx = cornerX + signX * r, cy = cornerY + signY * r;
    for (let s = 0; s <= segments; s++) {
      const deg = startDeg + (s / segments) * 90;
      const rad = (deg * Math.PI) / 180;
      pts.push([cx + Math.cos(rad) * r, cy + Math.sin(rad) * r]);
    }
  }
  return new Polygon2D(pts);
}

export function regularPolygon(sides, radius, rotationDegrees = 0) {
  const pts = [];
  for (let i = 0; i < sides; i++) {
    const deg = rotationDegrees + (i / sides) * 360;
    const rad = (deg * Math.PI) / 180;
    pts.push([Math.cos(rad) * radius, Math.sin(rad) * radius]);
  }
  return new Polygon2D(pts);
}

export function lobed(width, lobes, innerRatio, sharp) {
  const outerR = width / 2, innerR = outerR * innerRatio;
  const pts = [];
  const pointsPerLobe = sharp ? 2 : 10;
  const total = lobes * pointsPerLobe;
  for (let i = 0; i < total; i++) {
    const t = i / pointsPerLobe;
    const angle = ((t / lobes) * 2 * Math.PI);
    const phase = t % 1;
    let r;
    if (sharp) r = (i % 2 === 0) ? outerR : innerR;
    else r = innerR + (outerR - innerR) * (0.5 + 0.5 * Math.cos((phase - 0.5) * 2 * Math.PI));
    pts.push([Math.cos(angle) * r, Math.sin(angle) * r]);
  }
  return new Polygon2D(pts);
}

export function heart(width) {
  const raw = [];
  const steps = 64;
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * 2 * Math.PI;
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    raw.push([x, y]);
  }
  const maxX = Math.max(...raw.map(([x]) => Math.abs(x)));
  const scale = (width / 2) / maxX;
  const scaled = raw.map(([x, y]) => [x * scale, -y * scale]);
  let cx = 0, cy = 0;
  for (const [x, y] of scaled) { cx += x; cy += y; }
  cx /= scaled.length; cy /= scaled.length;
  return new Polygon2D(scaled.map(([x, y]) => [x - cx, y - cy]));
}
