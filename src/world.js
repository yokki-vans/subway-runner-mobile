// Мир: районы (чанки декораций), генератор препятствий, монеты, бонусы.
// Координата d — пройденная дистанция вперёд; мировая z = -d.
import * as THREE from 'three';
import { mergeGeometries } from '../vendor/utils/BufferGeometryUtils.js';
import { curved } from './curve.js';
import { radialTexture, windowTextures } from './assets.js';

export const LW = 2.6;       // ширина полосы
export const CL = 42;        // длина чанка
const NCH = 8;               // чанков одновременно
const VARIANTS = 3;
const TRAM_LEN = 15, TRAM_TOP = 3.3, RAMP_LEN = 7;
const MAXC = 320;            // пул монет
export const BIOMES = ['Центр', 'Парк', 'Порт', 'Мост'];

// ---------- маленький ГПСЧ ----------
function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---------- сборщики геометрии ----------
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _c = new THREE.Color();
function M(x, y, z, sx = 1, sy = 1, sz = 1, ry = 0, rx = 0, rz = 0) {
  _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e);
  return _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
}
const BOX = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
const PLANES = {};
const planeSeg = (seg) => (PLANES[seg] ||= new THREE.PlaneGeometry(1, 1, 1, seg).toNonIndexed());
const ni = (g) => (g.userData.ni ||= g.index ? g.toNonIndexed() : g);

class VC { // процедурная геометрия с цветом в вершинах
  constructor() { this.pos = []; this.nor = []; this.col = []; }
  add(geo, m, color) {
    const g = ni(geo).clone(); g.applyMatrix4(m);
    const p = g.attributes.position.array, n = g.attributes.normal.array;
    _c.set(color);
    for (let i = 0; i < p.length; i++) { this.pos.push(p[i]); this.nor.push(n[i]); }
    for (let i = 0; i < p.length / 3; i++) this.col.push(_c.r, _c.g, _c.b);
    g.dispose(); return this;
  }
  box(x, y, z, sx, sy, sz, color, ry = 0, rx = 0) { return this.add(BOX, M(x, y, z, sx, sy, sz, ry, rx), color); }
  floor(x0, x1, z0, z1, y, color, seg = 8) { // горизонтальная полоса, порезанная вдоль z (чтобы гнулась)
    return this.add(planeSeg(seg), M((x0 + x1) / 2, y, (z0 + z1) / 2, x1 - x0, Math.abs(z1 - z0), 1, 0, -Math.PI / 2), color);
  }
  longBox(x, y, z0, z1, sx, sy, color, segLen = 7) { // длинная балка вдоль z кусками
    const n = Math.max(1, Math.round(Math.abs(z1 - z0) / segLen)), dz = (z1 - z0) / n;
    for (let i = 0; i < n; i++) this.box(x, y, z0 + dz * (i + 0.5), sx, sy, Math.abs(dz) + 0.02, color);
    return this;
  }
  build() {
    if (!this.pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    return g;
  }
}

class KitB { // модели из набора (общая текстура)
  constructor(kit) { this.kit = kit; this.list = []; }
  add(name, x, y, z, s = 1, ry = 0, sy = s) { this.list.push(this.kit[name].clone().applyMatrix4(M(x, y, z, s, sy, s, ry))); return this; }
  build() { if (!this.list.length) return null; const g = mergeGeometries(this.list); this.list.forEach((x) => x.dispose()); return g; }
}

class QuadB { // плоскости с uv и цветом: свечение, высотки
  constructor() { this.list = []; }
  push(g, color) {
    _c.set(color);
    const n = g.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.list.push(g);
  }
  build() { if (!this.list.length) return null; const g = mergeGeometries(this.list); this.list.forEach((x) => x.dispose()); return g; }
}
const PLANE1 = new THREE.PlaneGeometry(1, 1);
const BOXI = new THREE.BoxGeometry(1, 1, 1);

function glowQuad(qb, x, y, z, size, color, flat = false) {
  qb.push(PLANE1.clone().applyMatrix4(M(x, y, z, size, size, 1, 0, flat ? -Math.PI / 2 : 0)), color);
}
function tower(qb, rnd, x, base, z, w, h, dpt, color) {
  const g = BOXI.clone();
  const uv = g.attributes.uv, ou = Math.floor(rnd() * 8) / 8, ov = Math.floor(rnd() * 8) / 8;
  for (let f = 0; f < 6; f++) {
    const wd = f < 2 ? dpt : w;
    const ku = Math.max(1, Math.round(wd / 1.7)) / 8, kv = Math.max(1, Math.round(h / 2.3)) / 8;
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      if (f === 2 || f === 3) uv.setXY(k, 0.005, 0.005);
      else uv.setXY(k, uv.getX(k) * ku + ou, uv.getY(k) * kv + ov);
    }
  }
  g.applyMatrix4(M(x, base + h / 2, z, w, h, dpt));
  qb.push(g, color);
}

