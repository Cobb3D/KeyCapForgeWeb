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

  const distinct = [...new Set(objects.map((o) => o.colorHex))];
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
  return objects.map((o) => ({ ...o, colorHex: mapping.get(o.colorHex) }));
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
export function buildThreeMF(objects, appName = 'KeyCapForge by Cobb3D') {
  const distinctColors = [...new Set(objects.map((o) => o.colorHex))];
  const colorIndex = new Map(distinctColors.map((c, i) => [c, i]));
  // A <m:colorgroup> from the Materials and Properties Extension, not a
  // plain core-spec <basematerials> — that's the actual bug this fixes.
  // <basematerials> is meant more for real material types (PLA/ABS/etc.)
  // and, while it technically supports a displaycolor attribute, many
  // real-world 3MF consumers (Bambu Studio, OrcaSlicer, PrusaSlicer's
  // AMS/MMU color assignment) specifically look for a proper color group
  // to treat something as a per-part color hint, not just informational
  // metadata — which is exactly why the exported color was being ignored
  // and everything came in as one flat color.
  let colorGroupXML = '';
  distinctColors.forEach((hex) => {
    colorGroupXML += `<m:color color="${hex.toUpperCase()}FF"/>\n`;
  });

  let resourcesXML = '';
  let buildXML = '';
  let objectId = 1;
  for (const obj of objects) {
    if (!obj.mesh || obj.mesh.isEmpty) continue;
    const pIndex = colorIndex.get(obj.colorHex) ?? 0;
    let verticesXML = '';
    for (let i = 0; i < obj.mesh.vertices.length; i += 3) {
      verticesXML += `<vertex x="${fmt(obj.mesh.vertices[i])}" y="${fmt(obj.mesh.vertices[i + 1])}" z="${fmt(obj.mesh.vertices[i + 2])}"/>\n`;
    }
    let trianglesXML = '';
    for (let i = 0; i < obj.mesh.indices.length; i += 3) {
      trianglesXML += `<triangle v1="${obj.mesh.indices[i]}" v2="${obj.mesh.indices[i + 1]}" v3="${obj.mesh.indices[i + 2]}" pid="1" p1="${pIndex}"/>\n`;
    }
    // pid/pindex declared on the object itself too, not just per-triangle —
    // every part here is entirely one uniform color, so this is actually
    // the more natural, spec-correct way to say so, and it's a cheap,
    // harmless belt-and-suspenders for readers that check the object-level
    // default rather than (or in addition to) the per-triangle values.
    resourcesXML += `<object id="${objectId}" type="model" name="${escapeXML(obj.name)}" pid="1" pindex="${pIndex}"><mesh><vertices>\n${verticesXML}</vertices><triangles>\n${trianglesXML}</triangles></mesh></object>\n`;
    const t = obj.translation || [0, 0, 0];
    // Each part is its own independent top-level <build> item — NOT
    // wrapped in a parent <components> assembly. A previous version of
    // this function did exactly that, to answer Bambu Studio's "should
    // this be treated as a single object with multiple parts?" prompt
    // definitively — but that caused a real, worse regression: sliced
    // output lost detail entirely (the base's recess/plate-hole cavities
    // came out as a solid block, cap legends and the internal switch
    // mount vanished). This project never does true CSG/boolean union
    // anywhere — every cavity is carved directly into a single part's own
    // mesh via matched-point-count ringFace/loftShell, not by subtracting
    // a separate object — so these parts genuinely need to stay
    // independent solids through slicing, not get merged into one. A
    // <components> assembly is exactly what invites (and for Bambu
    // Studio's slicer, apparently triggers) that kind of merge attempt,
    // which a thin, coincident-surface part like the flush legend can't
    // survive intact — it doesn't share real volumetric overlap with the
    // cap body, only a touching surface, so a merge treats it as
    // disconnected/floating and drops it. Reverted for correctness: one
    // extra confirmation click on import is a far smaller cost than
    // print-breaking geometry loss.
    buildXML += `<item objectid="${objectId}" transform="1 0 0 0 1 0 0 0 1 ${fmt(t[0])} ${fmt(t[1])} ${fmt(t[2])}"/>\n`;
    objectId++;
  }

  const modelXML = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:m="http://schemas.microsoft.com/3dmanufacturing/material/2015/02">
<metadata name="Application">${escapeXML(appName)}</metadata>
<resources>
<m:colorgroup id="1">
${colorGroupXML}</m:colorgroup>
${resourcesXML}</resources>
<build>
${buildXML}</build>
</model>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`;

  const zip = new ZipWriter();
  zip.addFile('[Content_Types].xml', new TextEncoder().encode(contentTypes));
  zip.addFile('_rels/.rels', new TextEncoder().encode(rels));
  zip.addFile('3D/3dmodel.model', new TextEncoder().encode(modelXML));
  return zip.finalize();
}

function fmt(v) {
  return v.toFixed(4);
}

function escapeXML(s) {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
