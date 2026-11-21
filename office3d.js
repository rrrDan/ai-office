// AI 辦公室：3D 大樓（three.js r170；模型與貼圖皆為本專案自製的程序化幾何與畫布貼圖）
import * as THREE from './vendor/three/three.module.min.js';
import { OrbitControls } from './vendor/three/OrbitControls.js';
import { BOTS, STATUS, botMeta, lookColor, viewStatus } from './feed.js';
import { buildAvatar, tintAvatar, disposeAvatar, usesShape, DEFAULT_SET } from './avatars.js';

const FLOOR_H = 5.0, WALL_H = 2.5, W = 12, D = 8, SLAB = 0.26;  // 樓層錯開堆疊（像剖面模型），從斜上方可看進每一層
const TOP_FLOOR = 4, GYM_FLOOR = 3;   // 4F 總管室、3F 健身房與休息空間、2F 工作區、1F 專案大廳
const FLOOR_INFO = { 4: '4F・總管室', 3: '3F・健身房與休息空間', 2: '2F・工作區', 1: '1F・專案大廳' };
const SEATS = {   // 辦公桌位置 [x, z]
  nori: [0, -0.4], akara: [0.6, -0.2],
  meron: [-3.5, -1.3], yuzu: [3.5, -1.3], goya: [-3.5, 1.7], ichigo: [3.5, 1.7],
};
const EXTRA_SEATS = [[3.6, 1.9], [3.6, -1.6], [-3.4, -2.2]];
// 3F 健身房與休息空間的站位（所有人休息時都到這層）。fz：接近點的 z（省略時用座位正前方 0.8）
const REST_SPOTS = [
  { id: 'tread1', cat: 'gym', act: 'treadmill', x: -4.55, z: -2.4, rot: Math.PI / 2, fz: -1.25 },
  { id: 'tread2', cat: 'gym', act: 'treadmill', x: -2.8, z: -2.4, rot: Math.PI / 2, fz: -1.25 },
  { id: 'bell1', cat: 'gym', act: 'dumbbells', x: -1.2, z: -2.4, rot: 0, fz: -1.25 },
  { id: 'bell2', cat: 'gym', act: 'dumbbells', x: 0.35, z: -2.4, rot: 0, fz: -1.25 },
  { id: 'bike1', cat: 'gym', act: 'bike', x: -4.4, z: 2.3, rot: 0, fz: 1.15 },
  { id: 'bike2', cat: 'gym', act: 'bike', x: -2.8, z: 2.3, rot: 0, fz: 1.15 },
  { id: 'yoga1', cat: 'gym', act: 'yoga', x: -1.2, z: 2.3, rot: 0, fz: 1.15 },
  { id: 'yoga2', cat: 'gym', act: 'yoga', x: 0.35, z: 2.3, rot: 0, fz: 1.15 },
  { id: 'sofa1', cat: 'rest', act: 'sofa', x: 2.0, z: 2.04, rot: 0 },
  { id: 'sofa2', cat: 'rest', act: 'sofa', x: 2.8, z: 2.04, rot: 0 },
  { id: 'mass1', cat: 'rest', act: 'massage', x: 4.4, z: 2.04, rot: 0 },
  { id: 'mass2', cat: 'rest', act: 'massage', x: 4.75, z: -2.16, rot: 0 },
  { id: 'cafe1', cat: 'rest', act: 'coffee', x: 2.2, z: -2.55, rot: Math.PI, fz: -1.45 },
  { id: 'cafe2', cat: 'rest', act: 'coffee', x: 3.4, z: -2.55, rot: Math.PI, fz: -1.45 },
];
const STAND_ACTS = new Set(['treadmill', 'dumbbells', 'coffee']);   // 站著做（腳貼地／貼跑帶）
const SOFA_ACTS = new Set(['sofa', 'massage']);                     // 沿用原本沙發坐姿（座位低 0.07）
const SADDLE_TOP = 0.595, MAT_TOP = 0.02;
const WALK_MS = 1500;
const AISLE = 3.1, LANE_L = -5.35, LANE_R = 4.75, ELEV_X = 7.15, ELEV_DOOR_X = 5.85, WALK_SPEED = 3.0;   // 左右兩座電梯以 x=0 對稱（左側 x 取負）
const PAL = {
  slab: 0xf1e6d4, slabEdge: 0x2e2b45, pillar: 0x3b3856, mullion: 0x4a4668,
  desk: 0xf7f1e8, deskLeg: 0x3a3a4a, chair: 0x3d4466, chairSeat: 0x4b5580,
  pot: 0xe9d6c0, leaf: 0x5fae7a, leaf2: 0x7cc48f, skin: 0xffe3cf,
  rug: [0, 0xb59a85, 0x8fa8a0, 0xc99a88, 0x9e93b8],
};

const floorY = (f) => (f - 1) * FLOOR_H;
const FLOOR_COLOR = { 4: '#ffcf6e', 3: '#ff9b7a', 2: '#5fd4c0', 1: '#7cb6ff', 0: '#c3a6ff' };
const floorAt = (y) => Math.max(1, Math.min(TOP_FLOOR, Math.round((y - floorY(1)) / FLOOR_H) + 1));
const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0.02, flatShading: true, ...extra });
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

