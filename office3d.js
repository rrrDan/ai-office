// AI 辦公室：3D 大樓（three.js r170；模型與貼圖皆為本專案自製的程序化幾何與畫布貼圖）
import * as THREE from './vendor/three/three.module.min.js';
import { OrbitControls } from './vendor/three/OrbitControls.js';
import { BOTS, STATUS, botMeta, lookColor, viewStatus } from './feed.js';
import { buildAvatar, tintAvatar, disposeAvatar, usesShape, DEFAULT_SET } from './avatars.js';

const FLOOR_H = 5.0, WALL_H = 2.5, W = 12, D = 8, SLAB = 0.26;  // 樓層錯開堆疊（像剖面模型），從斜上方可看進每一層
const FLOOR_INFO = { 3: '3F・總管室', 2: '2F・工作區', 1: '1F・專案大廳' };
const SEATS = {   // 辦公桌位置 [x, z]
  nori: [0, -0.4], akara: [0.6, -0.2],
  meron: [-3.5, -1.3], yuzu: [3.5, -1.3], goya: [-3.5, 1.7], ichigo: [3.5, 1.7],
};
const EXTRA_SEATS = [[3.6, 1.9], [3.6, -1.6], [-3.4, -2.2]];
// 休息區座位 [x, z, 朝向]（沙發座面中心）
const LOUNGE = {
  nori: [-3.4, 0.55, 0],
  meron: [-0.5, -0.95, 0], yuzu: [0.5, -0.95, 0], goya: [-1.75, 0.7, 0.45], ichigo: [1.75, 0.7, -0.45],
  akara: [-4.1, 0.55, 0],
};
const EXTRA_LOUNGE = [[-3.2, 0.55, 0], [-2.05, 1.5, -0.5], [-2.3, 0.4, -0.3]];
const WALK_MS = 1500;
const AISLE = 3.1, STAIR_X = -6.95, LANE_L = -5.35, LANE_R = 4.75, ELEV_X = 7.15, ELEV_DOOR_X = 5.85, WALK_SPEED = 3.0;
const stairZ = (f) => (f % 2 ? 3.1 : -3.1);   // 1F、3F 樓梯口在前方，2F 在後方（之字形樓梯）
const PAL = {
  slab: 0xf1e6d4, slabEdge: 0x2e2b45, pillar: 0x3b3856, mullion: 0x4a4668,
  desk: 0xf7f1e8, deskLeg: 0x3a3a4a, chair: 0x3d4466, chairSeat: 0x4b5580,
  pot: 0xe9d6c0, leaf: 0x5fae7a, leaf2: 0x7cc48f, skin: 0xffe3cf,
  rug: [0, 0xb59a85, 0x8fa8a0, 0x9e93b8],
};

const floorY = (f) => (f - 1) * FLOOR_H;
const FLOOR_COLOR = { 3: '#ffcf6e', 2: '#5fd4c0', 1: '#7cb6ff', 0: '#c3a6ff' };
const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0.02, flatShading: true, ...extra });
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

