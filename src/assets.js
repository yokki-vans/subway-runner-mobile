import * as THREE from 'three';
import { GLTFLoader } from '../vendor/loaders/GLTFLoader.js';
import { mergeGeometries } from '../vendor/utils/BufferGeometryUtils.js';

const loader = new GLTFLoader();
const load = (url, onProg) => new Promise((res, rej) => loader.load(url, res, onProg, rej));

// Городской набор: каждая модель сливается в одну геометрию (position/normal/uv), текстура общая.
export async function loadCity(onProg) {
  const gltf = await load('assets/city.glb', onProg);
  const kit = {};
  let tex = null;
  gltf.scene.updateMatrixWorld(true);
  for (const holder of gltf.scene.children) {
    const inv = new THREE.Matrix4().copy(holder.matrixWorld).invert();
    const parts = [];
    holder.traverse((o) => {
      if (!o.isMesh) return;
      if (!tex && o.material.map) tex = o.material.map;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', o.geometry.attributes.position.clone());
      g.setAttribute('normal', o.geometry.attributes.normal.clone());
      g.setAttribute('uv', o.geometry.attributes.uv.clone());
      const cnt = o.geometry.attributes.position.count;
      g.setIndex(o.geometry.index ? o.geometry.index.clone() : Array.from({ length: cnt }, (_, i) => i));
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
      parts.push(g);
    });
    if (parts.length) kit[holder.name] = parts.length > 1 ? mergeGeometries(parts) : parts[0];
  }
  return { kit, tex };
}

const charCache = {};
export function loadCharacter(name, onProg) {
  return (charCache[name] ||= load(`assets/${name}.glb`, onProg));
}

// Радиальное пятно: свечение фонарей, тень под игроком, частицы.
export function radialTexture(size = 64, inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, inner);
  gr.addColorStop(0.35, inner.replace(/[\d.]+\)$/, '0.45)'));
  gr.addColorStop(1, outer);
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Тайл окон для дальних высоток: карта цвета и карта свечения (ночью окна горят).
export function windowTextures(rnd) {
  const S = 128, N = 8, cs = S / N;
  const mk = () => { const c = document.createElement('canvas'); c.width = c.height = S; return c; };
  const a = mk(), b = mk();
  const ga = a.getContext('2d'), gb = b.getContext('2d');
  ga.fillStyle = '#ffffff'; ga.fillRect(0, 0, S, S);
  gb.fillStyle = '#000000'; gb.fillRect(0, 0, S, S);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    ga.fillStyle = rnd() < 0.5 ? '#6f8fb4' : '#5b7898';
    ga.fillRect(x * cs + 3, y * cs + 4, cs - 6, cs - 8);
    if (rnd() < 0.42) {
      gb.fillStyle = rnd() < 0.75 ? '#ffd58a' : '#bfe2ff';
      gb.fillRect(x * cs + 3, y * cs + 4, cs - 6, cs - 8);
    }
  }
  const ta = new THREE.CanvasTexture(a), tb = new THREE.CanvasTexture(b);
  for (const t of [ta, tb]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; }
  return { map: ta, emissive: tb };
}
