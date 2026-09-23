import { triangleNormal } from './mesh.js';

export function meshToSTL(mesh, name = 'KeyCapForge') {
  const triCount = mesh.indices.length / 3;
  const buffer = new ArrayBuffer(80 + 4 + triCount * 50);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  const nameBytes = new TextEncoder().encode(name).slice(0, 80);
  bytes.set(nameBytes, 0);
  view.setUint32(80, triCount, true);

  let offset = 84;
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const ia = mesh.indices[t], ib = mesh.indices[t + 1], ic = mesh.indices[t + 2];
    const a = [mesh.vertices[ia * 3], mesh.vertices[ia * 3 + 1], mesh.vertices[ia * 3 + 2]];
    const b = [mesh.vertices[ib * 3], mesh.vertices[ib * 3 + 1], mesh.vertices[ib * 3 + 2]];
    const c = [mesh.vertices[ic * 3], mesh.vertices[ic * 3 + 1], mesh.vertices[ic * 3 + 2]];
    const n = triangleNormal(a, b, c);
    view.setFloat32(offset, n[0], true); view.setFloat32(offset + 4, n[1], true); view.setFloat32(offset + 8, n[2], true);
    view.setFloat32(offset + 12, a[0], true); view.setFloat32(offset + 16, a[1], true); view.setFloat32(offset + 20, a[2], true);
    view.setFloat32(offset + 24, b[0], true); view.setFloat32(offset + 28, b[1], true); view.setFloat32(offset + 32, b[2], true);
    view.setFloat32(offset + 36, c[0], true); view.setFloat32(offset + 40, c[1], true); view.setFloat32(offset + 44, c[2], true);
    view.setUint16(offset + 48, 0, true);
    offset += 50;
  }
  return new Blob([buffer], { type: 'model/stl' });
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