// ---------- районы ----------
const TREE_TRUNK = new THREE.CylinderGeometry(0.22, 0.34, 2.2, 6);
const TREE_BALL = new THREE.IcosahedronGeometry(1.6, 0);
const TREE_CONE = new THREE.ConeGeometry(1.5, 2.6, 7);
const HILL = new THREE.IcosahedronGeometry(1, 1);
const pick = (rnd, a) => a[Math.floor(rnd() * a.length)];

function roadBase(vc, road, mark = '#e8e2cf', rail = '#aab2bd') {
  vc.floor(-4.3, 4.3, 0, -CL, 0, road);
  for (let l = -1; l <= 1; l++) for (const s of [-0.62, 0.62]) vc.floor(l * LW + s - 0.06, l * LW + s + 0.06, 0, -CL, 0.03, rail);
  for (const x of [-LW / 2, LW / 2]) for (let z = -1; z > -CL; z -= 6) vc.floor(x - 0.07, x + 0.07, z, z - 3, 0.025, mark, 1);
}
function lamp(kb, qb, side, z) {
  const x = side * 5.0, s = 5.6;
  kb.add('streetlight', x, 0.15, z, s, side > 0 ? 0 : Math.PI);
  const hx = x - side * 0.22 * s;
  glowQuad(qb, hx, 0.93 * s, z + 0.1, 3.4, '#ffd9a0');
  glowQuad(qb, hx - side * 1.2, 0.07, z, 9, '#7a5a30', true);
}
function tree(vc, rnd, x, z, s) {
  vc.add(TREE_TRUNK, M(x, 1.1 * s, z, s, s, s), '#6b4a32');
  if (rnd() < 0.45) {
    const c = pick(rnd, ['#2f6b3d', '#2a5f43', '#356f37']);
    vc.add(TREE_CONE, M(x, 3.0 * s, z, s, s, s, rnd() * 3), c);
    vc.add(TREE_CONE, M(x, 4.4 * s, z, s * 0.72, s * 0.8, s * 0.72, rnd() * 3), c);
  } else {
    vc.add(TREE_BALL, M(x, 3.3 * s, z, s, s * 0.85, s, rnd() * 3, rnd()), pick(rnd, ['#5faa45', '#76b84a', '#4d9a4f', '#8fbf4d', '#d9a441']));
  }
}

