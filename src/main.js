import * as THREE from 'three';
import { U } from './curve.js';
import { loadCity, loadCharacter } from './assets.js';
import { World, BIOMES, LW } from './world.js';
import { Player } from './player.js';
import { Sky } from './sky.js';
import { Fx } from './fx.js';
import { Sound } from './audio.js';

const $ = (id) => document.getElementById(id);
const Q = new URLSearchParams(location.search);
const GHOST = Q.has('ghost');           // ?ghost=1 — без столкновений (для проверки)
const store = {
  get: (k, d) => { try { return localStorage.getItem('sc_' + k) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem('sc_' + k, v); } catch { /* приватный режим */ } },
};
const CHARS = [['rogue', 'Трейсер'], ['knight', 'Рыцарь'], ['mage', 'Маг'], ['barbarian', 'Варвар']];

// ---------- рендер ----------
const canvas = $('c');
const baseDpr = Math.min(window.devicePixelRatio || 1, 2);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: (window.devicePixelRatio || 1) < 2, powerPreference: 'high-performance', stencil: false, alpha: false });
let resScale = 1;
renderer.setPixelRatio(baseDpr);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(66, 1, 0.4, 700);
const camPos = new THREE.Vector3(2.4, 2.3, 4.6), camLook = new THREE.Vector3(0, 1.2, -3), _t = new THREE.Vector3(), _l = new THREE.Vector3();

const sound = new Sound();
let world, player, sky, fx;
let state = 'load';
let time = 0, speed = 17, runT = 0, score = 0, coins = 0, shake = 0, invuln = 0, deadT = 0, lastBiome = 0;
const pw = { magnet: 0, x2: 0, shield: 0 };
const PW_INFO = { magnet: ['Магнит', '#ff4d6d', 10], x2: ['Очки ×2', '#b56bff', 12], shield: ['Щит', '#3fc1ff', 0] };
const got = { coins: 0, power: null };

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setPixelRatio(baseDpr * resScale);
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.fov = w < h ? 72 : 58; camera.updateProjectionMatrix();
  fx?.setScale(h * baseDpr * resScale);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));

// ---------- интерфейс ----------
let toastT = 0;
function toast(text) { const t = $('toast'); t.textContent = text; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2200); }
function show(id, on) { $(id).hidden = !on; }
function syncMute() { const s = 'Звук: ' + (sound.muted ? 'выкл' : 'вкл'); $('muteBtn').textContent = s; $('pauseMute').textContent = s; }
function refreshMenu() { $('best').textContent = store.get('best', '0'); $('bank').textContent = store.get('bank', '0'); }
let hudT = 0, pwKey = '';
function drawHud(force) {
  hudT -= 1; if (!force && hudT > 0) return; hudT = 6;
  $('score').textContent = Math.floor(score);
  $('coins').textContent = coins;
  $('mult').textContent = 'x' + (pw.x2 > 0 ? 2 : 1);
  const key = Object.keys(pw).filter((k) => pw[k] > 0).join();
  if (key !== pwKey) {
    pwKey = key;
    $('powers').innerHTML = Object.keys(pw).filter((k) => pw[k] > 0).map((k) => `<div class="pw"><i style="background:${PW_INFO[k][1]}"></i>${PW_INFO[k][0]}${PW_INFO[k][2] ? `<span class="bar"><b id="pw_${k}"></b></span>` : ''}</div>`).join('');
  }
  for (const k of ['magnet', 'x2']) { const el = pw[k] > 0 && $('pw_' + k); if (el) el.style.width = (pw[k] / PW_INFO[k][2]) * 100 + '%'; }
}

function buildChars() {
  const cur = store.get('char', 'rogue');
  $('chars').innerHTML = CHARS.map(([id, name]) => `<button data-c="${id}" class="${id === cur ? 'on' : ''}">${name}</button>`).join('');
  $('chars').addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b || b.classList.contains('busy')) return;
    sound.init(); sound.click();
    b.classList.add('busy');
    try {
      await player.setCharacter(b.dataset.c);
      store.set('char', b.dataset.c);
      for (const x of $('chars').children) x.classList.toggle('on', x === b);
      player.play('Cheer', 0.15, true); setTimeout(() => state === 'menu' && player.play('Idle', 0.3), 1500);
    } catch { toast('Не удалось загрузить персонажа'); }
    b.classList.remove('busy');
  });
}

