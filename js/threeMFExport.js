// Minimal ZIP writer supporting only the "stored" (uncompressed) method —
// perfectly valid per the ZIP spec, and these files are small enough that
// skipping compression costs nothing worth the complexity of a deflate
// implementation. Direct port of the native app's ZipWriter.swift.
class ZipWriter {
  constructor() {
    this.entries = [];
    this.chunks = [];
    this.offset = 0;
  }

  addFile(name, bytes) {
    const nameBytes = new TextEncoder().encode(name);
    const crc = crc32(bytes);
    const header = new Uint8Array(30 + nameBytes.length);
    const dv = new DataView(header.buffer);
    dv.setUint32(0, 0x04034b50, true);
    dv.setUint16(4, 20, true); // version needed
    dv.setUint16(6, 0, true); // flags
    dv.setUint16(8, 0, true); // method = stored
    dv.setUint16(10, 0, true); // mod time
    dv.setUint16(12, 0, true); // mod date
    dv.setUint32(14, crc, true);
    dv.setUint32(18, bytes.length, true);
    dv.setUint32(22, bytes.length, true);
    dv.setUint16(26, nameBytes.length, true);
    dv.setUint16(28, 0, true); // extra length
    header.set(nameBytes, 30);

    this.chunks.push(header, bytes);
    this.entries.push({ name, nameBytes, crc, size: bytes.length, offset: this.offset });
    this.offset += header.length + bytes.length;
  }

  finalize() {
    const centralChunks = [];
    let centralSize = 0;
    for (const e of this.entries) {
      const rec = new Uint8Array(46 + e.nameBytes.length);
      const dv = new DataView(rec.buffer);
      dv.setUint32(0, 0x02014b50, true);
      dv.setUint16(4, 20, true);
      dv.setUint16(6, 20, true);
      dv.setUint16(8, 0, true);
      dv.setUint16(10, 0, true);
      dv.setUint16(12, 0, true);
      dv.setUint16(14, 0, true);
      dv.setUint32(16, e.crc, true);
      dv.setUint32(20, e.size, true);
      dv.setUint32(24, e.size, true);
      dv.setUint16(28, e.nameBytes.length, true);
      dv.setUint16(30, 0, true);
      dv.setUint16(32, 0, true);
      dv.setUint16(34, 0, true);
      dv.setUint16(36, 0, true);
      dv.setUint32(38, 0, true);
      dv.setUint32(42, e.offset, true);
      rec.set(e.nameBytes, 46);
      centralChunks.push(rec);
      centralSize += rec.length;
    }
    const end = new Uint8Array(22);
    const edv = new DataView(end.buffer);
    edv.setUint32(0, 0x06054b50, true);
    edv.setUint16(4, 0, true);
    edv.setUint16(6, 0, true);
    edv.setUint16(8, this.entries.length, true);
    edv.setUint16(10, this.entries.length, true);
    edv.setUint32(12, centralSize, true);
    edv.setUint32(16, this.offset, true);
    edv.setUint16(20, 0, true);

    return new Blob([...this.chunks, ...centralChunks, end], { type: 'application/zip' });
  }
}

