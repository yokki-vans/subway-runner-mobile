// Subway Runner Mobile — main engine.
import * as THREE from '../three.module.js';
import { U, bendPoint, updateCurve } from './curve.js';
import { BIOMES, lerpColor, CL, CHUNKS, LANE_W, LANES, createWorld, createObstaclePool, acquireObstacle, createCoins, COIN_MAX, createWeather, matTow, matRoad, matTrains } from './world.js';
import { buildCharacter, animateRun, animateJump, animateRoll } from './player.js';
import { createSky } from './sky.js';
import { createFx } from './fx.js';
import { initAudio, sfx, setAmbience, setAudioEnabled, resumeAudio, setMusicTempo } from './audio.js';

// ---------------- QA params ----------------
const qs = new URLSearchParams(location.search);
const QA_FPS = qs.has('fps');
if (QA_FPS) document.body.classList.add('qa');
const QA_GHOST = qs.has('ghost');
const QA_BIOME = qs.has('biome') ? parseInt(qs.get('biome')) : null;
const QA_TOD = qs.has('tod') ? parseFloat(qs.get('tod')) : null;
let QA_FREEZE = false;

// ---------------- Renderer ----------------
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });

renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.5;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xbcd8f2, 170, 560);

const camera = new THREE.PerspectiveCamera(64, window.innerWidth / window.innerHeight, 0.1, 1200);
camera.position.set(0, 4.3, 7.4);

// ---------------- Lights ----------------
const lights = {};
lights.hemi = new THREE.HemisphereLight(0xfff0dd, 0xaa8866, 1.2); scene.add(lights.hemi);
lights.dir = new THREE.DirectionalLight(0xffffee, 1.5);
lights.dir.position.set(12, 26, 14); lights.dir.castShadow = true;
lights.dir.shadow.mapSize.set(1024, 1024);
Object.assign(lights.dir.shadow.camera, { near: 5, far: 90, left: -28, right: 28, top: 30, bottom: -30 });
lights.dir.shadow.bias = -0.0006;
scene.add(lights.dir); scene.add(lights.dir.target);
lights.ambient = new THREE.AmbientLight(0xfff5e0, 0.9); scene.add(lights.ambient);
lights.player = new THREE.PointLight(0xffe2b0, 0, 18); lights.player.position.set(0, 3.5, 0); scene.add(lights.player);

const chunks = [];
for (let i = 0; i < CHUNKS; i++) chunks.push({ grp: null, bL: null, bR: null, userData: {} });

// ---------------- World / sky / fx ----------------
const sky = createSky(); scene.add(sky.mesh);
const world = createWorld(scene);
world.chunks.forEach((c, i) => { chunks[i].grp = c.grp; chunks[i].bL = c.bL; chunks[i].bR = c.bR; });
const obstacles = createObstaclePool(scene);
const uTime = { value: 0 };
const coinsMesh = createCoins(scene, uTime);
const weather = createWeather(scene, uTime);
const fx = createFx(scene);

// ---------------- Player ----------------
const CHARS = [
    { jacket: 0xf2a51e, pants: 0x2b3a67, cap: 0xe23b3b, pack: 0x35b06f },
    { jacket: 0x2e6fbf, pants: 0x33383d, cap: 0xf2c94c, pack: 0xe23b3b },
    { jacket: 0x35b06f, pants: 0x5a4632, cap: 0xffffff, pack: 0x2b3a67 },
];
let charIdx = parseInt(localStorage.getItem('sr_char') || '0');
let player = buildCharacter({ ...CHARS[charIdx], skinIdx: charIdx + 1 });
scene.add(player.group);

// ---------------- Game state ----------------
const S = {
    state: 'menu', // menu | playing | paused | dead
    dist: 0, speed: 16, lane: 1, laneX: 0, py: 0, vy: 0,
    jumping: false, rolling: false, rollT: 0, jumpT: 0,
    coins: 0, score: 0, runTime: 0,
    biomeIdx: QA_BIOME ?? 0, biomeT: 0,
    rainAmt: 0, snowAmt: 0, windAmt: 0, thunderT: 4,
    magnet: 0, megaCoin: 0, invuln: 0,
};
const BIOME_LEN = 620; // meters per biome
let coinRecords = []; // {x,y,z,taken}
let activeObs = [];    // {o, lane, zStart, len, kind}
let spawnHorizon = -999;