function buildVariant(biome, rnd, kit) {
  const vc = new VC(), kb = new KitB(kit), glow = new QuadB(), tow = new QuadB();
  const towCol = ['#c9d2e0', '#b8a998', '#9fb3c8', '#d6c7b0', '#8f9bb0', '#c2b6c9'];

  if (biome === 0) { // Центр
    roadBase(vc, '#3a3e49');
    for (const sd of [-1, 1]) {
      vc.floor(sd * 4.3, sd * 7.4, 0, -CL, 0.15, '#bdb8ae');
      vc.longBox(sd * 4.36, 0.075, 0, -CL, 0.14, 0.15, '#8d8a84');
      vc.floor(sd * 7.4, sd * 95, 0, -CL, 0.02, '#7c7a78', 6);
      for (let i = 0; i < 3; i++) {
        const z = -7 - 14 * i;
        kb.add('building_' + pick(rnd, 'ABCDEFGH'), sd * 14.5, -0.52, z, 7, sd > 0 ? -Math.PI / 2 : Math.PI / 2, 7 * (1 + rnd() * 0.35));
        lamp(kb, glow, sd, z - 7 + 0.5);
        const r = rnd(), pz = z + (rnd() - 0.5) * 8;
        if (r < 0.25) kb.add('firehydrant', sd * 6.6, 0.15, pz, 5);
        else if (r < 0.5) kb.add('bench', sd * 6.7, 0.15, pz, 6, Math.PI / 2);
        else if (r < 0.7) kb.add('bush', sd * 6.6, 0.15, pz, 5.5, rnd() * 6, 4);
        else if (r < 0.85) kb.add('dumpster', sd * 6.3, 0.15, pz, 4, Math.PI / 2);
      }
      if (rnd() < 0.5) kb.add('trafficlight_C', sd * 4.7, 0.15, -CL + 2, 6, sd > 0 ? 0 : Math.PI);
      for (let i = 0; i < 4; i++) {
        const w = 11 + rnd() * 8, h = 28 + rnd() * 48;
        tower(tow, rnd, sd * (30 + rnd() * 45), 0, -rnd() * CL, w, h, 11 + rnd() * 8, pick(rnd, towCol));
      }
    }
  } else if (biome === 1) { // Парк
    roadBase(vc, '#4b4a47', '#efe6c8');
    for (const sd of [-1, 1]) {
      vc.longBox(sd * 4.45, 0.12, 0, -CL, 0.3, 0.24, '#b9b1a0');
      vc.floor(sd * 4.6, sd * 95, 0, -CL, 0.06, '#5d9c48', 6);
      vc.floor(sd * 5.4, sd * 6.6, 0, -CL, 0.08, '#c9b58c');
      for (let i = 0; i < 2; i++) lamp(kb, glow, sd, -10.5 - 21 * i);
      for (let i = 0; i < 16; i++) {
        const x = sd * (8 + Math.pow(rnd(), 1.4) * 44);
        tree(vc, rnd, x, -rnd() * CL, 0.9 + rnd() * 0.9);
      }
      for (let i = 0; i < 4; i++) kb.add('bush', sd * (7 + rnd() * 3), 0.05, -rnd() * CL, 6 + rnd() * 3, rnd() * 6, 4.5);
      if (rnd() < 0.8) kb.add('bench', sd * 7.0, 0.06, -6 - rnd() * 30, 6.5, Math.PI / 2);
      for (let i = 0; i < 10; i++) vc.box(sd * (7 + rnd() * 12), 0.2, -rnd() * CL, 0.22, 0.3, 0.22, pick(rnd, ['#ffd84a', '#ff7aa8', '#ffffff', '#b78cff']));
      vc.add(HILL, M(sd * (62 + rnd() * 18), -2, -rnd() * CL, 26 + rnd() * 10, 9 + rnd() * 8, 24), '#4f8f45');
      if (rnd() < 0.5) tower(tow, rnd, sd * (72 + rnd() * 15), 0, -rnd() * CL, 12, 40 + rnd() * 30, 12, pick(rnd, towCol));
    }
  } else if (biome === 2) { // Порт
    roadBase(vc, '#454a52', '#f2c230');
    const cols = ['#c0392b', '#2e6fb7', '#e08a1e', '#1f8a70', '#8e4bb5', '#d9d3c3', '#34495e'];
    for (const sd of [-1, 1]) {
      vc.floor(sd * 4.3, sd * 27, 0, -CL, 0.02, '#858b93', 6);
      vc.floor(sd * 4.5, sd * 4.8, 0, -CL, 0.035, '#f2c230');
      vc.floor(sd * 27, sd * 160, 0, -CL, -1.2, '#2c6f9f', 6);
      vc.longBox(sd * 27, -0.6, 0, -CL, 0.5, 1.3, '#6f747b');
      for (let i = 0; i < 6; i++) {
        const z = -3.5 - 7 * i;
        for (let c = 0; c < 4; c++) {
          const h = Math.floor(rnd() * 4.4 - (c === 0 ? 1.2 : 0));
          for (let k = 0; k < h; k++) {
            const x = sd * (9.2 + c * 3.0);
            vc.box(x, 1.3 + k * 2.62, z, 2.5, 2.6, 6.3, pick(rnd, cols));
            vc.box(x, 1.3 + k * 2.62, z + 3.17, 2.2, 2.3, 0.06, '#2b2f36');
          }
        }
      }
      for (let i = 0; i < 2; i++) lamp(kb, glow, sd, -10.5 - 21 * i);
      if (rnd() < 0.6) kb.add('watertower', sd * 23.5, 0, -rnd() * CL, 11);
      if (rnd() < 0.7) kb.add('dumpster', sd * 6.4, 0.02, -rnd() * CL, 4.2, Math.PI / 2);
      if (rnd() < 0.6) tower(tow, rnd, sd * (70 + rnd() * 50), -1.2, -rnd() * CL, 14, 30 + rnd() * 40, 14, pick(rnd, towCol));
    }
    if (rnd() < 0.7) { // портальный кран над дорогой
      const z = -8 - rnd() * 26, Y = '#e3b021';
      for (const sd of [-1, 1]) { vc.box(sd * 6.2, 8, z - 2, 0.7, 16, 0.7, Y); vc.box(sd * 6.2, 8, z + 2, 0.7, 16, 0.7, Y); vc.box(sd * 6.2, 15.6, z, 0.8, 0.8, 4.7, Y); }
      vc.box(0, 16.4, z, 30, 1.4, 1.6, Y); vc.box(2.5, 14.8, z, 2.6, 2, 2.2, '#2b2f36'); vc.box(-10, 13.5, z, 0.15, 5, 0.15, '#2b2f36');
    }
  } else { // Мост
    roadBase(vc, '#434750');
    const R = '#c4472f';
    vc.floor(-160, 160, 0, -CL, -11, '#2a6c9d', 6);
    vc.box(0, -6, -CL / 2, 10, 10, 5, '#8b8f96');
    vc.longBox(0, -0.6, 0, -CL, 15.4, 1.1, '#5b6068');
    for (const sd of [-1, 1]) {
      vc.floor(sd * 4.3, sd * 7.5, 0, -CL, 0.15, '#a9a59d');
      vc.longBox(sd * 7.4, 1.15, 0, -CL, 0.12, 0.12, '#d9dde2', 3.5);
      vc.longBox(sd * 7.4, 0.65, 0, -CL, 0.1, 0.1, '#d9dde2', 3.5);
      vc.longBox(sd * 7.8, 9, 0, -CL, 0.45, 0.45, R, 3.5);
      for (let i = 0; i < 6; i++) {
        const z = -7 * i;
        vc.box(sd * 7.8, 4.6, z, 0.4, 9.2, 0.4, R);
        const L = Math.hypot(7, 8.6), a = Math.atan2(8.6, 7) * (i % 2 ? 1 : -1);
        vc.box(sd * 7.8, 4.6, z - 3.5, 0.26, 0.26, L, R, 0, a);
        for (let k = 0; k < 2; k++) vc.box(sd * 7.4, 0.6, z - 1.75 - 3.5 * k, 0.12, 1.2, 0.12, '#d9dde2');
      }
      lamp(kb, glow, sd, -10.5); lamp(kb, glow, sd, -31.5);
      for (let i = 0; i < 3; i++) tower(tow, rnd, sd * (75 + rnd() * 70), -11, -rnd() * CL, 12 + rnd() * 8, 35 + rnd() * 55, 12 + rnd() * 8, pick(rnd, towCol));
    }
    for (let i = 0; i < 3; i++) vc.box(0, 9, -14 * i, 15.6, 0.4, 0.4, R);
  }
  return { vc: vc.build(), kit: kb.build(), glow: glow.build(), tow: tow.build() };
}

