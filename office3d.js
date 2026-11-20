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
const AISLE = 3.1, STAIR_X = -6.95, STAIR_X2 = -8.25, LANE_L = -5.35, LANE_R = 4.75, ELEV_X = 7.15, ELEV_DOOR_X = 5.85, WALK_SPEED = 3.0;
const stairZ = (f) => 3.1;     // 每層樓梯口都在左牆前方
const STAIR_MZ = -3.1;         // 兩層之間的中間平台（在後方）
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
  // ===== 左側樓梯（折返式，連接 1F-2F-3F）=====
  // 每層之間分兩段：前段 x=STAIR_X 從樓梯口（前方）往後爬半層到中間平台，後段 x=STAIR_X2 再往前爬到上一層樓梯口。
  // 兩段左右錯開，上一層的同一段在正上方 5 公尺（不再像舊版那樣兩段在同一直線上下交疊，身體穿過頭頂的踏階）；
  // 每段只爬半層，坡度從約 46° 降到約 28°，身體前緣不會撞到前一階。
  const FLIGHTS = [];    // 每段樓梯的踏階資料，給「腳踩地面」計算踏階頂面高度
  const LANDINGS = [];   // 中間平台（不在樓板高度上）
  const stairMat = std(0xe9dcc6, { roughness: 0.7 }), stairEdge = std(0x3b3856, { roughness: 0.5 });
  const LX0 = STAIR_X2 - 0.65, LX1 = STAIR_X + 0.65;
  function landing(y, z, x0, x1, back) {
    box(x1 - x0, 0.2, 1.4, stairMat, (x0 + x1) / 2, y - 0.1, z);
    box(x1 - x0 + 0.04, 0.08, 1.44, stairEdge, (x0 + x1) / 2, y - 0.22, z);
    box(0.05, 0.9, 1.4, stairEdge, x0 + 0.01, y + 0.45, z);                       // 外側欄板
    if (back) box(x1 - x0, 0.9, 0.05, stairEdge, (x0 + x1) / 2, y + 0.45, z + back * 0.69); // 後側欄板
    if (y > 0.1) for (const px of [x0 + 0.08, x1 - 0.08]) box(0.14, y, 0.14, pillarMat, px, y / 2 - 0.2, z + (z > 0 ? 0.62 : -0.62));
  }
  function flight(x, y, y2, zs, ze, N) {
    const dir = Math.sign(ze - zs);
    FLIGHTS.push({ x, y, y2, zs, ze, N });
    for (let i = 0; i < N; i++) {
      const u = (i + 0.5) / N;
      box(1.1, 0.12, Math.abs(ze - zs) / N + 0.02, stairMat, x, y + (y2 - y) * ((i + 1) / N) - 0.06, zs + (ze - zs) * u);
    }
    const run = Math.abs(ze - zs), rise = y2 - y, len = Math.hypot(run, rise), ang = Math.atan2(rise, run);
    for (const ox of [-0.6, 0.6]) { const st = box(0.08, 0.3, len, stairEdge, x + ox, y + rise / 2 - 0.1, (zs + ze) / 2); st.rotation.x = dir > 0 ? ang : -ang; }
    const rx = x - 0.62;
    const rail = box(0.05, 0.05, len, legMat, rx, y + rise / 2 + 0.9, (zs + ze) / 2); rail.rotation.x = dir > 0 ? ang : -ang;
    for (let i = 0; i <= 4; i++) { const u = i / 4; box(0.04, 0.9, 0.04, legMat, rx, y + rise * u + 0.45, zs + (ze - zs) * u); }
  }
  const STAIR_N = 16;   // 每段 16 階（每階高約 0.16、深 0.3）
  for (let f = 1; f <= 3; f++) {
    const z = stairZ(f), y = floorY(f);
    landing(y, z, f === 1 ? STAIR_X - 0.65 : LX0, LX1, 0);
    // 樓板邊緣（x=-6）到樓梯平台（x=-6.3）之間原本有 0.3 的空隙，補一塊門檻板讓腳有地方踩
    box(0.36, 0.08, 1.4, slabEdgeMat, -W / 2 - 0.15, y - 0.04, z);
    if (f < 3) {
      const y2 = floorY(f + 1), ym = (y + y2) / 2;
      landing(ym, STAIR_MZ, LX0, LX1, -1);
      LANDINGS.push({ x0: LX0, x1: LX1, z0: STAIR_MZ - 0.7, z1: STAIR_MZ + 0.7, y: ym });
      flight(STAIR_X, y, ym, z - 0.7, STAIR_MZ + 0.7, STAIR_N);
      flight(STAIR_X2, ym, y2, STAIR_MZ + 0.7, z - 0.7, STAIR_N);
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
  sofa(-3.4, floorY(3), 0.55, 0x8e6fb4); coffeeTable(-4.85, floorY(3), 0.6, 0.45); plant(-1.9, floorY(3), 0.3, 0.7); plant(4.6, floorY(3), -1.6, 0.9);
  // 休息區茶几位置調整（#6）：原本在沙發正前方，沙發與茶几之間只剩約 0.6 公尺，人物身體（寬約 1 公尺）過不去；3F、1F 移到沙發左側；2F 沙發前方被兩張單人椅與茶几圍住、找不到出口，茶几移到沙發左側
  sofa(0, floorY(2), -0.95, 0x6f9fd9); armchair(-1.75, floorY(2), 0.7, 0xe69a7a, 0.45); armchair(1.75, floorY(2), 0.7, 0xe69a7a, -0.45);
  coffeeTable(-1.75, floorY(2), -1.0, 0.5); coffeeBar(0, floorY(2), -D / 2 + 0.5);
  box(2.0, 1.1, 0.06, std(0xfafafa, { emissive: 0x222222 }), -3.5, floorY(2) + 1.75, -D / 2 + 0.2); // 白板
  sofa(-3.65, floorY(1), 0.55, 0xd98a6a); armchair(-2.05, floorY(1), 1.5, 0x6f9fd9, -0.5); coffeeTable(-5.1, floorY(1), 0.6, 0.45);
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

    const walker = new THREE.Group(); walker.userData.walker = true; scene.add(walker);
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
    const fl = Math.max(1, Math.min(3, Math.round(from.y / FLOOR_H) + 1));
    const route = planPath(fl, from, seat.pos, bodyRadius(fig), [...seatMeshes(fromSeat), ...seatMeshes(seat)], true).pts;
    const pts = [from, ...route]; pts[pts.length - 1] = seat.pos.clone();
    const lens = []; let total = 0;
    for (let i = 1; i < pts.length; i++) { const l = pts[i].distanceTo(pts[i - 1]); lens.push(l); total += l; }
    fig.walk = { pts, lens, total, t0: performance.now(), ms: Math.max(WALK_MS, total / 2.4 * 1000), rot: seat.rot };
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
  // 電梯車廂內 → 車廂地板頂面；樓梯段上 → 該踏階頂面；其他 → 最近樓層的樓板頂面（floorY）
  const CAB_FLOOR = 0.04;   // 車廂地板（厚 0.08、中心在車廂原點）的頂面
  function groundAt(x, z, nearY) {
    if (Math.abs(x - ELEV_X) < 0.7 && Math.abs(z) < 0.7 && Math.abs(nearY - elev.y) < 1.2) return elev.y + CAB_FLOOR;
    if (x < -6.2) {
      for (const fl of FLIGHTS) {
        if (Math.abs(x - fl.x) >= 0.56) continue;
        if (nearY < fl.y - 0.05 || nearY > fl.y2 + 0.05) continue;
        // 每階踏板前後各多出 0.01（建模時的重疊），邊界上取較高那一階
        const run = Math.abs(fl.ze - fl.zs), ov = 0.01 / run;
        const u = (z - fl.zs) / (fl.ze - fl.zs);
        if (u < -ov || u > 1 + ov) continue;
        const i = Math.max(0, Math.min(fl.N - 1, Math.floor((u + ov) * fl.N)));
        return fl.y + (fl.y2 - fl.y) * (i + 1) / fl.N;
      }
      for (const L of LANDINGS) if (x >= L.x0 - 0.02 && x <= L.x1 + 0.02 && z >= L.z0 - 0.02 && z <= L.z1 + 0.02 && Math.abs(nearY - L.y) < 0.6) return L.y;
    }
    const f = Math.max(1, Math.min(3, Math.round((nearY - floorY(1)) / FLOOR_H) + 1));
    return floorY(f);
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
      const floorMats = new Set([slabMat, slabEdgeMat, stairMat, cabFrame]);
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
        // 射線起點在頂點上方 0.15（樓梯上下兩段在同一直線，避免打到頭頂上的下一段踏階）
        probeRay.set(rayO.set(v.x, v.y + 0.15, v.z), DOWN); probeRay.far = 1.5;
        const h = probeRay.intersectObjects(floorMeshes, false)[0]; if (h) gap = Math.min(gap, v.y - h.point.y);
        const h2 = probeRay.intersectObjects(staticMeshes, false)[0]; if (h2) gapAny = Math.min(gapAny, v.y - h2.point.y);
      });
      out.push({ sole: +sole.toFixed(4), gap: isFinite(gap) ? +gap.toFixed(4) : null, gapGround: +gapGround.toFixed(4), gapAny: isFinite(gapAny) ? +gapAny.toFixed(4) : null, x: +(cx / n).toFixed(2), z: +(cz / n).toFixed(2) });
    }
    return { feet: out, legsVisible: f.av.legs.visible, walking: !!f.walk || f.moving, busy: f.busy, inCab: Math.abs(f.walker.position.x - ELEV_X) < 0.7 && Math.abs(f.walker.position.z) < 0.7 };
  }

  // 唯讀檢查用：角色身體（所有網格頂點）有沒有穿進靜態物件（家具、樓梯、牆柱）。
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
        const cat = (m.material === stairMat || m.material === stairEdge || (c.x < -6.2 && m.material === legMat)) ? 'stair' : (m.material === slabMat || m.material === slabEdgeMat || m.material === cabFrame) ? 'floor' : 'furniture';
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
    OBS = { 1: [], 2: [], 3: [] };
    scene.updateMatrixWorld(true); const bb = new THREE.Box3();
    const visit = (o, fn) => { if (o.userData.walker || o === cabin) return; fn(o); for (const c of o.children) visit(c, fn); };
    visit(scene, o => {
      if (!o.isMesh || !o.visible) return; const mt = o.material;
      if (!mt || mt.transparent || mt.visible === false || mt === slabMat || mt === slabEdgeMat) return;
      bb.setFromObject(o);
      for (let fl = 1; fl <= 3; fl++) { const y = floorY(fl); if (bb.max.y > y + 0.03 && bb.min.y < y + 1.9 && bb.max.x > GX0 - 1 && bb.min.x < GX1 + 1 && bb.max.z > GZ0 - 1 && bb.min.z < GZ1 + 1) OBS[fl].push({ x0: bb.min.x, x1: bb.max.x, z0: bb.min.z, z1: bb.max.z, m: o }); }
    });
    return OBS;
  }
  // 座位所在的那張椅子／沙發。whole=false（找路用）：只取外框包含座位點的零件（坐墊、底座），椅背、扶手仍是障礙；
  // whole=true（身體碰撞檢查用）：起身／坐下時會碰到的整張座椅——休息區取整組沙發／單人椅，辦公椅取中心離座位 0.4 公尺內的零件（含椅背，不含桌子）
  function seatMeshes(seat, whole = false) {
    if (!seat) return [];
    const ck = whole ? '_meshW' : '_mesh';
    if (seat[ck]) return seat[ck];
    const fl = Math.max(1, Math.min(3, Math.round(seat.pos.y / FLOOR_H) + 1));
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
      f.walker.position.y = groundAt(f.walker.position.x, f.walker.position.z, f.walker.position.y);
      const dx = b.x - a.x, dz = b.z - a.z;
      if (Math.hypot(dx, dz) > 0.05) { const tr = Math.atan2(dx, dz); const df = ((tr - f.walker.rotation.y + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; f.walker.rotation.y += df * 0.25; }
      if (d >= total) { f.walker.position.copy(pts[pts.length - 1]); f.walker.position.y = groundAt(f.walker.position.x, f.walker.position.z, f.walker.position.y); f.moving = false; return true; }
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
  // 樓梯路線：樓梯口 → 前段 → 中間平台（橫移到後段）→ 後段 → 上一層樓梯口；下樓反過來
  const stairHub = (fl, r) => P(GX0 + r - 0.3, fl, stairZ(fl));     // 樓梯口內側（樓板上）
  const ELEV_HUB = (fl, r) => P(GX1 - r + 0.3, fl, 0);               // 電梯門前（樓板上）
  function stairsRoute(fa, fb) {
    const pts = [], V = (x, y, z) => new THREE.Vector3(x, y, z), z = stairZ(1), mz = STAIR_MZ;
    const up = (fl) => { const y = floorY(fl), y2 = floorY(fl + 1), ym = (y + y2) / 2;
      return [V(STAIR_X, y, z), V(STAIR_X, y, z - 0.7), V(STAIR_X, ym, mz + 0.7), V(STAIR_X, ym, mz), V(STAIR_X2, ym, mz), V(STAIR_X2, ym, mz + 0.7), V(STAIR_X2, y2, z - 0.7), V(STAIR_X2, y2, z), V(STAIR_X, y2, z)]; };
    if (fb > fa) for (let fl = fa; fl < fb; fl++) pts.push(...up(fl).slice(fl === fa ? 0 : 1));
    else for (let fl = fa - 1; fl >= fb; fl--) pts.push(...up(fl).reverse().slice(fl === fa - 1 ? 0 : 1));
    return pts;
  }
  // 同一層：A* 找路；跨樓層：先走到樓梯口或電梯門，上下樓，再從另一層的樓梯口或電梯門走到目的地
  async function travel(f, fa, fb, target, mode, ign, forceEnd) {
    const r = bodyRadius(f);
    if (fa === fb) { await walk(f, planPath(fa, f.walker.position, target, r, ign, forceEnd).pts); return; }
    if (mode === 'stairs') {
      await walk(f, planPath(fa, f.walker.position, stairHub(fa, r), r, ign).pts);
      await walk(f, [...stairsRoute(fa, fb), stairHub(fb, r)], 2.6);
      await walk(f, planPath(fb, stairHub(fb, r), target, r, ign, forceEnd).pts);
    } else {
      await walk(f, planPath(fa, f.walker.position, ELEV_HUB(fa, r), r, ign).pts);
      await walk(f, [P(ELEV_DOOR_X, fa, 0)]); await rideElevator(f, fa, fb); await walk(f, [ELEV_HUB(fb, r)], 1.6);
      await walk(f, planPath(fb, ELEV_HUB(fb, r), target, r, ign, forceEnd).pts);
    }
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
      const home = a.want ? a.deskSeat : a.loungeSeat;
      await travel(a, fb, fa, home.pos, mode, seatMeshes(home), true);
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
  // 桌機名牌候選位移：dx ∈ {0, ±0.5, ±1, ±1.5, ±2, ±3}×sx，dy ∈ {0, ±1, ±2}×sy，依距離排序（近的優先）
  const DESK_CANDS = (sx, sy) => {
    const out = [];
    for (const a of [0, -0.5, 0.5, -1, 1, -1.5, 1.5, -2, 2, -3, 3]) for (const b of [0, -1, 1, -2, 2]) out.push([a * sx, b * sy, Math.hypot(a * sx, b * sy * 1.3)]);
    return out.sort((p, q) => p[2] - q[2]);
  };
  // 手機候選格更密（含半格上下），旋轉時才有足夠位置避開四位聚在 2F 休息區的名牌
  const MOBILE_CANDS = (sx, sy) => {
    const out = [];
    for (const a of [0, -0.5, 0.5, -1, 1, -1.5, 1.5, -2, 2, -2.5, 2.5, -3, 3]) for (const b of [0, -0.5, 0.5, -1, 1, -1.5, 1.5, -2, 2]) out.push([a * sx, b * sy, Math.hypot(a * sx, b * sy * 1.3)]);
    return out.sort((p, q) => p[2] - q[2]);
  };
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
    // 名牌避讓：選取中的先放，其次離鏡頭近的；先用候選格，再每幀做螢幕空間迭代分離，
    // 並夾在本層垂直範圍與畫面內。真的放不下就縮成只剩圓點＋名字
    list.sort((a, b) => (b.f.key === selected) - (a.f.key === selected) || a.z - b.z);
    // 右上角狀態小圖示（tag-fx）會超出名牌外框；手機精簡名牌同樣會溢出，比對時上、右各留 PAD
    const PAD = compactTags ? 8 : 10;
    const items = [];
    for (const it of list) {
      const [tw, th] = it.f.size;
      const [bTop, bBot] = it.band;
      const clampY = (bottom) => Math.max(bTop + th, Math.min(Math.max(bTop + th, bBot), bottom));
      const sx = tw * 0.55 + 4, sy = th + 4;
      // 手機改與桌機一樣用較密的候選格，旋轉時每一幀重新找位置
      const cands = compactTags ? MOBILE_CANDS(sx, sy) : DESK_CANDS(sx, sy);
      let best = null;
      for (const [dx, dy] of cands) {
        const x0 = Math.max(4, Math.min(w - tw - 4, it.x - tw / 2 + dx));
        const y1 = clampY(it.y + dy);
        const r = { x0, x1: x0 + tw + PAD, y0: y1 - th - PAD, y1 };
        let ov = 0; for (const p of items) ov += overlapArea(r, p.r);
        const cost = ov * 200 + Math.abs(x0 + tw / 2 - it.x) + Math.abs(y1 - it.y) * 1.3;
        if (!best || cost < best.cost) best = { r, cost, ov };
        if (ov === 0) break;
      }
      items.push({ it, tw, th, r: best.r, ov: best.ov });
    }
    const slackX = (obj, dir) => dir < 0 ? Math.max(0, obj.r.x0 - 4) : Math.max(0, (w - obj.tw - 4) - obj.r.x0);
    const slackY = (obj, dir) => {
      const [bTop, bBot] = obj.it.band, minB = bTop + obj.th, maxB = Math.max(minB, bBot);
      return dir < 0 ? Math.max(0, obj.r.y1 - minB) : Math.max(0, maxB - obj.r.y1);
    };
    const clampItem = (obj) => {
      const [bTop, bBot] = obj.it.band, minB = bTop + obj.th, maxB = Math.max(minB, bBot);
      const x0 = Math.max(4, Math.min(w - obj.tw - 4, obj.r.x0));
      const y1 = Math.max(minB, Math.min(maxB, obj.r.y1));
      obj.r = { x0, x1: x0 + obj.tw + PAD, y0: y1 - obj.th - PAD, y1 };
    };
    const shift = (obj, dx, dy) => { obj.r.x0 += dx; obj.r.x1 += dx; obj.r.y0 += dy; obj.r.y1 += dy; clampItem(obj); };
    // 迭代分離：有空間就沿重疊較小的軸推開；若該軸已被樓層／畫面擋住，改推另一軸
    for (let iter = 0; iter < 32; iter++) {
      let moved = false;
      for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
        const A = items[i], B = items[j];
        const ox = Math.min(A.r.x1, B.r.x1) - Math.max(A.r.x0, B.r.x0);
        const oy = Math.min(A.r.y1, B.r.y1) - Math.max(A.r.y0, B.r.y0);
        if (ox <= 0 || oy <= 0) continue;
        const selA = A.it.f.key === selected, selB = B.it.f.key === selected;
        const dirX = (A.r.x0 + A.r.x1 <= B.r.x0 + B.r.x1) ? -1 : 1;
        const dirY = (A.r.y0 + A.r.y1 <= B.r.y0 + B.r.y1) ? -1 : 1;
        const needX = ox + 0.75, needY = oy + 0.75;
        const sxA = slackX(A, dirX), sxB = slackX(B, -dirX), slX = sxA + sxB;
        const syA = slackY(A, dirY), syB = slackY(B, -dirY), slY = syA + syB;
        const preferX = ox < oy;
        const useX = (preferX && slX > 0.01) || slY < 0.01;
        if (useX && slX > 0.01) {
          const take = Math.min(needX, slX);
          const wA = selA && !selB ? 0 : (selB && !selA ? 1 : (sxA / slX));
          shift(A, dirX * take * wA, 0); shift(B, -dirX * take * (1 - wA), 0);
        } else if (slY > 0.01) {
          const take = Math.min(needY, slY);
          const wA = selA && !selB ? 0 : (selB && !selA ? 1 : (syA / slY));
          shift(A, 0, dirY * take * wA); shift(B, 0, -dirY * take * (1 - wA));
        } else continue;
        moved = true;
      }
      if (!moved) break;
    }
    for (const obj of items) {
      const r = { x0: obj.r.x0, x1: obj.r.x1 - PAD, y0: obj.r.y0 + PAD, y1: obj.r.y1 };
      const [bTop, bBot] = obj.it.band;
      let still = 0; for (const o of items) if (o !== obj) still += overlapArea(obj.r, o.r);
      obj.it.f._tagBand = [bTop, bBot]; obj.it.f._tagRect = [r.x0, r.y0, r.x1, r.y1];
      obj.it.f.el.classList.toggle('squeeze', still > obj.tw * obj.th * 0.12 && !obj.it.f.el.classList.contains('sel'));
      obj.it.f.el.style.transform = `translate3d(${r.x0.toFixed(1)}px, ${r.y0.toFixed(1)}px, 0)`;
      const shifted = Math.abs(r.x0 + obj.tw / 2 - obj.it.x) > 6 || Math.abs(r.y1 - obj.it.y) > 6;
      obj.it.f.el.classList.toggle('shifted', shifted);
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
      // 站著／走路時顯示腳並貼齊地面；坐著時收起腳、維持原本坐姿
      // 還在座位（沙發／椅子）範圍內時維持坐姿，離開座位才放下腳
      const inSeat = f.walker.position.distanceTo(f.loungeSeat.pos) < 0.5 || f.walker.position.distanceTo(f.deskSeat.pos) < 0.5;
      const standing = (walking || f.busy) && !inSeat;
      if (av.legs) {
        av.legs.visible = standing;
        if (av.seatFeet) for (const sf of av.seatFeet) sf.visible = !standing;
        if (standing) {
          // 樓梯區（x < -6.2）步幅縮小：擺腿 ±0.5 弧度時小腿側面會掃進上一階踏板的前緣
          const sw = walking ? Math.sin(t * 9 + f.phase) * (f.walker.position.x < -6.2 ? 0.2 : 0.5) : av.legL.rotation.x * 0.8;
          av.legL.rotation.x = sw; av.legR.rotation.x = -sw;
          // 樓梯區腳掌保持水平（抵銷擺腿角度）：腳掌斜著時，前上角會先碰到上一階的踏板前緣，把整隻腳抬離本階
          if (av.feet) { const lv = f.walker.position.x < -6.2; av.feet[0].rotation.x = lv ? -sw : 0; av.feet[1].rotation.x = lv ? sw : 0; }
          plantFeet(f);
        } else if (f.slot.position.y !== 0) { f.slot.position.y = 0; av.legL.rotation.x = av.legR.rotation.x = 0; }
      }
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
    const spot = (f.walk || f.moving || f.carry !== null) ? 'walking' : (f.atDesk ? 'desk' : 'lounge');
    return { floor: fl, spot, x: +f.walker.position.x.toFixed(2), z: +f.walker.position.z.toFixed(2) };
  }
  // 唯讀檢查用：在每次實際畫面輸出時記錄腳底資料
  function footLogCtl(keys, opts = {}) { const prev = footLog; footLog = keys ? { keys, samples: [], body: !!opts.body } : null; return prev ? prev.samples : null; }
  // 唯讀檢查用：每個名牌目前的外框與所屬樓層的上下界（螢幕座標）
  // 唯讀檢查用：每位角色在自己樓層上，座位／對方座位前方／樓梯口／電梯口兩兩之間能不能找到路（ok=false 代表找不到、只能直線硬走）
  const pathCheck = () => {
    const fails = []; let n = 0;
    for (const [k, f] of figures) {
      const r = bodyRadius(f);
      for (let fl = 1; fl <= 3; fl++) {
        const pts = [['stairs', stairHub(fl, r)], ['elevator', ELEV_HUB(fl, r)]];
        for (const [k2, g] of figures) if (g.floor === fl) { pts.push([k2 + ':deskFront', seatFront(g.deskSeat)], [k2 + ':loungeFront', seatFront(g.loungeSeat)]); if (k2 === k) pts.push([k2 + ':desk', g.deskSeat.pos, true], [k2 + ':lounge', g.loungeSeat.pos, true]); }
        for (const [na, pa] of pts) for (const [nb, pb, seatB] of pts) { if (na === nb) continue; n++;
          const ign = [...(na === k + ':desk' ? seatMeshes(f.deskSeat) : na === k + ':lounge' ? seatMeshes(f.loungeSeat) : []), ...(nb === k + ':desk' ? seatMeshes(f.deskSeat) : nb === k + ':lounge' ? seatMeshes(f.loungeSeat) : [])];
          const res = planPath(fl, pa, pb, r, ign, !!seatB); if (!res.ok) fails.push(`${k}@${fl}F ${na}→${nb}`); }
      }
    }
    return { checked: n, fails };
  };
  const tagBands = () => { const o = {}; for (const [k, f] of figures) if (f._tagRect) o[k] = { rect: f._tagRect.map(v => +v.toFixed(1)), band: f._tagBand.map(v => +v.toFixed(1)), floor: where(k).floor }; return o; };
  // 唯讀檢查用：鏡頭位置與方位角（證明觸控拖曳真的有轉動鏡頭）
  const camPose = () => {
    const p = camera.position, t = controls.target, dx = p.x - t.x, dy = p.y - t.y, dz = p.z - t.z;
    const dist = Math.hypot(dx, dy, dz);
    return { x: +p.x.toFixed(3), y: +p.y.toFixed(3), z: +p.z.toFixed(3), tx: +t.x.toFixed(3), ty: +t.y.toFixed(3), tz: +t.z.toFixed(3), az: +Math.atan2(dx, dz).toFixed(4), polar: +Math.acos(Math.max(-1, Math.min(1, dist ? dy / dist : 0))).toFixed(4), dist: +dist.toFixed(3) };
  };
  window.__aiOfficeCam = camPose;
  return { update, select, resetView, setInsets, setAvatarSet, deliver, setTheme, floorOf, where, footProbe, bodyProbe, tagBands, pathCheck, camPose, footLog: footLogCtl };
}

export function webglAvailable() {
  try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); }
  catch { return false; }
}