function resetRun() {
    S.dist = 0; S.speed = 16; S.lane = 1; S.laneX = 0; S.py = 0; S.vy = 0;
    S.jumping = S.rolling = false; S.coins = 0; S.score = 0; S.runTime = 0;
    S.magnet = S.megaCoin = S.invuln = 0; S.thunderT = 4;
    for (const o of obstacles) { o.mesh.visible = false; o.mesh.position.set(0, -50, 0); }
    activeObs = []; coinRecords = [];
    spawnHorizon = -(CHUNKS + 2) * CL; // fresh run: allow slots 1..CHUNKS+1 to regenerate
    S.biomeIdx = QA_BIOME ?? 0; S.biomeT = 0;
}

// ---------------- Track generation (slot k spans trackZ [-k*CL, -(k-1)*CL]) ----------------
function genChunk(k) {
    const slotFront = -k * CL;
    // regenerate whenever this slot was skipped by the horizon (e.g. after a fast restart)
    if (spawnHorizon >= slotFront && k > Math.floor(-spawnHorizon / CL)) { spawnHorizon = slotFront; }
    else if (spawnHorizon >= slotFront) return;
    else spawnHorizon = slotFront;
    const zFront = -k * CL; // far end of the slot
    const diff = Math.min(1, S.dist / 900);
    let z = (k === 1 ? -34 : zFront + CL) - 4; // first ~2s of a fresh run stays clear
    while (z > zFront + 6) {
        const gap = 15 - diff * 5 + Math.random() * 8;
        z -= gap;
        // pick blocked lanes (keep at least one safe lane)
        const r = Math.random();
        let blocked = [];
        if (r < 0.55 + diff * 0.2) blocked = [Math.floor(Math.random() * 3)];
        else if (r < 0.82) {
            const a = Math.floor(Math.random() * 3); let b = Math.floor(Math.random() * 3);
            if (a !== b) blocked = [a, b]; else blocked = [a];
        }
        for (const lane of blocked) {
            const kindR = Math.random();
            const kind = kindR < 0.45 ? 'train' : (kindR < 0.75 ? 'barrier' : 'ramp');
            let visCnt = 0; for (const oo of obstacles) if (oo.mesh.visible) visCnt++;
            const o = acquireObstacle(obstacles, kind);
            if (!o) continue;
            o.mesh.position.set(LANES[lane], kind === 'barrier' ? 0.53 : (kind === 'train' ? 1.5 : 0.5), z);
            if (kind === 'train') o.mesh.material = matTrains[Math.floor(Math.random() * matTrains.length)];
            activeObs.push({ o, lane, zStart: z, kind });
        }
        // coins on a safe lane; sometimes an arc over the obstacle line
        const safe = [0, 1, 2].filter(l => !blocked.includes(l));
        if (safe.length && Math.random() < 0.7 && coinRecords.length < 350) {
            const lane = safe[Math.floor(Math.random() * safe.length)];
            const n = 4 + Math.floor(Math.random() * 5);
            const arc = Math.random() < 0.25;
            for (let i = 0; i < n; i++) {
                const cz = z + 5 + i * 2.2;
                const cy = arc ? 1.0 + Math.sin((i / n) * Math.PI) * 1.8 : 0.9;
                coinRecords.push({ x: LANES[lane], y: cy, z: cz, taken: false });
            }
        }
    }
}

function recycleChunks() {
    const baseK = Math.floor(S.dist / CL); // slot the player is inside
    let maxK = baseK;
    for (const cc of chunks) if (cc.userData.k !== undefined && cc.userData.k > maxK) maxK = cc.userData.k;
    for (const c0 of chunks.sort((a, b) => (a.userData.k ?? 0) - (b.userData.k ?? 0))) {
        const c = c0;
        let k = c.userData.k;
        if (k === undefined || k < baseK - 1) {
            // reclaim: smallest unused slot ahead of the player, keeping coverage contiguous
            const used = new Set(chunks.map(cc => cc !== c && cc.userData.k !== undefined ? cc.userData.k : -999));
            let nk = Math.max(baseK, 1);
            while (used.has(nk)) nk++;
            k = nk; c.userData.k = k;
        }
        // slot k covers trackZ [-k*CL, -(k-1)*CL]; world z = trackZ + dist => [dist-k*CL, dist-(k-1)*CL]
        c.grp.position.z = S.dist - k * CL;
        if (k >= 1 && k <= baseK + CHUNKS + 2) genChunk(k);
        const hL = 8 + ((k * 7919) % 1300) / 100, hR = 8 + ((k * 104729) % 1500) / 100;
        c.bL.scale.set(1, hL, 1); c.bL.position.y = hL / 2 - 0.5;
        c.bR.scale.set(1, hR, 1); c.bR.position.y = hR / 2 - 0.5;
    }
}

