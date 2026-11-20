// AI 辦公室：5 套角色外型（全部為本專案自製的程序化低多邊形幾何，不使用任何外部模型、圖片或商標檔）
import * as THREE from './vendor/three/three.module.min.js';

export const AVATAR_SETS = [
  { id: 'mark',   name: '標記吉祥物', desc: '用各 bot 的標記形狀做成的圓潤小精靈（預設）' },
  { id: 'office', name: '上班族',     desc: '深色頭髮、白襯衫打紅領帶，外套是 bot 的顏色' },
  { id: 'robot',  name: '圓圓機器人', desc: '圓滾滾的機器人，面罩會發光' },
  { id: 'cat',    name: '貓咪同事',   desc: '尖耳朵、白鬍鬚、綠眼睛，還有翹尾巴' },
  { id: 'astro',  name: 'Q 版太空人', desc: '戴頭盔、背背包的太空人' },
];
export const DEFAULT_SET = 'mark';

const cache = new Map();
const memo = (k, fn) => { if (!cache.has(k)) cache.set(k, fn()); return cache.get(k); };
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.02, flatShading: true, ...o });
const glossy = (color, o = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.28, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.12, sheen: 0.3, ...o });
const shared = {
  eye: new THREE.MeshStandardMaterial({ color: 0x1d1830, roughness: 0.2 }),
  shine: new THREE.MeshBasicMaterial({ color: 0xffffff }),
  blush: new THREE.MeshBasicMaterial({ color: 0xff9fae, transparent: true, opacity: 0.75, depthWrite: false }),
  white: std(0xfaf8f4, { roughness: 0.5 }),
  skin: std(0xffe3cf, { roughness: 0.75 }),
  metal: std(0xc7cbd8, { roughness: 0.35, metalness: 0.55 }),
  dark: std(0x2a2c3a, { roughness: 0.4 }),
  pink: std(0xff9fb0, { roughness: 0.6 }),
};

function mesh(geo, mat, parent, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = false; parent.add(m); return m;
}
// 一雙會眨眼的眼睛＋腮紅＋微笑
function face(parent, z, opts = {}) {
  const { sx = 0.085, y = 0, r = 0.035, blushY = -0.06, smile = true, dz = 0 } = opts;
  const eyeG = memo('eye' + r, () => new THREE.SphereGeometry(r, 10, 8));
  const shineG = memo('shine' + r, () => new THREE.SphereGeometry(r * 0.32, 6, 4));
  const blushG = memo('blush', () => new THREE.CircleGeometry(0.038, 12));
  const eyes = new THREE.Group(); parent.add(eyes);
  for (const s of [-1, 1]) {
    const e = mesh(eyeG, shared.eye, eyes, s * sx, y, z); e.scale.set(1, 1.18, 0.6);
    mesh(shineG, shared.shine, eyes, s * sx + r * 0.3, y + r * 0.4, z + r * 0.45).castShadow = false;
    const b = mesh(blushG, shared.blush, parent, s * sx * 1.55, y + blushY, z - 0.005 + dz); b.castShadow = false;
  }
  if (smile) {
    const sm = mesh(memo('smile', () => new THREE.TorusGeometry(0.03, 0.009, 4, 10, Math.PI)), shared.eye, parent, 0, y - 0.05, z);
    sm.rotation.z = Math.PI; sm.castShadow = false;
  }
  return eyes;
}