// ---------- состояния ----------
function toMenu() {
  state = 'menu';
  world.reset(Math.floor(Math.random() * BIOMES.length)); player.reset(); player.root.rotation.y = Math.PI * 0.86;
  speed = 17; pw.magnet = pw.x2 = pw.shield = 0; player.shieldFx.visible = false;
  sound.music(false);
  refreshMenu(); show('menu', true); show('hud', false); show('over', false); show('pause', false);
}
function startRun() {
  sound.init();
  world.reset(world.startBiome); player.reset(); player.start();
  state = 'run'; runT = 0; score = 0; coins = 0; speed = 17; invuln = 0; shake = 0; lastBiome = world.startBiome;
  pw.magnet = pw.x2 = pw.shield = 0; pwKey = '-'; player.shieldFx.visible = false;
  show('menu', false); show('over', false); show('pause', false); show('hud', true);
  drawHud(true);
  sound.music(true);
}
function gameOver() {
  state = 'dead'; deadT = 0; shake = 0.55;
  player.die(world); sound.crash(); sound.music(false);
  fx.emit(player.x, player.y + 1, -player.d - 0.6, 26, '#ffd27a', { spread: 6, up: 6, life: 0.7, size: 0.5 });
  fx.emit(player.x, player.y + 1, -player.d - 0.6, 14, '#ffffff', { spread: 4, up: 4, life: 0.5, size: 0.7 });
  $('flash').style.transition = 'none'; $('flash').style.opacity = 0.7;
  requestAnimationFrame(() => { $('flash').style.transition = 'opacity .5s'; $('flash').style.opacity = 0; });
  navigator.vibrate?.(120);
}
function showOver() {
  const s = Math.floor(score), best = +store.get('best', '0'), isRec = s > best;
  if (isRec) { store.set('best', s); sound.record(); }
  store.set('bank', +store.get('bank', '0') + coins);
  $('oScore').textContent = s; $('oCoins').textContent = coins; $('oDist').textContent = Math.floor(player.d); $('oBest').textContent = Math.max(s, best);
  show('rec', isRec); show('hud', false); show('over', true);
}
function pause(on) {
  if (on && state === 'run') { state = 'pause'; show('pause', true); sound.music(false); sound.setAmbience(0, 0); }
  else if (!on && state === 'pause') { state = 'run'; show('pause', false); sound.init(); sound.music(true); last = performance.now(); }
}

// ---------- ввод ----------
function act(cmd) { if (state === 'run') player.input(cmd, world); }
let tx = 0, ty = 0, tid = null, used = false;
canvas.addEventListener('pointerdown', (e) => { tid = e.pointerId; tx = e.clientX; ty = e.clientY; used = false; });
window.addEventListener('pointermove', (e) => {
  if (e.pointerId !== tid || used) return;
  const dx = e.clientX - tx, dy = e.clientY - ty, th = 22;
  if (Math.abs(dx) < th && Math.abs(dy) < th) return;
  used = true;
  if (Math.abs(dx) > Math.abs(dy)) act(dx > 0 ? 'R' : 'L'); else act(dy > 0 ? 'D' : 'U');
});
window.addEventListener('pointerup', (e) => { if (e.pointerId === tid) tid = null; });
window.addEventListener('pointercancel', () => { tid = null; });
document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
document.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const k = e.code;
  if (k === 'ArrowLeft' || k === 'KeyA') act('L');
  else if (k === 'ArrowRight' || k === 'KeyD') act('R');
  else if (k === 'ArrowUp' || k === 'KeyW' || k === 'Space') { if (state === 'menu' && k === 'Space') startRun(); else if (state === 'dead' && deadT > 1.3 && k === 'Space') startRun(); else act('U'); }
  else if (k === 'ArrowDown' || k === 'KeyS') act('D');
  else if (k === 'Escape' || k === 'KeyP') pause(state === 'run');
  else return;
  e.preventDefault();
});
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(true); });

$('playBtn').onclick = startRun;
$('againBtn').onclick = startRun;
$('menuBtn').onclick = () => { sound.click(); toMenu(); };
$('quitBtn').onclick = () => { sound.click(); toMenu(); };
$('pauseBtn').onclick = () => pause(true);
$('resumeBtn').onclick = () => pause(false);
const toggleMute = () => { sound.init(); sound.setMuted(!sound.muted); syncMute(); };
$('muteBtn').onclick = toggleMute; $('pauseMute').onclick = toggleMute;
let showFps = Q.has('fps') || store.get('fps', '0') === '1';
$('fpsToggle').onclick = () => { showFps = !showFps; store.set('fps', showFps ? '1' : '0'); show('fps', showFps); };