// ---------- геометрия препятствий ----------
function obstacleGeos(kit) {
  const g = {};
  let v = new VC(); // барьер — перепрыгнуть
  for (const s of [-0.9, 0.9]) { v.box(s, 0.45, 0, 0.12, 0.9, 0.12, '#59606b'); v.box(s, 0.05, 0, 0.3, 0.1, 0.9, '#59606b'); }
  for (let i = 0; i < 6; i++) v.box(-0.92 + i * 0.368, 0.85, 0, 0.37, 0.48, 0.14, i % 2 ? '#f4f1ea' : '#e2412f');
  v.box(0, 0.38, 0, 2.0, 0.14, 0.1, '#f4f1ea');
  v.box(-0.9, 1.16, 0, 0.2, 0.16, 0.2, '#ffb020'); v.box(0.9, 1.16, 0, 0.2, 0.16, 0.2, '#ffb020');
  g.low = v.build();

  v = new VC(); // рама — проскользить
  for (const s of [-1.18, 1.18]) { v.box(s, 1.6, 0, 0.16, 3.2, 0.16, '#5c6470'); v.box(s, 0.06, 0, 0.5, 0.12, 0.7, '#3d434c'); }
  for (let i = 0; i < 8; i++) v.box(-1.03 + i * 0.295, 1.95, 0, 0.3, 0.95, 0.16, i % 2 ? '#22252b' : '#f5c518');
  v.box(0, 2.85, 0, 2.5, 0.5, 0.2, '#2f6fb7'); v.box(0, 2.85, 0.11, 1.4, 0.16, 0.02, '#ffffff');
  g.high = v.build();

  [['#e2553d', '#f6efe2'], ['#2aa6a0', '#f6efe2'], ['#f0b429', '#3b4250']].forEach(([a, b], i) => { // трамваи
    v = new VC();
    const L = TRAM_LEN;
    v.box(0, 0.3, 0, 1.9, 0.5, L - 1, '#23262d');
    for (const z of [-L / 2 + 2.4, L / 2 - 2.4]) v.box(0, 0.25, z, 2.2, 0.5, 2.4, '#16181d');
    v.box(0, 1.15, 0, 2.3, 1.3, L, a);
    v.box(0, 2.3, 0, 2.3, 1.0, L, b);
    v.box(0, 2.98, 0, 2.3, 0.36, L, a);
    v.box(0, 3.22, 0, 2.0, 0.16, L - 0.6, '#d5dade');
    for (const sx of [-1.16, 1.16]) for (let k = 0; k < 5; k++) v.box(sx, 2.3, -L / 2 + 1.9 + k * 2.8, 0.04, 0.78, 2.2, '#1f2c3a');
    for (const sz of [-1, 1]) {
      v.box(0, 2.25, sz * (L / 2 + 0.01), 1.9, 0.95, 0.04, '#1f2c3a');
      v.box(0, 2.98, sz * (L / 2 + 0.01), 1.1, 0.24, 0.04, '#111418');
      for (const sx of [-0.8, 0.8]) v.box(sx, 0.95, sz * (L / 2 + 0.02), 0.34, 0.22, 0.05, sz > 0 ? '#fff3b0' : '#ff5a4a');
      v.box(0, 0.62, sz * (L / 2 + 0.05), 2.1, 0.22, 0.14, '#3b4250');
    }
    g['tram' + i] = v.build();
  });

  // трап на крышу трамвая
  v = new VC();
  const w = 1.1, zn = RAMP_LEN / 2, zf = -RAMP_LEN / 2, H = TRAM_TOP;
  const tri = (pts) => { const t = new THREE.BufferGeometry(); t.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); t.computeVertexNormals(); return t; };
  const I = new THREE.Matrix4();
  v.add(tri([-w, 0, zn, w, 0, zn, w, H, zf, -w, 0, zn, w, H, zf, -w, H, zf]), I, '#8a93a3');
  v.add(tri([-w, 0, zn, -w, H, zf, -w, 0, zf, w, 0, zn, w, 0, zf, w, H, zf]), I, '#f0b429');
  for (let k = 1; k < 7; k++) { const t = k / 7; v.box(0, H * t + 0.03, zn + (zf - zn) * t, 2.0, 0.06, 0.16, '#f4f1ea', 0, Math.atan2(H, RAMP_LEN)); }
  g.ramp = v.build();

  ['car_hatchback', 'car_police', 'car_sedan', 'car_stationwagon', 'car_taxi'].forEach((n, i) => {
    g['car' + i] = kit[n].clone().applyMatrix4(M(0, 0.3, 0, 5, 5, 5));
  });
  return g;
}

