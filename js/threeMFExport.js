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
// How colour gets into the slicer. Each distinct colour gets a filament
// number (1, 2, 3, 4 in the order the colours first appear: the base first),
// and each part is assigned its colour's filament in the slicer's own
// per-object settings:
//   - Metadata/model_settings.config for Bambu Studio and OrcaSlicer, which
//     read it from any 3MF, not just their own (bbs_3mf.cpp,
//     _extract_xml_from_archive on BBS_MODEL_CONFIG_FILE);
//   - Metadata/Slic3r_PE_model.config, the same thing for PrusaSlicer.
// The part then comes in on that filament, and changing its filament (or
// that filament's colour) in the slicer works as for any other part.
//
// This replaced writing each part's colour into the mesh itself (a 3MF
// <m:colorgroup>, with a colour on every triangle). Bambu Studio turns a
// colour group on a single-part object into paint on every triangle (its
// ObjColorDialog only assigns a filament instead when an object has more
// than one part), and paint overrides the part's filament, so a part's
// colour couldn't be changed in the slicer without repainting it.
//
// The one exception is a part with its own per-triangle colours (the camo
// base's marks): those really are paint, so that part alone still carries a
// colour group.
export function buildThreeMF(objects, appName = 'KeyCapForge by Cobb3D') {
  const distinctColors = [...new Set(objects.flatMap((o) => [o.colorHex, ...(o.triangleColors || [])]))];
  const colorIndex = new Map(distinctColors.map((c, i) => [c, i]));
  const painted = objects.some((o) => o.triangleColors && o.mesh && !o.mesh.isEmpty);
  let colorGroupXML = '';
  distinctColors.forEach((hex) => {
    colorGroupXML += `<m:color color="${hex.toUpperCase()}FF"/>\n`;
  });

  let resourcesXML = '';
  let buildXML = '';
  let bambuXML = '';
  let prusaXML = '';
  let objectId = 1;
  for (const obj of objects) {
    if (!obj.mesh || obj.mesh.isEmpty) continue;
    const pIndex = colorIndex.get(obj.colorHex) ?? 0;
    const filament = pIndex + 1;
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
    const objectPaint = obj.triangleColors ? ` pid="1" pindex="${pIndex}"` : '';
    resourcesXML += `<object id="${objectId}" type="model" name="${name}"${objectPaint}><mesh><vertices>\n${verticesXML}</vertices><triangles>\n${trianglesXML}</triangles></mesh></object>\n`;
    bambuXML += `  <object id="${objectId}">\n    <metadata key="name" value="${name}"/>\n    <metadata key="extruder" value="${filament}"/>\n    <part id="${objectId}" subtype="normal_part">\n      <metadata key="name" value="${name}"/>\n    </part>\n  </object>\n`;
    prusaXML += ` <object id="${objectId}" instances_count="1">\n  <metadata type="object" key="name" value="${name}"/>\n  <metadata type="object" key="extruder" value="${filament}"/>\n  <volume firstid="0" lastid="${triCount - 1}">\n   <metadata type="volume" key="name" value="${name}"/>\n  </volume>\n </object>\n`;
    const t = obj.translation || [0, 0, 0];
    // Each part is its own independent top-level <build> item — NOT
    // wrapped in a parent <components> assembly. A previous version did
    // that, and Bambu Studio's slicer merged the parts and lost detail (the
    // base's recess/plate-hole cavities came out solid, cap legends and the
    // switch mount vanished): every cavity here is carved into one part's
    // own mesh, and a legend only touches its cap body, so the parts need
    // to stay independent solids.
    buildXML += `<item objectid="${objectId}" transform="1 0 0 0 1 0 0 0 1 ${fmt(t[0])} ${fmt(t[1])} ${fmt(t[2])}"/>\n`;
    objectId++;
  }

  const modelXML = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:m="http://schemas.microsoft.com/3dmanufacturing/material/2015/02">
<metadata name="Application">${escapeXML(appName)}</metadata>
<resources>
${painted ? `<m:colorgroup id="1">\n${colorGroupXML}</m:colorgroup>\n` : ''}${resourcesXML}</resources>
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
