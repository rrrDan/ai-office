// AI 辦公室：3D 大樓（three.js r170；模型與貼圖皆為本專案自製的程序化幾何與畫布貼圖）
import * as THREE from './vendor/three/three.module.min.js';
import { OrbitControls } from './vendor/three/OrbitControls.js';
import { BOTS, STATUS, botMeta, lookColor } from './feed.js';

const FLOOR_H = 5.0, WALL_H = 2.5, W = 12, D = 8, SLAB = 0.26;  // 樓層錯開堆疊（像剖面模型），從斜上方可看進每一層
const FLOOR_INFO = { 3: '3F・總管室', 2: '2F・工作區', 1: '1F・專案大廳' };
const SEATS = {
  nori: [0, -0.4], akara: [0.6, -0.2],
  meron: [-2.8, -1.3], yuzu: [2.8, -1.3], goya: [-2.8, 1.7], ichigo: [2.8, 1.7],
};
const EXTRA_SEATS = [[-3.8, 1.8], [4.2, 1.6], [-4.2, -1.9], [4.2, -2.0]];
const PAL = {
  slab: 0xf1e6d4, slabEdge: 0x2e2b45, pillar: 0x3b3856, mullion: 0x4a4668,
  desk: 0xf7f1e8, deskLeg: 0x3a3a4a, chair: 0x3d4466, chairSeat: 0x4b5580,
  pot: 0xe9d6c0, leaf: 0x5fae7a, leaf2: 0x7cc48f, skin: 0xffe3cf,
  rug: [0, 0xb59a85, 0x8fa8a0, 0x9e93b8],
};

const floorY = (f) => (f - 1) * FLOOR_H;
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

function ornament(shape, mat) {
  let geo;
  switch (shape) {
    case 'drop': geo = new THREE.ConeGeometry(0.1, 0.24, 7); break;
    case 'flower': {
      const grp = new THREE.Group();
      for (let i = 0; i < 5; i++) { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 0), mat); m.position.set(Math.cos(i * 1.2566) * 0.08, 0, Math.sin(i * 1.2566) * 0.08); grp.add(m); }
      const c = new THREE.Mesh(new THREE.IcosahedronGeometry(0.05, 0), std(0xffe9a8)); grp.add(c); return grp;
    }
    case 'clover': {
      const grp = new THREE.Group();
      for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.07, 0), mat); m.position.set(Math.cos(i * 2.094) * 0.075, 0, Math.sin(i * 2.094) * 0.075); grp.add(m); }
      return grp;
    }
    case 'hexagon': geo = new THREE.CylinderGeometry(0.12, 0.12, 0.06, 6); break;
    case 'star4': geo = new THREE.OctahedronGeometry(0.13, 0); break;
    default: geo = new THREE.IcosahedronGeometry(0.08, 0);
  }
  return new THREE.Mesh(geo, mat);
}

