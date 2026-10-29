// Zeronym landing scene: a chrome "zero" ring (the shielded pool) and a field of
// transaction particles that change state as the visitor scrolls.
// Stages: 0 hero stream, 1 public ledger, 2 shield, 3 vaults, 4 disclose, 5 withdraw.
// Public particles are solid dots; shielded particles are hollow squares, so the
// state never depends on colour alone.
import { LAND_B64, LAND_W, LAND_H } from './land-mask';
import {
  ACESFilmicToneMapping, AdditiveBlending, BackSide, BoxGeometry, BufferAttribute, BufferGeometry, Color, DoubleSide, Group, Mesh, MeshBasicMaterial, MeshPhysicalMaterial, OctahedronGeometry, PMREMGenerator, PerspectiveCamera, PlaneGeometry, Points, Quaternion, SRGBColorSpace, Scene, ShaderMaterial, Sphere, TorusGeometry, Vector2, Vector3, WebGLRenderer,
} from 'three';

export type Weights = { stream: number; grid: number; vault: number; exit: number; dim: number; note: number; ringBack: number; cam: number };

const KEYFRAMES: Weights[] = [
  { stream: 1, grid: 0, vault: 0, exit: 0, dim: 0, note: 0, ringBack: 0, cam: 0 }, // hero
  { stream: 0, grid: 1, vault: 0, exit: 0, dim: 0, note: 0, ringBack: 0, cam: 0 }, // 01 public by default: a dotted Earth around the ring
  { stream: 1, grid: 0, vault: 0, exit: 0, dim: 0, note: 0, ringBack: 0, cam: 0 }, // 02 shield
  { stream: 0, grid: 0, vault: 1, exit: 0, dim: 0, note: 0, ringBack: 0, cam: 0 }, // 03 vaults
  { stream: 0, grid: 0, vault: 1, exit: 0, dim: 1, note: 1, ringBack: 0, cam: 0 }, // 04 disclose
  { stream: 1, grid: 0, vault: 0, exit: 1, dim: 0, note: 0, ringBack: 0, cam: 0 }, // 05 withdraw
];