// ---------------- Input ----------------
const inputQ = [];
function queue(a) { if (inputQ.length < 6) inputQ.push(a); }
addEventListener('keydown', (e) => {
    if (S.state !== 'playing') return;
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') queue('left');
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') queue('right');
    else if (e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'Space') queue('jump');
    else if (e.code === 'ArrowDown' || e.code === 'KeyS') queue('roll');
});

let tStart = null;
addEventListener('touchstart', (e) => { tStart = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }, { passive: true });
addEventListener('touchend', (e) => {
    if (!tStart || S.state !== 'playing') return;
    const dx = e.changedTouches[0].clientX - tStart.x, dy = e.changedTouches[0].clientY - tStart.y;
    const adx = Math.abs(dx), ady = Math.abs(dy);
    if (Math.max(adx, ady) < 24) return;
    if (adx > ady) queue(dx > 0 ? 'right' : 'left');
    else queue(dy < 0 ? 'jump' : 'roll');
    tStart = null;
}, { passive: true });

function processInput() {
    while (inputQ.length) {
        const a = inputQ.pop();
        if (a === 'left' && S.lane > 0) { S.lane--; sfx.lane(); }
        else if (a === 'right' && S.lane < 2) { S.lane++; sfx.lane(); }
        else if (a === 'jump' && !S.jumping && !S.rolling) { S.jumping = true; S.vy = 11.5; S.jumpT = 0; sfx.jump(); }
        else if (a === 'roll') {
            if (S.jumping) S.vy = -16; // fast-fall into roll
            S.rolling = true; S.rollT = 0; sfx.roll(); fx.dust(S.laneX, 0.2, 0);
        }
    }
}

// ---------------- Physics (fixed 1/120) ----------------
const FIXED = 1 / 120;
function physics(dt) {
    if (S.state !== 'playing') return;
    if (!QA_FREEZE) {
        S.runTime += dt;
        S.speed = Math.min(42, 16 + S.runTime * 0.35);
        S.dist += S.speed * dt;
    } else S.speed = 0;

    const targetX = LANES[S.lane];
    S.laneX += (targetX - S.laneX) * Math.min(1, dt * 14);

    if (S.jumping || S.py > 0) {
        S.vy -= 30 * dt;
        S.py += S.vy * dt;
        S.jumpT += dt;
        if (S.py <= 0) { S.py = 0; S.vy = 0; S.jumping = false; fx.dust(S.laneX, 0.15, 0); }
    }
    if (S.rolling) { S.rollT += dt; if (S.rollT > 0.6) S.rolling = false; }

    S.biomeT += S.speed * dt;
    if (S.biomeT >= BIOME_LEN) { S.biomeT = 0; S.biomeIdx = (S.biomeIdx + 1) % BIOMES.length; }

    if (S.magnet > 0) S.magnet -= dt;
    if (S.megaCoin > 0) S.megaCoin -= dt;
    if (S.invuln > 0) S.invuln -= dt;

    recycleChunks();

    // coin pickup + magnet
    const magOn = S.magnet > 0;
    for (const c of coinRecords) {
        if (c.taken) continue;
        const wz = c.z + S.dist;
        if (wz < -60 || wz > 10) continue;
        if (magOn && Math.abs(c.x - S.laneX) < 2.6 && wz > -26) c.x += (S.laneX - c.x) * 0.18;
        const dx = Math.abs(c.x - S.laneX);
        const dy = Math.abs(c.y - (S.py + 0.9));
        if (dx < 0.85 && dy < 1.05 && wz > -3.5 && wz < 2) {
            c.taken = true;
            S.coins += S.megaCoin > 0 ? 5 : 1;
            sfx.coin(); fx.sparkle(c.x, c.y, wz);
        }
    }
    if (coinRecords.length > 400) coinRecords = coinRecords.filter(c => !c.taken && c.z + S.dist > -20 && c.z + S.dist < 140);

    // obstacle recycling: release anything fully behind the player (pool stays free)
    for (let i = activeObs.length - 1; i >= 0; i--) {
        const a = activeObs[i];
        if (a.zStart + S.dist > 14) {
            a.o.mesh.visible = false; a.o.mesh.position.set(0, -50, 0); activeObs.splice(i, 1);
        }
    }

    // obstacle collision
    if (!QA_GHOST && S.invuln <= 0) {
        for (const a of activeObs) {
            const wz = a.zStart + S.dist;
            if (wz > 2 || wz < -12) continue;
            if (Math.abs(LANES[a.lane] - S.laneX) > 1.35) continue;
            if (a.kind === 'ramp') {
                if (wz > -2 && wz < 1.6 && S.py < 0.4) return die();
                continue;
            }
            const top = a.kind === 'train' ? 3.0 : 1.05;
            if (S.py > top - 0.15) continue; // jumped over
            if (a.kind === 'barrier' && S.rolling && wz > -2.4) continue; // roll clears low barrier
            return die();
        }
    }
    if (activeObs.length > 0) {
        const a0 = activeObs[0];
    }
    for (let i = activeObs.length - 1; i >= 0; i--) {
        const a = activeObs[i];
        if (a.zStart + S.dist > 24) {
            a.o.mesh.visible = false;
            activeObs.splice(i, 1);
        }
    }

    // storm thunder
    const b = BIOMES[S.biomeIdx];
    if (b.weather === 'storm') {
        S.thunderT -= dt;
        if (S.thunderT <= 0) { S.thunderT = 3 + Math.random() * 6; fx.lightning(lights.player); sfx.thunder(); }
    }

    S.score = Math.floor(S.dist) + S.coins * 10;
}

