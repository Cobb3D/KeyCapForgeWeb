// Colour themes: picking one sets the base colour and every cap's body and
// legend colours at once. Caps take the theme's cap colours in turn (cap 1
// the first, cap 2 the second, and so on, starting over at the end), so
// caps added later continue the pattern.
//
// Each theme uses at most 4 distinct colours in total, counting the base,
// cap bodies, and legends, because the 3MF export is capped at 4 colours to
// match a 4-slot AMS: a theme with more would get colours merged on export
// and not print the way it looks. (Colourful emoji legends bring their own
// colours and can still push past 4; the export then merges the closest.)
export const THEMES = {
  // Inspired by blocky voxel-game terrain: a dirt base under grass and
  // stone blocks. Named generically rather than after any game.
  grass: {
    name: 'Grass Block',
    base: '#79553a', // dirt
    caps: [
      { body: '#5d9b34', legend: '#ffffff' }, // grass
      { body: '#828282', legend: '#ffffff' }, // stone
    ],
  },
  // Black and white patches with a pink nose, and black Holstein patches
  // on the white base.
  cow: {
    name: 'Cow',
    base: '#f4f4f4', // white
    pattern: 'cow',
    marks: ['#1b1b1b'], // black patches
    caps: [
      { body: '#1b1b1b', legend: '#f4a6b8' }, // black patch, pink letters
      { body: '#f4f4f4', legend: '#1b1b1b' }, // white, black letters
    ],
  },
  // Patterned themes also list `pattern` (a style in camo.js's
  // PATTERN_STYLES) and `marks`: the colours of the marks painted over the
  // base colour. The base plus the marks are among the theme's colours;
  // caps and legends reuse them, so each stays within the 4-colour limit.
  // Legends use whichever colour contrasts.
  //
  // Woodland camouflage.
  camo: {
    name: 'Camo (Woodland)',
    base: '#556b2f', // olive drab
    pattern: 'camo',
    marks: ['#c2b280', '#5b4632', '#3b4a2a'], // khaki, brown, forest green
    caps: [
      { body: '#c2b280', legend: '#5b4632' }, // khaki, brown letters
      { body: '#5b4632', legend: '#c2b280' }, // brown, khaki letters
      { body: '#3b4a2a', legend: '#c2b280' }, // forest green, khaki letters
    ],
  },
  // Navy blue camouflage, in the style of the blue working uniform.
  navy: {
    name: 'Camo (Navy)',
    base: '#26344f', // navy blue
    pattern: 'camo',
    marks: ['#566a8a', '#9aa3b0', '#141a26'], // blue-grey, light grey, near-black
    caps: [
      { body: '#9aa3b0', legend: '#141a26' }, // light grey, near-black letters
      { body: '#566a8a', legend: '#141a26' }, // blue-grey, near-black letters
      { body: '#141a26', legend: '#9aa3b0' }, // near-black, light grey letters
    ],
  },
  // Snow camouflage: white with grey patches.
  snow: {
    name: 'Camo (Snow)',
    base: '#eef1f4', // snow white
    pattern: 'camo',
    marks: ['#c6ccd3', '#8f97a0', '#50575f'], // light, medium, and dark grey
    caps: [
      { body: '#eef1f4', legend: '#50575f' }, // white, dark grey letters
      { body: '#c6ccd3', legend: '#50575f' }, // light grey, dark grey letters
      { body: '#50575f', legend: '#eef1f4' }, // dark grey, white letters
    ],
  },
};

// Order the themes appear in the picker.
export const THEME_ORDER = ['grass', 'cow', 'camo', 'navy', 'snow'];

// Body and legend colours for the cap at position `index` under a theme.
export function themeCapColors(themeId, index) {
  const caps = THEMES[themeId].caps;
  return caps[index % caps.length];
}