// ---------- мир ----------
export class World {
  constructor(scene, kit, tex) {
    this.scene = scene;
    const rnd = mulberry(20261111);
    this.rnd = Math.random;

    this.matVC = curved(new THREE.MeshLambertMaterial({ vertexColors: true }), 'wx');
    this.matKit = curved(new THREE.MeshLambertMaterial({ map: tex }), 'wx');
    const wt = windowTextures(rnd);
    this.matTow = curved(new THREE.MeshLambertMaterial({ map: wt.map, emissiveMap: wt.emissive, emissive: 0xffffff, emissiveIntensity: 0, vertexColors: true }));
    const glowTex = radialTexture(64);
    this.matGlow = curved(new THREE.MeshBasicMaterial({ map: glowTex, vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));

    // варианты чанков по районам
    this.variants = BIOMES.map((_, b) => Array.from({ length: VARIANTS }, () => buildVariant(b, rnd, kit)));
    this.chunks = [];
    for (let i = 0; i < NCH; i++) {
      const grp = new THREE.Group();
      const mk = (mat, ro = 0) => { const m = new THREE.Mesh(undefined, mat); m.frustumCulled = false; m.renderOrder = ro; grp.add(m); return m; };
      this.chunks.push({ grp, k: -1, vc: mk(this.matVC), kit: mk(this.matKit), tow: mk(this.matTow), glow: mk(this.matGlow, 5) });
      scene.add(grp);
    }
    this.biomeSeq = [];

    // препятствия
    const og = obstacleGeos(kit);
    this.defs = {
      low: { geo: og.low, mat: this.matVC, len: 0.5, top: 1.1, kind: 'low' },
      high: { geo: og.high, mat: this.matVC, len: 0.5, top: 3.2, kind: 'high' },
      ramp: { geo: og.ramp, mat: this.matVC, len: RAMP_LEN, top: TRAM_TOP, kind: 'ramp' },
    };
    for (let i = 0; i < 3; i++) this.defs['tram' + i] = { geo: og['tram' + i], mat: this.matVC, len: TRAM_LEN, top: TRAM_TOP, kind: 'plat' };
    for (let i = 0; i < 5; i++) this.defs['car' + i] = { geo: og['car' + i], mat: this.matKit, len: 4.6, top: 1.7, kind: 'plat' };
    this.pool = {}; this.obs = [];

    // монеты (один InstancedMesh, вращение в шейдере)
    const cg = new THREE.CylinderGeometry(0.34, 0.34, 0.09, 14).rotateX(Math.PI / 2);
    this.coinMat = curved(new THREE.MeshLambertMaterial({ color: 0xffc928, emissive: 0x8a5a00 }), 'coin');
    this.coins = new THREE.InstancedMesh(cg, this.coinMat, MAXC);
    this.coins.frustumCulled = false;
    this.cx = new Float32Array(MAXC); this.cy = new Float32Array(MAXC); this.cd = new Float32Array(MAXC);
    this.cAlive = new Uint8Array(MAXC); this.cPtr = 0;
    this.coins.instanceMatrix.array.fill(0);
    scene.add(this.coins);

    // бонусы
    this.powerDefs = { magnet: 0xff4d6d, shield: 0x3fc1ff, x2: 0xb56bff };
    this.powers = []; this.powerPool = [];
    this.powerGeo = new THREE.OctahedronGeometry(0.6, 0);
    this.haloMat = curved(new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));

    this.reset();
  }