function die() {
    S.state = 'dead';
    sfx.crash();
    fx.burst(S.laneX, 1.2, 0, 0xff6644, 14);
    document.getElementById('gameover').style.display = 'flex';
    document.getElementById('finalScore').textContent = `Рахунок: ${S.score} • Монети: ${S.coins}`;
    const best = Math.max(parseInt(localStorage.getItem('sr_best') || '0'), S.score);
    localStorage.setItem('sr_best', String(best));
    document.getElementById('bestScore').textContent = `Рекорд: ${best}`;
}

// ---------------- Biome / day-night / weather ----------------
const lampDay = new THREE.Color(0x8a949e), lampNight = new THREE.Color(0xfff2c0);
function updateEnvironment(dt) {
    const cur = BIOMES[S.biomeIdx];
    const nxt = BIOMES[(S.biomeIdx + 1) % BIOMES.length];
    const t = Math.min(1, S.biomeT / BIOME_LEN);

    const skyBot = lerpColor(cur.skyBot, nxt.skyBot, t);
    const fogC = lerpColor(cur.fog, nxt.fog, t);
    scene.background = skyBot;
    scene.fog.color.copy(fogC);
    scene.fog.near = THREE.MathUtils.lerp(cur.fogNear, nxt.fogNear, t);
    scene.fog.far = THREE.MathUtils.lerp(cur.fogFar, nxt.fogFar, t);

    let tod = THREE.MathUtils.lerp(cur.tod, nxt.tod, t);
    if (QA_TOD !== null) tod = QA_TOD;
    const night = 1 - tod;
    sky.uniforms.uDay.value = tod;
    sky.uniforms.uNight.value = night;
    sky.uniforms.uSkyTop.value.copy(lerpColor(cur.skyTop, nxt.skyTop, t));
    sky.uniforms.uSkyBot.value.copy(skyBot);
    const ang = tod * Math.PI;
    sky.uniforms.uSunDir.value.set(Math.cos(ang) * 0.6, Math.sin(ang), -0.7).normalize();

    lights.hemi.intensity = Math.max(1.2, 0.4 + tod * 0.6);
    lights.hemi.color.copy(lerpColor(0x777788, 0xfff0dd, tod));
    lights.dir.intensity = Math.max(1.5, 0.5 + tod * 1.0);
    lights.dir.color.copy(lerpColor(0x8899bb, 0xffffee, tod));
    lights.ambient.intensity = Math.max(0.8, 0.25 + tod * 0.4);
    lights.player.intensity = night * 10;
    lights.player.position.set(S.laneX, S.py + 3.2, -2);

    renderer.toneMappingExposure = THREE.MathUtils.lerp(1.7, 1.35, tod);
    matTow.emissiveIntensity = night * 1.15;
    matRoad.emissive.copy(fogC).multiplyScalar(night * 0.12);
    world.lampHeads.forEach(h => { h.visible = night > 0.35; });

    const wantRain = (cur.weather === 'rain' ? 1 : 0) * (1 - t) + (nxt.weather === 'rain' ? 1 : 0) * t;
    const wantSnow = (cur.weather === 'snow' ? 1 : 0) * (1 - t) + (nxt.weather === 'snow' ? 1 : 0) * t;
    const wantStorm = (cur.weather === 'storm' ? 1 : 0) * (1 - t) + (nxt.weather === 'storm' ? 1 : 0) * t;
    S.rainAmt += ((wantRain + wantStorm * 1.4) - S.rainAmt) * dt * 0.8;
    S.snowAmt += (wantSnow - S.snowAmt) * dt * 0.8;
    S.windAmt += (wantStorm - S.windAmt) * dt * 0.5;

    weather.rain.pts.visible = S.rainAmt > 0.02;
    weather.rain.mat.uniforms.uAmt.value = Math.min(1, S.rainAmt);
    weather.snow.pts.visible = S.snowAmt > 0.02;
    weather.snow.mat.uniforms.uAmt.value = Math.min(1, S.snowAmt);
    weather.rain.mat.uniforms.uCamY.value = camera.position.y;
    weather.snow.mat.uniforms.uCamY.value = camera.position.y;
    setAmbience(S.rainAmt, S.windAmt);
}