function signTexture(text) {
  const c = document.createElement('canvas'); c.width = 640; c.height = 160;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 640, 0); grad.addColorStop(0, '#2b2746'); grad.addColorStop(1, '#3a3158');
  g.fillStyle = grad; g.beginPath(); g.roundRect(6, 6, 628, 148, 36); g.fill();
  g.strokeStyle = 'rgba(255,184,107,.85)'; g.lineWidth = 5; g.stroke();
  g.fillStyle = '#ffd6a3';
  g.font = '700 74px -apple-system, "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 320, 86);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function woodTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#efe3cf'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 ? 'rgba(160,120,80,0.07)' : 'rgba(255,255,255,0.08)'; g.fillRect(0, i * 32, 256, 32);
    g.fillStyle = 'rgba(120,90,60,0.16)'; g.fillRect(0, i * 32, 256, 1.5);
    for (let k = 0; k < 2; k++) { g.fillRect(((i * 97 + k * 131) % 256), i * 32, 1.5, 32); }
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 2); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function blobTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  r.addColorStop(0, 'rgba(20,12,30,0.55)'); r.addColorStop(0.55, 'rgba(20,12,30,0.22)'); r.addColorStop(1, 'rgba(20,12,30,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

export function createOffice(container, overlay, { onSelect, avatarSet = DEFAULT_SET } = {}) {
  let currentSet = avatarSet;
  let running = false, raf = 0, onScreen = true;
  const clock = new THREE.Clock();
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // 沒有顯示卡（軟體算圖，如 SwiftShader / llvmpipe）時降低更新頻率，避免拖慢整個頁面
  let softGL = false, compactTags = false;
  try {
    const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    softGL = /swiftshader|llvmpipe|software|basic render/i.test(String(name));
  } catch { /* 取不到就當一般顯示卡 */ }
  const FRAME_MIN_MS = softGL ? 80 : 0;
  let lastDraw = 0;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x1a1830, 38, 95);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 220);
  const controls = new OrbitControls(camera, renderer.domElement);
  Object.assign(controls, { enableDamping: true, dampingFactor: 0.07, minDistance: 7, maxDistance: 75, rotateSpeed: 0.65, zoomSpeed: 0.9, panSpeed: 0.7, screenSpacePanning: true, maxPolarAngle: Math.PI * 0.485, minPolarAngle: 0.2 });

  // 光線：暖色主光 + 冷色補光 + 每層室內暖燈
  const hemi = new THREE.HemisphereLight(0xffe8d2, 0x2a2442, 1.05); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffd2a6, 2.1);
  sun.position.set(10, 26, 16); sun.castShadow = true;
  Object.assign(sun.shadow.camera, { left: -13, right: 13, top: 15, bottom: -9, near: 2, far: 70 });
  sun.shadow.mapSize.set(1024, 1024); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03; sun.shadow.radius = 4;
  sun.target.position.set(0, 6, 0); scene.add(sun, sun.target);
  const rim = new THREE.DirectionalLight(0x9db4ff, 0.7); rim.position.set(-12, 10, -14); scene.add(rim);

  // 地面廣場
  const ground = new THREE.Mesh(new THREE.CircleGeometry(48, 40), new THREE.MeshStandardMaterial({ color: 0x24223a, roughness: 1 })); const groundMat = ground.material;
  ground.rotation.x = -Math.PI / 2; ground.position.y = -SLAB; ground.receiveShadow = true; scene.add(ground);
  const pad = new THREE.Mesh(new THREE.CircleGeometry(12, 40), new THREE.MeshStandardMaterial({ color: 0x302d4a, roughness: 0.95 })); const padMat = pad.material;
  pad.rotation.x = -Math.PI / 2; pad.position.y = -SLAB + 0.01; pad.receiveShadow = true; scene.add(pad);
  const blob = blobTexture();
  const blobMat = new THREE.MeshBasicMaterial({ map: blob, transparent: true, depthWrite: false });
  const bigBlob = new THREE.Mesh(new THREE.PlaneGeometry(W + 5, D + 5), blobMat); bigBlob.rotation.x = -Math.PI / 2; bigBlob.position.y = -SLAB + 0.02; scene.add(bigBlob);

  // 周邊低多邊形樹
  const treeMat = std(0x4f9a6c), treeMat2 = std(0x3f8460), trunkMat = std(0x6b5444);
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * Math.PI * 2 + 0.3, r = 13 + (i % 3) * 2.2;
    const t = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.9, 5), trunkMat); trunk.position.y = 0.45; t.add(trunk);
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9 + (i % 2) * 0.3, 0), i % 2 ? treeMat : treeMat2); crown.position.y = 1.5; t.add(crown);
    t.position.set(Math.cos(a) * r, -SLAB, Math.sin(a) * r); t.traverse(o => { o.castShadow = true; }); scene.add(t);
  }

  // 大樓
  const slabMat = std(PAL.slab, { map: woodTexture(), flatShading: false, roughness: 0.8 });
  const slabEdgeMat = std(PAL.slabEdge, { roughness: 0.5 });
  const glassMat = new THREE.MeshPhysicalMaterial({ color: 0xbcd4ff, transparent: true, opacity: 0.13, roughness: 0.08, metalness: 0, depthWrite: false, side: THREE.DoubleSide });
  const mullionMat = std(PAL.mullion, { roughness: 0.4 });
  const pillarMat = std(PAL.pillar, { roughness: 0.5 });
  const deskMat = std(PAL.desk, { roughness: 0.55 });
  const legMat = std(PAL.deskLeg, { roughness: 0.4, metalness: 0.3 });
  const chairMat = std(PAL.chair), chairSeatMat = std(PAL.chairSeat);
  const potMat = std(PAL.pot), leafMat = std(PAL.leaf), leaf2Mat = std(PAL.leaf2);
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff1dc, emissive: 0xffd9a8, emissiveIntensity: 1.6 });
  const deskLampMat = new THREE.MeshStandardMaterial({ color: 0xfff3dd, emissive: 0xffc078, emissiveIntensity: 0.2 });
  const floorLights = [];
  const H = WALL_H;

  const add = (mesh, parent = scene, cast = true, recv = true) => { mesh.castShadow = cast; mesh.receiveShadow = recv; parent.add(mesh); return mesh; };
  const box = (w, h, d, mat, x, y, z, parent) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); return add(m, parent); };

  function plant(x, y, z, s = 1) {
    const g = new THREE.Group(); g.position.set(x, y, z); g.scale.setScalar(s);
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.16, 0.42, 7), potMat), g).position.set(0, 0.21, 0);
    const l1 = add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.38, 0), leafMat), g); l1.position.set(0, 0.72, 0);
    const l2 = add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.26, 0), leaf2Mat), g); l2.position.set(0.18, 1.0, 0.06);
    const l3 = add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0), leaf2Mat), g); l3.position.set(-0.17, 0.95, -0.08);
    scene.add(g); return g;
  }
  function shelf(x, y, z, rotY = 0) {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rotY;
    box(1.4, 1.6, 0.36, std(0x5a4a6e), 0, 0.8, 0, g);
    const cols = [0xff9e7a, 0xffd27a, 0x7ac4ff, 0x9be0b4, 0xd7a8ff];
    for (let r = 0; r < 3; r++) for (let i = 0; i < 5; i++) box(0.16, 0.34 - (i % 2) * 0.06, 0.26, std(cols[(i + r) % 5]), -0.5 + i * 0.24, 0.32 + r * 0.5 - (i % 2) * 0.03, 0.05, g);
    scene.add(g);
  }
  function sofa(x, y, z, color, rotY = 0) {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rotY;
    const m = std(color);
    box(1.8, 0.36, 0.8, m, 0, 0.26, 0, g); box(1.8, 0.5, 0.2, m, 0, 0.6, -0.32, g);
    box(0.2, 0.42, 0.8, m, -0.85, 0.45, 0, g); box(0.2, 0.42, 0.8, m, 0.85, 0.45, 0, g);
    const cush = std(new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.25).getHex());
    box(0.78, 0.08, 0.66, cush, -0.4, 0.47, 0.04, g); box(0.78, 0.08, 0.66, cush, 0.4, 0.47, 0.04, g);
    scene.add(g);
  }
  function armchair(x, y, z, color, rotY = 0) {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rotY;
    const m = std(color);
    box(0.9, 0.36, 0.8, m, 0, 0.26, 0, g); box(0.9, 0.5, 0.2, m, 0, 0.6, -0.32, g);
    box(0.16, 0.4, 0.8, m, -0.45, 0.44, 0, g); box(0.16, 0.4, 0.8, m, 0.45, 0.44, 0, g);
    box(0.7, 0.08, 0.64, std(new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.25).getHex()), 0, 0.47, 0.04, g);
    scene.add(g);
  }
  function coffeeTable(x, y, z, r = 0.5) {
    const g = new THREE.Group(); g.position.set(x, y, z);
    add(new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.06, 18), deskMat), g).position.y = 0.42;
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.4, 8), legMat), g).position.y = 0.2;
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.03, 12), legMat), g).position.y = 0.015;
    box(0.08, 0.09, 0.08, std(0xff9e7a), -0.15, 0.5, 0.08, g); box(0.08, 0.09, 0.08, std(0x7ac4ff), 0.18, 0.5, -0.06, g);
    box(0.26, 0.03, 0.18, std(0xffd27a), 0.02, 0.465, 0.18, g);
    scene.add(g);
  }
  function coffeeBar(x, y, z) {
    const g = new THREE.Group(); g.position.set(x, y, z);
    box(1.9, 0.9, 0.55, std(0x6b5a7e), 0, 0.45, 0, g); box(2.0, 0.06, 0.62, deskMat, 0, 0.93, 0, g);
    box(0.42, 0.5, 0.36, std(0x2d2b3d, { metalness: 0.4, roughness: 0.3 }), -0.5, 1.21, -0.02, g);
    box(0.3, 0.06, 0.06, new THREE.MeshStandardMaterial({ color: 0xffc98f, emissive: 0xffa860, emissiveIntensity: 1.2 }), -0.5, 1.36, 0.17, g);
    for (let i = 0; i < 3; i++) box(0.09, 0.1, 0.09, std([0xffffff, 0xff9e7a, 0x9be0b4][i]), 0.15 + i * 0.18, 1.01, 0.05, g);
    add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), leafMat), g).position.set(0.78, 1.12, 0);
    scene.add(g);
  }

  const TOP = floorY(3) + WALL_H;
  for (const [px, pz] of [[-W / 2 + 0.16, -D / 2 + 0.16], [W / 2 - 0.16, -D / 2 + 0.16], [-W / 2 + 0.16, D / 2 - 0.16], [W / 2 - 0.16, D / 2 - 0.16]]) box(0.3, TOP + SLAB, 0.3, pillarMat, px, (TOP - SLAB) / 2, pz);
  for (const z of [-D / 2 + 0.16, D / 2 - 0.16]) box(W, 0.16, 0.2, pillarMat, 0, TOP, z);
  for (const x of [-W / 2 + 0.16, W / 2 - 0.16]) box(0.2, 0.16, D, pillarMat, x, TOP, 0);
  for (let f = 1; f <= 3; f++) {
    const y = floorY(f);
    box(W, SLAB, D, slabMat, 0, y - SLAB / 2, 0);
    box(W + 0.14, SLAB * 0.55, D + 0.14, slabEdgeMat, 0, y - SLAB * 0.72, 0);   // 外緣深色收邊
    if (f < 3) { // 樓板下方的燈條，照亮下一層
      for (const lx of [-3, 0, 3]) { const l = box(1.6, 0.04, 0.22, lampMat, lx, floorY(f + 1) - SLAB - 0.03, 0.4); l.castShadow = false; }
    }
    // 玻璃帷幕（後牆與兩側）＋窗框
    const back = new THREE.Mesh(new THREE.PlaneGeometry(W, H), glassMat); back.position.set(0, y + H / 2, -D / 2 + 0.05); scene.add(back);
    for (let i = 1; i < 6; i++) box(0.06, H, 0.06, mullionMat, -W / 2 + i * W / 6, y + H / 2, -D / 2 + 0.05);
    box(W, 0.06, 0.08, mullionMat, 0, y + 0.9, -D / 2 + 0.05); box(W, 0.08, 0.1, mullionMat, 0, y + H, -D / 2 + 0.05);
    for (const sx of [-1, 1]) {
      const gap = sx < 0 ? [stairZ(f) - 0.7, stairZ(f) + 0.7] : [-0.8, 0.8];   // 左：樓梯出入口；右：電梯門
      const wx = sx * (W / 2 - 0.05);
      for (const [z0, z1] of [[-D / 2, gap[0]], [gap[1], D / 2]]) {
        const len = z1 - z0; if (len <= 0.05) continue; const zc = (z0 + z1) / 2;
        const g = new THREE.Mesh(new THREE.PlaneGeometry(len, H), glassMat); g.rotation.y = Math.PI / 2; g.position.set(wx, y + H / 2, zc); scene.add(g);
        box(0.08, 0.06, len, mullionMat, wx, y + 0.9, zc);
        box(0.08, H, 0.08, mullionMat, wx, y + H / 2, z0 === -D / 2 ? z1 : z0);
      }
      box(0.1, 0.08, D, mullionMat, wx, y + H, 0);
    }
    // 樓層牌
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 0.575), new THREE.MeshBasicMaterial({ map: signTexture(FLOOR_INFO[f]), transparent: true, toneMapped: false }));
    sign.position.set(-W / 2 + 2.9, y + 0.3, D / 2 + 0.1); scene.add(sign);
    // 室內暖光
    const pl = new THREE.PointLight(0xffc98f, 10, 14, 1.4); pl.position.set(0, y + 3.2, 1.2); scene.add(pl); floorLights.push(pl);
    // 地毯
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(W - 2.4, D - 2.6), std(PAL.rug[f], { roughness: 1, flatShading: false, transparent: true, opacity: 0.55 }));
    rug.rotation.x = -Math.PI / 2; rug.position.set(0, y + 0.006, 0); rug.receiveShadow = true; scene.add(rug);
    plant(W / 2 - 0.75, y, -D / 2 + 0.75, 1.05);
    plant(W / 2 - 0.75, y, D / 2 - 0.8, 0.8);
  }
  // ===== 左側樓梯（之字形，連接 1F-2F-3F）=====
  const stairMat = std(0xe9dcc6, { roughness: 0.7 }), stairEdge = std(0x3b3856, { roughness: 0.5 });
  for (let f = 1; f <= 3; f++) {
    const z = stairZ(f), y = floorY(f);
    box(1.3, 0.2, 1.4, stairMat, STAIR_X, y - 0.1, z);
    box(1.34, 0.08, 1.44, stairEdge, STAIR_X, y - 0.22, z);
    if (f > 1) { box(0.14, y, 0.14, pillarMat, STAIR_X - 0.6, y / 2 - 0.2, z + (z > 0 ? 0.6 : -0.6)); }
    box(0.05, 0.9, 1.4, stairEdge, STAIR_X - 0.64, y + 0.45, z);
    if (f < 3) {
      const z2 = stairZ(f + 1), dir = Math.sign(z2 - z), y2 = floorY(f + 1);
      const zs = z + dir * 0.7, ze = z2 - dir * 0.7, N = 16;
      for (let i = 0; i < N; i++) {
        const u = (i + 0.5) / N;
        box(1.1, 0.12, Math.abs(ze - zs) / N + 0.02, stairMat, STAIR_X, y + (y2 - y) * ((i + 1) / N) - 0.06, zs + (ze - zs) * u);
      }
      const run = Math.abs(ze - zs), rise = y2 - y, len = Math.hypot(run, rise), ang = Math.atan2(rise, run);
      for (const ox of [-0.6, 0.6]) {
        const st = box(0.08, 0.3, len, stairEdge, STAIR_X + ox, y + rise / 2 - 0.1, (zs + ze) / 2); st.rotation.x = dir > 0 ? ang : -ang;
      }
      const rail = box(0.05, 0.05, len, legMat, STAIR_X - 0.62, y + rise / 2 + 0.9, (zs + ze) / 2); rail.rotation.x = dir > 0 ? ang : -ang;
      for (let i = 0; i <= 4; i++) { const u = i / 4; box(0.04, 0.9, 0.04, legMat, STAIR_X - 0.62, y + rise * u + 0.45, zs + (ze - zs) * u); }
    }
  }

  // ===== 右側電梯（玻璃井道＋車廂＋滑門）=====
  const SHAFT_H = floorY(3) + WALL_H + 0.9;
  for (const [ox, oz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) box(0.12, SHAFT_H + SLAB, 0.12, pillarMat, ELEV_X + ox, (SHAFT_H - SLAB) / 2, oz);
  box(1.75, 0.14, 1.75, pillarMat, ELEV_X, SHAFT_H, 0);
  const shaftGlass = new THREE.MeshPhysicalMaterial({ color: 0xcfe0ff, transparent: true, opacity: 0.14, roughness: 0.05, depthWrite: false, side: THREE.DoubleSide });
  { const gx = new THREE.Mesh(new THREE.PlaneGeometry(1.6, SHAFT_H), shaftGlass); gx.rotation.y = Math.PI / 2; gx.position.set(ELEV_X + 0.8, SHAFT_H / 2, 0); scene.add(gx);
    for (const sz of [-1, 1]) { const gz = new THREE.Mesh(new THREE.PlaneGeometry(1.6, SHAFT_H), shaftGlass); gz.position.set(ELEV_X, SHAFT_H / 2, sz * 0.8); scene.add(gz); } }
  for (let f = 1; f <= 3; f++) { box(0.62, 0.08, 1.5, slabEdgeMat, W / 2 + 0.31, floorY(f) - 0.04, 0); }
  const cabin = new THREE.Group(); scene.add(cabin);
  const cabFrame = std(0x4a4668, { roughness: 0.4, metalness: 0.3 });
  box(1.4, 0.08, 1.4, cabFrame, ELEV_X, 0.0, 0, cabin); box(1.4, 0.08, 1.4, cabFrame, ELEV_X, 2.3, 0, cabin);
  for (const [ox, oz] of [[-0.68, -0.68], [0.68, -0.68], [-0.68, 0.68], [0.68, 0.68]]) box(0.06, 2.3, 0.06, cabFrame, ELEV_X + ox, 1.15, oz, cabin);
  const cabGlass = new THREE.MeshPhysicalMaterial({ color: 0xffe7c4, transparent: true, opacity: 0.22, roughness: 0.1, depthWrite: false, side: THREE.DoubleSide });
  { const bk = new THREE.Mesh(new THREE.PlaneGeometry(1.36, 2.2), cabGlass); bk.rotation.y = Math.PI / 2; bk.position.set(ELEV_X + 0.68, 1.15, 0); cabin.add(bk);
    for (const sz of [-1, 1]) { const sd = new THREE.Mesh(new THREE.PlaneGeometry(1.36, 2.2), cabGlass); sd.position.set(ELEV_X, 1.15, sz * 0.68); cabin.add(sd); } }
  const cabLight = box(0.9, 0.03, 0.9, lampMat, ELEV_X, 2.24, 0, cabin); cabLight.castShadow = false;
  const doorMat = std(0xb9bfd3, { roughness: 0.3, metalness: 0.5 });
  const doorL = box(0.05, 2.18, 0.66, doorMat, ELEV_X - 0.7, 1.13, -0.33, cabin);
  const doorR = box(0.05, 2.18, 0.66, doorMat, ELEV_X - 0.7, 1.13, 0.33, cabin);
  const elev = { y: 0, door: 0, lock: Promise.resolve() };
  function applyElev() { cabin.position.y = elev.y; doorL.position.z = -0.33 - elev.door * 0.62; doorR.position.z = 0.33 + elev.door * 0.62; }
  applyElev();

  // ===== 窗外城市（白天是建築立面，夜晚窗戶亮燈）=====
  function windowTex(lit) {
    const c = document.createElement('canvas'); c.width = 64; c.height = 128; const g = c.getContext('2d');
    g.fillStyle = lit ? '#000' : '#fff'; g.fillRect(0, 0, 64, 128);
    for (let yy = 6; yy < 124; yy += 12) for (let xx = 5; xx < 60; xx += 11) {
      if (lit) { if (Math.random() < 0.45) { g.fillStyle = Math.random() < 0.7 ? '#ffd38a' : '#bfe0ff'; g.fillRect(xx, yy, 7, 7); } }
      else { g.fillStyle = 'rgba(80,110,150,0.55)'; g.fillRect(xx, yy, 7, 7); }
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  const cityMat = new THREE.MeshStandardMaterial({ color: 0x8090a8, roughness: 0.9, map: windowTex(false), emissiveMap: windowTex(true), emissive: 0xffffff, emissiveIntensity: 0 });
  const city = new THREE.Group(); scene.add(city);
  for (let i = 0; i < 30; i++) {
    const a = (i / 30) * Math.PI * 2 + (i % 3) * 0.05, r = 30 + (i * 7 % 5) * 2.4;
    if (Math.cos(a) > 0.55 && Math.abs(Math.sin(a)) < 0.6) continue;
    const w = 2.5 + (i * 13 % 4), hgt = 6 + (i * 17 % 9) * 2, d = 2.5 + (i * 5 % 3);
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, hgt, d), cityMat);
    b.position.set(Math.sin(a) * r, hgt / 2 - SLAB, Math.cos(a) * r - 4); b.rotation.y = a; city.add(b);
  }
  const starGeo = new THREE.BufferGeometry(); const sp = [];
  for (let i = 0; i < 260; i++) { const th = Math.random() * Math.PI * 2, ph = Math.random() * 0.45 + 0.08, R = 120; sp.push(Math.cos(th) * Math.cos(ph) * R, Math.sin(ph) * R, Math.sin(th) * Math.cos(ph) * R); }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.9, sizeAttenuation: true, transparent: true, opacity: 0.9, fog: false }));
  scene.add(stars);
  const moon = new THREE.Mesh(new THREE.SphereGeometry(3.2, 20, 14), new THREE.MeshBasicMaterial({ color: 0xfff4d6, fog: false }));
  moon.position.set(-45, 60, -70); scene.add(moon);
  const sunDisc = new THREE.Mesh(new THREE.SphereGeometry(5, 20, 14), new THREE.MeshBasicMaterial({ color: 0xfff1c9, fog: false }));
  sunDisc.position.set(55, 62, -80); scene.add(sunDisc);

  // 樓層專屬擺設
  shelf(-3.6, floorY(3), -D / 2 + 0.45); shelf(3.6, floorY(3), -D / 2 + 0.45);
  // 休息區：3F 左側沙發；2F 中央沙發＋兩張單人椅＋咖啡吧；1F 左側沙發＋單人椅
  sofa(-3.4, floorY(3), 0.55, 0x8e6fb4); coffeeTable(-3.4, floorY(3), 1.65, 0.45); plant(-1.9, floorY(3), 0.3, 0.7); plant(4.6, floorY(3), -1.6, 0.9);
  sofa(0, floorY(2), -0.95, 0x6f9fd9); armchair(-1.75, floorY(2), 0.7, 0xe69a7a, 0.45); armchair(1.75, floorY(2), 0.7, 0xe69a7a, -0.45);
  coffeeTable(0, floorY(2), 0.55, 0.5); coffeeBar(0, floorY(2), -D / 2 + 0.5);
  box(2.0, 1.1, 0.06, std(0xfafafa, { emissive: 0x222222 }), -3.5, floorY(2) + 1.75, -D / 2 + 0.2); // 白板
  sofa(-3.65, floorY(1), 0.55, 0xd98a6a); armchair(-2.05, floorY(1), 1.5, 0x6f9fd9, -0.5); coffeeTable(-3.65, floorY(1), 1.65, 0.45);
  box(2.6, 1.0, 0.7, std(0xf2e8da), 0.6, floorY(1) + 0.5, -2.6); // 接待櫃台
  box(2.7, 0.06, 0.8, std(0x3b3856), 0.6, floorY(1) + 1.03, -2.6);
  const door = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.4), new THREE.MeshPhysicalMaterial({ color: 0xffe2b8, transparent: true, opacity: 0.25, emissive: 0xffc98f, emissiveIntensity: 0.3, side: THREE.DoubleSide }));
  door.position.set(0, floorY(1) + 1.2, D / 2 + 0.01); scene.add(door);

  // ===== 人物 =====
  const figures = new Map();
  let extraCount = 0;

  function buildFigure(key, floor, x, z, isLead, lounge) {
    const grp = new THREE.Group(); grp.position.set(x, floorY(floor), z); scene.add(grp);
    const s = add(new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.2), blobMat), grp, false, false); s.rotation.x = -Math.PI / 2; s.position.set(0, 0.012, 0.15);
    // 桌子在人物前方（+z，朝預設鏡頭），人物面向鏡頭
    const dw = isLead ? 2.1 : 1.6;
    box(dw, 0.08, 0.78, deskMat, 0, 0.74, 0.55, grp);
    box(dw - 0.1, 0.5, 0.04, std(0xe6dccd), 0, 0.46, 0.92, grp);          // 桌前擋板
    for (const lx of [-dw / 2 + 0.08, dw / 2 - 0.08]) box(0.06, 0.7, 0.66, legMat, lx, 0.36, 0.55, grp);
    // 筆電（螢幕朝人物）
    const screenMat = new THREE.MeshStandardMaterial({ color: 0x0f1424, emissive: 0x4da3ff, emissiveIntensity: 0.3 });
    box(0.5, 0.025, 0.34, legMat, -0.05, 0.79, 0.5, grp);
    const lid = box(0.5, 0.32, 0.02, screenMat, -0.05, 0.95, 0.68, grp); lid.rotation.x = 0.25;
    const lidBack = box(0.52, 0.34, 0.012, std(0xc8c4d8, { metalness: 0.4, roughness: 0.3 }), -0.05, 0.95, 0.695, grp); lidBack.rotation.x = 0.25;
    // 桌燈（夜晚會亮）
    box(0.03, 0.34, 0.03, legMat, dw / 2 - 0.18, 0.95, 0.72, grp);
    const bulb = box(0.18, 0.06, 0.12, deskLampMat, dw / 2 - 0.25, 1.12, 0.7, grp); bulb.castShadow = false;
    // 桌面小物：杯子、小盆栽
    box(0.09, 0.12, 0.09, std(0xff9e7a), dw / 2 - 0.3, 0.84, 0.4, grp);
    const mini = add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 0), leafMat), grp); mini.position.set(-dw / 2 + 0.28, 0.92, 0.42);
    box(0.12, 0.1, 0.12, potMat, -dw / 2 + 0.28, 0.83, 0.42, grp);
    // 椅子（人物後方）
    box(0.56, 0.08, 0.52, chairSeatMat, 0, 0.47, -0.25, grp);
    box(0.56, 0.62, 0.08, chairMat, 0, 0.84, -0.53, grp);
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.4, 6), legMat), grp).position.set(0, 0.24, -0.25);
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.04, 5), legMat), grp).position.set(0, 0.03, -0.25);

    const walker = new THREE.Group(); scene.add(walker);
    const slot = new THREE.Group(); walker.add(slot);
    const deskSeat = { pos: new THREE.Vector3(x, floorY(floor), z - 0.22), rot: 0, kind: 'desk', side: x < 0 ? 1 : -1 };
    const loungeSeat = { pos: new THREE.Vector3(lounge[0], floorY(floor) - 0.07, lounge[1] + 0.02), rot: lounge[2] || 0, kind: 'lounge' };
    walker.position.copy(loungeSeat.pos); walker.rotation.y = loungeSeat.rot;
    // 狀態光環
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x8a94a6, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, toneMapped: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.64, 28), ringMat); ring.rotation.x = -Math.PI / 2; ring.position.set(0, 0.03, 0); walker.add(ring);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.0, 1.8), new THREE.MeshBasicMaterial({ visible: false })); hit.position.set(0, 1, 0.1); hit.userData.key = key; walker.add(hit);

    // HTML 名牌 + 狀態泡泡（全部以 textContent 寫入）
    const el = document.createElement('button'); el.type = 'button'; el.className = 'tag';
    const fx = document.createElement('span'); fx.className = 'tag-fx';
    const bubble = document.createElement('span'); bubble.className = 'tag-bubble';
    const row = document.createElement('span'); row.className = 'tag-row';
    const dot = document.createElement('span'); dot.className = 'tag-dot';
    const nm = document.createElement('span'); nm.className = 'tag-name';
    const st = document.createElement('span'); st.className = 'tag-status';
    row.append(dot, nm, st);
    const step = document.createElement('span'); step.className = 'tag-step';
    bubble.append(row, step, fx);
    const fl = document.createElement('span'); fl.className = 'tag-floor'; fl.textContent = floor ? floor + 'F' : '';
    row.prepend(fl);
    el.style.setProperty('--floor', FLOOR_COLOR[floor] || FLOOR_COLOR[0]); el.dataset.floor = String(floor);
    const tail = document.createElement('span'); tail.className = 'tag-tail';
    el.append(bubble, tail);
    el.addEventListener('click', (ev) => { ev.stopPropagation(); onSelect && onSelect(key); });
    overlay.appendChild(el);

    const anchor = new THREE.Vector3();
    const fig = { key, grp, slot, walker, deskSeat, loungeSeat, atDesk: false, want: false, busy: false, moving: false, carry: null, walk: null, floor, floorBase: floorY(floor), av: null, avSet: null, color: null, ringMat, ring, screenMat, hit, el, fx, dot, nm, st, step, anchor, status: '', shape: null, phase: Math.random() * 6 };
    figures.set(key, fig);
    return fig;
  }

  function ensureFigure(state, key) {
    if (figures.has(key)) return figures.get(key);
    const meta = botMeta(state, key);
    if (meta.floor) { const [x, z] = SEATS[key]; return buildFigure(key, meta.floor, x, z, key === 'nori', LOUNGE[key]); }
    if (extraCount >= EXTRA_SEATS.length) return null;
    const i = extraCount++;
    const [x, z] = EXTRA_SEATS[i];
    return buildFigure(key, 1, x, z, false, EXTRA_LOUNGE[i]);
  }
  for (const b of BOTS) ensureFigure({ extras: {}, looks: {} }, b.key);

  function setFx(fig, status) {
    fig.fx.replaceChildren();
    const mk = (cls, text) => { const s = document.createElement('span'); s.className = cls; if (text) s.textContent = text; return s; };
    if (status === 'idle') { const z = mk('fx-z'); z.append(mk('', 'Z'), mk('', 'z'), mk('', 'z')); fig.fx.append(z); }
    else if (status === 'waiting_user') fig.fx.append(mk('fx-bang', '!'));
    else if (status === 'error') fig.fx.append(mk('fx-bang fx-err', '!'));
    else if (status === 'working') { const d = mk('fx-dots'); d.append(mk(''), mk(''), mk('')); fig.fx.append(d); }
    else if (status === 'done') fig.fx.append(mk('fx-ok', '✓'));
  }

  // 走路：工作中回辦公桌，其他狀態去休息區；剛載入時直接就位不走路
  const bornAt = performance.now();
  function moveTo(fig, toDesk) {
    fig.atDesk = toDesk;
    const from = fig.walker.position.clone();
    const seat = toDesk ? fig.deskSeat : fig.loungeSeat;
    if (performance.now() - bornAt < 4000 || document.hidden) {
      fig.walk = null; fig.walker.position.copy(seat.pos); fig.walker.rotation.y = seat.rot; return;
    }
    const fromSeat = toDesk ? fig.loungeSeat : fig.deskSeat;
    const pts = [from, seatFront(fromSeat), seatFront(seat), seat.pos.clone()];
    const lens = []; let total = 0;
    for (let i = 1; i < pts.length; i++) { const l = pts[i].distanceTo(pts[i - 1]); lens.push(l); total += l; }
    fig.walk = { pts, lens, total, t0: performance.now(), ms: WALK_MS, rot: seat.rot };
    start();
  }
  function stepWalk(f, now) {
    const w = f.walk; const k = Math.min(1, (now - w.t0) / w.ms);
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    let d = e * w.total, i = 0;
    while (i < w.lens.length - 1 && d > w.lens[i]) { d -= w.lens[i]; i++; }
    const p0 = w.pts[i], p1 = w.pts[i + 1], u = w.lens[i] ? Math.min(1, d / w.lens[i]) : 1;
    f.walker.position.lerpVectors(p0, p1, u);
    const dx = p1.x - p0.x, dz = p1.z - p0.z;
    if (k < 0.92 && Math.hypot(dx, dz) > 0.05) {
      const target = Math.atan2(dx, dz); let cur = f.walker.rotation.y;
      let diff = ((target - cur + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      f.walker.rotation.y = cur + diff * 0.25;
    } else {
      let diff = ((w.rot - f.walker.rotation.y + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      f.walker.rotation.y += diff * 0.3;
    }
    f.walker.position.y += Math.abs(Math.sin(k * Math.PI * 7)) * 0.06 + Math.sin(k * Math.PI) * 0.12; // 站起來＋腳步起伏
    if (k >= 1) { f.walk = null; f.walker.position.copy(w.pts[w.pts.length - 1]); f.walker.rotation.y = w.rot; }
    return k;
  }

  // ===== 送資料動畫：走樓梯或搭電梯到對方座位，交付後回座 =====
  const P = (x, f, z) => new THREE.Vector3(x, floorY(f), z);
  function seatFront(seat) {
    if (seat.kind === 'desk') return new THREE.Vector3(seat.pos.x + seat.side * 1.1, seat.pos.y, seat.pos.z);
    return new THREE.Vector3(seat.pos.x + Math.sin(seat.rot) * 0.8, seat.pos.y + 0.07, seat.pos.z + Math.cos(seat.rot) * 0.8);
  }
  const tasks = new Set();
  const task = (fn) => new Promise((res) => { tasks.add({ fn, res }); start(); });
  const wait = (ms) => { const t0 = performance.now(); return task((now) => now - t0 >= ms); };
  const tween = (ms, fn) => { const t0 = performance.now(); return task((now) => { const k = Math.min(1, (now - t0) / ms); fn(k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2); return k >= 1; }); };
  function walk(f, pts, speed = WALK_SPEED) {
    pts = [f.walker.position.clone(), ...pts];
    const lens = []; let total = 0;
    for (let i = 1; i < pts.length; i++) { const l = pts[i].distanceTo(pts[i - 1]); lens.push(l); total += l; }
    if (total < 0.01) return Promise.resolve();
    const t0 = performance.now(); f.moving = true;
    return task((now) => {
      let d = Math.min(total, (now - t0) / 1000 * speed), rem = d, i = 0;
      while (i < lens.length - 1 && rem > lens[i]) { rem -= lens[i]; i++; }
      const a = pts[i], b = pts[i + 1], u = lens[i] ? Math.min(1, rem / lens[i]) : 1;
      f.walker.position.lerpVectors(a, b, u);
      f.walker.position.y += 0.1 + Math.abs(Math.sin(d * 4.2)) * 0.05;
      const dx = b.x - a.x, dz = b.z - a.z;
      if (Math.hypot(dx, dz) > 0.05) { const tr = Math.atan2(dx, dz); const df = ((tr - f.walker.rotation.y + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; f.walker.rotation.y += df * 0.25; }
      if (d >= total) { f.walker.position.copy(pts[pts.length - 1]); f.walker.position.y += 0.1; f.moving = false; return true; }
      return false;
    });
  }
  function turnTo(f, rot, ms = 300) { const r0 = f.walker.rotation.y; const df = ((rot - r0 + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return tween(ms, (e) => { f.walker.rotation.y = r0 + df * e; }); }
  const elevTo = (fl) => { const y0 = elev.y, y1 = floorY(fl); if (Math.abs(y1 - y0) < 0.01) return Promise.resolve(); return tween(500 + Math.abs(y1 - y0) / 4.5 * 1000, (e) => { elev.y = y0 + (y1 - y0) * e; applyElev(); }); };
  const doors = (open) => { const d0 = elev.door, d1 = open ? 1 : 0; return tween(420, (e) => { elev.door = d0 + (d1 - d0) * e; applyElev(); }); };
  function rideElevator(f, fa, fb) {
    const run = async () => {
      await elevTo(fa); await doors(true);
      await walk(f, [P(ELEV_X, fa, 0)], 1.6); await turnTo(f, -Math.PI / 2);
      await doors(false);
      const off = f.walker.position.y - elev.y;
      const y0 = elev.y, y1 = floorY(fb);
      await tween(500 + Math.abs(y1 - y0) / 4.5 * 1000, (e) => { elev.y = y0 + (y1 - y0) * e; applyElev(); f.walker.position.y = elev.y + off; });
      await doors(true);
      await walk(f, [P(ELEV_DOOR_X, fb, 0)], 1.6);
      doors(false);
    };
    const p = elev.lock.then(run); elev.lock = p.catch(() => { }); return p;
  }
  function stairsRoute(fa, fb) {
    const pts = [];
    const exit = (fl) => stairZ(fl) > 0 ? [P(LANE_L, fl, AISLE), P(STAIR_X, fl, AISLE)] : [P(LANE_L, fl, AISLE), P(LANE_L, fl, stairZ(fl)), P(STAIR_X, fl, stairZ(fl))];
    pts.push(...exit(fa));
    const step = fb > fa ? 1 : -1;
    for (let fl = fa; fl !== fb; fl += step) {
      const z1 = stairZ(fl), z2 = stairZ(fl + step), dir = Math.sign(z2 - z1);
      pts.push(P(STAIR_X, fl, z1 + dir * 0.7), P(STAIR_X, fl + step, z2 - dir * 0.7), P(STAIR_X, fl + step, z2));
    }
    pts.push(...exit(fb).reverse());
    return pts;
  }
  async function travel(f, fa, fromSeat, fb, toPoint, mode) {
    const fr = seatFront(fromSeat);
    await walk(f, [fr, P(fr.x, fa, AISLE)]);
    if (fa !== fb) {
      if (mode === 'stairs') await walk(f, stairsRoute(fa, fb), 2.4);
      else { await walk(f, [P(LANE_R, fa, AISLE), P(LANE_R, fa, 0), P(ELEV_DOOR_X, fa, 0)]); await rideElevator(f, fa, fb); await walk(f, [P(LANE_R, fb, 0), P(LANE_R, fb, AISLE)]); }
    }
    await walk(f, [P(toPoint.x, fb, AISLE), toPoint]);
  }
  const docGeo = new THREE.BoxGeometry(0.34, 0.05, 0.26), paperGeo = new THREE.BoxGeometry(0.28, 0.02, 0.22);
  const docMat = std(0xffc861, { roughness: 0.5 }), paperMat = std(0xffffff, { roughness: 0.8 });
  function makeDoc() { const g = new THREE.Group(); const a = new THREE.Mesh(docGeo, docMat); a.castShadow = true; g.add(a); const b = new THREE.Mesh(paperGeo, paperMat); b.position.y = 0.035; g.add(b); g.rotation.x = -0.5; return g; }
  async function deliver(fromKey, toKey, mode = 'auto') {
    const a = figures.get(fromKey), b = figures.get(toKey);
    if (!a || !b || a === b || a.busy || !a.av) return false;
    a.busy = true; a.walk = null;
    try {
      const fa = a.floor, fb = b.floor;
      if (mode !== 'stairs' && mode !== 'elevator') mode = Math.abs(fa - fb) >= 2 ? 'elevator' : (Math.random() < 0.5 ? 'stairs' : 'elevator');
      const doc = makeDoc(); doc.position.set(0, 1.0, 0.42); a.walker.add(doc); a.carry = doc; a.dirty = true;
      const startSeat = a.atDesk ? a.deskSeat : a.loungeSeat;
      const bSeat = b.atDesk ? b.deskSeat : b.loungeSeat;
      const meet = seatFront(bSeat);
      await travel(a, fa, startSeat, fb, meet, mode);
      await turnTo(a, Math.atan2(b.walker.position.x - a.walker.position.x, b.walker.position.z - a.walker.position.z));
      // 交付：文件飛到對方手上
      const wp = new THREE.Vector3(); doc.getWorldPosition(wp); a.walker.remove(doc); scene.add(doc); doc.position.copy(wp); a.carry = null;
      const target = b.walker.position.clone().add(new THREE.Vector3(0, 1.0, 0));
      await tween(650, (e) => { doc.position.lerpVectors(wp, target, e); doc.position.y += Math.sin(e * Math.PI) * 0.3; });
      scene.remove(doc);
      b.el.classList.add('got'); setTimeout(() => b.el.classList.remove('got'), 2600);
      await wait(700);
      // 回座（工作中回辦公桌，其他回休息區）
      const home = a.want ? a.deskSeat : a.loungeSeat;
      const homeFront = seatFront(home);
      await travel(a, fb, bSeat, fa, homeFront, mode);
      await walk(a, [home.pos.clone()], 1.6);
      a.walker.position.copy(home.pos); await turnTo(a, home.rot, 250);
      a.atDesk = a.want;
      return true;
    } finally {
      a.busy = false; a.moving = false; if (a.carry) { a.walker.remove(a.carry); a.carry = null; }
      if (a.want !== a.atDesk) moveTo(a, a.want);
    }
  }

  // ===== 白天／夜晚 =====
  let theme = 'night';
  function setTheme(t) {
    theme = t === 'day' ? 'day' : 'night';
    const day = theme === 'day';
    hemi.color.set(day ? 0xfff4e6 : 0x9aa6d6); hemi.groundColor.set(day ? 0x8a9a7a : 0x1c1a33); hemi.intensity = day ? 1.35 : 0.55;
    sun.color.set(day ? 0xfff0d8 : 0x9fb2ff); sun.intensity = day ? 2.6 : 0.55;
    sun.position.set(day ? 12 : -10, 26, 16);
    rim.color.set(day ? 0xcfe2ff : 0x6f86ff); rim.intensity = day ? 0.5 : 0.35;
    scene.fog.color.set(day ? 0xcfe3f6 : 0x1a1830);
    for (const l of floorLights) l.intensity = day ? 4 : 16;
    lampMat.emissiveIntensity = day ? 0.5 : 2.2;
    deskLampMat.emissiveIntensity = day ? 0.15 : 2.4;
    cityMat.color.set(day ? 0xb8c6d8 : 0x2a2f45); cityMat.emissiveIntensity = day ? 0 : 1.2;
    groundMat.color.set(day ? 0x9fc08a : 0x24223a); padMat.color.set(day ? 0xd8d1c4 : 0x302d4a);
    stars.visible = moon.visible = !day; sunDisc.visible = day;
    renderer.toneMappingExposure = day ? 1.0 : 1.08;
    for (const f of figures.values()) f.screenMat.userData.night = !day;
  }
  setTheme('night');

  let selected = null;
  function update(state) {
    for (const key of [...BOTS.map(b => b.key), ...Object.keys(state.extras)]) {
      const fig = ensureFigure(state, key); if (!fig) continue;
      const meta = botMeta(state, key);
      const hex = lookColor(state, key);
      const shape = state.looks[key]?.shape || '';
      if (!fig.av || fig.avSet !== currentSet || (usesShape(currentSet) && shape !== fig.shape)) {
        if (fig.av) disposeAvatar(fig.av);
        fig.av = buildAvatar(currentSet, shape); fig.slot.add(fig.av.root);
        fig.avSet = currentSet; fig.shape = shape; fig.color = null;
      }
      if (fig.color !== hex) { tintAvatar(fig.av, hex); fig.color = hex; }
      const v = viewStatus(state, key), s = v.s;
      const status = v.status;
      const sc = STATUS[status];
      fig.el.classList.toggle('stale', v.stale);
      if (status !== fig.status) { setFx(fig, status); fig.status = status; }
      const wantDesk = status === 'working';
      fig.want = wantDesk;
      if (!fig.busy && wantDesk !== fig.atDesk) moveTo(fig, wantDesk);
      fig.ringMat.color.set(sc.color);
      fig.screenMat.emissive.set(status === 'error' ? '#ff5d6c' : '#6bb4ff');
      fig.screenMat.emissiveIntensity = (status === 'working' ? 1.2 : (status === 'idle' || status === 'unknown' ? 0.05 : 0.35)) * (theme === 'night' ? 1.6 : 1);
      fig.dot.style.background = hex;
      fig.nm.textContent = meta.short;
      fig.st.textContent = sc.label;
      fig.st.style.background = sc.color; fig.el.style.setProperty('--stc', sc.color);
      fig.step.textContent = s && s.step ? s.step : (s ? '' : '這台裝置沒有更早的紀錄');
      fig.el.dataset.status = status; fig.dirty = true;
      fig.el.setAttribute('aria-label', `${meta.name}：${sc.label}${s && s.step ? '，' + s.step : ''}`);
    }
    select(selected);
  }
  function select(key) { selected = key; for (const f of figures.values()) { f.el.classList.toggle('sel', f.key === key); f.dirty = true; } }

  // 點選 3D 人物
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let downAt = null;
  renderer.domElement.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; cancelFly(); });
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) return;
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects([...figures.values()].map(f => f.hit), false);
    if (hits.length && onSelect) onSelect(hits[0].object.userData.key);
  });

  // ===== 鏡頭：預設取景讓三層樓完整入鏡，並以緩動飛入 =====
  let insets = { top: 0, bottom: 0 };
  function defaultView() {
    const w = container.clientWidth || 1, h = container.clientHeight || 1;
    const usableH = Math.max(120, h - insets.top - insets.bottom);
    const aspect = w / usableH;
    const vfov = THREE.MathUtils.degToRad(camera.fov) * (usableH / h);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
    const az = THREE.MathUtils.degToRad(aspect < 0.9 ? 15 : 24), polar = THREE.MathUtils.degToRad(66);
    const effW = (W + 3.4) * Math.cos(az) + D * Math.sin(az) - (aspect < 0.9 ? 0.9 : -0.6);
    const effH = (2 * FLOOR_H + WALL_H + 0.6) * Math.sin(polar) + D * Math.cos(polar) + 2.6;
    const dist = Math.max((effH / 2) / Math.tan(vfov / 2), (effW / 2) / Math.tan(hfov / 2)) + D * 0.35;
    // 依可用區域的中心偏移目標點，避免被頁首或抽屜擋住
    const shiftPx = (insets.bottom - insets.top) / 2;
    const worldPerPx = 2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) / h;
    const target = new THREE.Vector3(0, (2 * FLOOR_H + WALL_H) / 2 - shiftPx * worldPerPx * Math.sin(polar), 0);
    const pos = new THREE.Vector3(dist * Math.sin(polar) * Math.sin(az), dist * Math.cos(polar), dist * Math.sin(polar) * Math.cos(az)).add(target);
    return { pos, target };
  }
  let fly = null;
  function flyTo(view, ms = 900) { fly = { t0: performance.now(), ms, p0: camera.position.clone(), t0v: controls.target.clone(), p1: view.pos, t1: view.target }; start(); }
  function cancelFly() { fly = null; }
  function resetView(animate = true) {
    const v = defaultView();
    if (!animate) { camera.position.copy(v.pos); controls.target.copy(v.target); controls.update(); return; }
    flyTo(v);
  }
  function setInsets(top, bottom) { insets = { top, bottom }; }

  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = w + 'px'; renderer.domElement.style.height = h + 'px';
    camera.aspect = w / h; camera.updateProjectionMatrix();
    const compact = w < 600; compactTags = compact;
    if (overlay.classList.contains('compact') !== compact) { overlay.classList.toggle('compact', compact); for (const f of figures.values()) f.dirty = true; }
  }
  let framed = false;
  function intro() {
    const v = defaultView();
    camera.position.copy(v.pos.clone().sub(v.target).multiplyScalar(1.55).add(v.target).add(new THREE.Vector3(-8, 6, 0)));
    controls.target.copy(v.target); controls.update();
    flyTo(v, 1600);
  }

  // 名牌投影：每個名牌只能待在自己那層樓的垂直範圍內（不會跑到別層）
  const v = new THREE.Vector3(), vb = new THREE.Vector3();
  function bandOf(f, w, h) {
    // 人物目前所在樓層（走樓梯/電梯途中以最接近的樓層計）
    const fl = Math.max(0, Math.min(2, Math.round((f.walker.position.y - floorY(1)) / FLOOR_H)));
    const base = fl * FLOOR_H + floorY(1);
    // 上界：上一層樓板的前緣（最上層則是牆頂上方一點）；下界：本層地板前緣
    if (fl < 2) vb.set(f.walker.position.x, base + FLOOR_H - SLAB - 0.1, D / 2);
    else vb.set(f.walker.position.x, base + WALL_H + (compactTags ? 0.6 : 1.3), f.walker.position.z);
    vb.project(camera);
    const top = (-vb.y * 0.5 + 0.5) * h;
    vb.set(f.walker.position.x, base + 0.15, D / 2).project(camera);
    const bot = (-vb.y * 0.5 + 0.5) * h;
    return [top, bot];
  }
  const overlapArea = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  function placeTags() {
    const w = container.clientWidth, h = container.clientHeight;
    const list = [];
    for (const f of figures.values()) {
      v.copy(f.anchor).project(camera);
      const vis = v.z < 1 && v.x > -1.15 && v.x < 1.15 && v.y > -1.15 && v.y < 1.15;
      f.el.style.visibility = vis ? 'visible' : 'hidden';
      if (!vis) continue;
      if (!f.size || f.dirty) { f.el.classList.remove('squeeze'); f.size = [f.el.offsetWidth, f.el.offsetHeight]; f.dirty = false; }
      list.push({ f, z: v.z, x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, band: bandOf(f, w, h) });
    }
    // 名牌避讓：選取中的先放，其次離鏡頭近的；重疊時優先往左右挪，
    // 再在本層範圍內上下挪；真的放不下就縮成只剩圓點＋名字
    list.sort((a, b) => (b.f.key === selected) - (a.f.key === selected) || a.z - b.z);
    const placed = [];
    for (const it of list) {
      const [tw, th] = it.f.size;
      const [bTop, bBot] = it.band;
      const clampY = (bottom) => Math.max(bTop + th, Math.min(Math.max(bTop + th, bBot), bottom));
      const sx = tw * 0.55 + 4, sy = th + 4;
      const cands = [[0, 0], [-sx, 0], [sx, 0], [0, -sy], [-sx, -sy], [sx, -sy], [0, sy], [-sx, sy], [sx, sy], [-2 * sx, 0], [2 * sx, 0], [0, 2 * sy], [-sx, 2 * sy], [sx, 2 * sy], [-2 * sx, sy], [2 * sx, sy]];
      let best = null;
      for (const [dx, dy] of cands) {
        const x0 = Math.max(4, Math.min(w - tw - 4, it.x - tw / 2 + dx));
        const y1 = clampY(it.y + dy);
        const r = { x0, x1: x0 + tw, y0: y1 - th, y1 };
        let ov = 0; for (const p of placed) ov += overlapArea(r, p);
        const cost = ov * 200 + Math.abs(x0 + tw / 2 - it.x) + Math.abs(y1 - it.y) * 1.3;
        if (!best || cost < best.cost) best = { r, cost, ov };
        if (ov === 0 && dx === 0 && dy === 0) break;
      }
      const r = best.r;
      it.f.el.classList.toggle('squeeze', best.ov > tw * th * 0.12 && !it.f.el.classList.contains('sel'));
      placed.push(r);
      it.f.el.style.transform = `translate3d(${r.x0.toFixed(1)}px, ${r.y0.toFixed(1)}px, 0)`;
      const shifted = Math.abs(r.x0 + tw / 2 - it.x) > 6 || Math.abs(r.y1 - it.y) > 6;
      it.f.el.classList.toggle('shifted', shifted);
    }
    list.forEach((it, i) => { it.f.el.style.zIndex = String(it.f.key === selected ? 999 : 100 - i); });
  }

  // 動畫迴圈：分頁隱藏或不在畫面時暫停
  function frame() {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    const nowT = performance.now();
    if (FRAME_MIN_MS && nowT - lastDraw < FRAME_MIN_MS) return;
    lastDraw = nowT;
    const t = clock.getElapsedTime();
    if (fly) {
      const k = Math.min(1, (performance.now() - fly.t0) / fly.ms), e = easeOut(k);
      camera.position.lerpVectors(fly.p0, fly.p1, e); controls.target.lerpVectors(fly.t0v, fly.t1, e);
      if (k >= 1) fly = null;
    }
    const nowMs = performance.now();
    for (const tk of [...tasks]) { if (tk.fn(nowMs)) { tasks.delete(tk); tk.res(); } }
    for (const f of figures.values()) {
      const p = t + f.phase;
      const av = f.av; if (!av) continue;
      if (f.walk) stepWalk(f, performance.now());
      const walking = !!f.walk || f.moving;
      f.anchor.set(f.walker.position.x, f.walker.position.y + (compactTags ? 1.8 : 2.05 + (f.walker.position.z < -0.6 ? 0.25 : 0)), f.walker.position.z + 0.02);
      if (f.carry !== null && !f.el.classList.contains('carrying')) f.el.classList.add('carrying');
      if (f.carry === null && f.el.classList.contains('carrying')) f.el.classList.remove('carrying');
      const breathe = Math.sin(p * 1.6) * (av.glossy ? 0.03 : 0.012);
      av.body.scale.set(1 + breathe, 1 - breathe * 0.6, 1 + breathe);
      const hy = av.headY, ay = av.armY;
      let la = ay, ra = ay;
      if (f.status === 'working') {
        la = ay + Math.max(0, Math.sin(p * 14)) * 0.035; ra = ay + Math.max(0, Math.sin(p * 14 + 1.6)) * 0.035;
        av.head.rotation.set(0.12 + Math.sin(p * 1.3) * 0.04, Math.sin(p * 0.7) * 0.12, 0); av.head.position.y = hy;
      } else if (f.status === 'idle') {
        av.head.rotation.set(0.3 + Math.sin(p * 0.9) * 0.04, 0, 0.18); av.head.position.y = hy - 0.03;
      } else if (f.status === 'waiting_user') {
        av.head.rotation.set(-0.1, Math.sin(p * 1.1) * 0.35, Math.sin(p * 0.8) * 0.1); av.head.position.y = hy + 0.01 + Math.abs(Math.sin(p * 2.2)) * 0.03;
        ra = ay + 0.12 + Math.abs(Math.sin(p * 2.2)) * 0.05;   // 舉手
      } else if (f.status === 'done') {
        av.head.rotation.set(-0.05, 0, Math.sin(p * 2) * 0.08); av.head.position.y = hy + Math.abs(Math.sin(p * 3)) * 0.02;
      } else if (f.status === 'error') {
        av.head.rotation.set(0, Math.sin(p * 9) * 0.06, 0); av.head.position.y = hy;
      } else { av.head.rotation.set(0, 0, 0); av.head.position.y = hy; }
      if (walking) { // 走路時手前後擺、頭擺正
        const sw = Math.sin(t * 11 + f.phase) * 0.05;
        la = ay + sw; ra = ay - sw; av.head.rotation.set(0, 0, sw); av.head.position.y = av.headY;
      }
      if (f.carry) { la = ra = ay + 0.1; }
      if (av.armL) av.armL.position.y = la;
      if (av.armR) av.armR.position.y = ra;
      if (av.spin) av.spin.rotation.y = t * 0.8;
      if (av.tail) av.tail.rotation.y = Math.sin(p * 1.8) * 0.35;
      const r = f.status === 'error' ? 0.45 + 0.55 * Math.abs(Math.sin(t * 3.5)) : (f.status === 'working' ? 0.65 + 0.3 * Math.sin(t * 2.6 + f.phase) : 0.7);
      f.ringMat.opacity = r;
      const sc = f.status === 'error' ? 1 + 0.15 * Math.abs(Math.sin(t * 3.5)) : 1;
      f.ring.scale.set(sc, sc, sc);
    }
    controls.update();
    renderer.render(scene, camera);
    placeTags();
  }
  function start() { if (running || document.hidden || !onScreen) return; running = true; frame(); }
  function stop() { running = false; cancelAnimationFrame(raf); }
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  if ('IntersectionObserver' in window) new IntersectionObserver((ents) => { onScreen = ents[0].isIntersecting; onScreen ? start() : stop(); }).observe(container);
  new ResizeObserver(() => { resize(); if (!framed && container.clientWidth) { framed = true; intro(); } }).observe(container);
  resize();
  if (container.clientWidth) { framed = true; intro(); }
  start();

  function setAvatarSet(id, state) { currentSet = id; if (state) update(state); }
  const floorOf = (k) => figures.get(k)?.floor || 0;
  return { update, select, resetView, setInsets, setAvatarSet, deliver, setTheme, floorOf };
}

export function webglAvailable() {
  try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); }
  catch { return false; }
}