// ---------- плавность: динамическое разрешение под частоту экрана ----------
const perf = { ema: 8, target: 0, samples: [], acc: 0, good: 0, frames: 0, fpsT: 0 };
function perfTick(ms) {
  if (ms > 250) return;
  perf.ema += (ms - perf.ema) * 0.06;
  if (perf.samples.length < 90) {
    perf.samples.push(ms);
    if (perf.samples.length === 90) { // частота экрана — по быстрым кадрам
      const s = [...perf.samples].sort((a, b) => a - b), q = s[18];
      perf.target = [240, 165, 144, 120, 90, 60].map((hz) => 1000 / hz).reduce((b, v) => (Math.abs(v - q) < Math.abs(b - q) ? v : b));
    }
    return;
  }
  perf.acc += ms;
  if (perf.acc > 900) {
    perf.acc = 0;
    if (perf.ema > perf.target * 1.3 && resScale > 0.5) { resScale = Math.max(0.5, resScale - 0.1); perf.good = 0; resize(); }
    else if (perf.ema < perf.target * 1.1 && resScale < 1) { if (++perf.good >= 5) { resScale = Math.min(1, resScale + 0.05); perf.good = 0; resize(); } }
    else perf.good = 0;
  }
  perf.frames++; perf.fpsT += ms;
  if (perf.fpsT > 500) {
    if (showFps) $('fps').textContent = `${Math.round((perf.frames * 1000) / perf.fpsT)} fps · экран ${Math.round(1000 / perf.target)} Гц · ${Math.round(resScale * 100)}% · ${renderer.info.render.calls} dc`;
    perf.frames = 0; perf.fpsT = 0;
  }
}

