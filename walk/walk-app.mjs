// walk-app.mjs — the walkable-grove renderer (phase 6, docs/05 G5), shared by
// the prototype page (prototypes/grove-walk/) and every grove repo's own walk
// page (grove/template/walk/ — vendored byte-identically, drift-guarded).
//
// The app owns its UI (it injects CSS + panels into the page) so host pages
// stay thin shells: provide an import map for three.js, load the planting log
// + grove.yml (or build a mock story), then call startGroveWalk().
//
// Impostor LOD: every member renders as glowing crown puffs on an instanced
// trunk — derived from its published tree.json when fetchable (leaf clusters,
// sector hues + recency, blossoms, real height), synthesized from a seeded
// spec otherwise. All crowns draw as ONE instanced billboard mesh.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const V3 = (...a) => new THREE.Vector3(...a);

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function strHash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

// grove.yml is deliberately flat — no YAML library needed
export function parseGroveYml(text) {
  const cfg = {};
  for (const raw of String(text).split('\n')) {
    const line = raw.replace(/\s+#.*$/, '').trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^([A-Za-z][A-Za-z0-9]*):\s*(.+)$/);
    if (!m) continue;
    const v = m[2].trim().replace(/^["']|["']$/g, '');
    cfg[m[1]] = v !== '' && !isNaN(Number(v)) ? Number(v) : v;
  }
  return cfg;
}

// Fetch a real grove: its grove.yml + plantings.jsonl live at `base` (a repo's
// raw-content root, a Pages root, or a relative path when served together).
export async function loadGrove(base, parsePlantings) {
  const root = String(base).replace(/\/+$/, '');
  const [cfgRes, logRes] = await Promise.all([
    fetch(root + '/grove.yml', { cache: 'no-cache' }),
    fetch(root + '/plantings.jsonl', { cache: 'no-cache' }),
  ]);
  if (!cfgRes.ok) throw new Error(`HTTP ${cfgRes.status} fetching ${root}/grove.yml`);
  if (!logRes.ok) throw new Error(`HTTP ${logRes.status} fetching ${root}/plantings.jsonl`);
  const config = parseGroveYml(await cfgRes.text());
  return { config, events: parsePlantings(await logRes.text()) };
}

// the tree taxonomy's nine sector hues (docs/03) — synthetic impostors draw from these
export const HUES = [0xffb54d, 0xff6f91, 0xff4d6d, 0x7bd88f, 0x4fd8c4, 0x3fa7ff, 0xb28dff, 0x8f7bff, 0x5aa0e6];

// impostor from a member's REAL tree.json: bounds + sector hues (docs/05 G5)
export function specFromTreeJson(T) {
  const S = T.sectors;
  const clusters = T.leafClusters.map(c => ({
    pos: [c.center[0], c.center[1], c.center[2]],
    r: c.radius * 1.5,
    hue: S[c.sector].hue,
    glow: 0.85 + (S[c.sector].recent || 0) * 0.9,
  }));
  const height = Math.max(4, ...T.leafClusters.map(c => c.center[1]));
  const blossoms = (T.blossoms || []).map(b => ({ pos: [b.pos[0], b.pos[1], b.pos[2]], hue: b.hue }));
  return { height, clusters, blossoms, real: true };
}

// seeded plausible impostor for members whose tree.json isn't fetchable
export function specSynthetic(id) {
  const R = mulberry32(strHash('impostor|' + id));
  const level = 1 + Math.floor(Math.min(3.999, R() * R() * 6));   // most trees young — honest demographics
  const height = 3.5 + level * 2.4 + R() * 2;
  const crownR = 2.2 + level * 1.1 + R();
  const domHue = HUES[Math.floor(R() * 9)], altHue = HUES[Math.floor(R() * 9)];
  const clusters = [];
  const count = 4 + level * 4 + Math.floor(R() * 7);
  for (let i = 0; i < count; i++) {
    const h = height * (0.38 + 0.62 * R());
    const rr = crownR * (1 - (h / height) * 0.55) * Math.sqrt(R());
    const a = R() * Math.PI * 2;
    clusters.push({
      pos: [Math.cos(a) * rr, h, Math.sin(a) * rr],
      r: 0.8 + R() * 1.3 + level * 0.25,
      hue: R() < 0.72 ? domHue : altHue,
      glow: 0.55 + R() * 0.75,
    });
  }
  const blossoms = [];
  for (let i = 0; i < level - 1; i++) {
    const c = clusters[Math.floor(R() * clusters.length)];
    blossoms.push({ pos: [c.pos[0], c.pos[1] + 0.4, c.pos[2]], hue: 0xffd9ec });
  }
  return { height, clusters, blossoms, real: false };
}

// default "visit this tree" target: derived from the member's published URL —
// a real planting always carries one (ceremony rule) and its owner is verified
// there. A bare owner/repo-SHAPED id alone is deliberately NOT enough evidence:
// synthetic/mock ids match that shape and would produce broken links.
function defaultVisitLink(member) {
  const u = String(member.url || '');
  let m = u.match(/^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\//);
  if (m) return `https://github.com/${m[1]}/${m[2]}`;
  m = u.match(/^https:\/\/([\w-]+)\.github\.io\/([^/]+)\//);
  if (m) return `https://github.com/${m[1]}/${m[2]}`;
  return null;
}

const UI_CSS = /* css */`
  html, body { margin: 0; height: 100%; overflow: hidden; background: #05070d; font-family: "Segoe UI", system-ui, sans-serif; }
  #app { position: fixed; inset: 0; }
  .panel {
    position: fixed; color: #cfd8e3; background: rgba(10, 16, 28, 0.55);
    border: 1px solid rgba(140, 170, 210, 0.18); border-radius: 12px;
    backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
    padding: 14px 16px; font-size: 13px; line-height: 1.5; user-select: none;
  }
  body.nohud .panel { display: none; }
  #hud { top: 16px; left: 16px; max-width: 300px; }
  #hud h1 { font-size: 15px; margin: 0 0 2px; font-weight: 600; color: #eef4fb; }
  #hud .sub { color: #8fa3ba; font-size: 11.5px; margin-bottom: 8px; }
  #hud p { margin: 6px 0 8px; font-size: 12px; color: #9fb2c8; }
  #controls { display: flex; gap: 8px; flex-wrap: wrap; }
  #hud button {
    all: unset; cursor: pointer; padding: 7px 14px; border-radius: 8px; font-size: 12.5px;
    color: #eaf2fb; background: rgba(90, 140, 220, 0.22); border: 1px solid rgba(140, 180, 240, 0.35);
    transition: background 0.2s;
  }
  #hud button:hover { background: rgba(110, 160, 240, 0.38); }
  #hud button:focus-visible { outline: 2px solid rgba(150, 190, 250, 0.75); outline-offset: 2px; }
  #hud button[aria-pressed="true"] { background: rgba(120, 170, 240, 0.42); color: #fff; border-color: rgba(160, 195, 250, 0.6); }
  #note { bottom: 14px; right: 16px; font-size: 11px; color: #7f93aa; padding: 8px 12px; }
  #detail { top: 16px; right: 16px; max-width: 280px; display: none; }
  #detail.on { display: block; }
  #detail h2 { font-size: 13.5px; margin: 0 0 6px; font-weight: 600; color: #eef4fb; padding-right: 18px; }
  #detail .meta { color: #9fb2c8; font-size: 11.5px; margin: 3px 0; }
  #detail a { color: #86b7ff; text-decoration: none; }
  #detail a:hover { text-decoration: underline; }
  #detail .x { position: absolute; top: 8px; right: 10px; cursor: pointer; color: #8fa3ba; font-size: 16px; line-height: 1; padding: 2px 4px; border-radius: 5px; background: none; border: none; }
  #detail .x:hover { color: #eaf2fb; background: rgba(120, 160, 230, 0.2); }
`;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Start the walk. Required: placeGrove (from place.mjs), config + events (a
// loaded grove, or a mock story). Optional: title/subtitle/blurb/note strings,
// visitLink(member) -> href|null, specs (pre-built Map for special members).
export async function startGroveWalk({ placeGrove, config, events, title, subtitle, blurb, note, visitLink, specs: presetSpecs }) {
  const PARAMS = new URLSearchParams(location.search);
  if (PARAMS.get('hud') === '0') document.body.classList.add('nohud');
  const linkFor = visitLink || defaultVisitLink;

  // ---------- UI ----------
  const style = document.createElement('style');
  style.textContent = UI_CSS;
  document.head.appendChild(style);
  document.body.insertAdjacentHTML('beforeend', `
    <div id="app"></div>
    <div class="panel" id="hud">
      <h1>${esc(title || 'The grove — walk')}</h1>
      <div class="sub">${esc(subtitle || 'a shared forest of AI learning trees')}</div>
      <p>${blurb || '<b>Drag</b> to look, <b>WASD / arrows</b> to walk, <b>wheel</b> to glide, click a tree to meet its grower.'}</p>
      <div id="controls">
        <button id="strollBtn" aria-pressed="true" title="Auto-walk a loop through the clearings">🚶 Stroll</button>
        <button id="homeBtn" title="Back to the grove's edge">⌂ Edge</button>
      </div>
    </div>
    <div class="panel" id="detail">
      <button type="button" class="x" id="detailClose" aria-label="Close">×</button>
      <h2 id="detailTitle"></h2>
      <div id="detailBody"></div>
    </div>
    <div class="panel" id="note">${esc(note || 'impostor LOD — visit a tree to see it in full')}</div>
  `);

  // ---------- placement + impostor specs ----------
  const GROVE = placeGrove(events, config);
  const ALIVE = GROVE.trees.filter(t => t.state === 'alive');
  const STUMPS = GROVE.trees.filter(t => t.state === 'stump');
  const specs = new Map(ALIVE.map(t => [t.tree, (presetSpecs && presetSpecs.get(t.tree)) || specSynthetic(t.tree)]));
  await Promise.allSettled(ALIVE.filter(t => t.url && !(presetSpecs && presetSpecs.has(t.tree))).map(async (t) => {
    const res = await fetch(t.url, { cache: 'no-cache' });
    if (res.ok) specs.set(t.tree, specFromTreeJson(await res.json()));
  }));

  // ---------- scene ----------
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05070d);
  scene.fog = new THREE.FogExp2(0x05070d, 0.0035);
  const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 2400);
  const EYE = 4.2;

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(innerWidth, innerHeight);
  const dprParsed = parseFloat(PARAMS.get('dpr'));
  const dprExplicit = Number.isFinite(dprParsed) && dprParsed > 0;
  renderer.setPixelRatio(Math.min(devicePixelRatio, dprExplicit ? dprParsed : 2));
  document.getElementById('app').appendChild(renderer.domElement);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.75, 0.6, 0.62));
  composer.addPass(new OutputPass());

  const U = { uTime: { value: 0 } };

  // ground + clearings
  {
    const groundR = Math.max(...GROVE.clearings.map(c => Math.hypot(c.center[0], c.center[1]) + c.reservedRadius)) + 400;
    const ground = new THREE.Mesh(new THREE.CircleGeometry(groundR, 64), new THREE.MeshBasicMaterial({ color: 0x070d0b }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.05;
    scene.add(ground);
  }
  function labelSprite(text, scale = 1) {
    const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 192;
    const ctx = cv.getContext('2d');
    ctx.font = '500 64px "Segoe UI", sans-serif';
    ctx.fillStyle = '#bcd2e8'; ctx.globalAlpha = 0.85;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 512, 96);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, opacity: 0.75, depthWrite: false }));
    sp.scale.set(36 * scale, 6.75 * scale, 1);
    return sp;
  }
  for (const c of GROVE.clearings) {
    if (!c.plots && c.id !== 'commons') continue;
    const moss = new THREE.Mesh(
      new THREE.CircleGeometry(c.reservedRadius, 72),
      new THREE.MeshBasicMaterial({ color: 0x14241c, transparent: true, opacity: 0.55, depthWrite: false })
    );
    moss.rotation.x = -Math.PI / 2; moss.position.set(c.center[0], -0.02, c.center[1]);
    scene.add(moss);
    const rim = new THREE.Mesh(
      new THREE.RingGeometry(c.reservedRadius - 1.2, c.reservedRadius, 96),
      new THREE.MeshBasicMaterial({ color: 0x3c5a4a, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false })
    );
    rim.rotation.x = -Math.PI / 2; rim.position.set(c.center[0], 0.01, c.center[1]);
    scene.add(rim);
    const plate = labelSprite(c.label, c.id === 'commons' ? 1.5 : 1.1);
    plate.position.set(c.center[0], 26, c.center[1]);
    scene.add(plate);
  }

  // trunks — one InstancedMesh for the whole forest
  if (ALIVE.length) {
    const geo = new THREE.CylinderGeometry(0.55, 1.1, 1, 7, 1);
    geo.translate(0, 0.5, 0);
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0x2a211a }), ALIVE.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = V3(), p = V3();
    ALIVE.forEach((t, i) => {
      const spec = specs.get(t.tree);
      const R = mulberry32(strHash('tilt|' + t.tree));
      q.setFromEuler(new THREE.Euler((R() - 0.5) * 0.09, R() * Math.PI * 2, (R() - 0.5) * 0.09));
      p.set(t.pos[0], 0, t.pos[1]);
      s.set(0.5 + spec.height * 0.05, spec.height * 0.72, 0.5 + spec.height * 0.05);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
    });
    scene.add(mesh);
  }

  // crowns — every cluster of every tree in ONE instanced billboard draw
  {
    const puffs = [];
    for (const t of ALIVE) for (const c of specs.get(t.tree).clusters) puffs.push({ t, c });
    if (puffs.length) {
      const geo = new THREE.InstancedBufferGeometry();
      const quad = new THREE.PlaneGeometry(1, 1);
      geo.index = quad.index; geo.attributes.position = quad.attributes.position; geo.attributes.uv = quad.attributes.uv;
      const nP = puffs.length;
      const off = new Float32Array(nP * 3), col = new Float32Array(nP * 3), size = new Float32Array(nP), ph = new Float32Array(nP);
      const ccol = new THREE.Color();
      puffs.forEach((pf, i) => {
        off.set([pf.t.pos[0] + pf.c.pos[0], pf.c.pos[1], pf.t.pos[1] + pf.c.pos[2]], i * 3);
        ccol.set(pf.c.hue).multiplyScalar(pf.c.glow);
        col.set([ccol.r, ccol.g, ccol.b], i * 3);
        size[i] = pf.c.r * 2.1;
        ph[i] = (strHash(pf.t.tree) % 628) / 100 + i * 0.37;
      });
      geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(off, 3));
      geo.setAttribute('aColor', new THREE.InstancedBufferAttribute(col, 3));
      geo.setAttribute('aSize', new THREE.InstancedBufferAttribute(size, 1));
      geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(ph, 1));
      const mat = new THREE.ShaderMaterial({
        uniforms: { ...U, uCamRight: { value: V3(1, 0, 0) }, uCamUp: { value: V3(0, 1, 0) } },
        transparent: true, depthWrite: false,
        vertexShader: /* glsl */`
          attribute vec3 aOffset, aColor; attribute float aSize, aPhase;
          uniform vec3 uCamRight, uCamUp; uniform float uTime;
          varying vec3 vColor; varying vec2 vUv; varying float vTw;
          void main() {
            vec3 sway = vec3(sin(uTime * 0.7 + aPhase), 0.0, cos(uTime * 0.6 + aPhase)) * 0.12;
            vec3 world = aOffset + sway + (uCamRight * position.x + uCamUp * position.y) * aSize;
            vColor = aColor; vUv = uv; vTw = aPhase;
            gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
          }`,
        fragmentShader: /* glsl */`
          varying vec3 vColor; varying vec2 vUv; varying float vTw;
          uniform float uTime;
          void main() {
            float d = length(vUv - 0.5);
            float a = smoothstep(0.5, 0.12, d);
            if (a < 0.02) discard;
            float tw = 0.82 + 0.22 * sin(uTime * 1.1 + vTw * 3.0);
            gl_FragColor = vec4(vColor * tw, a * 0.6);
          }`,
      });
      const crowns = new THREE.Mesh(geo, mat);
      crowns.frustumCulled = false;
      scene.add(crowns);
      crowns.onBeforeRender = (r, sc, cam) => {
        const e = cam.matrixWorld.elements;
        mat.uniforms.uCamRight.value.set(e[0], e[1], e[2]);
        mat.uniforms.uCamUp.value.set(e[4], e[5], e[6]);
      };
    }
  }

  // blossom sparks + stumps + ambient fireflies
  {
    const sparks = [];
    for (const t of ALIVE) for (const b of specs.get(t.tree).blossoms) sparks.push({ t, b });
    if (sparks.length) {
      const pos = new Float32Array(sparks.length * 3), col = new Float32Array(sparks.length * 3);
      const c = new THREE.Color();
      sparks.forEach((s, i) => {
        pos.set([s.t.pos[0] + s.b.pos[0], s.b.pos[1], s.t.pos[1] + s.b.pos[2]], i * 3);
        c.set(s.b.hue).lerp(new THREE.Color(0xfff0f6), 0.6).multiplyScalar(2.2);
        col.set([c.r, c.g, c.b], i * 3);
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 3.4, vertexColors: true, transparent: true, opacity: 0.95, sizeAttenuation: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      pts.frustumCulled = false;
      scene.add(pts);
    }
    for (const s of STUMPS) { // the grove remembers, honestly but kindly
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.9, 1.5, 24),
        new THREE.MeshBasicMaterial({ color: 0x8a745a, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false })
      );
      ring.rotation.x = -Math.PI / 2; ring.position.set(s.pos[0], 0.03, s.pos[1]);
      scene.add(ring);
    }
    const FN = 260, R = mulberry32(20260714);
    const span = GROVE.config.coarsePitch * 1.6;
    const pos = new Float32Array(FN * 3), ph2 = new Float32Array(FN);
    for (let i = 0; i < FN; i++) { pos.set([(R() - 0.5) * 2 * span, 1.5 + R() * 9, (R() - 0.5) * 2 * span], i * 3); ph2[i] = R() * 6.28; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aPhase', new THREE.BufferAttribute(ph2, 1));
    const m2 = new THREE.ShaderMaterial({
      uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */`
        attribute float aPhase; uniform float uTime; varying float vA;
        void main() {
          vec3 p = position + vec3(sin(uTime * 0.5 + aPhase) * 1.4, sin(uTime * 0.4 + aPhase * 2.1) * 0.8, cos(uTime * 0.45 + aPhase) * 1.4);
          vA = 0.4 + 0.6 * sin(uTime * 1.8 + aPhase * 3.7);
          vec4 mv = viewMatrix * vec4(p, 1.0);
          gl_PointSize = 60.0 / max(1.0, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        varying float vA;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          gl_FragColor = vec4(1.0, 0.98, 0.85, smoothstep(0.5, 0.05, d) * vA * 0.5);
        }`,
    });
    const ff = new THREE.Points(g, m2);
    ff.frustumCulled = false;
    scene.add(ff);
  }

  // ---------- the walk: drag to look, WASD to move, wheel to glide ----------
  let yaw = 0, pitch = -0.04;
  const camPos = V3(0, EYE, 0);
  const keys = new Set();
  const homePose = () => {
    const commons = GROVE.clearings.find(c => c.id === 'commons');
    const edge = commons.reservedRadius + 30;
    camPos.set(commons.center[0] + edge * 0.7, EYE, commons.center[1] + edge * 0.7);
    yaw = Math.atan2(camPos.x - commons.center[0], camPos.z - commons.center[1]); pitch = -0.02;
  };
  homePose();
  addEventListener('keydown', e => { keys.add(e.code); if (!e.code.startsWith('F')) cancelStroll(); });
  addEventListener('keyup', e => keys.delete(e.code));
  const dom = renderer.domElement;
  let dragging = false, lx = 0, ly = 0, downT = 0, moved = 0;
  dom.addEventListener('pointerdown', e => { dragging = true; lx = e.clientX; ly = e.clientY; downT = performance.now(); moved = 0; dom.setPointerCapture(e.pointerId); });
  dom.addEventListener('pointermove', e => {
    if (!dragging) return;
    const dx = e.clientX - lx, dy = e.clientY - ly;
    moved += Math.abs(dx) + Math.abs(dy);
    if (moved > 4) cancelStroll();
    yaw -= dx * 0.0035; pitch = Math.max(-1.2, Math.min(0.9, pitch - dy * 0.0032));
    lx = e.clientX; ly = e.clientY;
  });
  dom.addEventListener('pointerup', e => {
    dragging = false;
    if (moved <= 5 && performance.now() - downT < 260) pick(e.clientX, e.clientY);
  });
  let glide = 0;
  dom.addEventListener('wheel', e => { glide += e.deltaY * -0.02; cancelStroll(); }, { passive: true });

  // stroll mode: wander among each clearing's trees; FLY the meadow between them
  const strollBtn = document.getElementById('strollBtn');
  const strollPath = (() => {
    const pts = [];
    const commons = GROVE.clearings.find(c => c.id === 'commons');
    const rOcc = (c) => GROVE.config.plotPitch * Math.sqrt(Math.max(4, c.plots)) * 0.7; // where the trees actually are
    for (const a of [0.4, 2.0, 3.6]) {
      pts.push(V3(commons.center[0] + Math.cos(a) * rOcc(commons) * 0.55, EYE, commons.center[1] + Math.sin(a) * rOcc(commons) * 0.55));
    }
    for (const c of GROVE.clearings) {
      if (c.id === 'commons' || !c.plots) continue;
      pts.push(V3((commons.center[0] + c.center[0]) / 2, 85, (commons.center[1] + c.center[1]) / 2)); // the flight
      pts.push(V3(c.center[0] + rOcc(c) * 0.5, EYE, c.center[1]));                                    // the landing
      pts.push(V3(c.center[0] - rOcc(c) * 0.35, EYE, c.center[1] + rOcc(c) * 0.5));
    }
    pts.push(V3(commons.center[0], 85, commons.center[1] - commons.reservedRadius * 0.8));
    return new THREE.CatmullRomCurve3(pts, true, 'centripetal', 0.6);
  })();
  let stroll = PARAMS.get('stroll') !== '0';
  let strollT = 0;
  const STROLL_LOOP = 150; // seconds per full loop — a stroll, not a sprint
  function setStroll(on) { stroll = on; strollBtn.setAttribute('aria-pressed', String(on)); }
  function cancelStroll() { if (stroll) setStroll(false); }
  strollBtn.addEventListener('click', () => setStroll(!stroll));
  document.getElementById('homeBtn').addEventListener('click', () => { cancelStroll(); homePose(); });
  setStroll(stroll);

  // picking: nearest trunk within reach
  const elDetail = document.getElementById('detail'), elTitle = document.getElementById('detailTitle'), elBody = document.getElementById('detailBody');
  document.getElementById('detailClose').addEventListener('click', () => elDetail.classList.remove('on'));
  const _v = new THREE.Vector3();
  function pick(x, y) {
    let best = null, bd = 30 * 30;
    for (const t of ALIVE) {
      const spec = specs.get(t.tree);
      _v.set(t.pos[0], spec.height * 0.55, t.pos[1]).project(camera);
      if (_v.z > 1) continue;
      const sx = (_v.x * 0.5 + 0.5) * innerWidth, sy = (-_v.y * 0.5 + 0.5) * innerHeight;
      const d = (sx - x) * (sx - x) + (sy - y) * (sy - y);
      const dist = Math.hypot(t.pos[0] - camPos.x, t.pos[1] - camPos.z);
      if (d < bd && dist < 220) { bd = d; best = t; }
    }
    if (!best) { elDetail.classList.remove('on'); return null; }
    const spec = specs.get(best.tree);
    elTitle.textContent = `🌳 ${best.tree}`;
    const planted = best.plantedTs ? best.plantedTs.slice(0, 10) : '—';
    const href = linkFor(best);
    const visit = href ? `<div class="meta"><a href="${esc(href)}" target="_blank" rel="noopener">visit this tree →</a></div>` : '';
    elBody.innerHTML =
      `<div class="meta">clearing <b>${esc(best.clearing)}</b> · slot <b>${best.slot}</b> · planted ${esc(planted)}</div>` +
      `<div class="meta">${spec.real ? 'a real tree — impostor built from its published tree.json' : 'impostor synthesized (tree.json not fetchable from here)'}</div>` + visit;
    elDetail.classList.add('on');
    return best.tree;
  }

  // ---------- loop ----------
  const clock = new THREE.Clock();
  let fpsAcc = 0, fpsN = 0;
  function tick() {
    requestAnimationFrame(tick);
    const rawDt = clock.getDelta();
    const dt = Math.min(rawDt, 0.05);
    U.uTime.value += dt;

    if (stroll) {
      strollT = (strollT + dt / STROLL_LOOP) % 1;
      strollPath.getPointAt(strollT, camPos);
      const ahead = strollPath.getPointAt((strollT + 0.012) % 1);
      yaw = Math.atan2(ahead.x - camPos.x, ahead.z - camPos.z) + Math.PI;
      // look gently down while airborne, level out among the trees
      pitch += ((-0.03 - (camPos.y - EYE) * 0.006) - pitch) * (1 - Math.exp(-dt / 0.8));
    } else {
      const speed = (keys.has('ShiftLeft') || keys.has('ShiftRight')) ? 42 : 15;
      const f = V3(-Math.sin(yaw), 0, -Math.cos(yaw)), r = V3(-f.z, 0, f.x);
      let mx = 0, mz = 0;
      if (keys.has('KeyW') || keys.has('ArrowUp')) mz += 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) mz -= 1;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1;
      camPos.addScaledVector(f, (mz * speed + glide) * dt);
      camPos.addScaledVector(r, mx * speed * dt);
      glide *= Math.exp(-dt / 0.4);
      camPos.y = EYE;
    }
    camera.position.copy(camPos);
    camera.rotation.set(0, 0, 0);
    camera.rotateY(yaw); // camera forward = (-sin yaw, -cos yaw): matches the WASD basis above
    camera.rotateX(pitch);

    // adaptive quality (same guard as the mood sketch)
    fpsAcc += rawDt; fpsN++;
    if (fpsAcc >= 2) {
      const fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0;
      const pr = renderer.getPixelRatio();
      if (!dprExplicit && fps < 28 && pr > 0.75) {
        const next = Math.max(0.75, pr - 0.25);
        renderer.setPixelRatio(next); composer.setPixelRatio(next);
        renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
      }
    }
    composer.render();
  }
  tick();

  function syncSize() {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    composer.setSize(innerWidth, innerHeight);
  }
  addEventListener('resize', syncSize);
  new ResizeObserver(syncSize).observe(document.body);

  return {
    grove: GROVE, camera, specs,
    members: ALIVE.length, stumps: STUMPS.length,
    realMembers: ALIVE.filter(t => specs.get(t.tree).real).map(t => t.tree),
    setStroll, pickAt: (x, y) => pick(x, y),
    goTo: (id) => { const t = ALIVE.find(a => a.tree === id); if (t) { cancelStroll(); camPos.set(t.pos[0] + 26, EYE, t.pos[1] + 26); yaw = Math.atan2(camPos.x - t.pos[0], camPos.z - t.pos[1]); } return !!t; },
    state: () => ({ stroll, pos: [+camPos.x.toFixed(1), +camPos.z.toFixed(1)], yaw: +yaw.toFixed(3), panelVisible: elDetail.classList.contains('on'), dpr: renderer.getPixelRatio() }),
  };
}
