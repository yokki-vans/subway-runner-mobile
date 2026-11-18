// Небо, цикл день/ночь, погода (ясно, облачно, дождь, гроза, снег, туман).
import * as THREE from 'three';
import { U } from './curve.js';

const C = (h) => new THREE.Color(h);
// ключевые кадры суток: t, верх неба, горизонт, цвет света, сила солнца, сила заполняющего, «ночность»
const KEYS = [
  [0.00, '#3d6fb3', '#ffb47f', '#ffc590', 1.5, 0.80, 0.30],
  [0.08, '#2f8fe6', '#bfe3ff', '#fff4dc', 2.5, 1.15, 0.0],
  [0.44, '#2f8fe6', '#bfe3ff', '#fff4dc', 2.5, 1.15, 0.0],
  [0.53, '#3b3f92', '#ff8a5c', '#ff9d63', 1.4, 0.75, 0.40],
  [0.61, '#070b20', '#1b2649', '#8ea6ff', 0.6, 0.42, 1.0],
  [0.92, '#070b20', '#1b2649', '#8ea6ff', 0.6, 0.42, 1.0],
  [1.00, '#3d6fb3', '#ffb47f', '#ffc590', 1.5, 0.80, 0.30],
].map((k) => ({ t: k[0], top: C(k[1]), hor: C(k[2]), sun: C(k[3]), si: k[4], hi: k[5], night: k[6] }));

export const WEATHER = {
  clear:  { name: 'Ясно',    cloud: 0.18, rain: 0, snow: 0, near: 95, far: 280 },
  cloudy: { name: 'Облачно', cloud: 0.72, rain: 0, snow: 0, near: 80, far: 250 },
  rain:   { name: 'Дождь',   cloud: 0.92, rain: 0.7, snow: 0, near: 50, far: 200 },
  storm:  { name: 'Гроза',   cloud: 1.0,  rain: 1, snow: 0, near: 40, far: 170 },
  snow:   { name: 'Снег',    cloud: 0.85, rain: 0, snow: 1, near: 45, far: 185 },
  fog:    { name: 'Туман',   cloud: 0.8,  rain: 0, snow: 0, near: 8, far: 100 },
};
const ORDER = ['clear', 'cloudy', 'rain', 'storm', 'snow', 'fog'];
const DAY_LEN = 150;