// ===== 1. 標記吉祥物：頭＋身體就是標記形狀 =====
function markOutline(shape) {
  const pts = []; const N = 72;
  const R = 0.36;
  for (let i = 0; i < N; i++) {
    const t = i / N * Math.PI * 2;
    let r, x, y;
    switch (shape) {
      case 'flower': r = R * (0.8 + 0.2 * Math.cos(5 * t)); x = r * Math.sin(t); y = r * Math.cos(t); break;
      case 'clover': r = R * (0.56 + 0.44 * Math.pow(Math.abs(Math.cos(2 * (t + Math.PI / 4))), 0.55)); x = r * Math.sin(t); y = r * Math.cos(t); break;
      case 'hexagon': {
        const k = Math.PI / 3, a = ((t + Math.PI / 6) % k) - k / 2; r = R * 0.9 * Math.cos(k / 2) / Math.cos(a);
        r = r * 0.86 + R * 0.9 * 0.14; x = r * Math.sin(t); y = r * Math.cos(t); break; // 角落略帶圓
      }
      case 'star4': r = R * (0.5 + 0.5 * Math.pow(Math.abs(Math.cos(2 * t)), 2.2)) * 1.06; x = r * Math.sin(t); y = r * Math.cos(t); break;
      default: { // drop：上尖下圓的水滴
        const a = 0.4; x = a * Math.sin(t) * Math.pow(Math.sin(t / 2), 1.1) * 0.95; y = a * Math.cos(t) * 0.92;
      }
    }
    pts.push(new THREE.Vector2(x, y));
  }
  return pts;
}
function markGeometry(shape) {
  return memo('mark:' + shape, () => {
    const g = new THREE.ExtrudeGeometry(new THREE.Shape(markOutline(shape)), { depth: 0.18, bevelEnabled: true, bevelThickness: 0.11, bevelSize: 0.075, bevelSegments: 5, curveSegments: 4 });
    g.center(); g.computeVertexNormals(); return g;
  });
}
function buildMark(shape) {
  const root = new THREE.Group();
  const tintMat = glossy(0x888888);
  const head = new THREE.Group(); head.position.y = 1.16; root.add(head);
  const body = new THREE.Group(); head.add(body);
  const m = mesh(markGeometry(shape || 'drop'), tintMat, body);
  if (shape === 'drop' || !shape) m.rotation.z = 0; // 尖端朝上
  const frontZ = 0.2;
  face(body, frontZ, { y: shape === 'drop' || !shape ? -0.06 : 0.0, r: 0.04, sx: 0.1 });
  // 小手小腳
  const nub = memo('nub', () => new THREE.SphereGeometry(0.075, 10, 8));
  const armL = mesh(nub, tintMat, root, -0.36, 1.0, 0.12);
  const armR = mesh(nub, tintMat, root, 0.36, 1.0, 0.12);
  for (const s of [-1, 1]) { const f = mesh(nub, tintMat, root, s * 0.14, 0.66, 0.16); f.scale.set(1.1, 0.7, 1.3); }
  return { root, head, body, armL, armR, headY: 1.16, armY: 1.0, tint: [tintMat], spin: null, glossy: true };
}

// ===== 2. 上班族 =====
// 上班族：深色頭髮（固定髮色）、白襯衫＋領帶，西裝外套才是 bot 的顏色
const hairMat = std(0x2b2220, { roughness: 0.55 });
const tieMat = std(0xc23a45, { roughness: 0.5 });
const badgeMat = std(0xffffff, { roughness: 0.4 });
function buildOffice() {
  const root = new THREE.Group();
  const c = std(0x888888, { roughness: 0.55 });
  const body = mesh(memo('off-body', () => new THREE.CapsuleGeometry(0.24, 0.32, 3, 10)), c, root, 0, 0.86, 0);
  // 襯衫前襟（V 領）＋領帶
  const shirt = mesh(memo('off-shirt', () => new THREE.CylinderGeometry(0.0, 0.15, 0.34, 3, 1)), shared.white, root, 0, 1.0, 0.2);
  shirt.rotation.set(Math.PI + 0.14, 0, 0); shirt.scale.set(1, 1, 0.35);
  const knot = mesh(memo('off-knot', () => new THREE.OctahedronGeometry(0.035, 0)), tieMat, root, 0, 1.12, 0.245); knot.scale.set(1, 0.8, 0.6);
  const tie = mesh(memo('off-tie', () => new THREE.ConeGeometry(0.045, 0.24, 4)), tieMat, root, 0, 0.98, 0.25); tie.rotation.set(Math.PI + 0.12, Math.PI / 4, 0); tie.scale.set(1, 1, 0.45);
  // 識別證
  const badge = mesh(memo('off-badge', () => new THREE.BoxGeometry(0.07, 0.09, 0.012)), badgeMat, root, 0.13, 0.9, 0.235); badge.rotation.x = -0.12;
  const head = new THREE.Group(); head.position.y = 1.43; root.add(head);
  mesh(memo('off-head', () => new THREE.IcosahedronGeometry(0.25, 2)), shared.skin, head);
  // 頭髮：頭頂＋後腦＋側分瀏海
  const cap = mesh(memo('off-hair', () => new THREE.SphereGeometry(0.27, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5)), hairMat, head, 0, 0.02, -0.02); cap.rotation.x = -0.28;
  const back = mesh(memo('off-hairb', () => new THREE.SphereGeometry(0.262, 12, 8)), hairMat, head, 0, -0.02, -0.07); back.scale.set(1, 0.9, 0.8);
  const fringe = mesh(memo('off-fringe', () => new THREE.CapsuleGeometry(0.06, 0.26, 2, 6)), hairMat, head, -0.04, 0.16, 0.17); fringe.rotation.set(0, 0, Math.PI / 2 - 0.35);
  for (const sx of [-1, 1]) mesh(memo('off-ear', () => new THREE.SphereGeometry(0.05, 8, 6)), shared.skin, head, sx * 0.245, -0.02, 0).scale.set(0.5, 1, 0.8);
  face(head, 0.225, { r: 0.03, sx: 0.085, y: 0, blushY: -0.07 });
  const armG = memo('off-arm', () => new THREE.CapsuleGeometry(0.065, 0.3, 2, 6));
  const handG = memo('off-hand', () => new THREE.SphereGeometry(0.058, 8, 6));
  const armL = new THREE.Group(); armL.position.set(-0.28, 0.9, 0.16); root.add(armL);
  const armR = new THREE.Group(); armR.position.set(0.28, 0.9, 0.16); root.add(armR);
  for (const a of [armL, armR]) { mesh(armG, c, a).rotation.x = Math.PI / 2 - 0.25; mesh(handG, shared.skin, a, 0, -0.04, 0.2); }
  return { root, head, body, armL, armR, headY: 1.43, armY: 0.9, tint: [c], spin: null };
}