// Merges the distinct colors used across a set of export objects down to
// at most `maxColors`, via agglomerative clustering — repeatedly merge
// whichever pair of remaining colors is closest in RGB distance (weighted
// by how many original colors have already folded into each side) until
// only maxColors clusters remain, then remap every object to its cluster's
// final color. Most consumer multi-material setups (a single Bambu AMS
// unit, for instance) have a fixed small number of simultaneous filament
// slots, and a set with several multi-color emoji legends (each already
// capped at 3 colors on its own, in rasterizeLegend) can still add up to
// far more than that once multiple emoji, cap bodies, and the base are all
// counted together — this is what actually keeps the exported file within
// a real printer's filament budget rather than assuming unlimited color
// slots. No priority is given to user-picked colors (body/base/legend)
// over algorithm-detected emoji colors here — everything participates in
// the same merge — so if a set already uses more than maxColors
// intentional colors on its own, some of those will get merged too. Does
// nothing if the distinct color count is already at or under the limit.
export function limitDistinctColors(objects, maxColors) {
  const hexToRgb = (hex) => {
    const h = hex.replace('#', '');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  };
  const rgbToHex = ([r, g, b]) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

  // Objects can also carry per-triangle colours (triangleColors, e.g. the
  // base's camo marks); those count toward the limit and get merged too.
  const distinct = [...new Set(objects.flatMap((o) => [o.colorHex, ...(o.triangleColors || [])]))];
  if (distinct.length <= maxColors) return objects;

  let clusters = distinct.map((hex) => ({ colors: [hex], rgb: hexToRgb(hex) }));
  while (clusters.length > maxColors) {
    let bestI = 0, bestJ = 1, bestDist = Infinity;
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const d = Math.hypot(...clusters[i].rgb.map((v, k) => v - clusters[j].rgb[k]));
        if (d < bestDist) { bestDist = d; bestI = i; bestJ = j; }
      }
    }
    const a = clusters[bestI], b = clusters[bestJ];
    const totalWeight = a.colors.length + b.colors.length;
    const mergedRgb = a.rgb.map((v, k) => (v * a.colors.length + b.rgb[k] * b.colors.length) / totalWeight);
    clusters[bestI] = { colors: [...a.colors, ...b.colors], rgb: mergedRgb };
    clusters.splice(bestJ, 1);
  }

  const mapping = new Map();
  for (const cluster of clusters) {
    const finalHex = rgbToHex(cluster.rgb);
    for (const origHex of cluster.colors) mapping.set(origHex, finalHex);
  }
  return objects.map((o) => ({
    ...o,
    colorHex: mapping.get(o.colorHex),
    ...(o.triangleColors ? { triangleColors: o.triangleColors.map((c) => mapping.get(c)) } : {}),
  }));
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// One printable part: a mesh, the color it should be assigned, and where it
// sits on the plate (already-baked absolute position, not a relative
// offset — see computeExportLayout in app.js for where these come from).
//
// How colour gets into the slicer. Two things at once:
//
//  1. Each part's own colour, as a 3MF colour group with the colour set on
//     the object (not on each triangle). Bambu Studio and OrcaSlicer then
//     open their "Standard 3mf Import color" window: the file's colours
//     start as the app's colours, and its "Color match" button maps each
//     one to the closest filament already loaded (the AMS), or "Append"
//     adds them as new filaments. On OK, an object made of SEVERAL parts,
//     each one colour, gets each part assigned to a filament, with no paint
//     (ObjColorPanel::apply_volume_filament_ids in Bambu Studio's
//     ObjColorDialog.cpp). An object of just one part is painted instead,
//     and paint overrides the part's filament (that's what made colours
//     impossible to change in the slicer before), so every object here is
//     made of at least two parts: a cap's body and legend, the logo cap's
//     body, rim and logo, and the base as base + keyring loop or as floor
//     slab + the rest (buildBaseParts). Anything without a colour would be
//     painted with filament 1, so everything gets one.
//  2. A filament number per colour (1, 2, 3, 4 in the order the colours
//     first appear: the base first) in the slicer's own per-part settings:
//     Metadata/model_settings.config for Bambu Studio and OrcaSlicer (read
//     from any 3MF; bbs_3mf.cpp), and Metadata/Slic3r_PE_model.config for
//     PrusaSlicer. That's what's used if the colour window is cancelled.
//
// Either way each part ends up on a filament, so changing its filament, or
// a filament's colour, in the slicer works as for any other part. The camo
// base's marks are per-triangle colours, so that one part is painted.
export function buildThreeMF(objects, appName = 'KeyCapForge by Cobb3D') {
  const distinctColors = [...new Set(objects.flatMap((o) => [o.colorHex, ...(o.triangleColors || [])]))];
  const colorIndex = new Map(distinctColors.map((c, i) => [c, i]));
  let colorGroupXML = '';
  distinctColors.forEach((hex) => {
    colorGroupXML += `<m:color color="${hex.toUpperCase()}FF"/>\n`;
  });

  let resourcesXML = '';
  let buildXML = '';
  let bambuXML = '';
  let prusaXML = '';
  const meta = (key, value, type) => `<metadata${type ? ` type="${type}"` : ''} key="${key}" value="${value}"/>`;
  let nextId = 1;
  // Pass 1: every part as its own mesh object.
  const parts = [];
  for (const obj of objects) {
    if (!obj.mesh || obj.mesh.isEmpty) continue;
    const id = nextId++;
    const pIndex = colorIndex.get(obj.colorHex) ?? 0;
    const name = escapeXML(obj.name);
    let verticesXML = '';
    for (let i = 0; i < obj.mesh.vertices.length; i += 3) {
      verticesXML += `<vertex x="${fmt(obj.mesh.vertices[i])}" y="${fmt(obj.mesh.vertices[i + 1])}" z="${fmt(obj.mesh.vertices[i + 2])}"/>\n`;
    }
    let trianglesXML = '';
    const triCount = obj.mesh.indices.length / 3;
    for (let i = 0, t = 0; i < obj.mesh.indices.length; i += 3, t++) {
      const paint = obj.triangleColors ? ` pid="1" p1="${colorIndex.get(obj.triangleColors[t]) ?? pIndex}"` : '';
      trianglesXML += `<triangle v1="${obj.mesh.indices[i]}" v2="${obj.mesh.indices[i + 1]}" v3="${obj.mesh.indices[i + 2]}"${paint}/>\n`;
    }
    const objectPaint = ` pid="1" pindex="${pIndex}"`;
    resourcesXML += `<object id="${id}" type="model" name="${name}"${objectPaint}><mesh><vertices>\n${verticesXML}</vertices><triangles>\n${trianglesXML}</triangles></mesh></object>\n`;
    // PrusaSlicer loads each mesh of an assembly as its own object, so it
    // gets a filament per mesh object (the cap and its letter stay
    // separate objects there).
    prusaXML += ` <object id="${id}" instances_count="1">\n  ${meta('name', name, 'object')}\n  ${meta('extruder', pIndex + 1, 'object')}\n  <volume firstid="0" lastid="${triCount - 1}">\n   ${meta('name', name, 'volume')}\n  </volume>\n </object>\n`;
    parts.push({ id, name, filament: pIndex + 1, group: obj.group, translation: obj.translation || [0, 0, 0] });
  }

  // Pass 2: what goes on the plate. Parts that share a `group` (a cap's
  // body and its letter or logo pieces) become one assembly object whose
  // components are those parts, so Bambu Studio and OrcaSlicer load them as
  // ONE object with several parts: it moves as one, and each part keeps its
  // own filament (the <part> entries below). Everything else (the base) is
  // placed directly.
  //
  // An earlier version wrapped the WHOLE export (every cap and the base) in
  // a single assembly, and Bambu Studio's sliced output lost detail. That
  // was before meshes were welded (Mesh.welded(), the root cause of that
  // run of slicing problems), and the base is never grouped here.
  const groups = new Map();
  for (const part of parts) {
    const key = part.group ?? `__single_${part.id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(part);
  }
  for (const [key, members] of groups) {
    const t = members[0].translation;
    const place = (objectid) => `<item objectid="${objectid}" transform="1 0 0 0 1 0 0 0 1 ${fmt(t[0])} ${fmt(t[1])} ${fmt(t[2])}"/>\n`;
    if (members.length === 1) {
      const p = members[0];
      buildXML += place(p.id);
      bambuXML += `  <object id="${p.id}">\n    ${meta('name', p.name)}\n    ${meta('extruder', p.filament)}\n    <part id="${p.id}" subtype="normal_part">\n      ${meta('name', p.name)}\n      ${meta('extruder', p.filament)}\n    </part>\n  </object>\n`;
      continue;
    }
    const id = nextId++;
    const name = escapeXML(String(key));
    // Parts in a group share one position, so their meshes line up with
    // identity component transforms and the group is placed as a whole.
    const components = members.map((p) => `<component objectid="${p.id}" transform="1 0 0 0 1 0 0 0 1 0 0 0"/>`).join('\n');
    resourcesXML += `<object id="${id}" type="model" name="${name}"><components>\n${components}\n</components></object>\n`;
    buildXML += place(id);
    bambuXML += `  <object id="${id}">\n    ${meta('name', name)}\n    ${meta('extruder', members[0].filament)}\n`;
    for (const p of members) bambuXML += `    <part id="${p.id}" subtype="normal_part">\n      ${meta('name', p.name)}\n      ${meta('extruder', p.filament)}\n    </part>\n`;
    bambuXML += `  </object>\n`;
  }

  const modelXML = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:m="http://schemas.microsoft.com/3dmanufacturing/material/2015/02">
<metadata name="Application">${escapeXML(appName)}</metadata>
<resources>
${distinctColors.length ? `<m:colorgroup id="1">\n${colorGroupXML}</m:colorgroup>\n` : ''}${resourcesXML}</resources>
<build>
${buildXML}</build>
</model>`;

  const bambuConfig = `<?xml version="1.0" encoding="UTF-8"?>
<config>
${bambuXML}</config>
`;
  const prusaConfig = `<?xml version="1.0" encoding="UTF-8"?>
<config>
${prusaXML}</config>
`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
<Default Extension="config" ContentType="text/xml"/>
</Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`;

  const zip = new ZipWriter();
  zip.addFile('[Content_Types].xml', new TextEncoder().encode(contentTypes));
  zip.addFile('_rels/.rels', new TextEncoder().encode(rels));
  zip.addFile('3D/3dmodel.model', new TextEncoder().encode(modelXML));
  zip.addFile('Metadata/model_settings.config', new TextEncoder().encode(bambuConfig));
  zip.addFile('Metadata/Slic3r_PE_model.config', new TextEncoder().encode(prusaConfig));
  return zip.finalize();
}

function fmt(v) {
  return v.toFixed(4);
}

function escapeXML(s) {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
