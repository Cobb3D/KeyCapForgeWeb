// Three.js is loaded via an import map (declared in index.html), which is
// the officially documented way to use it from a CDN without a bundler —
// it guarantees the main module and its addons (like OrbitControls)
// resolve to the exact same module instance. That matters because modern
// Three.js addon files import Three itself via a bare specifier
// (`import ... from 'three'`), which cannot resolve to any URL at all
// without an import map — this was the actual cause of OrbitControls
// failing to load from jsdelivr/unpkg here, not a network or CORS problem.
//
// esm.sh is kept as a fallback for if jsdelivr itself is ever unreachable:
// it rewrites bare specifiers on the fly so it works without an import map
// at all, but it can end up loading Three.js as two separate module
// instances (one directly, one via its rewritten OrbitControls import),
// which broke Three's internal rotation/quaternion sync with a stack
// overflow when tried here — a real trade-off, not a hypothetical one, so
// it's the fallback rather than the primary.
let cached = null;

export async function ensureThreeLoaded() {
  if (cached) return cached;
  const note = (msg) => { console.info('KeyCapForge:', msg); if (window.showDiag) window.showDiag(msg); };

  try {
    note('Trying import map (three + three/addons/…) …');
    const THREE = await import('three');
    const { OrbitControls } = await import('three/addons/controls/OrbitControls.js');
    cached = { THREE, OrbitControls };
    note('✓ loaded via import map — ready');
    return cached;
  } catch (e) {
    note(`✗ import map approach failed: ${e.message || e}`);
  }

  try {
    note('Trying esm.sh fallback …');
    const THREE = await import('https://esm.sh/three@0.160.0');
    const { OrbitControls } = await import('https://esm.sh/three@0.160.0/examples/jsm/controls/OrbitControls.js');
    cached = { THREE, OrbitControls };
    note('✓ loaded via esm.sh — ready');
    return cached;
  } catch (e) {
    note(`✗ esm.sh fallback failed: ${e.message || e}`);
    throw new Error('Could not load Three.js via the import map or the esm.sh fallback: ' + (e.message || e));
  }
}