// ---------- кадр ----------
let last = performance.now();
function step(dt) { // один шаг физики забега
  runT += dt;
  speed = 17 + Math.min(17, runT * 0.09);
  player.update(dt, world, speed);
  for (const k of ['magnet', 'x2']) if (pw[k] > 0) pw[k] = Math.max(0, pw[k] - dt);
  invuln -= dt;
  score += speed * dt * (pw.x2 > 0 ? 2 : 1);

  world.collect(player.x, player.y, player.d, pw.magnet > 0, dt, got);
  if (got.coins) {
    coins += got.coins; score += got.coins * 10 * (pw.x2 > 0 ? 2 : 1);
    sound.coin(); fx.emit(player.x, player.y + 1.1, -player.d - 0.8, 5, '#ffe066', { spread: 2.2, up: 3, life: 0.35, size: 0.3, vz: -speed * 0.8 });
  }
  if (got.power) {
    const p = got.power; pw[p] = PW_INFO[p][2] || 1; sound.power(); toast(PW_INFO[p][0]);
    fx.emit(player.x, player.y + 1.1, -player.d - 0.8, 18, PW_INFO[p][1], { spread: 4, up: 4, life: 0.6, size: 0.45, vz: -speed * 0.8 });
    player.shieldFx.visible = pw.shield > 0;
  }
  const o = !GHOST && invuln <= 0 && world.hit(player.x, player.d, player.y, player.rolling);
  if (o) {
    if (pw.shield > 0) {
      pw.shield = 0; player.shieldFx.visible = false; invuln = 0.7; shake = 0.3; sound.shield(); navigator.vibrate?.(40);
      fx.emit(o.x, 1.2, -o.d, 24, '#9fe0ff', { spread: 7, up: 7, life: 0.7, size: 0.55 });
      world.knock(o);
    } else gameOver();
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const raw = now - last; last = now;
  perfTick(raw);
  if (state === 'pause' || state === 'load') return;
  const dt = Math.min(0.1, raw / 1000);
  time += dt; U.uTime.value = time;

  if (state === 'run') {
    const n = Math.max(1, Math.ceil(dt / 0.011));
    for (let i = 0; i < n && state === 'run'; i++) step(dt / n);
    for (const ev of player.events) {
      if (ev === 'jump') sound.jump();
      else if (ev === 'roll') sound.roll();
      else if (ev === 'swipe') sound.swipe();
      else if (ev === 'bump') { sound.bump(); shake = Math.max(shake, 0.18); }
      else if (ev === 'land') { sound.land(); fx.emit(player.x, player.y + 0.1, -player.d, 6, '#d9d2c4', { spread: 2.5, up: 1.2, grav: -2, life: 0.4, size: 0.5, vz: -speed * 0.6 }); }
    }
    player.events.length = 0;
    const b = world.biomeNow(player.d + 60);
    if (b !== lastBiome) { lastBiome = b; toast('Район: ' + BIOMES[b]); }
    drawHud(false);
  } else {
    player.update(dt, world, 0);
    if (state === 'dead') { deadT += dt; if (deadT > 1.25 && $('over').hidden) showOver(); }
  }
  world.update(dt, player.d, speed, time, sky.night);

  // изгиб трассы: медленно меняется с дистанцией — поворот то влево, то вправо
  const d = player.d;
  U.uCurve.value.set((Math.sin(d * 0.0052) * 0.65 + Math.sin(d * 0.0021 + 1.7) * 0.35) * 0.0015, -0.00085 + 0.0003 * Math.sin(d * 0.0031));

  // камера
  if (state === 'menu') {
    _t.set(Math.sin(time * 0.25) * 0.7, 2.0, 5.6); _l.set(0, 0.35, 0);
    camPos.lerp(_t, Math.min(1, dt * 3)); camLook.lerp(_l, Math.min(1, dt * 3));
  } else {
    const py = player.y;
    _t.set(player.x * 0.72, 4.3 + py * 0.62, -d + 7.4); _l.set(player.x * 0.86, 1.5 + py * 0.62, -d - 9);
    const kx = Math.min(1, dt * 9), ky = Math.min(1, dt * 5);
    camPos.x += (_t.x - camPos.x) * kx; camPos.y += (_t.y - camPos.y) * ky; camPos.z += (_t.z - camPos.z) * Math.min(1, dt * 14);
    camLook.x += (_l.x - camLook.x) * kx; camLook.y += (_l.y - camLook.y) * ky; camLook.z += (_l.z - camLook.z) * Math.min(1, dt * 14);
  }
  camera.position.copy(camPos);
  if (shake > 0) { shake = Math.max(0, shake - dt); camera.position.x += (Math.random() - 0.5) * shake * 1.2; camera.position.y += (Math.random() - 0.5) * shake * 1.2; }
  camera.lookAt(camLook);

  const fl = sky.update(dt, camera, state === 'run' ? speed : 0, time, state === 'run');
  if (state === 'run') sound.setAmbience(sky.w.rain, Math.max(sky.w.snow * 0.8, sky.w.rain * 0.5) + 0.12);
  if (fl > 0.05) $('flash').style.opacity = Math.min(0.35, fl * 0.25); else if (state !== 'dead' && $('flash').style.opacity !== '0') $('flash').style.opacity = 0;
  if (player.shieldFx.visible) { player.shieldFx.rotation.y = time * 2; player.shieldFx.material.opacity = 0.22 + 0.08 * Math.sin(time * 6); }
  fx.update(dt);
  renderer.render(scene, camera);
}

// ---------- запуск ----------
async function boot() {
  resize();
  try {
    const bar = $('lbar');
    const charName = store.get('char', 'rogue');
    const [city] = await Promise.all([
      loadCity((e) => { if (e.total) bar.style.width = 10 + (e.loaded / e.total) * 40 + '%'; }),
      loadCharacter(charName, (e) => { if (e.total) bar.style.width = 50 + (e.loaded / e.total) * 40 + '%'; }),
    ]);
    world = new World(scene, city.kit, city.tex);
    player = new Player(scene);
    sky = new Sky(scene, renderer);
    fx = new Fx(scene);
    sky.onThunder = () => sound.thunder();
    sky.onWeather = (n) => { if (state === 'run') toast('Погода: ' + n); };
    if (Q.has('weather')) sky.setWeather(Q.get('weather'), true);
    if (Q.has('tod')) sky.tod = +Q.get('tod');
    await player.setCharacter(charName);
    bar.style.width = '100%';
    buildChars(); syncMute(); show('fps', showFps); resize();
    toMenu();
    if (Q.has('biome')) world.reset(+Q.get('biome'));
    camera.position.copy(camPos);
    renderer.compile(scene, camera);
    show('loading', false);
    window.__dbg = { world, player, sky, sound, renderer, scene, camera, get state() { return state; }, start: startRun, act, pw, get speed() { return speed; } };
    requestAnimationFrame((t) => { last = t; frame(t); });
  } catch (err) {
    console.error(err);
    $('lerr').textContent = 'Не удалось загрузить игру: ' + (err?.message || err);
  }
}
boot();