  // ----- районы -----
  biomeOf(k) {
    while (this.biomeSeq.length <= Math.max(0, k)) {
      const prev = this.biomeSeq.length ? this.biomeSeq[this.biomeSeq.length - 1] : -1;
      let b = prev < 0 ? this.startBiome : Math.floor(this.rnd() * BIOMES.length);
      if (b === prev) b = (b + 1) % BIOMES.length;
      const n = 6 + Math.floor(this.rnd() * 4);
      for (let i = 0; i < n; i++) this.biomeSeq.push(b);
    }
    return this.biomeSeq[Math.max(0, k)];
  }
  setChunk(c, k) {
    c.k = k;
    const v = this.variants[this.biomeOf(k)][Math.floor(this.rnd() * VARIANTS)];
    for (const key of ['vc', 'kit', 'tow', 'glow']) { c[key].geometry = v[key] || BOX; c[key].userData.has = !!v[key]; c[key].visible = !!v[key]; }
    c.grp.position.z = -k * CL;
  }

  reset(startBiome = 0) {
    this.startBiome = startBiome;
    this.biomeSeq.length = 0;
    this.chunks.forEach((c, i) => this.setChunk(c, i - 1));
    this.maxK = NCH - 2;
    for (const o of this.obs) this.release(o);
    this.obs.length = 0;
    this.cAlive.fill(0); this.coins.instanceMatrix.array.fill(0); this.coins.instanceMatrix.needsUpdate = true;
    for (const p of this.powers) { p.mesh.visible = false; this.powerPool.push(p.mesh); }
    this.powers.length = 0;
    this.genD = 70; this.prevD = 40; this.safe = 1; this.busy = [0, 0, 0];
    this.nextPower = 260; this.speed = 17;
  }

  // ----- пул препятствий -----
  spawn(type, lane, d, mv = 0, ref = d) {
    const def = this.defs[type];
    let m = (this.pool[type] ||= []).pop();
    if (!m) { m = new THREE.Mesh(def.geo, def.mat); m.frustumCulled = false; this.scene.add(m); }
    m.visible = true;
    const o = { type, lane, x: (lane - 1) * LW, d0: d, d, len: def.len, top: def.top, kind: def.kind, mesh: m, mv, ref };
    m.position.set(o.x, 0, -d); m.rotation.set(0, 0, 0); m.scale.setScalar(1);
    if (def.kind === 'plat' && type.startsWith('car') && !mv && this.rnd() < 0.5) m.rotation.y = Math.PI;
    this.obs.push(o);
    return o;
  }
  release(o) { o.mesh.visible = false; this.pool[o.type].push(o.mesh); }

  addCoin(lane, d, y) {
    for (let n = 0; n < MAXC; n++) {
      const i = (this.cPtr + n) % MAXC;
      if (this.cAlive[i]) continue;
      this.cPtr = i + 1;
      this.cAlive[i] = 1; this.cx[i] = (lane - 1) * LW; this.cy[i] = y; this.cd[i] = d;
      this.writeCoin(i, 1);
      return;
    }
  }
  writeCoin(i, s) {
    const a = this.coins.instanceMatrix.array, o = i * 16;
    a[o] = a[o + 5] = a[o + 10] = s; a[o + 15] = 1;
    a[o + 12] = this.cx[i]; a[o + 13] = this.cy[i]; a[o + 14] = -this.cd[i];
    this.coinsDirty = true;
  }
  addPower(lane, d) {
    const type = ['magnet', 'shield', 'x2'][Math.floor(this.rnd() * 3)];
    let m = this.powerPool.pop();
    if (!m) {
      m = new THREE.Mesh(this.powerGeo, curved(new THREE.MeshLambertMaterial({ emissiveIntensity: 0.7 })));
      const halo = new THREE.Mesh(PLANE1, this.haloMat.clone()); halo.material.onBeforeCompile = this.haloMat.onBeforeCompile; halo.material.customProgramCacheKey = this.haloMat.customProgramCacheKey;
      halo.scale.setScalar(3.4); m.add(halo); m.userData.halo = halo; m.frustumCulled = halo.frustumCulled = false;
      this.scene.add(m);
    }
    m.material.color.set(this.powerDefs[type]); m.material.emissive.set(this.powerDefs[type]);
    m.userData.halo.material.color.set(this.powerDefs[type]);
    m.visible = true; m.position.set((lane - 1) * LW, 1.4, -d);
    this.powers.push({ type, x: (lane - 1) * LW, d, mesh: m });
  }