function signTexture(text) {
  const c = document.createElement('canvas'); c.width = 640; c.height = 160;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 640, 0); grad.addColorStop(0, '#2b2746'); grad.addColorStop(1, '#3a3158');
  g.fillStyle = grad; g.beginPath(); g.roundRect(6, 6, 628, 148, 36); g.fill();
  g.strokeStyle = 'rgba(255,184,107,.85)'; g.lineWidth = 5; g.stroke();
  g.fillStyle = '#ffd6a3';
  let fs = 74;   // 字太長（例如「3F・健身房與休息空間」）時縮小字級，不超出牌子
  const font = (n) => `700 ${n}px -apple-system, "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif`;
  g.font = font(fs); while (fs > 30 && g.measureText(text).width > 580) { fs -= 2; g.font = font(fs); }
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
  let softGL = false, compactTags = false, footLog = null;
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
  Object.assign(controls, { enableDamping: true, dampingFactor: 0.07, minDistance: 7.5, maxDistance: 75, rotateSpeed: 0.65, zoomSpeed: 0.9, enableZoom: true, panSpeed: 0.7, screenSpacePanning: true, maxPolarAngle: Math.PI * 0.485, minPolarAngle: 0.2 });
  // 縮放：一指旋轉、兩指捏合縮放（兩指同時可旋轉，不平移，避免鏡頭目標跑進建築裡）
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE };
  // 只讓 3D 畫面縮放，不讓瀏覽器把整頁放大：iOS Safari 會忽略 user-scalable=no，所以擋掉 gesture* 與多指 touchmove
  for (const t of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(t, (e) => e.preventDefault(), { passive: false });
  container.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });

  // 光線：暖色主光 + 冷色補光 + 每層室內暖燈
  const hemi = new THREE.HemisphereLight(0xffe8d2, 0x2a2442, 1.05); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffd2a6, 2.1);
  sun.position.set(10, 26, 16); sun.castShadow = true;
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 20, bottom: -10, near: 2, far: 80 });
  sun.shadow.mapSize.set(1024, 1024); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03; sun.shadow.radius = 4;
  sun.target.position.set(0, 8, 0); scene.add(sun, sun.target);
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

  const TOP = floorY(TOP_FLOOR) + WALL_H;
  for (const [px, pz] of [[-W / 2 + 0.16, -D / 2 + 0.16], [W / 2 - 0.16, -D / 2 + 0.16], [-W / 2 + 0.16, D / 2 - 0.16], [W / 2 - 0.16, D / 2 - 0.16]]) box(0.3, TOP + SLAB, 0.3, pillarMat, px, (TOP - SLAB) / 2, pz);
  for (const z of [-D / 2 + 0.16, D / 2 - 0.16]) box(W, 0.16, 0.2, pillarMat, 0, TOP, z);
  for (const x of [-W / 2 + 0.16, W / 2 - 0.16]) box(0.2, 0.16, D, pillarMat, x, TOP, 0);
  for (let f = 1; f <= TOP_FLOOR; f++) {
    const y = floorY(f);
    box(W, SLAB, D, slabMat, 0, y - SLAB / 2, 0);
    box(W + 0.14, SLAB * 0.55, D + 0.14, slabEdgeMat, 0, y - SLAB * 0.72, 0);   // 外緣深色收邊
    if (f < TOP_FLOOR) { // 樓板下方的燈條，照亮下一層
      for (const lx of [-3, 0, 3]) { const l = box(1.6, 0.04, 0.22, lampMat, lx, floorY(f + 1) - SLAB - 0.03, 0.4); l.castShadow = false; }
    }
    // 玻璃帷幕（後牆與兩側）＋窗框
    const back = new THREE.Mesh(new THREE.PlaneGeometry(W, H), glassMat); back.position.set(0, y + H / 2, -D / 2 + 0.05); scene.add(back);
    for (let i = 1; i < 6; i++) box(0.06, H, 0.06, mullionMat, -W / 2 + i * W / 6, y + H / 2, -D / 2 + 0.05);
    box(W, 0.06, 0.08, mullionMat, 0, y + 0.9, -D / 2 + 0.05); box(W, 0.08, 0.1, mullionMat, 0, y + H, -D / 2 + 0.05);
    for (const sx of [-1, 1]) {
      const gap = [-0.8, 0.8];   // 左右兩側都是電梯門
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
    if (f !== GYM_FLOOR) { plant(W / 2 - 0.75, y, -D / 2 + 0.75, 1.05); plant(W / 2 - 0.75, y, D / 2 - 0.8, 0.8); }   // 3F 角落留給器材
  }
  // ===== 左右兩座玻璃電梯（井道＋車廂＋滑門），連接 1F–4F；原本的左側樓梯已拆除 =====
  const SHAFT_H = floorY(TOP_FLOOR) + WALL_H + 0.9;
  const shaftGlass = new THREE.MeshPhysicalMaterial({ color: 0xcfe0ff, transparent: true, opacity: 0.14, roughness: 0.05, depthWrite: false, side: THREE.DoubleSide });
  const cabFrame = std(0x4a4668, { roughness: 0.4, metalness: 0.3 });
  const cabGlass = new THREE.MeshPhysicalMaterial({ color: 0xffe7c4, transparent: true, opacity: 0.22, roughness: 0.1, depthWrite: false, side: THREE.DoubleSide });
  const doorMat = std(0xb9bfd3, { roughness: 0.3, metalness: 0.5 });
  function buildElevator(side, startFloor) {
    const ex = side * ELEV_X;
    for (const [ox, oz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) box(0.12, SHAFT_H + SLAB, 0.12, pillarMat, ex + ox, (SHAFT_H - SLAB) / 2, oz);
    box(1.75, 0.14, 1.75, pillarMat, ex, SHAFT_H, 0);
    { const gx = new THREE.Mesh(new THREE.PlaneGeometry(1.6, SHAFT_H), shaftGlass); gx.rotation.y = Math.PI / 2; gx.position.set(ex + side * 0.8, SHAFT_H / 2, 0); scene.add(gx);
      for (const sz of [-1, 1]) { const gz = new THREE.Mesh(new THREE.PlaneGeometry(1.6, SHAFT_H), shaftGlass); gz.position.set(ex, SHAFT_H / 2, sz * 0.8); scene.add(gz); } }
    for (let f = 1; f <= TOP_FLOOR; f++) box(0.62, 0.08, 1.5, slabEdgeMat, side * (W / 2 + 0.31), floorY(f) - 0.04, 0);   // 門檻板
    const cabin = new THREE.Group(); scene.add(cabin);
    box(1.4, 0.08, 1.4, cabFrame, ex, 0.0, 0, cabin); box(1.4, 0.08, 1.4, cabFrame, ex, 2.3, 0, cabin);
    for (const [ox, oz] of [[-0.68, -0.68], [0.68, -0.68], [-0.68, 0.68], [0.68, 0.68]]) box(0.06, 2.3, 0.06, cabFrame, ex + ox, 1.15, oz, cabin);
    { const bk = new THREE.Mesh(new THREE.PlaneGeometry(1.36, 2.2), cabGlass); bk.rotation.y = Math.PI / 2; bk.position.set(ex + side * 0.68, 1.15, 0); cabin.add(bk);
      for (const sz of [-1, 1]) { const sd = new THREE.Mesh(new THREE.PlaneGeometry(1.36, 2.2), cabGlass); sd.position.set(ex, 1.15, sz * 0.68); cabin.add(sd); } }
    const cabLight = box(0.9, 0.03, 0.9, lampMat, ex, 2.24, 0, cabin); cabLight.castShadow = false;
    const doorL = box(0.05, 2.18, 0.66, doorMat, ex - side * 0.7, 1.13, -0.33, cabin);
    const doorR = box(0.05, 2.18, 0.66, doorMat, ex - side * 0.7, 1.13, 0.33, cabin);
    const e = { side, x: ex, doorX: side * ELEV_DOOR_X, y: floorY(startFloor), door: 0, lock: Promise.resolve(), pending: 0, slots: {}, cabin, doorL, doorR, rides: 0 };
    applyElev(e);
    return e;
  }
  function applyElev(e) { e.cabin.position.y = e.y; e.doorL.position.z = -0.33 - e.door * 0.62; e.doorR.position.z = 0.33 + e.door * 0.62; }
  const ELEVS = [buildElevator(1, 1), buildElevator(-1, GYM_FLOOR)];   // [右, 左]
  const cabins = new Set(ELEVS.map(e => e.cabin));

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

  // 樓層專屬擺設（休息區已全部搬到 3F 健身房與休息空間）
  shelf(-3.6, floorY(4), -D / 2 + 0.45); shelf(3.6, floorY(4), -D / 2 + 0.45); plant(4.6, floorY(4), -1.6, 0.9);
  box(2.0, 1.1, 0.06, std(0xfafafa, { emissive: 0x222222 }), -3.5, floorY(2) + 1.75, -D / 2 + 0.2); // 白板
  box(2.6, 1.0, 0.7, std(0xf2e8da), 0.6, floorY(1) + 0.5, -2.6); // 接待櫃台
  box(2.7, 0.06, 0.8, std(0x3b3856), 0.6, floorY(1) + 1.03, -2.6);
  const door = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.4), new THREE.MeshPhysicalMaterial({ color: 0xffe2b8, transparent: true, opacity: 0.25, emissive: 0xffc98f, emissiveIntensity: 0.3, side: THREE.DoubleSide }));
  door.position.set(0, floorY(1) + 1.2, D / 2 + 0.01); scene.add(door);

  // ===== 3F 健身房與休息空間：器材全部是程序化低多邊形幾何 =====
  const deckMat = std(0x2d2b3d, { roughness: 0.6 });
  const gymFrameMat = std(0x9aa1b8, { roughness: 0.35, metalness: 0.5 });
  const gymAccentMat = std(0xff9b7a, { roughness: 0.5 });
  const matMats = [std(0x7fc8a9, { roughness: 0.9 }), std(0xb59be0, { roughness: 0.9 })];
  const beltTex = (() => { const c = document.createElement('canvas'); c.width = 16; c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#2a2838'; g.fillRect(0, 0, 16, 64); g.fillStyle = '#4a4762'; for (let i = 0; i < 64; i += 8) g.fillRect(0, i, 16, 2); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 4); return t; })();
  const beltMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: beltTex, roughness: 0.85 });
  const PLATFORMS = [];   // 可以站上去的器材頂面（跑步機），給「腳踩地面」用
  const CRANKS = [];      // 健身車踏板（有人騎時轉動）
  const gy = floorY(GYM_FLOOR);
  function treadmill(x, z) {   // 沿 x 方向，使用者面向 +x，控制台在 +x 端
    const g = new THREE.Group(); g.position.set(x, gy, z);
    box(1.4, 0.1, 0.78, deckMat, 0, 0.05, 0, g);
    const belt = box(1.3, 0.04, 0.6, beltMat, 0, 0.12, 0, g); belt.rotation.y = Math.PI / 2; belt.scale.set(0.6 / 1.3, 1, 1.3 / 0.6);
    for (const sz of [-1, 1]) box(0.05, 1.05, 0.05, gymFrameMat, 0.74, 0.6, sz * 0.32, g);   // 控制台立柱（不做扶手，前後都能走進跑帶）
    const panel = box(0.08, 0.26, 0.66, gymAccentMat, 0.76, 1.18, 0, g); panel.rotation.z = 0.3;
    scene.add(g);
    PLATFORMS.push({ x0: x - 0.65, x1: x + 0.65, z0: z - 0.3, z1: z + 0.3, y: gy + 0.14 }, { x0: x - 0.7, x1: x + 0.7, z0: z - 0.39, z1: z + 0.39, y: gy + 0.1 });
  }
  function bike(x, z) {         // 使用者面向 +z，坐在原點的座墊上
    const g = new THREE.Group(); g.position.set(x, gy, z);
    box(0.1, 0.06, 1.0, gymFrameMat, 0, 0.03, 0.3, g);
    box(0.5, 0.05, 0.08, gymFrameMat, 0, 0.025, -0.16, g); box(0.5, 0.05, 0.08, gymFrameMat, 0, 0.025, 0.76, g);
    box(0.05, 0.5, 0.05, gymFrameMat, 0, 0.3, -0.04, g);
    box(0.26, 0.07, 0.32, deckMat, 0, 0.56, 0, g);
    const post = box(0.06, 0.95, 0.06, gymFrameMat, 0, 0.5, 0.64, g); post.rotation.x = -0.18;
    box(0.52, 0.05, 0.06, gymFrameMat, 0, 0.98, 0.56, g);
    const wheel = add(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.06, 18), gymAccentMat), g); wheel.rotation.z = Math.PI / 2; wheel.position.set(0, 0.3, 0.74);
    const crank = new THREE.Group(); crank.position.set(0, 0.3, 0.34); g.add(crank);
    for (const sx of [-1, 1]) { const arm = box(0.03, 0.2, 0.04, gymFrameMat, sx * 0.24, sx * 0.08, 0, crank); arm.rotation.x = 0; box(0.1, 0.03, 0.08, deckMat, sx * 0.28, sx * 0.17, 0, crank); }
    scene.add(g); CRANKS.push({ x, z, crank });
  }
  function yogaMat(x, z, i) { const m = box(0.66, 0.02, 1.5, matMats[i % 2], x, gy + 0.01, z); m.castShadow = false; }
  function dumbbellRack(x, z) {
    const g = new THREE.Group(); g.position.set(x, gy, z);
    box(0.9, 0.5, 0.32, std(0x5a4a6e), 0, 0.25, 0, g);
    for (let i = 0; i < 3; i++) { const bar = add(new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.22, 6), gymFrameMat), g); bar.rotation.z = Math.PI / 2; bar.position.set(-0.3 + i * 0.3, 0.56, 0); for (const s of [-1, 1]) { const d = add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 10), deckMat), g); d.rotation.z = Math.PI / 2; d.position.set(-0.3 + i * 0.3 + s * 0.1, 0.56, 0); } }
    scene.add(g);
  }
  function massageChair(x, z, color) {   // 面向 +z，座位在原點
    const g = new THREE.Group(); g.position.set(x, gy, z - 0.04);
    const m = std(color), cush = std(new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.3).getHex());
    box(0.9, 0.36, 0.84, m, 0, 0.24, 0, g);
    const back = box(0.9, 1.05, 0.22, m, 0, 0.9, -0.33, g); back.rotation.x = -0.12;
    box(0.16, 0.46, 0.84, m, -0.45, 0.46, 0, g); box(0.16, 0.46, 0.84, m, 0.45, 0.46, 0, g);
    box(0.68, 0.08, 0.62, cush, 0, 0.47, 0.06, g);
    box(0.5, 0.06, 0.06, gymAccentMat, 0, 1.38, -0.4, g);
    scene.add(g);
  }
  for (const sp of REST_SPOTS) {
    if (sp.act === 'treadmill') treadmill(sp.x, sp.z);
    else if (sp.act === 'bike') bike(sp.x, sp.z);
    else if (sp.act === 'yoga') yogaMat(sp.x, sp.z, sp.x > -0.5 ? 1 : 0);
    else if (sp.act === 'dumbbells') dumbbellRack(sp.x, sp.z - 0.95);
    else if (sp.act === 'massage') massageChair(sp.x, sp.z, 0x6f9fd9);
  }
  sofa(2.4, gy, 2.0, 0xd98a6a);
  coffeeBar(2.8, gy, -3.45);

  // ===== 人物 =====
  const figures = new Map();
  let extraCount = 0;

  function buildFigure(key, floor, x, z, isLead) {
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

    const walker = new THREE.Group(); walker.userData.walker = true; scene.add(walker);
    const slot = new THREE.Group(); walker.add(slot);
    const deskSeat = { pos: new THREE.Vector3(x, floorY(floor), z - 0.22), rot: 0, kind: 'desk', side: x < 0 ? 1 : -1 };
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
    el.style.visibility = 'hidden';
    el.addEventListener('click', (ev) => { ev.stopPropagation(); onSelect && onSelect(key); });
    overlay.appendChild(el);

    const anchor = new THREE.Vector3();
    const fig = { key, grp, slot, walker, deskSeat, loungeSeat: null, restSpot: null, restSession: 0, commuting: null, props: null, atDesk: false, want: false, busy: false, moving: false, carry: null, walk: null, floor, floorBase: floorY(floor), av: null, avSet: null, color: null, ringMat, ring, screenMat, hit, el, fx, dot, nm, st, step, anchor, status: '', shape: null, phase: Math.random() * 6 };
    figures.set(key, fig);
    assignRest(fig); walker.position.copy(fig.loungeSeat.pos); walker.rotation.y = fig.loungeSeat.rot;
    return fig;
  }
  // 休息站位：每位、每一段休息只抽一次（雜湊決定，不會每幀換），約一半健身、一半休息；該類滿了才改另一類
  const spotOwner = new Map();
  const hashStr = (s) => { let x = 0x811c9dc5; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 0x01000193) >>> 0; } return x; };
  function restSeatOf(sp) {
    if (sp.seat) return sp.seat;
    const y = floorY(GYM_FLOOR) + (SOFA_ACTS.has(sp.act) ? -0.07 : 0);
    sp.seat = { pos: new THREE.Vector3(sp.x, y, sp.z), rot: sp.rot, kind: 'lounge', act: sp.act, stand: STAND_ACTS.has(sp.act), spot: sp,
      front: sp.fz != null ? new THREE.Vector3(sp.x, floorY(GYM_FLOOR), sp.fz) : null };
    return sp.seat;
  }
  function assignRest(f) {
    if (f.restSpot) return f.loungeSeat;
    const base = f.key + '#' + f.restSession, first = (hashStr(base) >>> 3) & 1 ? 'rest' : 'gym';
    const order = (cat) => REST_SPOTS.filter(s => s.cat === cat).map(s => [hashStr(base + '#' + s.id), s]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
    const sp = order(first).find(s => !spotOwner.has(s.id)) || order(first === 'gym' ? 'rest' : 'gym').find(s => !spotOwner.has(s.id)) || REST_SPOTS[0];
    spotOwner.set(sp.id, f.key); f.restSpot = sp; f.loungeSeat = restSeatOf(sp);
    return f.loungeSeat;
  }
  function releaseRest(f) {
    if (!f.restSpot) return;
    if (spotOwner.get(f.restSpot.id) === f.key) spotOwner.delete(f.restSpot.id);
    f.restSpot = null; f.restSession++;
  }

  function ensureFigure(state, key) {
    if (figures.has(key)) return figures.get(key);
    const meta = botMeta(state, key);
    if (meta.floor) { const [x, z] = SEATS[key]; return buildFigure(key, meta.floor, x, z, key === 'nori'); }
    if (extraCount >= EXTRA_SEATS.length) return null;
    const i = extraCount++;
    const [x, z] = EXTRA_SEATS[i];
    return buildFigure(key, 1, x, z, false);
  }
  for (const b of BOTS) ensureFigure({ extras: {}, looks: {} }, b.key);

  // 手上道具（程序化）：一對啞鈴、一個咖啡杯，掛在人物的 slot 下
  const propBarGeo = new THREE.CylinderGeometry(0.016, 0.016, 0.2, 6), propDiscGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.045, 10), cupGeo = new THREE.CylinderGeometry(0.045, 0.038, 0.09, 10);
  const cupMat = std(0xffffff, { roughness: 0.5 });
  function propsOf(f) {
    if (f.props) return f.props;
    const bells = new THREE.Group(); f.slot.add(bells);
    const one = () => { const g = new THREE.Group(); const b = new THREE.Mesh(propBarGeo, gymFrameMat); b.rotation.z = Math.PI / 2; g.add(b); for (const s of [-1, 1]) { const d = new THREE.Mesh(propDiscGeo, deckMat); d.rotation.z = Math.PI / 2; d.position.x = s * 0.09; g.add(d); } bells.add(g); return g; };
    const bellL = one(), bellR = one();
    const cup = new THREE.Mesh(cupGeo, cupMat); f.slot.add(cup);
    bells.visible = false; cup.visible = false;
    f.props = { bells, bellL, bellR, cup };
    return f.props;
  }
  // 坐姿時（不含腳）角色最低點的高度，給健身車座墊、瑜珈墊對齊用
  function sitMinOf(av) {
    av.root.updateWorldMatrix(true, true); const bb = new THREE.Box3(); let min = Infinity;
    const rootY = new THREE.Vector3().setFromMatrixPosition(av.root.matrixWorld).y;   // 量角色自己座標裡的高度（不含所在樓層）
    for (const c of av.root.children) { if (c === av.legs) continue; bb.makeEmpty(); bb.expandByObject(c, true); if (!bb.isEmpty()) min = Math.min(min, bb.min.y - rootY); }
    return isFinite(min) ? min : 0.5;
  }
  function setFx(fig, status) {
    fig.fx.replaceChildren();
    const mk = (cls, text) => { const s = document.createElement('span'); s.className = cls; if (text) s.textContent = text; return s; };
    if (status === 'idle') { const z = mk('fx-z'); z.append(mk('', 'Z'), mk('', 'z'), mk('', 'z')); fig.fx.append(z); }
    else if (status === 'waiting_user') fig.fx.append(mk('fx-bang', '!'));
    else if (status === 'error') fig.fx.append(mk('fx-bang fx-err', '!'));
    else if (status === 'working') { const d = mk('fx-dots'); d.append(mk(''), mk(''), mk('')); fig.fx.append(d); }
    else if (status === 'done') fig.fx.append(mk('fx-ok', '✓'));
  }

  // 走路：工作中回辦公桌，其他狀態去 3F 健身房與休息空間（不同樓層就搭電梯）；剛載入時直接就位不走路
  const bornAt = performance.now();
  function moveTo(fig, toDesk) {
    const prevSeat = fig.atDesk ? fig.deskSeat : fig.loungeSeat;
    if (toDesk) releaseRest(fig);
    fig.atDesk = toDesk;
    const from = fig.walker.position.clone();
    const seat = toDesk ? fig.deskSeat : assignRest(fig);
    if (performance.now() - bornAt < 4000 || document.hidden) {
      fig.walk = null; fig.walker.position.copy(seat.pos); fig.walker.rotation.y = seat.rot; return;
    }
    const fa = floorAt(from.y + 0.1), fb = floorAt(seat.pos.y + 0.1);
    const ign = [...seatMeshes(prevSeat), ...seatMeshes(seat)];
    if (fa === fb) {
      const route = planPath(fa, from, seat.pos, bodyRadius(fig), ign, true).pts;
      const pts = [from, ...route]; pts[pts.length - 1] = seat.pos.clone();
      const lens = []; let total = 0;
      for (let i = 1; i < pts.length; i++) { const l = pts[i].distanceTo(pts[i - 1]); lens.push(l); total += l; }
      fig.walk = { pts, lens, total, t0: performance.now(), ms: Math.max(WALK_MS, total / 2.4 * 1000), rot: seat.rot };
      start(); return;
    }
    fig.walk = null;
    const p = (async () => {
      await travel(fig, fa, fb, seat.pos, 'elevator', ign, true);
      fig.walker.position.copy(seat.pos); await turnTo(fig, seat.rot, 250);
    })();
    fig.commuting = p;
    p.catch(() => { }).finally(() => {
      if (fig.commuting === p) fig.commuting = null;
      fig.moving = false;
      if (!fig.busy && fig.want !== fig.atDesk) moveTo(fig, fig.want);
    });
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
    f.walker.position.y = groundAt(f.walker.position.x, f.walker.position.z, f.walker.position.y); // 腳踩地面（不再整個人浮起來）
    if (k >= 1) { f.walk = null; f.walker.position.copy(w.pts[w.pts.length - 1]); f.walker.rotation.y = w.rot; }
    return k;
  }

  // ===== 腳踩地面：算出某個位置的「地面頂面高度」=====
  // 電梯車廂內 → 車廂地板頂面；跑步機上 → 跑帶頂面；其他 → 最近樓層的樓板頂面（floorY）
  const CAB_FLOOR = 0.04;   // 車廂地板（厚 0.08、中心在車廂原點）的頂面
  function groundAt(x, z, nearY) {
    for (const e of ELEVS) if (Math.abs(x - e.x) < 0.7 && Math.abs(z) < 0.7 && Math.abs(nearY - e.y) < 1.2) return e.y + CAB_FLOOR;
    for (const p of PLATFORMS) if (x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1 && Math.abs(nearY - p.y) < 0.6) return p.y;
    return floorY(floorAt(nearY));
  }
  // 每格：先把腳擺好（走路擺動），把兩隻腳的每個頂點換到世界座標，查每個頂點正下方的地面高度，
  // 再把整個角色上下移到「沒有任何頂點低於它下面的地面，且至少有一個頂點剛好貼地」
  const vtx = new THREE.Vector3();
  function footVerts(ft, cb) {
    const pos = ft.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) { vtx.fromBufferAttribute(pos, i).applyMatrix4(ft.matrixWorld); cb(vtx); }
  }
  function plantFeet(f) {
    f.slot.position.y = 0; f.walker.updateMatrixWorld(true);
    let need = -Infinity; const ny = f.walker.position.y;
    for (const ft of f.av.feet) footVerts(ft, (v) => { need = Math.max(need, groundAt(v.x, v.z, ny) - v.y); });
    f.slot.position.y = need; f.slot.updateMatrixWorld(true);
  }
  // 唯讀檢查用：每隻腳的每個頂點，量「頂點高度 − 正下方實際地板幾何表面」（射線），取最小值
  const probeRay = new THREE.Raycaster(); const DOWN = new THREE.Vector3(0, -1, 0), rayO = new THREE.Vector3();
  let floorMeshes = null, staticMeshes = null;
  function footProbe(k) {
    const f = figures.get(k); if (!f || !f.av || !f.av.feet) return null;
    if (!floorMeshes) {
      const skip = new Set(); for (const g of figures.values()) g.walker.traverse(o => skip.add(o));
      staticMeshes = []; scene.traverse(o => { if (o.isMesh && !skip.has(o) && o.visible && !(o.material && (o.material.transparent || o.material.visible === false))) staticMeshes.push(o); });
      const floorMats = new Set([slabMat, slabEdgeMat, cabFrame, deckMat, beltMat]);
      floorMeshes = staticMeshes.filter(o => floorMats.has(o.material));
    }
    f.walker.updateMatrixWorld(true);
    const ny = f.walker.position.y, out = [];
    for (const ft of f.av.feet) {
      let gap = Infinity, gapGround = Infinity, gapAny = Infinity, sole = Infinity, cx = 0, cz = 0, n = 0;
      const pos = ft.geometry.attributes.position; let minLocal = Infinity;
      for (let i = 0; i < pos.count; i++) minLocal = Math.min(minLocal, pos.getY(i));
      let vi = 0;
      footVerts(ft, (v) => {
        if (pos.getY(vi++) > minLocal + 1e-4) return;   // 只量腳底那一面的頂點
        sole = Math.min(sole, v.y); cx += v.x; cz += v.z; n++;
        gapGround = Math.min(gapGround, v.y - groundAt(v.x, v.z, ny));
        // 射線起點在頂點上方 0.15（避免打到頭頂上一層的東西）
        probeRay.set(rayO.set(v.x, v.y + 0.15, v.z), DOWN); probeRay.far = 1.5;
        const h = probeRay.intersectObjects(floorMeshes, false)[0]; if (h) gap = Math.min(gap, v.y - h.point.y);
        const h2 = probeRay.intersectObjects(staticMeshes, false)[0]; if (h2) gapAny = Math.min(gapAny, v.y - h2.point.y);
      });
      out.push({ sole: +sole.toFixed(4), gap: isFinite(gap) ? +gap.toFixed(4) : null, gapGround: +gapGround.toFixed(4), gapAny: isFinite(gapAny) ? +gapAny.toFixed(4) : null, x: +(cx / n).toFixed(2), z: +(cz / n).toFixed(2) });
    }
    return { feet: out, legsVisible: f.av.legs.visible, walking: !!f.walk || f.moving, busy: f.busy, inCab: ELEVS.some(e => Math.abs(f.walker.position.x - e.x) < 0.7 && Math.abs(f.walker.position.z) < 0.7) };
  }

  // 唯讀檢查用：角色身體（所有網格頂點）有沒有穿進靜態物件（家具、器材、牆柱）。
  // 每個靜態網格都在自己的區域座標裡用幾何外框判斷，穿入深度 > 1 公分才算；站立用的地板（樓板、平台、踏階頂面）只在穿入時才算。
  let bodyTargets = null; const bpL = new THREE.Vector3(), bpS = new THREE.Vector3(), bpInv = new THREE.Matrix4();
  function bodyProbe(k) {
    const f = figures.get(k); if (!f || !f.av) return null;
    if (!bodyTargets) {
      if (!staticMeshes) footProbe(k);
      bodyTargets = staticMeshes.map(o => { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); return o; });
    }
    f.walker.updateMatrixWorld(true);
    const pts = [];
    const root = f.slot;
    root.traverse(o => { if (!o.isMesh || !o.visible) return; let vis = true; for (let q = o; q && q !== root; q = q.parent) if (!q.visible) vis = false; if (!vis) return;
      const pos = o.geometry.attributes.position; const step = Math.max(1, Math.floor(pos.count / 60));
      let part = 'body'; for (let q = o; q && q !== root; q = q.parent) { if (f.av.feet && f.av.feet.includes(q)) part = 'foot'; else if (q === f.av.legs && part === 'body') part = 'leg'; }
      for (let i = 0; i < pos.count; i += step) { const v = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); v.part = part; pts.push(v); } });
    const hits = [];
    // 起身／坐下時碰到自己的座椅不算（只在離座位 1 公尺內）
    const own = new Set(); for (const seat of [f.deskSeat, f.loungeSeat]) if (seat && Math.hypot(f.walker.position.x - seat.pos.x, f.walker.position.z - seat.pos.z) < 1.0) for (const m of seatMeshes(seat, true)) own.add(m);
    for (const m of bodyTargets) {
      if (own.has(m)) continue;
      m.updateWorldMatrix(true, false); bpInv.copy(m.matrixWorld).invert(); m.getWorldScale(bpS);
      const bb = m.geometry.boundingBox; let worst = 0, wv = null;
      for (const v of pts) {
        bpL.copy(v).applyMatrix4(bpInv);
        const dx = Math.min(bpL.x - bb.min.x, bb.max.x - bpL.x) * Math.abs(bpS.x), dy = Math.min(bpL.y - bb.min.y, bb.max.y - bpL.y) * Math.abs(bpS.y), dz = Math.min(bpL.z - bb.min.z, bb.max.z - bpL.z) * Math.abs(bpS.z);
        const d = Math.min(dx, dy, dz); if (d > worst) { worst = d; wv = v; }
      }
      if (worst > 0.01) {
        const c = new THREE.Vector3(); m.getWorldPosition(c);
        const cat = (m.material === slabMat || m.material === slabEdgeMat || m.material === cabFrame) ? 'floor' : 'furniture';
        hits.push({ cat, depth: +worst.toFixed(3), pt: [+wv.x.toFixed(2), +(wv.y - f.walker.position.y).toFixed(2), +wv.z.toFixed(2), wv.part], mat: '#' + m.material.color.getHexString(), at: [+c.x.toFixed(2), +c.y.toFixed(2), +c.z.toFixed(2)] });
      }
    }
    let rad = 0; const wp = f.walker.position; const inv = new THREE.Matrix4().copy(f.walker.matrixWorld).invert(); const ext = [0, 0, 0, 0];
    for (const v of pts) { rad = Math.max(rad, Math.hypot(v.x - wp.x, v.z - wp.z)); const l = v.clone().applyMatrix4(inv); ext[0] = Math.min(ext[0], l.x); ext[1] = Math.max(ext[1], l.x); ext[2] = Math.min(ext[2], l.z); ext[3] = Math.max(ext[3], l.z); }
    return { hits, pts: pts.length, rad: +rad.toFixed(3), ext: ext.map(e => +e.toFixed(3)) };
  }

  // ===== 走路路徑：避開家具（每層一張 0.1 公尺格子地圖，A* 找路後拉直）=====
  // 障礙物＝各層地板上方 0.03～1.9 公尺內的實心網格（家具、桌椅、盆栽、櫃台、柱子）；樓板、地毯、玻璃不算。
  // 角色當成圓形，半徑取它目前外型站立時的水平最大範圍＋3 公分。自己的座椅（沙發／單人椅／辦公椅）在起身、坐下時可以碰到，不算障礙。
  const GR = 0.1, GX0 = -5.9, GX1 = 5.9, GZ0 = -3.85, GZ1 = 3.85;
  const GNX = Math.round((GX1 - GX0) / GR) + 1, GNZ = Math.round((GZ1 - GZ0) / GR) + 1;
  let OBS = null;
  function obstacles() {
    if (OBS) return OBS;
    OBS = {}; for (let fl = 1; fl <= TOP_FLOOR; fl++) OBS[fl] = [];
    scene.updateMatrixWorld(true); const bb = new THREE.Box3();
    const visit = (o, fn) => { if (o.userData.walker || cabins.has(o)) return; fn(o); for (const c of o.children) visit(c, fn); };
    visit(scene, o => {
      if (!o.isMesh || !o.visible) return; const mt = o.material;
      if (!mt || mt.transparent || mt.visible === false || mt === slabMat || mt === slabEdgeMat) return;
      bb.setFromObject(o);
      for (let fl = 1; fl <= TOP_FLOOR; fl++) { const y = floorY(fl); if (bb.max.y > y + 0.03 && bb.min.y < y + 1.9 && bb.max.x > GX0 - 1 && bb.min.x < GX1 + 1 && bb.max.z > GZ0 - 1 && bb.min.z < GZ1 + 1) OBS[fl].push({ x0: bb.min.x, x1: bb.max.x, z0: bb.min.z, z1: bb.max.z, m: o }); }
    });
    return OBS;
  }
  // 座位所在的那張椅子／沙發。whole=false（找路用）：只取外框包含座位點的零件（坐墊、底座），椅背、扶手仍是障礙；
  // whole=true（身體碰撞檢查用）：起身／坐下時會碰到的整張座椅——休息區取整組沙發／單人椅，辦公椅取中心離座位 0.4 公尺內的零件（含椅背，不含桌子）
  function seatMeshes(seat, whole = false) {
    if (!seat) return [];
    const ck = whole ? '_meshW' : '_mesh';
    if (seat[ck]) return seat[ck];
    const fl = floorAt(seat.pos.y + 0.1);
    const obs = obstacles()[fl];
    const hit = obs.filter(o => seat.pos.x > o.x0 - 0.02 && seat.pos.x < o.x1 + 0.02 && seat.pos.z > o.z0 - 0.02 && seat.pos.z < o.z1 + 0.02).map(o => o.m);
    if (!whole) return (seat[ck] = hit);
    const groups = new Set(seat.kind === 'lounge' ? hit.map(m => m.parent).filter(g => g && g !== scene) : []);
    seat[ck] = obs.filter(o => hit.includes(o.m) || groups.has(o.m.parent) || (seat.kind === 'desk' && Math.hypot((o.x0 + o.x1) / 2 - seat.pos.x, (o.z0 + o.z1) / 2 - seat.pos.z) < 0.4)).map(o => o.m);
    return seat[ck];
  }
  function bodyRadius(f) {
    if (f._rad && f._radAv === f.av) return f._rad;
    let r = 0.4;
    if (f.av) {
      const lv = f.av.legs ? f.av.legs.visible : null; if (f.av.legs) f.av.legs.visible = true;
      f.walker.updateMatrixWorld(true); const inv = new THREE.Matrix4().copy(f.walker.matrixWorld).invert(); const v = new THREE.Vector3(); r = 0;
      f.slot.traverse(o => { if (!o.isMesh) return; const pos = o.geometry.attributes.position; for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).applyMatrix4(inv); r = Math.max(r, Math.hypot(v.x, v.z)); } });
      if (f.av.legs) f.av.legs.visible = lv;
    }
    f._rad = r + 0.03; f._radAv = f.av; return f._rad;
  }
  function makeFree(fl, r, ign) {
    const list = obstacles()[fl].filter(o => !ign.has(o.m));
    const cache = new Int8Array(GNX * GNZ);   // 0 未算、1 可走、2 擋住
    const pt = (x, z) => {
      if (x < GX0 + r - 0.35 || x > GX1 - r + 0.35 || z < GZ0 + r - 0.35 || z > GZ1 - r + 0.35) return false;   // 牆邊留空間
      for (const o of list) { const dx = Math.max(o.x0 - x, 0, x - o.x1), dz = Math.max(o.z0 - z, 0, z - o.z1); if (dx * dx + dz * dz < r * r) return false; }
      return true;
    };
    const cell = (i, j) => { if (i < 0 || j < 0 || i >= GNX || j >= GNZ) return false; const k = i * GNZ + j; if (!cache[k]) cache[k] = pt(GX0 + i * GR, GZ0 + j * GR) ? 1 : 2; return cache[k] === 1; };
    const seg = (a, b) => { const n = Math.max(1, Math.ceil(a.distanceTo(b) / 0.04)); for (let i = 0; i <= n; i++) { const u = i / n; if (!pt(a.x + (b.x - a.x) * u, a.z + (b.z - a.z) * u)) return false; } return true; };
    return { pt, cell, seg };
  }
  function planPath(fl, from, to, r, ignList, forceEnd = false) {
    const ign = new Set(ignList || []);
    const F = makeFree(fl, r, ign), y = floorY(fl);
    const toCell = (p) => [Math.round((p.x - GX0) / GR), Math.round((p.z - GZ0) / GR)];
    const nearest = (c) => { if (F.cell(c[0], c[1])) return c; for (let d = 1; d < 30; d++) { let best = null, bd = 1e9; for (let i = -d; i <= d; i++) for (let j = -d; j <= d; j++) { if (Math.max(Math.abs(i), Math.abs(j)) !== d) continue; if (F.cell(c[0] + i, c[1] + j)) { const dd = i * i + j * j; if (dd < bd) { bd = dd; best = [c[0] + i, c[1] + j]; } } } if (best) return best; } return null; };
    const A = nearest(toCell(from)), B = nearest(toCell(to));
    const P3 = (c) => new THREE.Vector3(GX0 + c[0] * GR, y, GZ0 + c[1] * GR);
    if (!A || !B) return { pts: [to.clone()], ok: false };
    // A*（8 方向；斜走時兩側都要可走，避免切角）
    const key = (i, j) => i * GNZ + j, g = new Float32Array(GNX * GNZ).fill(Infinity), came = new Int32Array(GNX * GNZ).fill(-1), done = new Uint8Array(GNX * GNZ);
    const open = [[0, A[0], A[1]]]; g[key(A[0], A[1])] = 0; let found = false;
    const h = (i, j) => Math.hypot(i - B[0], j - B[1]);
    while (open.length) {
      let bi = 0; for (let q = 1; q < open.length; q++) if (open[q][0] < open[bi][0]) bi = q;
      const [, i, j] = open[bi]; open[bi] = open[open.length - 1]; open.pop();
      const k = key(i, j); if (done[k]) continue; done[k] = 1;
      if (i === B[0] && j === B[1]) { found = true; break; }
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        if (!di && !dj) continue; const ni = i + di, nj = j + dj; if (!F.cell(ni, nj)) continue;
        if (di && dj && (!F.cell(i + di, j) || !F.cell(i, j + dj))) continue;
        const nk = key(ni, nj), ng = g[k] + (di && dj ? 1.4142 : 1);
        if (ng < g[nk]) { g[nk] = ng; came[nk] = k; open.push([ng + h(ni, nj), ni, nj]); }
      }
    }
    if (!found) return { pts: [to.clone()], ok: false };
    const cells = []; for (let k = key(B[0], B[1]); k !== -1; k = came[k]) cells.push([Math.floor(k / GNZ), k % GNZ]);
    cells.reverse();
    // 拉直：從目前點往後找最遠、一路都可走的點
    const raw = cells.map(P3), out = [];
    const startP = new THREE.Vector3(from.x, y, from.z);
    let cur = F.pt(startP.x, startP.z) ? startP : raw[0]; if (cur === raw[0]) out.push(raw[0]);
    let idx = 0;
    while (idx < raw.length - 1) { let far = idx + 1; for (let q = raw.length - 1; q > idx; q--) if (F.seg(cur, raw[q])) { far = q; break; } cur = raw[far]; out.push(cur); idx = far; }
    const end = new THREE.Vector3(to.x, y, to.z);
    if (F.pt(end.x, end.z) && F.seg(cur, end)) { if (out.length && out[out.length - 1].distanceTo(end) < 0.15) out.pop(); out.push(end); }
    else if (forceEnd) out.push(end);   // 目的地是座位本身：最後一小段直接走進座位
    return { pts: out, ok: true, snapped: !F.pt(end.x, end.z) };
  }

  // ===== 送資料動畫：搭電梯（同層直接走）到對方座位，交付後回座 =====
  const P = (x, f, z) => new THREE.Vector3(x, floorY(f), z);
  function seatFront(seat) {
    if (seat.kind === 'desk') return new THREE.Vector3(seat.pos.x + seat.side * 1.1, seat.pos.y, seat.pos.z);
    if (seat.front) return seat.front.clone();
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
      f.walker.position.y = groundAt(f.walker.position.x, f.walker.position.z, f.walker.position.y);
      const dx = b.x - a.x, dz = b.z - a.z;
      if (Math.hypot(dx, dz) > 0.05) { const tr = Math.atan2(dx, dz); const df = ((tr - f.walker.rotation.y + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; f.walker.rotation.y += df * 0.25; }
      if (d >= total) { f.walker.position.copy(pts[pts.length - 1]); f.walker.position.y = groundAt(f.walker.position.x, f.walker.position.z, f.walker.position.y); f.moving = false; return true; }
      return false;
    });
  }
  function turnTo(f, rot, ms = 300) { const r0 = f.walker.rotation.y; const df = ((rot - r0 + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return tween(ms, (e) => { f.walker.rotation.y = r0 + df * e; }); }
  const elevTo = (e, fl) => { const y0 = e.y, y1 = floorY(fl); if (Math.abs(y1 - y0) < 0.01) return Promise.resolve(); return tween(500 + Math.abs(y1 - y0) / 4.5 * 1000, (k) => { e.y = y0 + (y1 - y0) * k; applyElev(e); }); };
  const doors = (e, open) => { const d0 = e.door, d1 = open ? 1 : 0; return tween(420, (k) => { e.door = d0 + (d1 - d0) * k; applyElev(e); }); };
  // 一座電梯一次載一人；後到的人在該層門前排隊（e.lock 依序）
  function rideElevator(f, e, fa, fb, onBoard) {
    const run = async () => {
      await elevTo(e, fa); await doors(e, true);
      if (onBoard) onBoard();
      await walk(f, [P(f.walker.position.x, fa, 0), P(e.doorX, fa, 0), P(e.x, fa, 0)], 1.6);   // 先橫移到門的正前方，再直直走進車廂 await turnTo(f, e.side > 0 ? -Math.PI / 2 : Math.PI / 2);
      await doors(e, false);
      const off = f.walker.position.y - e.y;   // 站在車廂地板上：跟著車廂一起移動，不掛進車廂群組
      const y0 = e.y, y1 = floorY(fb);
      await tween(500 + Math.abs(y1 - y0) / 4.5 * 1000, (k) => { e.y = y0 + (y1 - y0) * k; applyElev(e); f.walker.position.y = e.y + off; });
      await doors(e, true);
      await walk(f, [P(e.doorX, fb, 0)], 1.6);
      e.rides++;
      doors(e, false);
    };
    const p = e.lock.then(run); e.lock = p.catch(() => { }); return p;
  }
  const ELEV_HUB = (e, fl, r) => P(e.side > 0 ? GX1 - r + 0.3 : GX0 + r - 0.3, fl, 0);   // 電梯門前（樓板上）
  // 排隊位置：0＝門前；1、2＝門前左右（沿牆）；3 以後沿走道往內（z=0.4，避開 2F 辦公桌）
  function queueSpot(e, fl, r, k) {
    const hub = ELEV_HUB(e, fl, r);
    if (k === 0) return hub;
    if (k <= 2) return new THREE.Vector3(hub.x - e.side * 0.45, hub.y, k === 1 ? 1.0 : -1.0);   // 往內退一點，身體不碰門框立柱
    return new THREE.Vector3(hub.x - e.side * 0.95 * (k - 2), hub.y, 0.4);
  }
  function takeSlot(e, fl) { const s = e.slots[fl] || (e.slots[fl] = new Set()); let k = 0; while (s.has(k)) k++; s.add(k); return k; }
  function freeSlot(e, fl, k) { e.slots[fl] && e.slots[fl].delete(k); }
  // 選梯：預估上車時間較短的那座；差不到 0.3 秒時選人所在那一側。選定後不換梯
  function pickElevator(f, fa) {
    const est = (e) => e.pending * 7000 + Math.abs(e.y - floorY(fa)) / 4.5 * 1000;
    const [R, L] = ELEVS, tr = est(R), tl = est(L);
    if (Math.abs(tr - tl) <= 300) return f.walker.position.x < 0 ? L : R;
    return tr < tl ? R : L;
  }
  // 同一層：A* 找路；跨樓層：走到選定電梯的門前（或排隊位置），搭電梯，再從另一層電梯門前走到目的地
  async function travel(f, fa, fb, target, mode, ign, forceEnd) {
    const r = bodyRadius(f);
    if (fa === fb) { await walk(f, planPath(fa, f.walker.position, target, r, ign, forceEnd).pts); return; }
    const e = pickElevator(f, fa); e.pending++;
    f.lastElev = e.side > 0 ? 'R' : 'L';
    let k = -1;
    try {
      k = takeSlot(e, fa);
      await walk(f, planPath(fa, f.walker.position, queueSpot(e, fa, r, k), r, ign).pts);
      if (k > 0) await walk(f, [queueSpot(e, fa, r, k)], 1.6);
      await rideElevator(f, e, fa, fb, () => { freeSlot(e, fa, k); k = -1; });
    } finally { if (k >= 0) freeSlot(e, fa, k); e.pending--; }
    await walk(f, [ELEV_HUB(e, fb, r)], 1.6);
    await walk(f, planPath(fb, ELEV_HUB(e, fb, r), target, r, ign, forceEnd).pts);
  }
  const docGeo = new THREE.BoxGeometry(0.34, 0.05, 0.26), paperGeo = new THREE.BoxGeometry(0.28, 0.02, 0.22);
  const docMat = std(0xffc861, { roughness: 0.5 }), paperMat = std(0xffffff, { roughness: 0.8 });
  function makeDoc() { const g = new THREE.Group(); const a = new THREE.Mesh(docGeo, docMat); a.castShadow = true; g.add(a); const b = new THREE.Mesh(paperGeo, paperMat); b.position.y = 0.035; g.add(b); g.rotation.x = -0.5; return g; }
  async function deliver(fromKey, toKey, mode = 'auto') {
    const a = figures.get(fromKey), b = figures.get(toKey);
    if (!a || !b || a === b || a.busy || !a.av) return false;
    a.busy = true; a.walk = null;
    try {
      // 正在搭電梯上下班的人，先讓他到位；收件人在哪一層就送到哪一層（例如在 3F 休息）
      if (a.commuting) await a.commuting.catch(() => { });
      if (b.commuting) await b.commuting.catch(() => { });
      const fa = floorAt(a.walker.position.y + 0.1), fb = floorAt(b.walker.position.y + 0.1);
      mode = 'elevator';   // 樓梯已拆除；舊的 'stairs' 參數一律改搭電梯
      const doc = makeDoc(); doc.position.set(0, 1.0, 0.42); a.walker.add(doc); a.carry = doc; a.dirty = true;
      const startSeat = a.atDesk ? a.deskSeat : a.loungeSeat;
      const bSeat = b.atDesk ? b.deskSeat : b.loungeSeat;
      const meet = seatFront(bSeat);   // 走到對方座位前方；被家具擋住時改到最近的可站位置
      await travel(a, fa, fb, meet, mode, seatMeshes(startSeat));
      await turnTo(a, Math.atan2(b.walker.position.x - a.walker.position.x, b.walker.position.z - a.walker.position.z));
      // 交付：文件飛到對方手上
      const wp = new THREE.Vector3(); doc.getWorldPosition(wp); a.walker.remove(doc); scene.add(doc); doc.position.copy(wp); a.carry = null;
      const target = b.walker.position.clone().add(new THREE.Vector3(0, 1.0, 0));
      await tween(650, (e) => { doc.position.lerpVectors(wp, target, e); doc.position.y += Math.sin(e * Math.PI) * 0.3; });
      scene.remove(doc);
      b.el.classList.add('got'); setTimeout(() => b.el.classList.remove('got'), 2600);
      await wait(700);
      // 回座（工作中回辦公桌，其他回休息區）
      if (a.want) releaseRest(a);
      const home = a.want ? a.deskSeat : assignRest(a);
      await travel(a, fb, floorAt(home.pos.y + 0.1), home.pos, mode, seatMeshes(home), true);
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
        fig.sitMin = sitMinOf(fig.av); fig._rad = null;
      }
      if (fig.color !== hex) { tintAvatar(fig.av, hex); fig.color = hex; }
      const v = viewStatus(state, key), s = v.s;
      const status = v.status;
      const sc = STATUS[status];
      fig.el.classList.toggle('stale', v.stale);
      if (status !== fig.status) { setFx(fig, status); fig.status = status; }
      const wantDesk = status === 'working';
      fig.want = wantDesk;
      if (!fig.busy && !fig.commuting && wantDesk !== fig.atDesk) moveTo(fig, wantDesk);
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
  renderer.domElement.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; cancelFly(); beginTagDrag(); });
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
    const effW = (W + 3.6) * Math.cos(az) + D * Math.sin(az) - (aspect < 0.9 ? 0.9 : -0.6);
    const effH = ((TOP_FLOOR - 1) * FLOOR_H + WALL_H + 0.6) * Math.sin(polar) + D * Math.cos(polar) + 2.6;
    const dist = Math.max((effH / 2) / Math.tan(vfov / 2), (effW / 2) / Math.tan(hfov / 2)) + D * 0.35;
    // 依可用區域的中心偏移目標點，避免被頁首或抽屜擋住
    const shiftPx = (insets.bottom - insets.top) / 2;
    const worldPerPx = 2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) / h;
    const target = new THREE.Vector3(0, ((TOP_FLOOR - 1) * FLOOR_H + WALL_H) / 2 - shiftPx * worldPerPx * Math.sin(polar), 0);
    const pos = new THREE.Vector3(dist * Math.sin(polar) * Math.sin(az), dist * Math.cos(polar), dist * Math.sin(polar) * Math.cos(az)).add(target);
    return { pos, target };
  }
  let fly = null;
  function flyTo(view, ms = 900) { fly = { t0: performance.now(), ms, p0: camera.position.clone(), t0v: controls.target.clone(), p1: view.pos, t1: view.target }; start(); }
  function cancelFly() { fly = null; }
  function resetView(animate = true) {
    beginTagDrag();
    const v = defaultView();
    if (!animate) { camera.position.copy(v.pos); controls.target.copy(v.target); controls.update(); return; }
    flyTo(v);
  }
  function setInsets(top, bottom) { insets = { top, bottom }; updateZoomLimits(); }
  // 縮放範圍跟著畫面大小：最近約為預設距離的 1/3（不會穿進牆裡），最遠約 1.35 倍且不超過 66（再遠會被霧蓋住，建築不會縮到看不見）
  function updateZoomLimits() {
    const v = defaultView(), d = v.pos.distanceTo(v.target);
    if (!isFinite(d) || d <= 0) return;
    controls.minDistance = Math.max(7.5, d * 0.32);
    controls.maxDistance = Math.min(66, d * 1.35);
  }

  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = w + 'px'; renderer.domElement.style.height = h + 'px';
    camera.aspect = w / h; camera.updateProjectionMatrix(); updateZoomLimits();
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
    // 人物目前所在樓層（搭電梯途中以最接近的樓層計）
    const fl = Math.max(0, Math.min(TOP_FLOOR - 1, Math.round((f.walker.position.y - floorY(1)) / FLOOR_H)));
    const base = fl * FLOOR_H + floorY(1);
    // 上界：上一層樓板的前緣（最上層則是牆頂上方一點）；下界：本層地板前緣
    if (fl < TOP_FLOOR - 1) vb.set(f.walker.position.x, base + FLOOR_H - SLAB - 0.1, D / 2);
    else vb.set(f.walker.position.x, base + WALL_H + (compactTags ? 0.6 : 1.3), f.walker.position.z);
    vb.project(camera);
    const top = (-vb.y * 0.5 + 0.5) * h;
    vb.set(f.walker.position.x, base + 0.15, D / 2).project(camera);
    const bot = (-vb.y * 0.5 + 0.5) * h;
    return [top, bot];
  }
  const OCCLUSION_GAP = 3;     // 隱藏後要再顯示，聯集至少再分開 3px（此距離內視為仍被擋住，以符合準則 5）
  const DEPTH_EPS = 0.25;      // 世界座標；兩人距鏡頭差小於此值時沿用目前的前後關係，避免每幀互換
  let tagCamSig = '', tagDragGen = 0;
  function beginTagDrag() {
    tagDragGen++;
    tagCamSig = '';
    for (const f of figures.values()) f._tagDepthRank = undefined;
  }
  function placeTags() {
    const w = container.clientWidth, h = container.clientHeight;
    const camPos = camera.position;
    const sig = [camPos.x, camPos.y, camPos.z, controls.target.x, controls.target.y, controls.target.z].map((n) => n.toFixed(4)).join();
    const camStill = (sig === tagCamSig);
    tagCamSig = sig;

    const makeR = (x0, y1, tw, th) => ({ x0, x1: x0 + tw, y0: y1 - th, y1 });
    const fxPad = (f) => {
      const tag = f.el.getBoundingClientRect(), bubble = f.el.querySelector('.tag-bubble')?.getBoundingClientRect();
      const fx = f.el.querySelector('.tag-fx');
      const fxs = fx ? getComputedStyle(fx) : null;
      const fxr = (fx && fxs && fxs.display !== 'none' && fxs.visibility !== 'hidden' && fx.textContent.trim()) ? fx.getBoundingClientRect() : null;
      const reserve = { l: 0, t: compactTags ? 8 : 10, r: compactTags ? 8 : 10, b: 0 };
      if (!bubble || !tag.width) return reserve;
      const u0 = Math.min(bubble.left, fxr ? fxr.left : bubble.left), u1 = Math.max(bubble.right, fxr ? fxr.right : bubble.right);
      const v0 = Math.min(bubble.top, fxr ? fxr.top : bubble.top), v1 = Math.max(bubble.bottom, fxr ? fxr.bottom : bubble.bottom);
      return {
        l: Math.max(reserve.l, tag.left - u0),
        t: Math.max(reserve.t, tag.top - v0),
        r: Math.max(reserve.r, u1 - tag.right),
        b: Math.max(reserve.b, v1 - tag.bottom)
      };
    };
    const unionOf = (rec, pad) => ({ x0: rec.x0 - pad.l, x1: rec.x1 + pad.r, y0: rec.y0 - pad.t, y1: rec.y1 + pad.b });
    const sepAxes = (A, B) => {
      const ox = Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0);
      const oy = Math.min(A.y1, B.y1) - Math.max(A.y0, B.y0);
      return [ox, oy];
    };
    // 已顯示的名牌：以 Nori 的 0.5px 為準隱藏；已隱藏的：空隙達 OCCLUSION_GAP 才再顯示
    const blocks = (shownU, otherU, wasShown) => {
      const [ox, oy] = sepAxes(shownU, otherU);
      if (wasShown) return ox > 0.5 && oy > 0.5;
      return ox > -OCCLUSION_GAP && oy > -OCCLUSION_GAP;
    };

    const items = [];
    for (const f of figures.values()) {
      v.copy(f.anchor).project(camera);
      const onScreen = v.z < 1 && v.x > -1.15 && v.x < 1.15 && v.y > -1.15 && v.y < 1.15;
      if (f.dirty) { f.el.classList.remove('squeeze'); f.dirty = false; }
      const [tw, th] = [f.el.offsetWidth, f.el.offsetHeight];
      f.size = [tw, th];
      const x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h;
      const band = bandOf(f, w, h);
      const [bTop, bBot] = band;
      const minB = bTop + th, maxB = Math.max(minB, bBot);
      // 固定錨點正上方，只把底邊連續夾進樓層帶與畫面內，不換格、不推開
      let x0 = Math.max(4, Math.min(w - tw - 4, x - tw / 2));
      let y1 = Math.max(minB, Math.min(maxB, y));
      x0 = Math.round(x0 * 10) / 10;
      y1 = Math.round(y1 * 10) / 10;
      // 可見時單幀左上角最多 19.4 px（含鏡頭阻尼與夾帶），避免偶爾超過 20
      if (f._tagDisp && f._tagShown) {
        const px = f._tagDisp.x0, py = f._tagDisp.y0;
        const d = Math.hypot(x0 - px, (y1 - th) - py);
        const MAX = 19.4;
        if (d > MAX) {
          const k = MAX / d;
          x0 = px + (x0 - px) * k;
          const y0 = py + ((y1 - th) - py) * k;
          y1 = y0 + th;
        }
      }
      // 限速後再夾回樓層帶與畫面，避免帶跟著人移動時短暫出界
      x0 = Math.max(4, Math.min(w - tw - 4, x0));
      y1 = Math.max(minB, Math.min(maxB, y1));
      x0 = Math.round(x0 * 10) / 10;
      y1 = Math.round(y1 * 10) / 10;
      const rec = makeR(x0, y1, tw, th);
      const pad = fxPad(f);
      const dist = camPos.distanceTo(f.anchor);
      items.push({ f, onScreen, tw, th, rec, pad, uni: unionOf(rec, pad), dist, band, x, y });
    }

    const on = items.filter((o) => o.onScreen);
    on.sort((a, b) => {
      const d = a.dist - b.dist;
      if (Math.abs(d) <= DEPTH_EPS) {
        const ra = a.f._tagDepthRank, rb = b.f._tagDepthRank;
        if (ra != null && rb != null && ra !== rb) return ra - rb;
      }
      return d;
    });
    on.forEach((o, i) => { o.f._tagDepthRank = i; });

    // 鏡頭與各牌子畫面位置都幾乎不變時，凍結可見性以免數值抖動（準則 3）。
    // 有人走動、或先前已可見卻重疊時，仍跑貪心遮蔽（準則 1、5 優先於凍結）。
    const platesMoved = on.some((o) => {
      const d = o.f._tagDisp;
      if (!d) return true;
      return Math.hypot(o.rec.x0 - d.x0, o.rec.y0 - d.y0) > 0.5;
    });
    if (camStill && !platesMoved) {
      for (const o of on) o.want = (o.f._tagShown === true);
    } else {
      const accepted = [];
      for (const o of on) {
        const wasShown = o.f._tagShown === true;
        let hit = false;
        for (const s of accepted) {
          if (blocks(s.uni, o.uni, wasShown)) { hit = true; break; }
        }
        o.want = !hit;
        if (o.want) accepted.push(o);
      }
    }

    for (const o of items) {
      const show = !!(o.onScreen && o.want);
      o.f._tagShown = show;
      o.f.el.style.visibility = show ? 'visible' : 'hidden';
      o.f.el.style.opacity = '';
      o.f.el.style.transform = `translate3d(${o.rec.x0.toFixed(1)}px, ${o.rec.y0.toFixed(1)}px, 0)`;
      o.f._tagBand = o.band;
      o.f._tagRect = [o.rec.x0, o.rec.y0, o.rec.x1, o.rec.y1];
      o.f._tagDisp = { x0: o.rec.x0, y0: o.rec.y0, x1: o.rec.x1, y1: o.rec.y1 };
      o.f._tagDist = o.dist;
      o.f.el.classList.remove('squeeze', 'shifted');
    }
    // 同一幀再讀一次 DOM 聯集：若兩個可見名牌仍重疊（四捨五入／圖示），立刻隱藏較遠的那個
    const visNow = items.filter((o) => o.f._tagShown);
    const readUnion = (el) => {
      const bubble = el.querySelector('.tag-bubble')?.getBoundingClientRect();
      const fx = el.querySelector('.tag-fx');
      const fxs = fx ? getComputedStyle(fx) : null;
      const fxr = (fx && fxs && fxs.display !== 'none' && fxs.visibility !== 'hidden' && fx.textContent.trim()) ? fx.getBoundingClientRect() : null;
      const r = el.getBoundingClientRect();
      let u = bubble ? { x0: bubble.left, y0: bubble.top, x1: bubble.right, y1: bubble.bottom } : { x0: r.left, y0: r.top, x1: r.right, y1: r.bottom };
      if (fxr && fxr.width > 0 && fxr.height > 0) u = { x0: Math.min(u.x0, fxr.left), y0: Math.min(u.y0, fxr.top), x1: Math.max(u.x1, fxr.right), y1: Math.max(u.y1, fxr.bottom) };
      return u;
    };
    {
      const urs = visNow.map((o) => ({ o, u: readUnion(o.f.el) }));
      urs.sort((a, b) => a.o.dist - b.o.dist);
      const keep = [];
      for (const it of urs) {
        let hit = false;
        for (const k of keep) {
          const [ox, oy] = sepAxes(it.u, k.u);
          if (ox > 0.5 && oy > 0.5) { hit = true; break; }
        }
        if (hit) {
          it.o.f._tagShown = false;
          it.o.f.el.style.visibility = 'hidden';
        } else keep.push(it);
      }
    }

    const visList = items.filter((o) => o.f._tagShown);
    visList.sort((a, b) => a.dist - b.dist);
    visList.forEach((o, i) => { o.f.el.style.zIndex = String(o.f.key === selected ? 999 : 200 - i); });
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
      // 3F 休息活動：只有到了自己的站位、沒有在走路或送文件時才做（站位整段休息固定，不會每幀換）
      const ls = f.loungeSeat;
      const atRest = !f.atDesk && !walking && !f.busy && !f.commuting && ls && Math.hypot(f.walker.position.x - ls.pos.x, f.walker.position.z - ls.pos.z) < 0.08 && Math.abs(f.walker.position.y - ls.pos.y) < 0.3;
      const act = atRest ? ls.act : null;
      f.act = act;
      if (act === 'treadmill') { const sw = Math.sin(t * 11 + f.phase) * 0.06; la = ay + sw; ra = ay - sw; av.head.rotation.set(0.05, 0, 0); av.head.position.y = hy; }
      else if (act === 'dumbbells') { const u = 0.5 - 0.5 * Math.cos(p * 2.6); la = ra = ay + u * 0.16; av.head.rotation.set(-0.05, 0, 0); av.head.position.y = hy; }
      else if (act === 'coffee') { const u = Math.pow(Math.max(0, Math.sin(p * 0.9)), 3); ra = ay + u * 0.15; av.head.rotation.set(-0.08 * u, 0, 0); }
      else if (act === 'bike') { la = ra = ay + 0.06; av.head.rotation.set(0.1, 0, 0); av.head.position.y = hy; }
      else if (act === 'yoga') { const u = Math.sin(p * 0.8); la = ra = ay + 0.04 + u * 0.06; av.head.rotation.set(-0.12 + u * 0.05, 0, 0); av.head.position.y = hy; av.body.scale.set(1 + u * 0.03, 1 - u * 0.02, 1 + u * 0.03); }
      else if (act === 'massage') { av.head.rotation.set(-0.18, 0, Math.sin(p * 0.5) * 0.06); }
      if (av.armL) av.armL.position.y = la;
      if (av.armR) av.armR.position.y = ra;
      // 手上道具（啞鈴、咖啡杯）跟著手臂
      const pr = propsOf(f);
      pr.bells.visible = act === 'dumbbells'; pr.cup.visible = act === 'coffee';
      if (pr.bells.visible && av.armL && av.armR) { pr.bellL.position.set(av.armL.position.x, la - 0.02, av.armL.position.z + 0.16); pr.bellR.position.set(av.armR.position.x, ra - 0.02, av.armR.position.z + 0.16); }
      if (pr.cup.visible && av.armR) pr.cup.position.set(av.armR.position.x - 0.02, ra + 0.03, av.armR.position.z + 0.19);
      // 站著／走路時顯示腳並貼齊地面；坐著時收起腳、維持原本坐姿
      // 還在座位（沙發／椅子）範圍內時維持坐姿，離開座位才放下腳；站立型活動（跑步機、啞鈴、咖啡）一律站著
      const nearDesk = f.walker.position.distanceTo(f.deskSeat.pos) < 0.5;
      const nearSit = ls && !ls.stand && f.walker.position.distanceTo(ls.pos) < 0.5;
      const standing = (act && ls.stand) || ((walking || f.busy || f.commuting) && !nearDesk && !nearSit);
      if (av.legs) {
        const legsOn = standing || act === 'bike';
        av.legs.visible = legsOn;
        if (av.seatFeet) for (const sf of av.seatFeet) sf.visible = !legsOn;
        if (standing) {
          const sw = walking ? Math.sin(t * 9 + f.phase) * 0.5 : (act === 'treadmill' ? Math.sin(t * 11 + f.phase) * 0.42 : av.legL.rotation.x * 0.8);
          av.legL.rotation.x = sw; av.legR.rotation.x = -sw;
          if (av.feet) { av.feet[0].rotation.x = 0; av.feet[1].rotation.x = 0; }
          plantFeet(f);
        } else if (act === 'bike') {
          const sw = Math.sin(t * 6 + f.phase) * 0.45;
          av.legL.rotation.x = sw; av.legR.rotation.x = -sw;
          f.slot.position.y = SADDLE_TOP - (f.sitMin ?? 0.5);
        } else if (act === 'yoga') {
          f.slot.position.y = MAT_TOP - (f.sitMin ?? 0.5); av.legL.rotation.x = av.legR.rotation.x = 0;
        } else if (act === 'massage') {
          f.slot.position.y = Math.sin(t * 13) * 0.004; av.legL.rotation.x = av.legR.rotation.x = 0;
        } else if (f.slot.position.y !== 0) { f.slot.position.y = 0; av.legL.rotation.x = av.legR.rotation.x = 0; }
      }
      if (av.spin) av.spin.rotation.y = t * 0.8;
      if (av.tail) av.tail.rotation.y = Math.sin(p * 1.8) * 0.35;
      const r = f.status === 'error' ? 0.45 + 0.55 * Math.abs(Math.sin(t * 3.5)) : (f.status === 'working' ? 0.65 + 0.3 * Math.sin(t * 2.6 + f.phase) : 0.7);
      f.ringMat.opacity = r;
      const sc = f.status === 'error' ? 1 + 0.15 * Math.abs(Math.sin(t * 3.5)) : 1;
      f.ring.scale.set(sc, sc, sc);
    }
    { // 有人在用時，跑帶捲動、健身車踏板轉動
      let run = false; for (const f of figures.values()) if (f.act === 'treadmill') run = true;
      if (run) beltTex.offset.y = (beltTex.offset.y - 0.03) % 1;
      for (const c of CRANKS) { let on = false; for (const f of figures.values()) if (f.act === 'bike' && Math.abs(f.walker.position.x - c.x) < 0.1 && Math.abs(f.walker.position.z - c.z) < 0.1) { on = true; c.crank.rotation.x = -(t * 6 + f.phase); } }
    }
    controls.update();
    renderer.render(scene, camera);
    placeTags();
    if (footLog) for (const k of footLog.keys) { const pr = footProbe(k); if (pr && pr.legsVisible) { const w = where(k); const bp = footLog.body ? bodyProbe(k) : null; footLog.samples.push({ k, floor: w.floor, x: w.x, z: w.z, y: +figures.get(k).walker.position.y.toFixed(3), ...pr, body: bp ? bp.hits : undefined }); } }
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
  // 唯讀：目前人物在 3D 中的位置（給檢查用）
  function where(k) {
    const f = figures.get(k); if (!f) return null;
    const fl = Math.round((f.walker.position.y - floorY(1)) / FLOOR_H) + 1;
    const spot = (f.walk || f.moving || f.carry !== null || f.commuting) ? 'walking' : (f.atDesk ? 'desk' : 'lounge');
    return { floor: fl, spot, act: f.act || null, restSpot: f.restSpot ? f.restSpot.id : null, session: f.restSession, elev: f.lastElev || null, x: +f.walker.position.x.toFixed(2), y: +f.walker.position.y.toFixed(3), z: +f.walker.position.z.toFixed(2) };
  }
  // 唯讀檢查用：在每次實際畫面輸出時記錄腳底資料
  function footLogCtl(keys, opts = {}) { const prev = footLog; footLog = keys ? { keys, samples: [], body: !!opts.body } : null; return prev ? prev.samples : null; }
  // 唯讀檢查用：每個名牌目前的外框與所屬樓層的上下界（螢幕座標）
  // 唯讀檢查用：每位角色在自己樓層上，座位／對方座位前方／3F 器材／兩座電梯口與排隊位置兩兩之間能不能找到路（ok=false 代表找不到、只能直線硬走）
  const pathCheck = () => {
    const fails = []; let n = 0;
    for (const [k, f] of figures) {
      const r = bodyRadius(f);
      for (let fl = 1; fl <= TOP_FLOOR; fl++) {
        const pts = [['elevR', ELEV_HUB(ELEVS[0], fl, r)], ['elevL', ELEV_HUB(ELEVS[1], fl, r)]];
        for (const e of ELEVS) for (let q = 1; q <= 4; q++) pts.push([`queue${e.side > 0 ? 'R' : 'L'}${q}`, queueSpot(e, fl, r, q)]);
        for (const [k2, g] of figures) if (g.floor === fl) { pts.push([k2 + ':deskFront', seatFront(g.deskSeat)]); if (k2 === k) pts.push([k2 + ':desk', g.deskSeat.pos, true, g.deskSeat]); }
        if (fl === GYM_FLOOR) for (const sp of REST_SPOTS) { const st = restSeatOf(sp); pts.push([sp.id + ':front', seatFront(st)], [sp.id, st.pos, true, st]); }
        for (const [na, pa, , sa] of pts) for (const [nb, pb, seatB, sb] of pts) { if (na === nb) continue; n++;
          const ign = [...(sa ? seatMeshes(sa) : []), ...(sb ? seatMeshes(sb) : [])];
          const res = planPath(fl, pa, pb, r, ign, !!seatB); if (!res.ok) fails.push(`${k}@${fl}F ${na}→${nb}`); }
      }
    }
    return { checked: n, fails };
  };
  const tagBands = () => { const o = {}; for (const [k, f] of figures) if (f._tagRect && f._tagShown) o[k] = { rect: f._tagRect.map(v => +v.toFixed(1)), band: f._tagBand.map(v => +v.toFixed(1)), floor: where(k).floor, dist: f._tagDist }; return o; };
  // 唯讀檢查用：鏡頭位置與方位角（證明觸控拖曳真的有轉動鏡頭）
  const camPose = () => {
    const p = camera.position, t = controls.target, dx = p.x - t.x, dy = p.y - t.y, dz = p.z - t.z;
    const dist = Math.hypot(dx, dy, dz);
    return { x: +p.x.toFixed(3), y: +p.y.toFixed(3), z: +p.z.toFixed(3), tx: +t.x.toFixed(3), ty: +t.y.toFixed(3), tz: +t.z.toFixed(3), az: +Math.atan2(dx, dz).toFixed(4), polar: +Math.acos(Math.max(-1, Math.min(1, dist ? dy / dist : 0))).toFixed(4), dist: +dist.toFixed(3) };
  };
  window.__aiOfficeCam = camPose;
  // 唯讀檢查用：兩座電梯目前狀態、3F 站位佔用
  const elevState = () => ELEVS.map(e => ({ side: e.side > 0 ? 'R' : 'L', y: +e.y.toFixed(3), door: +e.door.toFixed(2), pending: e.pending, rides: e.rides }));
  // 測試用：把休息中的人直接放到指定器材（只換位置，不改分配規則），給身體碰撞／腳底檢查逐一掃過每個器材
  function restAt(k, id) {
    const f = figures.get(k), sp = REST_SPOTS.find(s => s.id === id);
    if (!f || !sp || f.atDesk || f.busy || f.commuting) return false;
    const owner = spotOwner.get(id); if (owner && owner !== k) return false;
    if (f.restSpot && spotOwner.get(f.restSpot.id) === k) spotOwner.delete(f.restSpot.id);
    spotOwner.set(id, k); f.restSpot = sp; f.loungeSeat = restSeatOf(sp);
    f.walker.position.copy(f.loungeSeat.pos); f.walker.rotation.y = f.loungeSeat.rot; f.dirty = true;
    return true;
  }
  const restState = () => { const o = {}; for (const [id, k] of spotOwner) o[id] = k; return o; };
  return { update, select, resetView, setInsets, setAvatarSet, deliver, setTheme, floorOf, where, footProbe, bodyProbe, tagBands, pathCheck, camPose, footLog: footLogCtl, elevState, restState, restAt };
}

export function webglAvailable() {
  try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); }
  catch { return false; }
}