export class Viewport {
  constructor(host, THREE, OrbitControls) {
    this.THREE = THREE;
    this.host = host;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0f0e11);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000);
    this.camera.up.set(0, 0, 1); // Z-up, matching the geometry convention
    this.camera.position.set(0, -75, 45);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    host.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0, 8);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.update();
    // Left-click orbit is OrbitControls' default; middle-drag pans and the
    // scroll wheel zooms out of the box, which is exactly the "familiar 3D
    // app" scheme this project spent a long time hand-rolling natively —
    // using the library eliminates that whole category of bugs.

    const key = new THREE.DirectionalLight(0xffffff, 2.6);
    key.position.set(60, -80, 120);
    this.scene.add(key);
    const ambient = new THREE.AmbientLight(0xffffff, 0.9);
    this.scene.add(ambient);

    this.modelGroup = new THREE.Group();
    this.scene.add(this.modelGroup);

    this._initScaleBar();

    this.resize();
    window.addEventListener('resize', () => this.resize());
    // Also resize whenever the canvas's own container changes size, not
    // just when the browser window does. On phones the viewport's space
    // changes for reasons that never fire a window resize (the stacked
    // mobile layout settling, the address bar collapsing, fonts loading
    // and reflowing the sidebar), and a canvas that missed one of those
    // stays at a stale — or zero — size, which is how the model could
    // fail to show on an iPhone at all.
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(() => this.resize()).observe(host);
    }
    this._animate();
  }

  // A "map-style" scale reference — a small bar overlaid on the render
  // itself, labeled with a round physical length (mm), sized in CSS
  // pixels to match whatever that length actually measures at RIGHT NOW.
  // Deliberately NOT a fixed-size image or a one-time-computed value:
  // the whole point is that it has to stay honest as the person zooms,
  // pans, or orbits, so it's recalculated every single frame in
  // _animate() below from the camera's actual current distance to its
  // target — not from whatever the distance happened to be when the
  // model was first framed. That also means it never needs its own
  // explicit "update after this camera change" calls scattered through
  // resetView()/frameToModel()/resize() — anything that moves the camera
  // or changes the viewport size is automatically reflected on the very
  // next rendered frame, the same guarantee the render loop itself
  // already provides for the model.
  //
  // A plain DOM overlay (not a ruler mesh placed in the 3D scene itself)
  // on purpose: a 3D ruler would need its own careful positioning to
  // avoid being obscured by the model from some orbit angles, and would
  // foreshorten/tilt away from a straight-on read the moment the camera
  // isn't looking at it face-on — an HTML overlay stays flat, legible,
  // and in the same corner of the screen regardless of orbit angle,
  // exactly like a map application's own scale bar.
  _initScaleBar() {
    this.scaleBarEl = document.createElement('div');
    this.scaleBarEl.className = 'scale-bar';
    this.scaleBarEl.innerHTML = '<div class="scale-bar-line"></div><span class="scale-bar-label"></span>';
    this.host.appendChild(this.scaleBarEl);
    this._scaleBarLineEl = this.scaleBarEl.querySelector('.scale-bar-line');
    this._scaleBarLabelEl = this.scaleBarEl.querySelector('.scale-bar-label');
    // Tracks the last value actually written to the DOM, so a frame where
    // nothing has meaningfully changed (the common case — most frames
    // aren't mid-drag) skips the style/text writes entirely rather than
    // touching the DOM 60 times a second for no visible difference.
    this._lastScaleMM = null;
    this._lastScalePx = null;
  }

  // Standard "nice number" rounding (the same technique map and chart
  // axis scale bars use): snaps an arbitrary ideal length to the nearest
  // of {1, 2, 5} × a power of 10, so the bar always reads as a round,
  // at-a-glance value (10mm, 20mm, 50mm, ...) rather than some exact but
  // unreadable computed length like "37mm".
  _niceScaleLength(idealMM) {
    if (!isFinite(idealMM) || idealMM <= 0) return 10;
    const exponent = Math.floor(Math.log10(idealMM));
    const fraction = idealMM / Math.pow(10, exponent);
    let niceFraction;
    if (fraction < 1.5) niceFraction = 1;
    else if (fraction < 3.5) niceFraction = 2;
    else if (fraction < 7.5) niceFraction = 5;
    else niceFraction = 10;
    return niceFraction * Math.pow(10, exponent);
  }

  _updateScaleBar() {
    const h = this.host.clientHeight;
    if (h <= 0) return;
    // Distance from the camera to whatever it's currently focused on —
    // the natural reference plane for "how many mm is a pixel right now"
    // in an orbit viewer, since that's the point the person is actually
    // looking at, not an arbitrary fixed depth. Panning or zooming both
    // change this distance, and both should (and do, since this runs
    // every frame) immediately affect the bar's own size.
    const distance = this.camera.position.distanceTo(this.controls.target);
    if (distance <= 0.001) return; // avoid a divide-by-zero-width bar if the camera and target ever coincide
    const vFovRad = (this.camera.fov * Math.PI) / 180;
    // Standard perspective-camera relationship: the height of the plane
    // exactly at `distance` that fills the vertical field of view.
    const worldHeightAtDistance = 2 * distance * Math.tan(vFovRad / 2);
    const mmPerPixel = worldHeightAtDistance / h;
    // Aim for a bar that's comfortably sized on screen (not a sliver,
    // not spanning half the viewport) — the nice-number snap below then
    // pulls whatever ideal length that implies down to the nearest round
    // value, which is very likely a different (usually smaller) pixel
    // width, not this target exactly.
    const targetPixelWidth = 90;
    const idealMM = targetPixelWidth * mmPerPixel;
    const niceMM = this._niceScaleLength(idealMM);
    const pixelWidth = Math.round(niceMM / mmPerPixel);
    if (niceMM === this._lastScaleMM && pixelWidth === this._lastScalePx) return;
    this._lastScaleMM = niceMM;
    this._lastScalePx = pixelWidth;
    this._scaleBarLineEl.style.width = `${pixelWidth}px`;
    this._scaleBarLabelEl.textContent = `${niceMM} mm`;
  }

  resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    // Guards against a transient zero (or near-zero) height during a
    // layout transition — dividing by it would set an invalid, wildly
    // distorted aspect ratio that then persists until the next resize
    // event fires with a sane size. Skipping the update here just leaves
    // the previous (still-valid) aspect ratio in place for one frame
    // instead.
    if (w <= 0 || h <= 0) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // Computes target + distance from the model's ACTUAL rendered bounding
  // box (via THREE.Box3), rather than a hand-tuned heuristic based on cap
  // count and pitch (this replaces an earlier setTarget(x,y,z,distance)
  // that took those pre-computed numbers) — reported to sometimes frame
  // dramatically too close (an extreme, distorted wide-FOV-close-up
  // look), which a bounding-box-based fit avoids by construction: it's
  // derived directly from what's actually in the scene, so it can't be
  // wrong about the model's real size the way a formula guessing at it
  // from unrelated settings could be. Uses a standard fit-to-bounding-
  // sphere technique: radius/sin(fov/2) is how far back the camera needs
  // to be for a sphere of that radius to exactly fill a given field of
  // view. Checked for BOTH the vertical and horizontal FOV (the latter
  // computed from the camera's current aspect ratio) and takes whichever
  // requires more distance, so this stays correct regardless of whether
  // the viewport is wide or narrow — not just for whatever aspect ratio a
  // fixed heuristic happened to be tuned against. "Only actually move the
  // camera if this is the first call, or forceReset is true" — routine
  // rebuilds update where Reset View goes back to without yanking the
  // camera away from wherever the person has already orbited to; the
  // button itself calls this with forceReset so it always reflects
  // whatever's actually in the scene at the moment it's clicked.
  frameToModel(forceReset = false) {
    // Refreshed here too, not just inside resetView() below — this
    // function computes hFov from camera.aspect itself, so that value
    // needs to be current BEFORE the distance calculation runs, not just
    // by the time resetView() repositions the camera afterward.
    this.resize();
    const box = new this.THREE.Box3().setFromObject(this.modelGroup);
    if (box.isEmpty()) return;
    const isFirst = !this.defaultTarget;
    this.defaultTarget = box.getCenter(new this.THREE.Vector3());
    const size = box.getSize(new this.THREE.Vector3());
    const radius = size.length() / 2;
    const vFov = (this.camera.fov * Math.PI) / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * this.camera.aspect);
    const margin = 1.4;
    const distForV = radius / Math.sin(vFov / 2);
    const distForH = radius / Math.sin(hFov / 2);
    this.defaultDistance = Math.max(distForV, distForH) * margin;
    if (isFirst || forceReset) this.resetView();
  }

  resetView() {
    if (!this.defaultTarget) return;
    // Refreshes the renderer size and camera aspect ratio from the host
    // element's CURRENT dimensions before framing, rather than trusting
    // whatever the last 'resize' event happened to capture. That event
    // only fires on window resize, and a fullscreen transition can
    // plausibly fire it mid-transition — before the layout has settled
    // into its final size — leaving camera.aspect set from a transient,
    // wrong intermediate size. Reset View is a deliberate user action
    // that happens well after any such transition has finished, so
    // re-querying live dimensions right here is cheap, always safe, and
    // specifically closes that gap regardless of the exact browser timing
    // quirk behind it.
    this.resize();
    this.controls.target.copy(this.defaultTarget);
    // Top-down view: camera directly above, looking straight down at the
    // tops of the keycaps. This needs camera.up changed to a horizontal
    // vector (Y here) rather than left at this app's normal Z-up (0,0,1):
    // when the viewing direction is nearly parallel to `up` itself — which
    // is exactly what looking straight down means when up is Z — the
    // camera's on-screen orientation becomes essentially undefined/
    // arbitrary rather than predictable, which is why the keyring ended
    // up at the bottom of the screen instead of the top on the first
    // attempt at this (that attempt deliberately left camera.up alone to
    // avoid disrupting manual orbiting afterward, but an undefined
    // top-down orientation isn't an acceptable trade for that). Y is
    // chosen (not -Y) because it's toward the first cap for a vertical
    // layout, which is where a 'top'-side keyring sits by default,
    // putting it at the top of the screen as intended.
    this.camera.up.set(0, 1, 0);
    const dir = new this.THREE.Vector3(0, 0, 1);
    this.camera.position.copy(this.defaultTarget).addScaledVector(dir, this.defaultDistance);
    this.controls.update();
  }

  setModel(object3D) {
    this.modelGroup.clear();
    this.modelGroup.add(object3D);
  }

  _animate() {
    requestAnimationFrame(() => this._animate());
    this.controls.update();
    this._updateScaleBar();
    this.renderer.render(this.scene, this.camera);
  }
}