const SKY_VS = `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * mat4(mat3(viewMatrix)) * vec4(position, 1.0); gl_Position = p.xyww; }`;
const SKY_FS = `
varying vec3 vDir;
uniform vec3 uTop, uHor, uSun, uMoon, uSunCol, uCloudCol;
uniform float uSunK, uMoonK, uCloud, uT;
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
void main(){
  vec3 d = normalize(vDir);
  float h = max(d.y, 0.0);
  vec3 col = mix(uHor, uTop, pow(h, 0.5));
  float s = max(dot(d, uSun), 0.0);
  col += uSunCol * (smoothstep(0.9990, 0.9994, s) * 1.5 + pow(s, 24.0) * 0.28) * uSunK;
  float m = max(dot(d, uMoon), 0.0);
  col += vec3(0.85, 0.9, 1.0) * (smoothstep(0.9992, 0.9995, m) + pow(m, 60.0) * 0.12) * uMoonK;
  if (d.y > 0.015) {
    vec2 uv = d.xz / (d.y + 0.14) * 1.4 + uT * vec2(0.012, 0.005);
    float n = noise(uv) * 0.55 + noise(uv * 2.3 + 7.1) * 0.3 + noise(uv * 5.1 + 3.3) * 0.15;
    float th = mix(0.78, 0.18, uCloud);
    float c = smoothstep(th, th + 0.3, n) * smoothstep(0.015, 0.16, d.y);
    col = mix(col, uCloudCol * (0.75 + 0.35 * n), c * 0.92);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

const FALL_VS = `
attribute float aEnd; attribute float aSeed;
uniform vec3 uCam, uBox, uVel; uniform float uT, uStreak, uSize, uSway;
varying float vA;
void main(){
  vec3 q = position * uBox + uVel * uT * (0.75 + 0.5 * aSeed);
  q.x += sin(uT * 1.3 + aSeed * 40.0) * uSway;
  q = mod(q - uCam, uBox) - 0.5 * uBox; q.z -= uBox.z * 0.3;
  vec3 wp = uCam + q + normalize(uVel) * aEnd * uStreak;
  vec4 mv = viewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * (0.6 + aSeed) / max(1.0, -mv.z) ;
  vA = (1.0 - aEnd * 0.8) * (1.0 - smoothstep(uBox.z * 0.4, uBox.z * 0.8, -mv.z));
}`;
const FALL_FS = `uniform vec3 uCol; uniform float uA, uRound; varying float vA;
void main(){ float a = uA * vA; if (uRound > 0.5) { float r = length(gl_PointCoord - 0.5); a *= 1.0 - smoothstep(0.15, 0.5, r); } gl_FragColor = vec4(uCol, a); }`;

export class Sky {
  constructor(scene, renderer) {
    this.scene = scene;
    this.tod = 0.1;
    this.night = 0;
    this.w = { cloud: 0.18, rain: 0, snow: 0, near: 95, far: 280 };
    this.weather = 'clear'; this.wTimer = 22;
    this.snowCover = 0; this.wet = 0; this.flash = 0; this.boltT = 6;
    this.onThunder = null; this.onWeather = null;

    scene.fog = new THREE.Fog(0xbfe3ff, 95, 280);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x8a8f99, 1.1);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.5);
    scene.add(this.hemi, this.sun);

    this.skyU = {
      uTop: { value: C('#2f8fe6') }, uHor: { value: C('#bfe3ff') }, uSun: { value: new THREE.Vector3(0, 1, 0) }, uMoon: { value: new THREE.Vector3(0, -1, 0) },
      uSunCol: { value: C('#fff4dc') }, uCloudCol: { value: C('#ffffff') }, uSunK: { value: 1 }, uMoonK: { value: 0 }, uCloud: { value: 0.2 }, uT: { value: 0 },
    };
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), new THREE.ShaderMaterial({ uniforms: this.skyU, vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false }));
    this.dome.frustumCulled = false; this.dome.renderOrder = -100;
    scene.add(this.dome);

    // звёзды
    const sp = new Float32Array(500 * 3);
    for (let i = 0; i < 500; i++) {
      const a = Math.random() * Math.PI * 2, y = 0.06 + Math.random() * 0.94, r = Math.sqrt(1 - y * y);
      sp.set([Math.cos(a) * r * 300, y * 300, Math.sin(a) * r * 300], i * 3);
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6 * renderer.getPixelRatio(), sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, depthTest: false, fog: false }));
    this.stars.frustumCulled = false; this.stars.renderOrder = -99;
    scene.add(this.stars);

    // дождь (отрезки) и снег (точки): позиции считаются в шейдере, обёрнуты вокруг камеры
    const mkFall = (n, lines) => {
      const per = lines ? 2 : 1, pos = new Float32Array(n * per * 3), end = new Float32Array(n * per), seed = new Float32Array(n * per);
      for (let i = 0; i < n; i++) {
        const x = Math.random(), y = Math.random(), z = Math.random(), s = Math.random();
        for (let k = 0; k < per; k++) { pos.set([x, y, z], (i * per + k) * 3); end[i * per + k] = k; seed[i * per + k] = s; }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
      g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
      const u = { uCam: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(34, 22, 44) }, uVel: { value: new THREE.Vector3(0, -1, 0) }, uT: { value: 0 }, uStreak: { value: 0 }, uSize: { value: 0 }, uSway: { value: 0 }, uCol: { value: C('#cfe4ff') }, uA: { value: 0 }, uRound: { value: lines ? 0 : 1 } };
      const m = new THREE.ShaderMaterial({ uniforms: u, vertexShader: FALL_VS, fragmentShader: FALL_FS, transparent: true, depthWrite: false, fog: false });
      const o = lines ? new THREE.LineSegments(g, m) : new THREE.Points(g, m);
      o.frustumCulled = false; o.visible = false; o.renderOrder = 20; o.userData.u = u; o.userData.n = n * per;
      scene.add(o); return o;
    };
    this.rain = mkFall(1100, true);
    this.snow = mkFall(900, false);
    this.snow.userData.u.uCol.value.set('#ffffff');
    this.pr = renderer.getPixelRatio();
  }

  setWeather(name, instant = false) {
    this.weather = name; this.wTimer = 30 + Math.random() * 22;
    if (instant) Object.assign(this.w, { ...WEATHER[name] });
    this.onWeather?.(WEATHER[name].name);
  }

  update(dt, camera, speed, time, running) {
    if (running) {
      this.tod = (this.tod + dt / DAY_LEN) % 1;
      this.wTimer -= dt;
      if (this.wTimer <= 0) {
        let n; do { n = ORDER[Math.floor(Math.random() * ORDER.length)]; } while (n === this.weather);
        this.setWeather(n);
      }
    }
    // плавный переход погоды
    const tw = WEATHER[this.weather], k = Math.min(1, dt * 0.35);
    for (const key of ['cloud', 'rain', 'snow', 'near', 'far']) this.w[key] += (tw[key] - this.w[key]) * k;
    this.snowCover += ((this.w.snow > 0.5 ? 1 : 0) - this.snowCover) * Math.min(1, dt * 0.12);
    this.wet += ((this.w.rain > 0.3 ? 1 : 0) - this.wet) * Math.min(1, dt * 0.25);
    U.uWx.value.set(this.snowCover, this.wet);

    // время суток
    let a = KEYS[0], b = KEYS[1];
    for (let i = 0; i < KEYS.length - 1; i++) if (this.tod >= KEYS[i].t && this.tod <= KEYS[i + 1].t) { a = KEYS[i]; b = KEYS[i + 1]; break; }
    const f = (this.tod - a.t) / Math.max(1e-5, b.t - a.t);
    const u = this.skyU, cl = this.w.cloud;
    this.night = a.night + (b.night - a.night) * f;
    const bright = 1 - this.night * 0.86;
    const gray = _g.setRGB(0.55 * bright, 0.6 * bright, 0.68 * bright);
    u.uTop.value.copy(a.top).lerp(b.top, f).lerp(gray, cl * 0.7);
    u.uHor.value.copy(a.hor).lerp(b.hor, f).lerp(_g2.copy(gray).multiplyScalar(1.25), cl * 0.75);
    u.uCloudCol.value.copy(a.hor).lerp(b.hor, f).lerp(_w.setRGB(bright, bright, bright), 0.75).multiplyScalar(1 - cl * 0.35);
    u.uCloud.value = cl; u.uT.value = time;

    // солнце и луна
    const dayPart = this.tod < 0.58;
    const ang = dayPart ? Math.PI * (this.tod + 0.02) / 0.6 : Math.PI * (this.tod - 0.58) / 0.42;
    const dir = _v.set(Math.cos(ang) * 0.75, Math.sin(ang) * 0.75 + 0.06, -0.62).normalize();
    if (dayPart) { u.uSun.value.copy(dir); u.uMoon.value.set(0, -1, 0); } else { u.uMoon.value.copy(dir); u.uSun.value.set(0, -1, 0); }
    u.uSunK.value = dayPart ? 1 - cl * 0.85 : 0; u.uMoonK.value = dayPart ? 0 : 1 - cl * 0.85;
    u.uSunCol.value.copy(a.sun).lerp(b.sun, f);

    // молния
    this.flash = Math.max(0, this.flash - dt * 4.5);
    if (this.weather === 'storm' && running) {
      this.boltT -= dt;
      if (this.boltT <= 0) { this.boltT = 4 + Math.random() * 7; this.flash = 1.3; this.onThunder?.(); }
    }
    const fl = this.flash > 0 ? this.flash * (0.6 + 0.4 * Math.sin(time * 70)) : 0;

    // свет и туман
    this.sun.color.copy(u.uSunCol.value);
    this.sun.intensity = (a.si + (b.si - a.si) * f) * (1 - cl * 0.6) + fl * 2.5;
    this.sun.position.copy(dir).multiplyScalar(50).add(camera.position); this.sun.target.position.copy(camera.position); this.sun.target.updateMatrixWorld();
    this.hemi.intensity = (a.hi + (b.hi - a.hi) * f) * (1 - cl * 0.15) + fl * 1.6;
    this.hemi.color.copy(u.uTop.value).lerp(_w.setRGB(1, 1, 1), 0.72);
    this.hemi.groundColor.copy(u.uHor.value).multiplyScalar(0.6);
    const fog = this.scene.fog;
    fog.color.copy(u.uHor.value); if (fl > 0) fog.color.lerp(_w.setRGB(1, 1, 1), Math.min(0.6, fl * 0.4));
    fog.near = this.w.near; fog.far = this.w.far;

    this.dome.position.copy(camera.position); this.dome.scale.setScalar(1);
    this.stars.position.copy(camera.position);
    this.stars.material.opacity = Math.max(0, this.night - 0.35) * 1.5 * (1 - cl);
    this.stars.visible = this.stars.material.opacity > 0.01;

    // осадки
    const ru = this.rain.userData.u, su = this.snow.userData.u;
    this.rain.visible = this.w.rain > 0.03;
    if (this.rain.visible) {
      ru.uCam.value.copy(camera.position); ru.uT.value = time;
      ru.uVel.value.set(-5, -34, speed * 0.9); ru.uStreak.value = 1.1 + speed * 0.02; ru.uA.value = 0.6 * Math.min(1, this.w.rain * 1.4);
      this.rain.geometry.setDrawRange(0, Math.floor(this.rain.userData.n * Math.min(1, this.w.rain) / 2) * 2);
    }
    this.snow.visible = this.w.snow > 0.03;
    if (this.snow.visible) {
      su.uCam.value.copy(camera.position); su.uT.value = time;
      su.uVel.value.set(-1.2, -3.2, speed * 0.25); su.uSway.value = 0.7; su.uSize.value = 70 * this.pr; su.uA.value = 0.9 * Math.min(1, this.w.snow * 1.5);
      this.snow.geometry.setDrawRange(0, Math.floor(this.snow.userData.n * Math.min(1, this.w.snow)));
    }
    return fl;
  }
}
const _g = new THREE.Color(), _g2 = new THREE.Color(), _w = new THREE.Color(), _v = new THREE.Vector3();