  // ----- генератор трассы: всегда остаётся проходимая «безопасная» полоса -----
  genRow() {
    const r = this.rnd, d = this.genD, prevD = this.prevD;
    const diff = Math.min(1, Math.max(0, (d - 150) / 3000));
    const freeGap = (l) => this.busy[l] <= prevD + 3;
    const cand = [this.safe];
    for (const dir of [-1, 1]) {
      const l = this.safe + dir;
      if (l < 0 || l > 2 || !freeGap(l)) continue;
      cand.push(l, l);
      const l2 = l + dir;
      if (l2 >= 0 && l2 <= 2 && freeGap(l2) && r() < 0.35) cand.push(l2);
    }
    const safe = cand[Math.floor(r() * cand.length)];
    let safeItem = 'none';
    const airHalf = Math.min(9, this.speed * 0.3);

    for (let l = 0; l < 3; l++) {
      if (this.busy[l] > d - 1) continue;
      const x = r();
      if (l === safe) {
        const pe = 0.45 - diff * 0.2;
        if (x < pe) safeItem = 'none';
        else if (x < pe + (1 - pe) * 0.55) { this.spawn('low', l, d); safeItem = 'low'; }
        else { this.spawn('high', l, d); safeItem = 'high'; }
        continue;
      }
      const pe = 0.3 - diff * 0.18;
      if (x < pe) continue;
      const y = (x - pe) / (1 - pe);
      if (y < 0.16) this.spawn('low', l, d);
      else if (y < 0.3) this.spawn('high', l, d);
      else if (y < 0.56) {
        const mv = diff > 0.08 && r() < 0.3 ? 0.5 : 0;
        this.spawn('car' + Math.floor(r() * 5), l, d + 2.3, mv, d);
      } else {
        const n = 1 + (r() < 0.5 ? 1 : 0) + (diff > 0.3 && r() < 0.3 ? 1 : 0);
        const ramp = r() < 0.4, mv = !ramp && diff > 0.1 && r() < 0.35 ? 0.5 : 0, c = Math.floor(r() * 3);
        let s = d;
        if (ramp) { this.spawn('ramp', l, s + RAMP_LEN / 2); s += RAMP_LEN; }
        const s0 = s;
        for (let k = 0; k < n; k++) { this.spawn('tram' + c, l, s + TRAM_LEN / 2, mv, d); s += TRAM_LEN + 0.5; }
        this.busy[l] = s + (ramp ? 20 : 2);
        if (ramp) for (let cd = s0 + 2; cd < s - 2; cd += 2.6) this.addCoin(l, cd, TRAM_TOP + 0.95);
      }
    }

    // бонус или монеты на безопасной линии
    if (d > this.nextPower) {
      this.addPower(safe, (prevD + d) / 2 + 2);
      this.nextPower = d + 300 + r() * 240;
    } else if (r() < 0.72) {
      for (let cd = prevD + 6; cd < d - (safeItem === 'low' ? airHalf : 2.5); cd += 2.5) this.addCoin(safe, cd, 0.95);
      if (safeItem === 'low') for (let k = -2; k <= 2; k++) { const t = k / 2.4; this.addCoin(safe, d + t * airHalf, 0.95 + 2.1 * (1 - t * t)); }
      if (safeItem === 'high') for (let k = -1; k <= 1; k++) this.addCoin(safe, d + k * 2.5, 0.55);
    }
    this.prevD = d; this.safe = safe;
    this.genD = d + Math.max(15, this.speed * 0.66) + r() * (9 - diff * 5) + (1 - diff) * 5;
  }