const VERT = /* glsl */ `
  uniform float uTime;
  uniform float uStream;
  uniform float uGrid;
  uniform float uVault;
  uniform float uExit;
  uniform float uDim;
  uniform float uPixelRatio;
  uniform float uSize;
  uniform vec2 uMouse;
  uniform float uLens;
  uniform float uLensR;
  uniform float uAspect;
  uniform vec3 uAxis;
  uniform vec3 uSide;
  attribute vec4 aSeed;
  attribute vec4 aGlobe; // xyz: point on a unit sphere, w: 1 on land, 0 on ocean
  varying float vPriv;
  varying float vAlpha;


  vec3 streamPos(out float priv, out float edge) {
    float speed = 0.035 + 0.03 * aSeed.y;
    float t = fract(aSeed.x + uTime * speed);
    float x = mix(-11.0, 11.0, t);
    float d = abs(x);
    float rMax = mix(1.0, 3.4, smoothstep(0.2, 7.0, d));
    float ang = aSeed.z * 6.2831853 + uTime * 0.15 * (aSeed.w - 0.5);
    float r = rMax * sqrt(aSeed.w);
    float y = cos(ang) * r * 1.22;
    float z = sin(ang) * r;
    priv = smoothstep(-0.25, 0.25, x) * (1.0 - uExit * smoothstep(4.0, 5.2, x));
    edge = smoothstep(11.0, 8.5, d);
    return uAxis * x + vec3(0.0, 1.0, 0.0) * y + uSide * z;
  }

  // Public by default: a slowly turning dotted Earth that wraps around the ring.
  // A sweep of brighter dots passes over the land, like a block explorer scanning it.
  vec3 globePos(out float hi, out float land, out float facing) {
    float a = uTime * 0.12;
    float c = cos(a); float s = sin(a);
    vec3 g = aGlobe.xyz;
    g = vec3(c * g.x + s * g.z, g.y, -s * g.x + c * g.z);
    float ct = 0.9287; float st = 0.3709; // tilt about 22 degrees toward the viewer
    g = vec3(g.x, ct * g.y - st * g.z, st * g.y + ct * g.z);
    land = aGlobe.w;
    facing = g.z;
    float lon = atan(aGlobe.x, aGlobe.z);
    float d = mod(lon - uTime * 0.7 + 3.14159265, 6.2831853) - 3.14159265;
    hi = land * exp(-d * d * 10.0);
    return g * 2.95 + vec3(0.0, -0.12, 0.0);
  }

  vec3 vaultPos() {
    float k = floor(aSeed.y * 3.0);
    float a = k * 2.0943951 + uTime * 0.08 + 0.5;
    vec3 c = vec3(cos(a) * 3.6, sin(a) * 2.2, sin(a) * 1.2 - 0.6);
    float u = aSeed.z * 6.2831853 + uTime * (0.25 + aSeed.x * 0.3);
    float v = acos(2.0 * aSeed.w - 1.0);
    float r = 0.8 * pow(aSeed.x, 0.33);
    return c + r * vec3(sin(v) * cos(u), sin(v) * sin(u), cos(v));
  }

  void main() {
    float privS; float edge; float hi; float land; float facing;
    vec3 ps = streamPos(privS, edge);
    vec3 pg = globePos(hi, land, facing);
    vec3 pv = vaultPos();
    vec3 pos = ps * uStream + pg * uGrid + pv * uVault;
    float priv = privS * uStream + uVault;
    float alpha = mix(1.0, edge, uStream);

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;

    // Cursor lens: anything under it is shown shielded, and is nudged aside.
    vec2 ndc = gl_Position.xy / gl_Position.w;
    vec2 dm = (ndc - uMouse) * vec2(uAspect, 1.0);
    float L = length(dm);
    float lens = uLens * (1.0 - smoothstep(uLensR * 0.75, uLensR, L));
    priv = max(priv, lens);
    gl_Position.xy += normalize(dm + 0.0001) / vec2(uAspect, 1.0) * lens * 0.035 * gl_Position.w;

    float globeSize = mix(0.55, 1.0, land) * (1.0 + hi * 0.7);
    float size = uSize * mix(0.85, 1.2, step(0.5, priv)) * (0.65 + aSeed.w * 0.7) * mix(1.0, globeSize, uGrid);
    gl_PointSize = size * uPixelRatio * (10.0 / -mv.z);
    vPriv = priv;
    float globeA = mix(0.16, 0.85 + hi * 0.15, land) * mix(0.32, 1.0, smoothstep(-0.35, 0.25, facing));
    vAlpha = alpha * (1.0 - uDim * 0.72) * mix(1.0, globeA, uGrid);
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  varying float vPriv;
  varying float vAlpha;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float disc = 1.0 - smoothstep(0.32, 0.5, length(uv));
    vec2 q = abs(uv);
    float sq = max(q.x, q.y);
    float box = smoothstep(0.5, 0.42, sq) * smoothstep(0.22, 0.3, sq);
    float isPriv = step(0.5, vPriv);
    float shape = mix(disc, box, isPriv);
    vec3 pub = vec3(0.93, 0.92, 0.96);
    vec3 prv = vec3(0.66, 0.48, 1.0);
    vec3 col = mix(pub, prv, isPriv);
    float a = shape * vAlpha * 0.92;
    if (a < 0.01) discard;
    gl_FragColor = vec4(col, a);
  }
`;


// Shared noise for the portal.
const NOISE = /* glsl */ `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float fbm(vec2 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < 4; i++) { v += a * vnoise(p); p *= 2.03; a *= 0.5; } return v; }
`;