// ===== 3. 圓圓機器人 =====
function buildRobot() {
  const root = new THREE.Group();
  const c = std(0x888888, { roughness: 0.3, metalness: 0.35, flatShading: false });
  const body = mesh(memo('rb-body', () => new THREE.SphereGeometry(0.3, 16, 12)), c, root, 0, 0.84, 0); body.scale.set(1, 0.92, 0.9);
  mesh(memo('rb-belly', () => new THREE.CircleGeometry(0.11, 16)), shared.white, root, 0, 0.84, 0.272).castShadow = false;
  const head = new THREE.Group(); head.position.y = 1.4; root.add(head);
  mesh(memo('rb-head', () => new THREE.SphereGeometry(0.27, 18, 14)), shared.white, head).scale.set(1.08, 0.94, 1);
  const visorMat = new THREE.MeshPhysicalMaterial({ color: 0x141a2c, roughness: 0.15, clearcoat: 1 });
  const visor = mesh(memo('rb-visor', () => new THREE.SphereGeometry(0.235, 18, 10, -Math.PI * 0.36, Math.PI * 0.72, Math.PI * 0.3, Math.PI * 0.36)), visorMat, head, 0, 0, 0.05);
  visor.scale.set(1.08, 1, 1); visor.rotation.y = 0;
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x8ff3ff, toneMapped: false });
  for (const s of [-1, 1]) { const e = mesh(memo('rb-eye', () => new THREE.CapsuleGeometry(0.022, 0.03, 2, 6)), eyeMat, head, s * 0.075, 0.01, 0.28); e.castShadow = false; }
  for (const s of [-1, 1]) { const ear = mesh(memo('rb-ear', () => new THREE.CylinderGeometry(0.06, 0.06, 0.06, 12)), c, head, s * 0.29, 0, 0); ear.rotation.z = Math.PI / 2; }
  mesh(memo('rb-ant', () => new THREE.CylinderGeometry(0.012, 0.012, 0.16, 5)), shared.metal, head, 0, 0.32, 0);
  const tip = mesh(memo('rb-tip', () => new THREE.SphereGeometry(0.045, 10, 8)), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.2 }), head, 0, 0.41, 0);
  const armG = memo('rb-arm', () => new THREE.CapsuleGeometry(0.05, 0.26, 2, 8));
  const armL = new THREE.Group(); armL.position.set(-0.3, 0.92, 0.14); root.add(armL);
  const armR = new THREE.Group(); armR.position.set(0.3, 0.92, 0.14); root.add(armR);
  for (const a of [armL, armR]) { const m = mesh(armG, shared.metal, a); m.rotation.x = Math.PI / 2 - 0.3; mesh(memo('rb-hand', () => new THREE.SphereGeometry(0.065, 10, 8)), c, a, 0, -0.05, 0.16); }
  return { root, head, body, armL, armR, headY: 1.4, armY: 0.92, tint: [c, tip.material], spin: null, robotTip: tip };
}