  // ----- запросы для игрока -----
  topAt(o, d) { // высота поверхности препятствия в точке d
    if (o.kind === 'ramp') return o.top * Math.min(1, Math.max(0, (d - (o.d - o.len / 2)) / o.len));
    return o.top;
  }
  groundAt(x, d, y) {
    let g = 0;
    for (const o of this.obs) {
      if (o.kind !== 'plat' && o.kind !== 'ramp') continue;
      if (Math.abs(o.x - x) > 1.25 || d < o.d - o.len / 2 - 0.2 || d > o.d + o.len / 2 + 0.2) continue;
      const t = this.topAt(o, d);
      if (y >= t - 0.45 && t > g) g = t;
    }
    return g;
  }
  blocked(x, d0, d1, y) { // можно ли перестроиться в полосу x на отрезке d0..d1
    for (const o of this.obs) {
      if (o.kind !== 'plat' && o.kind !== 'ramp') continue;
      if (Math.abs(o.x - x) > 1.0 || d1 < o.d - o.len / 2 || d0 > o.d + o.len / 2) continue;
      if (y < this.topAt(o, Math.min(d1, o.d + o.len / 2)) - 0.45) return true;
    }
    return false;
  }
  hit(x, d, y, rolling) {
    for (const o of this.obs) {
      if (Math.abs(o.x - x) > 1.0) continue;
      const h = o.len / 2;
      if (o.kind === 'low') { if (Math.abs(d - o.d) < 0.55 && y < o.top - 0.2) return o; }
      else if (o.kind === 'high') { if (Math.abs(d - o.d) < 0.5 && y < 2.3 && !(rolling && y < 0.6)) return o; }
      else if (d > o.d - h - 0.35 && d < o.d + h && y < this.topAt(o, d) - 0.45) return o;
    }
    return null;
  }
  knock(o) { // щит сносит препятствие
    const i = this.obs.indexOf(o);
    if (i >= 0) { this.release(o); this.obs.splice(i, 1); }
  }

  collect(px, py, pd, magnet, dt, out) {
    out.coins = 0; out.power = null;
    for (let i = 0; i < MAXC; i++) {
      if (!this.cAlive[i]) continue;
      const dd = this.cd[i] - pd;
      if (dd < -9) { this.cAlive[i] = 0; this.writeCoin(i, 0); continue; }
      if (dd > 26) continue;
      if (magnet && dd < 16 && dd > -3) {
        const k = Math.min(1, dt * 11);
        this.cx[i] += (px - this.cx[i]) * k; this.cy[i] += (py + 0.9 - this.cy[i]) * k; this.cd[i] += (pd - this.cd[i]) * k * 0.9;
        this.writeCoin(i, 1);
      }
      if (Math.abs(this.cd[i] - pd) < 1.0 && Math.abs(this.cx[i] - px) < 1.0 && Math.abs(this.cy[i] - (py + 0.9)) < 1.35) {
        this.cAlive[i] = 0; this.writeCoin(i, 0); out.coins++;
      }
    }
    for (let i = this.powers.length - 1; i >= 0; i--) {
      const p = this.powers[i];
      const got = Math.abs(p.d - pd) < 1.2 && Math.abs(p.x - px) < 1.1 && py < 3;
      if (got || p.d < pd - 9) {
        if (got) out.power = p.type;
        p.mesh.visible = false; this.powerPool.push(p.mesh); this.powers.splice(i, 1);
      }
    }
    return out;
  }

  update(dt, pd, speed, time, night) {
    this.speed = speed;
    // чанки
    for (const c of this.chunks) if ((c.k + 1) * CL < pd - 16) this.setChunk(c, ++this.maxK);
    // генерация вперёд
    while (this.genD < pd + 235) this.genRow();
    // препятствия
    for (let i = this.obs.length - 1; i >= 0; i--) {
      const o = this.obs[i];
      if (o.mv) { o.d = o.d0 + o.mv * Math.max(0, o.ref - pd - 5); o.mesh.position.z = -o.d; }
      if (o.d + o.len / 2 < pd - 12) { this.release(o); this.obs.splice(i, 1); }
    }
    for (const p of this.powers) { p.mesh.rotation.y = time * 2.2; p.mesh.position.y = 1.4 + Math.sin(time * 3 + p.d) * 0.18; p.mesh.userData.halo.rotation.y = -time * 2.2; }
    if (this.coinsDirty) { this.coins.instanceMatrix.needsUpdate = true; this.coinsDirty = false; }
    // ночные огни
    this.matTow.emissiveIntensity = night * 1.15;
    this.matGlow.opacity = night * 0.85;
    for (const c of this.chunks) c.glow.visible = c.glow.userData.has && night > 0.03;
  }

  biomeNow(pd) { return this.biomeOf(Math.max(0, Math.floor(pd / CL))); }
}