// Portal inside the ring's opening: a swirling vortex with a bright electric edge
// and flickering arcs. Additive, so the particle stream still shows through.
const PORTAL_R = 1.43;
const PORTAL_VERT = /* glsl */ `
  varying vec2 vP;
  void main() { vP = (uv - 0.5) * 2.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const PORTAL_FRAG = /* glsl */ `
  uniform float uTime; uniform float uDim;
  varying vec2 vP;
  ${NOISE}
  void main() {
    float t = uTime;
    float r = length(vP);
    if (r > 1.0) discard;
    float a = atan(vP.y, vP.x);
    // Spiral coordinates: the twist grows towards the centre.
    float tw = a + (1.0 - r) * 3.2 - t * 0.6;
    vec2 sp = vec2(cos(tw), sin(tw)) * r;
    float n1 = fbm(sp * 2.6 + vec2(0.0, t * 0.35));
    float n2 = fbm(sp * 5.2 - vec2(t * 0.5, 0.0));
    float arms = smoothstep(0.42, 0.8, n1) * (0.55 + 0.45 * n2);
    vec3 deep = vec3(0.16, 0.04, 0.42);
    vec3 violet = vec3(0.58, 0.25, 1.0);
    vec3 magenta = vec3(0.85, 0.3, 1.0);
    vec3 hot = vec3(0.9, 0.8, 1.0);
    // Bright edge where the portal meets the chrome, fading into a darker core.
    float edge = smoothstep(0.55, 0.98, r);
    vec3 col = deep * (0.35 + 0.65 * r);
    col += mix(violet, magenta, n2) * arms * (0.35 + 0.9 * r);
    col += violet * pow(edge, 3.0) * 1.1;
    col += hot * pow(edge, 9.0) * 0.9;
    // Electric arcs: thin noisy rings that flicker on and off.
    vec2 dir = vec2(cos(a), sin(a));
    float arcs = 0.0;
    for (int k = 0; k < 2; k++) {
      float fk = float(k);
      float rr = 0.78 + fk * 0.12 + (fbm(dir * 2.4 + vec2(t * 1.9 + fk * 4.0, fk)) - 0.5) * 0.22;
      float w = 0.006 + fk * 0.004;
      float gate = smoothstep(0.45, 0.72, vnoise(dir * 3.0 + vec2(floor(t * 10.0 + fk * 3.0) * 0.41, fk * 5.0)));
      arcs += w / (abs(r - rr) + w) * gate;
    }
    col += hot * arcs * 0.45;
    // A soft glow in the very centre, like light at the far end.
    col += violet * smoothstep(0.35, 0.0, r) * 0.25;
    // Fade out right at the rim so the chrome covers the edge cleanly.
    col *= smoothstep(1.0, 0.94, r) * (1.0 - uDim * 0.4);
    gl_FragColor = vec4(col, 1.0);
  }