// ---------------- Camera ----------------
function updateCamera() {
    camera.position.copy(bendPoint(S.laneX * 0.72, 4.3 + S.py * 0.62, 7.4));
    const lk = bendPoint(S.laneX * 0.86, 1.5 + S.py * 0.62, -9);
    camera.lookAt(lk);
    lights.dir.target.position.set(S.laneX, 0, -10);
}

// ---------------- Coins instancing ----------------
const dummy = new THREE.Object3D();
function updateCoins() {
    let n = 0;
    for (const c of coinRecords) {
        if (c.taken || n >= COIN_MAX) continue;
        const wz = c.z + S.dist;
        if (wz < -90 || wz > 12) continue;
        dummy.position.set(c.x, c.y, wz);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        coinsMesh.setMatrixAt(n++, dummy.matrix);
    }
    dummy.position.set(0, -50, 0); dummy.scale.setScalar(0.0001); dummy.updateMatrix();
    for (let i = n; i < COIN_MAX; i++) coinsMesh.setMatrixAt(i, dummy.matrix);
    coinsMesh.instanceMatrix.needsUpdate = true;
}

// ---------------- Dynamic resolution ----------------
let resScale = 1, fpsAcc = 0, fpsN = 0, fpsShown = 0;
function tuneResolution(dt) {
    fpsAcc += dt; fpsN++;
    if (fpsAcc >= 0.5) {
        const fps = fpsN / fpsAcc;
        fpsShown = Math.round(fps);
        if (fps > 100) resScale = Math.min(1, resScale + 0.05);
        else if (fps < 55) resScale = Math.max(0.62, resScale - 0.06);
        if (fps < 40) resScale = 0.62;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2) * resScale);
        fpsAcc = 0; fpsN = 0;
    }
}

// ---------------- HUD ----------------
const hud = { score: document.getElementById('score'), coins: document.getElementById('coins'), biome: document.getElementById('biome'), fps: document.getElementById('fps') };
function updateHUD() {
    hud.score.textContent = S.score;
    hud.coins.textContent = S.coins;
    hud.biome.textContent = BIOMES[S.biomeIdx].name;
    if (QA_FPS) hud.fps.textContent = fpsShown;
}