// ===== 4. 貓咪同事：大尖耳、白鬍鬚、虎斑額紋、翹起的尾巴 =====
const stripeMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false });
const whiskerMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
const catEyeMat = new THREE.MeshStandardMaterial({ color: 0x9be36b, roughness: 0.2, emissive: 0x2a4a10, emissiveIntensity: 0.4 });
function buildCat() {
  const root = new THREE.Group();
  const c = std(0x888888, { roughness: 0.75 });
  const body = mesh(memo('cat-body', () => new THREE.CapsuleGeometry(0.22, 0.24, 3, 10)), c, root, 0, 0.82, 0);
  body.scale.set(1.05, 1, 1);
  mesh(memo('cat-belly', () => new THREE.SphereGeometry(0.15, 10, 8)), shared.white, root, 0, 0.8, 0.14).scale.set(1, 1.3, 0.6);
  const head = new THREE.Group(); head.position.y = 1.36; root.add(head);
  mesh(memo('cat-head', () => new THREE.IcosahedronGeometry(0.28, 2)), c, head).scale.set(1.18, 0.9, 1);
  for (const s of [-1, 1]) {
    const ear = mesh(memo('cat-ear', () => new THREE.ConeGeometry(0.13, 0.26, 4)), c, head, s * 0.19, 0.27, -0.02); ear.rotation.set(0, Math.PI / 4, -s * 0.32);
    const inner = mesh(memo('cat-ear2', () => new THREE.ConeGeometry(0.075, 0.16, 4)), shared.pink, head, s * 0.18, 0.25, 0.04); inner.rotation.set(0, Math.PI / 4, -s * 0.32); inner.castShadow = false;
  }
  // 額頭虎斑
  for (const [x, h] of [[-0.07, 0.07], [0, 0.09], [0.07, 0.07]]) { const st = mesh(memo('cat-stripe', () => new THREE.BoxGeometry(0.028, 1, 0.01)), stripeMat, head, x, 0.17, 0.24); st.scale.y = h; st.rotation.x = -0.5; st.castShadow = false; }
  mesh(memo('cat-muzzle', () => new THREE.SphereGeometry(0.095, 10, 8)), shared.white, head, 0, -0.08, 0.215).scale.set(1.45, 0.8, 0.7);
  mesh(memo('cat-nose', () => new THREE.ConeGeometry(0.03, 0.03, 3)), shared.pink, head, 0, -0.04, 0.28).rotation.x = Math.PI;
  // 杏仁形綠眼（取代一般圓眼）
  for (const s of [-1, 1]) {
    const e = mesh(memo('cat-eye', () => new THREE.SphereGeometry(0.042, 10, 8)), catEyeMat, head, s * 0.105, 0.04, 0.235); e.scale.set(1.1, 1.0, 0.5); e.castShadow = false;
    const pu = mesh(memo('cat-pupil', () => new THREE.SphereGeometry(0.03, 8, 6)), shared.eye, head, s * 0.105, 0.04, 0.252); pu.scale.set(0.35, 1.1, 0.4); pu.castShadow = false;
    mesh(memo('cat-shine', () => new THREE.SphereGeometry(0.011, 6, 4)), shared.shine, head, s * 0.105 + 0.012, 0.058, 0.262).castShadow = false;
  }
  // 白色長鬍鬚，伸出臉頰外面才看得到
  const wh = memo('cat-wh', () => new THREE.BoxGeometry(0.24, 0.012, 0.012));
  for (const s of [-1, 1]) for (const k of [-1, 0, 1]) { const w = mesh(wh, whiskerMat, head, s * 0.24, -0.075 + k * 0.026, 0.2); w.rotation.z = s * k * 0.18; w.castShadow = false; }
  // 尾巴從身體側邊翹起來，正面也看得到
  const tail = mesh(memo('cat-tail', () => new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.18, 0.02, -0.06), new THREE.Vector3(0.34, 0.22, 0.0), new THREE.Vector3(0.36, 0.5, 0.06), new THREE.Vector3(0.28, 0.66, 0.1)]), 20, 0.055, 7, false)), c, root, 0.12, 0.6, -0.12);
  const tip = mesh(memo('cat-tailtip', () => new THREE.SphereGeometry(0.058, 8, 6)), shared.white, tail, 0.28, 0.66, 0.1); tip.castShadow = false;
  const pawG = memo('cat-paw', () => new THREE.CapsuleGeometry(0.06, 0.22, 2, 6));
  const armL = new THREE.Group(); armL.position.set(-0.23, 0.88, 0.16); root.add(armL);
  const armR = new THREE.Group(); armR.position.set(0.23, 0.88, 0.16); root.add(armR);
  for (const a of [armL, armR]) { mesh(pawG, c, a).rotation.x = Math.PI / 2 - 0.25; mesh(memo('cat-mitt', () => new THREE.SphereGeometry(0.065, 8, 6)), shared.white, a, 0, -0.04, 0.17); }
  return { root, head, body, armL, armR, headY: 1.36, armY: 0.88, tint: [c], spin: null, tail };
}