`;

function makeEnvironment(renderer: WebGLRenderer) {
  // A dark studio with soft white panels and violet strips, so the chrome shows
  // silver faces with violet edge reflections and no glow around it.
  const env = new Scene();
  env.background = new Color(0x050407);
  env.add(new Mesh(new BoxGeometry(30, 30, 30), new MeshBasicMaterial({ color: 0x131219, side: BackSide })));
  const panel = (w: number, h: number, color: number, intensity: number, pos: [number, number, number]) => {
    const m = new Mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({ color: new Color(color).multiplyScalar(intensity), side: DoubleSide }));
    m.position.set(...pos);
    m.lookAt(0, 0, 0);
    env.add(m);
  };
  panel(14, 5, 0xffffff, 2.2, [0, 12, 2]);
  panel(6, 10, 0xe8e6f0, 1.4, [-12, 2, 6]);
  panel(4, 9, 0xffffff, 1.1, [11, -1, 8]);
  panel(1.2, 14, 0x8b3dff, 3.2, [10, 0, -6]);
  panel(1.0, 14, 0x7a2cff, 2.6, [-9, -2, -8]);
  panel(16, 1.0, 0x9b5cff, 2.0, [0, -11, -3]);
  // Soft fill from behind the camera so faces toward the viewer read as silver.
  panel(18, 7, 0xd8d6e0, 1.0, [0, 1, 15]);
  panel(7, 2.5, 0xffffff, 1.8, [-6, 6, 12]);
  const pmrem = new PMREMGenerator(renderer);
  const tex = pmrem.fromScene(env, 0.02).texture;
  pmrem.dispose();
  return tex;
}

export const vec3 = () => new Vector3();

export type Projected = { x: number; y: number; on: boolean };
export type StreamSeed = { x: number; z: number; w: number; speed: number };

export interface SceneHandle {
  setProgress(stage: number): void;
  setReduced(on: boolean): void;
  weights(): Weights;
  project(local: Vector3): Projected;
  streamPoint(seed: StreamSeed, out: Vector3): { priv: number; vis: number; along: number };
  vaultTop(k: number, out: Vector3): Vector3;
  lens(): { x: number; y: number; r: number; on: number };
  /** Where a stream label is hidden by the portal: its screen x as it crosses the portal, and the ring's right edge at screen y. */
  ringCut(seed: StreamSeed, y: number): { inX: number; outX: number | null };
  destroy(): void;
}

export function createPoolScene(
  canvas: HTMLCanvasElement,
  opts: { reduced: boolean; mobile: boolean; onFrame?: () => void },
): SceneHandle | null {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  } catch {
    return null;
  }

  const N = opts.mobile ? 2400 : 5200;
  const portrait = window.innerHeight > window.innerWidth;
  const dpr = Math.min(window.devicePixelRatio || 1, opts.mobile ? 1.5 : 1.75);
  renderer.setPixelRatio(dpr);
  renderer.setClearColor(0x000000, 1);
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = SRGBColorSpace;

  const scene = new Scene();
  scene.environment = makeEnvironment(renderer);
  const camera = new PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 0, 13);

  const world = new Group();
  scene.add(world);

  // Flow axis: left to right, receding slightly, so the ring is seen at an angle.
  const axis = new Vector3(1, 0, -0.62).normalize();
  const up = new Vector3(0, 1, 0);
  const side = new Vector3().crossVectors(axis, up).normalize();

  const uniformsTime = { value: 0 }; const uniformsDim = { value: 0 };
  // The ring: an oval chrome zero whose opening faces along the flow.
  // A purple portal swirls inside the opening.
  const ringGroup = new Group();
  world.add(ringGroup);
  const ringMat = new MeshPhysicalMaterial({ color: 0xe6e4ee, metalness: 1, roughness: 0.24, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.7 });
  const ring = new Mesh(new TorusGeometry(1.75, 0.36, opts.mobile ? 64 : 96, opts.mobile ? 160 : 256), ringMat);
  ring.scale.set(1, 1.24, 1.15);
  ring.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), axis);
  ringGroup.add(ring);
  const portalMat = new ShaderMaterial({
    vertexShader: PORTAL_VERT, fragmentShader: PORTAL_FRAG,
    uniforms: { uTime: uniformsTime, uDim: uniformsDim },
    transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide,
  });
  const portal = new Mesh(new PlaneGeometry(2 * PORTAL_R, 2 * PORTAL_R), portalMat);
  portal.scale.set(1, 1.24, 1);
  portal.quaternion.copy(ring.quaternion);
  ringGroup.add(portal);

  // The disclosed record: a chrome octahedron that comes forward in stage 04.
  const note = new Mesh(
    new OctahedronGeometry(0.55, 0),
    new MeshPhysicalMaterial({ color: 0xf2f0f8, metalness: 1, roughness: 0.2, clearcoat: 1, flatShading: true, envMapIntensity: 2.6 }),
  );
  note.visible = false;
  world.add(note);

  // Particles.
  const geo = new BufferGeometry();
  const seeds = new Float32Array(N * 4);
  const rand = mulberry32(7);
  for (let i = 0; i < N; i++) {
    seeds[i * 4] = rand(); seeds[i * 4 + 1] = rand(); seeds[i * 4 + 2] = rand(); seeds[i * 4 + 3] = rand();
  }
  geo.setAttribute('position', new BufferAttribute(new Float32Array(N * 3), 3));
  geo.setAttribute('aSeed', new BufferAttribute(seeds, 4));
  geo.setAttribute('aGlobe', new BufferAttribute(globePoints(N), 4));
  geo.boundingSphere = new Sphere(new Vector3(), 40);
  const uniforms = {
    uTime: uniformsTime, uStream: { value: 1 }, uGrid: { value: 0 }, uVault: { value: 0 }, uExit: { value: 0 }, uDim: uniformsDim,
    uPixelRatio: { value: dpr }, uSize: { value: opts.mobile && portrait ? 8.5 : 6.2 },
    uMouse: { value: new Vector2(9, 9) }, uLens: { value: 0 }, uLensR: { value: 0.2 }, uAspect: { value: 1 },
    uAxis: { value: axis }, uSide: { value: side },
  };
  const mat = new ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG, uniforms, transparent: true, depthWrite: false,
  });
  world.add(new Points(geo, mat));

  let target = 0; let current = 0; let reduced = opts.reduced;
  let w: Weights = { ...KEYFRAMES[0] };
  const mouse = new Vector2(9, 9); const tilt = new Vector2(0, 0); const tiltSmooth = new Vector2(0, 0);
  let mousePx = { x: -999, y: -999 };
  let hasPointer = false; let lens = 0; let lift = 0.9; let baseZ = 13;
  // Stream position for a seed at distance x along the flow.
  const streamAt = (s: StreamSeed, x: number, out: Vector3) => {
    const rMax = lerp(1.0, 3.4, smooth(0.2, 7, Math.abs(x)));
    const ang = s.z * Math.PI * 2;
    const r = rMax * Math.sqrt(s.w);
    return out.copy(axis).multiplyScalar(x).addScaledVector(up, Math.cos(ang) * r * 1.22).addScaledVector(side, Math.sin(ang) * r);
  };
  // The ring's outline on screen (convex hull of points on its surface), rebuilt at most once a frame.
  let frameNo = 0; let outlineFrame = -1;
  let outline: { x: number; y: number }[] = [];
  const cutP = new Vector3(); const rp = new Vector3();
  const buildOutline = () => {
    ring.updateWorldMatrix(true, false);
    const R = 1.75, T = 0.36; const pts: { x: number; y: number }[] = [];
    for (let i = 0; i < 64; i++) {
      const u = (i / 64) * Math.PI * 2;
      for (let j = 0; j < 8; j++) {
        const v = (j / 8) * Math.PI * 2;
        rp.set(Math.cos(u) * (R + T * Math.cos(v)), Math.sin(u) * (R + T * Math.cos(v)), T * Math.sin(v));
        ring.localToWorld(rp); rp.project(camera);
        pts.push({ x: (rp.x * 0.5 + 0.5) * canvas.clientWidth, y: (-rp.y * 0.5 + 0.5) * canvas.clientHeight });
      }
    }
    pts.sort((a, b) => a.x - b.x || a.y - b.y);
    const cross = (o: any, a: any, b: any) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    const lo: any[] = []; const hi: any[] = [];
    for (const p of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); }
    outline = lo.slice(0, -1).concat(hi.slice(0, -1));
  };
  const tmp = new Vector3(); const tmpQ = new Quaternion(); const Z = new Vector3(0, 0, 1); const ZERO = new Vector2(0, 0);

  const onPointer = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    mousePx = { x: e.clientX - r.left, y: e.clientY - r.top };
    mouse.set((mousePx.x / r.width) * 2 - 1, -(mousePx.y / r.height) * 2 + 1);
    tilt.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    hasPointer = e.pointerType === 'mouse';
  };
  const onLeave = () => { hasPointer = false; };
  window.addEventListener('pointermove', onPointer, { passive: true });
  document.documentElement.addEventListener('pointerleave', onLeave);

  const weightsAt = (s: number): Weights => {
    const k = Math.max(0, Math.min(KEYFRAMES.length - 1, s));
    const a = Math.floor(k); const b = Math.min(KEYFRAMES.length - 1, a + 1);
    const t = easeInOut(k - a);
    const A = KEYFRAMES[a]; const B = KEYFRAMES[b];
    const o = {} as Weights;
    (Object.keys(A) as (keyof Weights)[]).forEach((key) => { o[key] = lerp(A[key], B[key], t); });
    return o;
  };

  function frame(dt: number) {
    frameNo++;
    if (!reduced) time += dt;
    const step = dt || 1;
    current = reduced ? target : lerp(current, target, 1 - Math.pow(0.004, step));
    w = weightsAt(current);
    const t = reduced ? 14 : time;
    uniforms.uTime.value = t;
    uniforms.uStream.value = w.stream; uniforms.uGrid.value = w.grid; uniforms.uVault.value = w.vault;
    uniforms.uExit.value = w.exit; uniforms.uDim.value = w.dim;

    tiltSmooth.lerp(reduced ? ZERO : tilt, 1 - Math.pow(0.02, step));
    world.rotation.y = tiltSmooth.x * 0.2;
    world.rotation.x = -tiltSmooth.y * 0.1;
    // The hero lifts the pool above its headline; in the story it eases back to the exact centre.
    const liftNow = lift * (1 - Math.min(1, Math.max(0, current)));
    world.position.y = liftNow;

    lens = lerp(lens, hasPointer && !reduced ? 1 : 0, 1 - Math.pow(0.004, step));
    uniforms.uLens.value = lens;
    uniforms.uMouse.value.copy(mouse);

    camera.position.set(0, w.cam * 3.2, baseZ - w.note * 0.8);
    // The world is lifted above the view centre so captions and headlines have room below it.
    camera.lookAt(0, w.cam * (liftNow - 1.4), 0);

    ringGroup.rotation.z = Math.sin(t * 0.25) * 0.06;
    const back = w.ringBack;
    ringGroup.position.set(0, back * 0.1, -6 * back);
    ringGroup.scale.setScalar(1 - 0.3 * back);

    note.visible = w.note > 0.01;
    if (note.visible) {
      const k = easeInOut(w.note);
      note.position.set(lerp(3.2, 0, k), lerp(1.4, 0.1, k), lerp(-0.6, 2.6, k));
      note.rotation.set(0.5 + t * 0.35, t * 0.6, 0.3);
      note.scale.setScalar(lerp(0.2, 1, k));
    }

    renderer.render(scene, camera);
    opts.onFrame?.();
  }

  const resize = () => {
    const width = canvas.clientWidth; const height = canvas.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // Keep the flow in frame on tall phone screens.
    camera.fov = camera.aspect < 0.8 ? 52 : 38;
    baseZ = camera.aspect < 0.8 ? 21 : camera.aspect < 1.25 ? 15.5 : 13.6;
    lift = camera.aspect < 0.8 ? 3.3 : camera.aspect < 1.25 ? 1.3 : 1.15;
    uniforms.uAspect.value = camera.aspect;
    camera.updateProjectionMatrix();
    if (reduced) frame(0);
  };

  let running = true; let visible = true; let raf = 0; let last = performance.now(); let time = 0;
  function loop() {
    cancelAnimationFrame(raf);
    if (!running || !visible || document.hidden) return;
    raf = requestAnimationFrame((now) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      frame(dt);
      if (!reduced) loop();
    });
  }

  const ro = new ResizeObserver(resize); ro.observe(canvas);
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) { last = performance.now(); loop(); } }, { threshold: 0 });
  io.observe(canvas);
  const onVis = () => { if (!document.hidden) { last = performance.now(); loop(); } };
  document.addEventListener('visibilitychange', onVis);
  resize();
  loop();

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault(); running = false;
    canvas.dispatchEvent(new CustomEvent('zeronym:lost', { bubbles: true }));
  });

  return {
    setProgress(s: number) { target = s; if (reduced) frame(0); },
    setReduced(on: boolean) { reduced = on; last = performance.now(); if (on) frame(0); else loop(); },
    weights: () => w,
    project(local: Vector3) {
      tmp.copy(local);
      world.localToWorld(tmp);
      tmp.project(camera);
      return { x: (tmp.x * 0.5 + 0.5) * canvas.clientWidth, y: (-tmp.y * 0.5 + 0.5) * canvas.clientHeight, on: tmp.z < 1 && tmp.z > -1 };
    },
    streamPoint(s: StreamSeed, out: Vector3) {
      const tt = (s.x + (reduced ? 14 : time) * s.speed) % 1;
      const x = -11 + 22 * tt;
      const d = Math.abs(x);
      streamAt(s, x, out);
      const priv = smooth(-0.25, 0.25, x) * (1 - w.exit * smooth(4.0, 5.2, x));
      return { priv, vis: smooth(10.5, 7.5, d) * w.stream, along: x };
    },
    // A point just above vault cluster k, for its label.
    vaultTop(k: number, out: Vector3) {
      const a = k * 2.0943951 + (reduced ? 14 : time) * 0.08 + 0.5;
      return out.set(Math.cos(a) * 3.6, Math.sin(a) * 2.2 + 1.25, Math.sin(a) * 1.2 - 0.6);
    },
    ringCut(s: StreamSeed, y: number) {
      streamAt(s, 0, cutP);
      const inX = this.project(cutP).x;
      if (outlineFrame !== frameNo) { outlineFrame = frameNo; buildOutline(); }
      // Right edge of the ring's screen outline along the row y.
      let outX: number | null = null;
      for (let i = 0; i < outline.length; i++) {
        const a = outline[i]; const b = outline[(i + 1) % outline.length];
        if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) {
          const x = a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x);
          if (outX === null || x > outX) outX = x;
        }
      }
      return { inX, outX };
    },
    lens() {
      return { x: mousePx.x, y: mousePx.y, r: uniforms.uLensR.value * 0.88 * canvas.clientHeight * 0.5, on: lens };
    },
    destroy() {
      running = false; cancelAnimationFrame(raf); ro.disconnect(); io.disconnect();
      window.removeEventListener('pointermove', onPointer);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      document.removeEventListener('visibilitychange', onVis);
      renderer.dispose(); geo.dispose(); mat.dispose(); ringMat.dispose(); portalMat.dispose();
    },
  };
}

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function smooth(e0: number, e1: number, x: number) { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); }
function easeInOut(t: number) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Even points on a sphere (Fibonacci spiral), mostly on land so the continents read
// clearly, with a sparse scatter over the oceans.
function globePoints(n: number) {
  const bits = Uint8Array.from(atob(LAND_B64), (c) => c.charCodeAt(0));
  const isLand = (lat: number, lon: number) => {
    const x = Math.min(LAND_W - 1, Math.floor(((lon + 180) / 360) * LAND_W));
    const y = Math.min(LAND_H - 1, Math.floor(((90 - lat) / 180) * LAND_H));
    const i = y * LAND_W + x;
    return (bits[i >> 3] >> (i & 7)) & 1;
  };
  const landWanted = Math.round(n * 0.8);
  const k = Math.ceil(landWanted / 0.27);
  const landPts: number[][] = []; const seaPts: number[][] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < k; i++) {
    const y = 1 - (2 * (i + 0.5)) / k;
    const r = Math.sqrt(1 - y * y);
    const phi = i * golden;
    const x = Math.cos(phi) * r; const z = Math.sin(phi) * r;
    const lat = (Math.asin(y) * 180) / Math.PI;
    const lon = (Math.atan2(x, z) * 180) / Math.PI;
    (isLand(lat, lon) ? landPts : seaPts).push([x, y, z]);
  }
  const pick = (arr: number[][], m: number) => Array.from({ length: m }, (_, j) => arr[Math.floor((j * arr.length) / m)]);
  const chosen = [...pick(landPts, Math.min(landWanted, landPts.length)).map((p) => [...p, 1]), ...pick(seaPts, n - Math.min(landWanted, landPts.length)).map((p) => [...p, 0])];
  const out = new Float32Array(n * 4);
  // Shuffle so the globe-to-stream morph mixes land and ocean dots.
  const rand = mulberry32(11);
  for (let i = chosen.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [chosen[i], chosen[j]] = [chosen[j], chosen[i]]; }
  chosen.forEach((p, i) => out.set(p, i * 4));
  return out;
}