export function meshToObject3D(THREE, mesh, colorHex, { decal = false } = {}) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(mesh.vertices, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(mesh.normals, 3));
  // addTriangle() never reuses vertices — every triangle gets 3 brand-new
  // ones, even where they're geometrically identical to an existing point.
  // For a legend built from a fine pixel grid, that easily produces more
  // than 65,536 vertices for a single letter, which a 16-bit index buffer
  // (setIndex()'s default when just handed a plain array in some paths)
  // can't address — indices silently wrap, corrupting exactly the
  // connecting regions of a shape while leaving isolated chunks intact.
  // Forcing a 32-bit index buffer whenever the vertex count demands it
  // fixes that regardless of what setIndex() would have inferred on its own.
  const vertexCount = mesh.vertices.length / 3;
  const IndexArray = vertexCount > 65535 ? Uint32Array : Uint16Array;
  geo.setIndex(new THREE.BufferAttribute(new IndexArray(mesh.indices), 1));
  const matOptions = { color: colorHex, roughness: 0.55, metalness: 0.05, side: THREE.DoubleSide };
  if (decal) {
    // For the 'engraved'/flush legend specifically: its top face sits a
    // hair above the cap body's own top face (see keycapBuilder.js's
    // FLUSH_EPSILON) rather than exactly coincident with it, which helps
    // but isn't fully reliable on its own — WebGL's depth buffer loses
    // precision at oblique/grazing viewing angles (looking at the model
    // nearly edge-on), where a fixed world-space gap that was enough
    // head-on stops being enough, and the two surfaces fall back into
    // full Z-fighting — which can look like the legend flickering or
    // disappearing entirely depending which one loses the per-pixel depth
    // tie that frame. polygonOffset is the actual standard fix for two
    // coincident-plane surfaces (the same technique games use for
    // decals): it's a GPU-level, screen-space depth nudge rather than a
    // world-space geometry change, so it stays robust across every
    // viewing angle and zoom level instead of just the ones a fixed
    // epsilon happens to survive.
    matOptions.polygonOffset = true;
    matOptions.polygonOffsetFactor = -4;
    matOptions.polygonOffsetUnits = -4;
  }
  const mat = new THREE.MeshStandardMaterial(matOptions);
  return new THREE.Mesh(geo, mat);
}