export function createOffice(container, overlay, { onSelect } = {}) {
  let running = false, raf = 0, onScreen = true;
  const clock = new THREE.Clock();
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x1a1830, 38, 95);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 220);
  const controls = new OrbitControls(camera, renderer.domElement);
  Object.assign(controls, { enableDamping: true, dampingFactor: 0.07, minDistance: 7, maxDistance: 75, rotateSpeed: 0.65, zoomSpeed: 0.9, panSpeed: 0.7, screenSpacePanning: true, maxPolarAngle: Math.PI * 0.485, minPolarAngle: 0.2 });

  // 光線：暖色主光 + 冷色補光 + 每層室內暖燈
  scene.add(new THREE.HemisphereLight(0xffe8d2, 0x2a2442, 1.05));
  const sun = new THREE.DirectionalLight(0xffd2a6, 2.1);
  sun.position.set(10, 26, 16); sun.castShadow = true;
  Object.assign(sun.shadow.camera, { left: -13, right: 13, top: 15, bottom: -9, near: 2, far: 70 });
  sun.shadow.mapSize.set(1024, 1024); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03; sun.shadow.radius = 4;
  sun.target.position.set(0, 6, 0); scene.add(sun, sun.target);
  const rim = new THREE.DirectionalLight(0x9db4ff, 0.7); rim.position.set(-12, 10, -14); scene.add(rim);

  // 地面廣場
  const ground = new THREE.Mesh(new THREE.CircleGeometry(48, 40), new THREE.MeshStandardMaterial({ color: 0x24223a, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -SLAB; ground.receiveShadow = true; scene.add(ground);
  const pad = new THREE.Mesh(new THREE.CircleGeometry(10.5, 40), new THREE.MeshStandardMaterial({ color: 0x302d4a, roughness: 0.95 }));
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
      const s = new THREE.Mesh(new THREE.PlaneGeometry(D, H), glassMat); s.rotation.y = Math.PI / 2; s.position.set(sx * (W / 2 - 0.05), y + H / 2, 0); scene.add(s);
      for (let i = 1; i < 4; i++) box(0.06, H, 0.06, mullionMat, sx * (W / 2 - 0.05), y + H / 2, -D / 2 + i * D / 4);
      box(0.08, 0.06, D, mullionMat, sx * (W / 2 - 0.05), y + 0.9, 0); box(0.1, 0.08, D, mullionMat, sx * (W / 2 - 0.05), y + H, 0);
    }
    // 樓層牌
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 0.575), new THREE.MeshBasicMaterial({ map: signTexture(FLOOR_INFO[f]), transparent: true, toneMapped: false }));
    sign.position.set(-W / 2 + 2.9, y + 0.3, D / 2 + 0.1); scene.add(sign);
    // 室內暖光
    const pl = new THREE.PointLight(0xffc98f, 10, 14, 1.4); pl.position.set(0, y + 3.2, 1.2); scene.add(pl);
    // 地毯
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(W - 2.4, D - 2.6), std(PAL.rug[f], { roughness: 1, flatShading: false, transparent: true, opacity: 0.55 }));
    rug.rotation.x = -Math.PI / 2; rug.position.set(0, y + 0.006, 0); rug.receiveShadow = true; scene.add(rug);
    plant(W / 2 - 0.75, y, -D / 2 + 0.75, 1.05);
    plant(-W / 2 + 0.75, y, D / 2 - 0.8, 0.85);
  }
  // 樓層專屬擺設
  shelf(-3.6, floorY(3), -D / 2 + 0.45); shelf(3.6, floorY(3), -D / 2 + 0.45);
  sofa(-3.2, floorY(3), 2.3, 0x8e6fb4, Math.PI); plant(4.4, floorY(3), 2.6, 0.9);
  box(2.2, 1.2, 0.06, std(0xfafafa, { emissive: 0x222222 }), 0, floorY(2) + 1.75, -D / 2 + 0.2); // 白板
  sofa(-3.4, floorY(1), 2.2, 0xd98a6a, Math.PI); sofa(3.6, floorY(1), -2.4, 0x6f9fd9);
  box(2.6, 1.0, 0.7, std(0xf2e8da), 0.6, floorY(1) + 0.5, -2.6); // 接待櫃台
  box(2.7, 0.06, 0.8, std(0x3b3856), 0.6, floorY(1) + 1.03, -2.6);
  const door = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.4), new THREE.MeshPhysicalMaterial({ color: 0xffe2b8, transparent: true, opacity: 0.25, emissive: 0xffc98f, emissiveIntensity: 0.3, side: THREE.DoubleSide }));
  door.position.set(0, floorY(1) + 1.2, D / 2 + 0.01); scene.add(door);

  // ===== 人物 =====
  const figures = new Map();
  let extraCount = 0;
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x241c33 });
  const blushMat = new THREE.MeshBasicMaterial({ color: 0xffa9a0, transparent: true, opacity: 0.7 });

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
    // 桌面小物：杯子、小盆栽
    box(0.09, 0.12, 0.09, std(0xff9e7a), dw / 2 - 0.3, 0.84, 0.4, grp);
    const mini = add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 0), leafMat), grp); mini.position.set(-dw / 2 + 0.28, 0.92, 0.42);
    box(0.12, 0.1, 0.12, potMat, -dw / 2 + 0.28, 0.83, 0.42, grp);
    // 椅子（人物後方）
    box(0.56, 0.08, 0.52, chairSeatMat, 0, 0.47, -0.25, grp);
    box(0.56, 0.62, 0.08, chairMat, 0, 0.84, -0.53, grp);
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.4, 6), legMat), grp).position.set(0, 0.24, -0.25);
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.04, 5), legMat), grp).position.set(0, 0.03, -0.25);

    const bodyMat = std(0x888888, { roughness: 0.5 });
    const skinMat = std(PAL.skin, { roughness: 0.75 });
    const person = new THREE.Group(); person.position.set(0, 0, -0.22); grp.add(person);
    const body = add(new THREE.Mesh(new THREE.CapsuleGeometry(0.23, 0.32, 2, 8), bodyMat), person); body.position.y = 0.86;
    const head = new THREE.Group(); head.position.y = 1.42; person.add(head);
    add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.25, 1), skinMat), head);
    const hair = add(new THREE.Mesh(new THREE.SphereGeometry(0.265, 10, 5, 0, Math.PI * 2, 0, Math.PI * 0.42), bodyMat), head); hair.position.set(0, 0.03, -0.02); hair.rotation.x = -0.35;
    for (const ex of [-0.085, 0.085]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), eyeMat); e.position.set(ex, 0.0, 0.225); head.add(e);
      const b = new THREE.Mesh(new THREE.CircleGeometry(0.04, 8), blushMat); b.position.set(ex * 1.55, -0.07, 0.218); b.rotation.y = ex > 0 ? 0.4 : -0.4; head.add(b);
    }
    const armL = add(new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.32, 2, 6), bodyMat), person); armL.rotation.x = Math.PI / 2 - 0.25; armL.position.set(-0.27, 0.9, 0.2);
    const armR = armL.clone(); armR.position.x = 0.27; person.add(armR);
    let orn = ornament('', bodyMat); orn.position.y = 0.33; head.add(orn);
    // 狀態光環
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x8a94a6, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, toneMapped: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.64, 28), ringMat); ring.rotation.x = -Math.PI / 2; ring.position.set(0, 0.02, -0.22); grp.add(ring);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.0, 1.8), new THREE.MeshBasicMaterial({ visible: false })); hit.position.set(0, 1, 0.1); hit.userData.key = key; grp.add(hit);

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
    const tail = document.createElement('span'); tail.className = 'tag-tail';
    el.append(bubble, tail);
    el.addEventListener('click', (ev) => { ev.stopPropagation(); onSelect && onSelect(key); });
    overlay.appendChild(el);

    const anchor = new THREE.Vector3(x, floorY(floor) + 2.05 + (z < -1 ? 0.25 : 0), z - 0.2);
    const fig = { key, grp, person, head, body, armL, armR, bodyMat, ringMat, ring, screenMat, hit, el, fx, dot, nm, st, step, anchor, status: '', shape: null, phase: Math.random() * 6,
      get orn() { return orn; }, set orn(v) { orn = v; } };
    figures.set(key, fig);
    return fig;
  }

  function ensureFigure(state, key) {
    if (figures.has(key)) return figures.get(key);
    const meta = botMeta(state, key);
    if (meta.floor) { const [x, z] = SEATS[key]; return buildFigure(key, meta.floor, x, z, key === 'nori'); }
    if (extraCount >= EXTRA_SEATS.length) return null;
    const [x, z] = EXTRA_SEATS[extraCount++];
    return buildFigure(key, 1, x, z, false);
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

  let selected = null;
  function update(state) {
    for (const key of [...BOTS.map(b => b.key), ...Object.keys(state.extras)]) {
      const fig = ensureFigure(state, key); if (!fig) continue;
      const meta = botMeta(state, key);
      const hex = lookColor(state, key);
      const col = new THREE.Color(hex);
      fig.bodyMat.color.copy(col);
      const lum = col.r * 0.3 + col.g * 0.59 + col.b * 0.11;
      if (lum < 0.08) { fig.bodyMat.color.setRGB(0.07, 0.07, 0.1); fig.bodyMat.emissive.setRGB(0.05, 0.05, 0.08); } else fig.bodyMat.emissive.setRGB(0, 0, 0);
      const shape = state.looks[key]?.shape || '';
      if (shape !== fig.shape) { fig.head.remove(fig.orn); const o = ornament(shape, fig.bodyMat); o.position.y = 0.33; o.traverse(m => { m.castShadow = true; }); fig.head.add(o); fig.orn = o; fig.shape = shape; }
      const s = state.bots[key];
      const status = s ? s.status : 'unknown';
      const sc = STATUS[status];
      if (status !== fig.status) { setFx(fig, status); fig.status = status; }
      fig.ringMat.color.set(sc.color);
      fig.screenMat.emissive.set(status === 'error' ? '#ff5d6c' : '#6bb4ff');
      fig.screenMat.emissiveIntensity = status === 'working' ? 1.2 : (status === 'idle' || status === 'unknown' ? 0.05 : 0.35);
      fig.dot.style.background = hex;
      fig.nm.textContent = meta.short;
      fig.st.textContent = sc.label;
      fig.st.style.background = sc.color;
      fig.step.textContent = s && s.step ? s.step : '尚無狀態訊息';
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
    const effW = W * Math.cos(az) + D * Math.sin(az) - (aspect < 0.9 ? 0.8 : -0.6);
    const effH = (2 * FLOOR_H + WALL_H + 0.6) * Math.sin(polar) + D * Math.cos(polar) + 1.2;
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
  }
  let framed = false;
  function intro() {
    const v = defaultView();
    camera.position.copy(v.pos.clone().sub(v.target).multiplyScalar(1.55).add(v.target).add(new THREE.Vector3(-8, 6, 0)));
    controls.target.copy(v.target); controls.update();
    flyTo(v, 1600);
  }

  // 名牌投影
  const v = new THREE.Vector3();
  function placeTags() {
    const w = container.clientWidth, h = container.clientHeight;
    const list = [];
    for (const f of figures.values()) {
      v.copy(f.anchor).project(camera);
      const vis = v.z < 1 && v.x > -1.15 && v.x < 1.15 && v.y > -1.15 && v.y < 1.15;
      f.el.style.visibility = vis ? 'visible' : 'hidden';
      if (!vis) continue;
      if (!f.size || f.dirty) { f.size = [f.el.offsetWidth, f.el.offsetHeight]; f.dirty = false; }
      list.push({ f, z: v.z, x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h });
    }
    // 名牌避讓：離鏡頭近的先放，後面的若重疊就往上推
    list.sort((a, b) => a.z - b.z);
    const placed = [];
    for (const it of list) {
      const [tw, th] = it.f.size;
      let x0 = it.x - tw / 2, y1 = it.y, lift = 0;
      for (let pass = 0; pass < 6; pass++) {
        const hit = placed.find(r => x0 < r.x1 - 2 && x0 + tw > r.x0 + 2 && (y1 - lift) - th < r.y1 - 2 && (y1 - lift) > r.y0 + 2);
        if (!hit) break;
        lift = y1 - hit.y0 + 12;
      }
      const top = y1 - lift;
      placed.push({ x0, x1: x0 + tw, y0: top - th, y1: top });
      it.f.el.style.transform = `translate3d(${x0.toFixed(1)}px, ${(top - th).toFixed(1)}px, 0)`;
      it.f.el.classList.toggle('lifted', lift > 0);
      if (lift > 0) it.f.el.style.setProperty('--lift', lift.toFixed(0) + 'px');
    }
    list.forEach((it, i) => { it.f.el.style.zIndex = String(it.f.key === selected ? 999 : 100 - i); });
  }

  // 動畫迴圈：分頁隱藏或不在畫面時暫停
  function frame() {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    const t = clock.getElapsedTime();
    if (fly) {
      const k = Math.min(1, (performance.now() - fly.t0) / fly.ms), e = easeOut(k);
      camera.position.lerpVectors(fly.p0, fly.p1, e); controls.target.lerpVectors(fly.t0v, fly.t1, e);
      if (k >= 1) fly = null;
    }
    for (const f of figures.values()) {
      const p = t + f.phase;
      const breathe = Math.sin(p * 1.6) * 0.012;
      f.body.scale.set(1 + breathe, 1 - breathe * 0.6, 1 + breathe);
      if (f.status === 'working') {
        f.armL.position.y = 0.9 + Math.max(0, Math.sin(p * 14)) * 0.035; f.armR.position.y = 0.9 + Math.max(0, Math.sin(p * 14 + 1.6)) * 0.035;
        f.head.rotation.set(0.12 + Math.sin(p * 1.3) * 0.04, Math.sin(p * 0.7) * 0.12, 0); f.head.position.y = 1.42;
      } else if (f.status === 'idle') {
        f.armL.position.y = f.armR.position.y = 0.9;
        f.head.rotation.set(0.32 + Math.sin(p * 0.9) * 0.04, 0, 0.18); f.head.position.y = 1.39;
      } else if (f.status === 'waiting_user') {
        f.armL.position.y = f.armR.position.y = 0.9;
        f.head.rotation.set(-0.1, Math.sin(p * 1.1) * 0.35, Math.sin(p * 0.8) * 0.1); f.head.position.y = 1.43 + Math.abs(Math.sin(p * 2.2)) * 0.02;
      } else if (f.status === 'done') {
        f.armL.position.y = f.armR.position.y = 0.9;
        f.head.rotation.set(-0.05, 0, Math.sin(p * 2) * 0.08); f.head.position.y = 1.42;
      } else {
        f.armL.position.y = f.armR.position.y = 0.9; f.head.rotation.set(0, 0, 0); f.head.position.y = 1.42;
      }
      f.orn.rotation.y = t * 0.8;
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

  return { update, select, resetView, setInsets };
}

export function webglAvailable() {
  try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); }
  catch { return false; }
}