// ===== 5. Q 版太空人 =====
function buildAstro() {
  const root = new THREE.Group();
  const c = std(0x888888, { roughness: 0.45 });
  const suit = std(0xf4f5f9, { roughness: 0.55, flatShading: false });
  const body = mesh(memo('as-body', () => new THREE.CapsuleGeometry(0.24, 0.26, 4, 12)), suit, root, 0, 0.84, 0);
  mesh(memo('as-pack', () => new THREE.BoxGeometry(0.4, 0.42, 0.16)), c, root, 0, 0.9, -0.26);
  mesh(memo('as-panel', () => new THREE.BoxGeometry(0.16, 0.1, 0.04)), c, root, 0, 0.92, 0.235);
  mesh(memo('as-belt', () => new THREE.TorusGeometry(0.235, 0.025, 6, 20)), c, root, 0, 0.72, 0).rotation.x = Math.PI / 2;
  const head = new THREE.Group(); head.position.y = 1.44; root.add(head);
  mesh(memo('as-helmet', () => new THREE.SphereGeometry(0.3, 20, 16)), suit, head);
  const visorMat = new THREE.MeshPhysicalMaterial({ color: 0x23263f, roughness: 0.08, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05 });
  const visor = mesh(memo('as-visor', () => new THREE.SphereGeometry(0.245, 20, 12, -Math.PI * 0.4, Math.PI * 0.8, Math.PI * 0.26, Math.PI * 0.46)), visorMat, head, 0, -0.01, 0.075);
  const rim = mesh(memo('as-rim', () => new THREE.TorusGeometry(0.2, 0.022, 6, 24)), c, head, 0, -0.01, 0.22); rim.scale.set(1.12, 0.92, 1);
  // 面罩上的反光
  const glint = mesh(memo('as-glint', () => new THREE.CircleGeometry(0.035, 10)), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 }), head, -0.08, 0.06, 0.315); glint.castShadow = false;
  face(head, 0.3, { r: 0.028, sx: 0.07, y: -0.02, blushY: -0.055, smile: true, dz: 0.004 });
  mesh(memo('as-ant', () => new THREE.CylinderGeometry(0.01, 0.01, 0.14, 5)), shared.metal, head, 0.16, 0.3, -0.04);
  const light = mesh(memo('as-light', () => new THREE.SphereGeometry(0.035, 8, 6)), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.25 }), head, 0.16, 0.38, -0.04);
  const armG = memo('as-arm', () => new THREE.CapsuleGeometry(0.07, 0.24, 3, 8));
  const armL = new THREE.Group(); armL.position.set(-0.29, 0.92, 0.14); root.add(armL);
  const armR = new THREE.Group(); armR.position.set(0.29, 0.92, 0.14); root.add(armR);
  for (const a of [armL, armR]) { mesh(armG, suit, a).rotation.x = Math.PI / 2 - 0.3; mesh(memo('as-glove', () => new THREE.SphereGeometry(0.075, 10, 8)), c, a, 0, -0.04, 0.17); }
  return { root, head, body, armL, armR, headY: 1.44, armY: 0.92, tint: [c, light.material], spin: null };
}

export function buildAvatar(setId, shape) {
  switch (setId) {
    case 'office': return buildOffice();
    case 'robot': return buildRobot();
    case 'cat': return buildCat();
    case 'astro': return buildAstro();
    default: return buildMark(shape);
  }
}
export const usesShape = (setId) => setId === 'mark' || !AVATAR_SETS.some(s => s.id === setId);

// 依外型顏色上色；太暗的顏色（例如黑色）稍微提亮並加一點自發光，夜景中才看得到
export function tintAvatar(av, hex) {
  const col = new THREE.Color(hex);
  const lum = col.r * 0.3 + col.g * 0.59 + col.b * 0.11;
  av.tint.forEach((m, i) => {
    if (i > 0 && m.emissive && m.emissiveIntensity !== undefined && m !== av.tint[0]) { m.color.copy(col); m.emissive.copy(col); m.emissiveIntensity = 0.6; return; }
    m.color.copy(col);
    if (lum < 0.08) { m.color.setRGB(0.06, 0.06, 0.09); m.emissive && m.emissive.setRGB(0.04, 0.04, 0.07); }
    else m.emissive && m.emissive.setRGB(0, 0, 0);
  });
}

const KEEP = new Set([hairMat, tieMat, badgeMat, stripeMat, whiskerMat, catEyeMat]);
export function disposeAvatar(av) {
  av.root.traverse(o => { if (o.material && !Object.values(shared).includes(o.material) && !KEEP.has(o.material) && !av.tint.includes(o.material)) o.material.dispose?.(); });
  av.tint.forEach(m => m.dispose?.());
  av.root.removeFromParent();
}