// ---------------- Main loop ----------------
let lastT = performance.now(), acc = 0;
function animate(time) {
    requestAnimationFrame(animate);
    const dt = Math.min((time - lastT) / 1000, 0.05);
    lastT = time;
    uTime.value += dt;

    if (S.state === 'playing') {
        if (!QA_FREEZE) {
            acc += dt;
            let steps = 0;
            while (acc >= FIXED && steps < 12) { physics(FIXED); acc -= FIXED; steps++; }
            processInput();
        }
        updateCurve(S.dist);
        const speedNorm = (S.speed - 16) / 26;
        if (S.rolling) { animateRoll(player, S.rollT / 0.6); player.group.rotation.x = -Math.sin((S.rollT / 0.6) * Math.PI) * 1.1; }
        else if (S.jumping || S.py > 0) { animateJump(player, Math.min(1, S.jumpT / 0.7)); player.group.rotation.x = 0; }
        else { animateRun(player, time * 0.012 * (0.8 + speedNorm), speedNorm); player.group.rotation.x = 0; }
        player.group.position.set(S.laneX, S.py, 0);
    } else {
        animateRun(player, time * 0.008, 0.2);
        player.group.position.set(0, 0, 0);
        updateCurve(time * 0.01);
    }

    updateEnvironment(dt);
    updateCamera();
    updateCoins();
    fx.update(dt);
    renderer.render(scene, camera);
    updateHUD();
    tuneResolution(dt);
}
requestAnimationFrame(animate);

// ---------------- UI wiring ----------------
function startGame() {
    initAudio(); resumeAudio();
    resetRun();
    S.state = 'playing';
    lastT = performance.now(); acc = 0;
    document.getElementById('menu').style.display = 'none';
    document.getElementById('gameover').style.display = 'none';
    document.getElementById('pauseOverlay').style.display = 'none';
    document.getElementById('hud').style.display = 'flex';
}
document.getElementById('startBtn').addEventListener('click', startGame);
document.getElementById('retryBtn').addEventListener('click', startGame);
document.getElementById('pauseBtn').addEventListener('click', () => {
    if (S.state === 'playing') { S.state = 'paused'; document.getElementById('pauseOverlay').style.display = 'flex'; }
});
document.getElementById('resumeBtn').addEventListener('click', () => {
    S.state = 'playing'; lastT = performance.now(); acc = 0;
    document.getElementById('pauseOverlay').style.display = 'none';
});
const muteBtn = document.getElementById('muteBtn');
if (localStorage.getItem('sr_mute') === '1') { muteBtn.textContent = '🔇'; }
muteBtn.addEventListener('click', () => {
    const muted = localStorage.getItem('sr_mute') === '1';
    localStorage.setItem('sr_mute', muted ? '0' : '1');
    setAudioEnabled(muted); // if it WAS muted, now enable
    muteBtn.textContent = muted ? '🔊' : '🔇';
});

document.querySelectorAll('.charBtn').forEach((btn) => {
    btn.addEventListener('click', () => {
        charIdx = parseInt(btn.dataset.i);
        localStorage.setItem('sr_char', String(charIdx));
        scene.remove(player.group);
        player = buildCharacter({ ...CHARS[charIdx], skinIdx: charIdx + 1 });
        scene.add(player.group);
        document.querySelectorAll('.charBtn').forEach(b => b.classList.toggle('sel', b === btn));
    });
});

addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.fov = window.innerHeight > window.innerWidth ? 72 : 58;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
camera.fov = window.innerHeight > window.innerWidth ? 72 : 58;
camera.updateProjectionMatrix();

// ---------------- QA API ----------------
window.gameApi = {
    state: () => S.state,
    fps: () => fpsShown,
    dist: () => Math.round(S.dist),
    advance: (m) => { S.dist += m; recycleChunks(); },
    diag: () => ({ spawnHorizon, chunkKs: chunks.map(c => c.userData.k), obsLen: activeObs.length, coinLen: coinRecords.length }),
    start: startGame,
    setBiome: (i) => { S.biomeIdx = i % BIOMES.length; S.biomeT = 0; },
    freeze: (v) => { QA_FREEZE = !!v; },
    input: (a) => queue(a),
    lamps: () => world.lampHeads.map(h => h.visible),
    sceneInfo: () => ({
        fogNear: scene.fog.near, fogFar: scene.fog.far,
        curve: { x: U.uCurve.value.x, y: U.uCurve.value.y },
        tod: sky.uniforms.uDay.value,
        obs: activeObs.length, coins: coinRecords.length,
        camPos: [camera.position.x.toFixed(1), camera.position.y.toFixed(1), camera.position.z.toFixed(1)],
    }),
};
window.gameApi.renderNow = () => { renderer.render(scene, camera); return 'rendered'; };
