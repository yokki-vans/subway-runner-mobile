// World: chunk pool, obstacle pools, instanced coins, GPU weather, biomes + day/night.
import * as THREE from '../three.module.js';
import { curveify } from './curve.js';
import { texAsphalt, texRails, texBricks, texFacade, texTrain, texGrass, texConcrete } from './textures.js';

export const CL = 48;           // chunk length
export const CHUNKS = 9;        // pool size => view ~430
export const LANE_W = 2.4;
export const LANES = [-LANE_W, 0, LANE_W];

// ---------------- Biomes ----------------
export const BIOMES = [
    { name: 'DAY_CITY',   skyTop: 0x4fa8ff, skyBot: 0xcfe8ff, fog: 0xbcd8f2, fogNear: 170, fogFar: 560, tod: 1.0, weather: 'clear', ground: '#6a6f73', wall: '#a5645a', facade: '#9aa3ad', train: ['#c23b3b', '#2e6fbf', '#3d9a55'] },
    { name: 'SUNSET',     skyTop: 0x6a5a9a, skyBot: 0xffab6e, fog: 0xe8a274, fogNear: 150, fogFar: 500, tod: 0.55, weather: 'clear', ground: '#70655f', wall: '#8a5a52', facade: '#b09080', train: ['#d0703a', '#8a4a8a', '#c2a03b'] },
    { name: 'NIGHT_CITY', skyTop: 0x1e3a66, skyBot: 0x50729c, fog: 0x44608c, fogNear: 130, fogFar: 460, tod: 0.0, weather: 'clear', ground: '#4d5560', wall: '#5a5f6e', facade: '#6a7482', train: ['#8a2e3b', '#254a7f', '#2e7a4a'] },
    { name: 'RAIN',       skyTop: 0x5a7286, skyBot: 0x93a9ba, fog: 0x8aa1b2, fogNear: 110, fogFar: 420, tod: 0.7, weather: 'rain', ground: '#575e64', wall: '#7a7a74', facade: '#88929c', train: ['#a03d3d', '#33608f', '#417f57'] },
    { name: 'STORM',      skyTop: 0x3a4a5a, skyBot: 0x647484, fog: 0x5c6c7c, fogNear: 90, fogFar: 360, tod: 0.35, weather: 'storm', ground: '#4a5056', wall: '#62666e', facade: '#707882', train: ['#7f3232', '#2a4d75', '#356b49'] },
    { name: 'SNOW_DAY',   skyTop: 0x9ec8e8, skyBot: 0xe6f2fa, fog: 0xd8e8f4, fogNear: 120, fogFar: 430, tod: 0.85, weather: 'snow', ground: '#aebbc4', wall: '#9aa4ae', facade: '#aab4be', train: ['#b03d3d', '#2e6fbf', '#3d9a55'] },
];

export function lerpColor(a, b, t) {
    const ca = new THREE.Color(a), cb = new THREE.Color(b);
    return ca.lerp(cb, t);
}

// ---------------- Materials (curveified) ----------------
const texA = texAsphalt(), texR = texRails(), texB = texBricks(), texF = texFacade(), texG = texGrass(), texC = texConcrete();
texA.repeat.set(1.6, 8); texR.repeat.set(1, 8); texB.repeat.set(2, 3); texF.repeat.set(2, 4); texG.repeat.set(3, 10); texC.repeat.set(1, 1);

export const matRoad = curveify(new THREE.MeshLambertMaterial({ map: texA }));
export const matRail = curveify(new THREE.MeshLambertMaterial({ map: texR }));
export const matWall = curveify(new THREE.MeshLambertMaterial({ map: texB }));
export const matTow = curveify(new THREE.MeshLambertMaterial({ map: texF, emissive: 0xffc87a, emissiveIntensity: 0 }));
export const matGrass = curveify(new THREE.MeshLambertMaterial({ map: texG }));
export const matConc = curveify(new THREE.MeshLambertMaterial({ color: 0x9aa0a6 }));
export const matTie = curveify(new THREE.MeshLambertMaterial({ color: 0x5b4632 }));
const matTrainBase = texTrain('#c23b3b'); matTrainBase.repeat.set(1, 3);
export const matTrains = ['#c23b3b', '#2e6fbf', '#3d9a55', '#d0703a', '#8a4a8a'].map(c => {
    const t = texTrain(c); t.repeat.set(1, 3); t.needsUpdate = true;
    return curveify(new THREE.MeshPhongMaterial({ map: t, shininess: 30 }));
});
export const matBarrier = curveify(new THREE.MeshLambertMaterial({ color: 0xf2a51e }));
export const matRamp = curveify(new THREE.MeshLambertMaterial({ color: 0x8f9499 }));
export const matLampPost = curveify(new THREE.MeshLambertMaterial({ color: 0x3a4046 }));
export const matLampHead = new THREE.MeshBasicMaterial({ color: 0xfff2c0 });

// ---------------- Geometry (shared) ----------------
const gRoad = new THREE.PlaneGeometry(LANE_W * 3 + 0.6, CL); gRoad.rotateX(-Math.PI / 2);
const gRail = new THREE.PlaneGeometry(1.7, CL); gRail.rotateX(-Math.PI / 2);
const gGrass = new THREE.PlaneGeometry(5, CL); gGrass.rotateX(-Math.PI / 2);
const gWall = new THREE.BoxGeometry(0.5, 7, CL);
const gTow = new THREE.BoxGeometry(6, 1, 1); // scaled per building
const gTrain = new THREE.BoxGeometry(2.1, 3.0, 9);
const gBarrier = new THREE.BoxGeometry(2.1, 1.05, 0.45);
const gRamp = new THREE.BoxGeometry(2.1, 1.0, 2.6); gRamp.rotateX(-0.38);
const gTie = new THREE.BoxGeometry(1.7, 0.12, 0.5);
const gCoin = new THREE.CylinderGeometry(0.42, 0.42, 0.1, 16); gCoin.rotateZ(Math.PI / 2);
const matCoin = curveify(new THREE.MeshStandardMaterial({ color: 0xffc93d, metalness: 0.85, roughness: 0.3, emissive: 0x8a5a00, emissiveIntensity: 0.5 }));
const gLampPost = new THREE.CylinderGeometry(0.07, 0.1, 4.6, 6);
const gLampHead = new THREE.SphereGeometry(0.22, 8, 6);

// ---------------- Chunk pool ----------------
export function createWorld(scene) {
    const chunks = [];
    const lampHeads = [];
    for (let i = 0; i < CHUNKS; i++) {
        const grp = new THREE.Group();
        const road = new THREE.Mesh(gRoad, matRoad); road.position.set(0, 0, -CL / 2); road.receiveShadow = true; grp.add(road);
        const railL = new THREE.Mesh(gRail, matRail); railL.position.set(-LANE_W * 1.5 - 1.4, 0.02, -CL / 2); grp.add(railL);
        const railR = new THREE.Mesh(gRail, matRail); railR.position.set(LANE_W * 1.5 + 1.4, 0.02, -CL / 2); grp.add(railR);
        const grassL = new THREE.Mesh(gGrass, matGrass); grassL.position.set(-LANE_W * 1.5 - 4.6, 0.01, -CL / 2); grp.add(grassL);
        const grassR = new THREE.Mesh(gGrass, matGrass); grassR.position.set(LANE_W * 1.5 + 4.6, 0.01, -CL / 2); grp.add(grassR);
        const wallL = new THREE.Mesh(gWall, matWall); wallL.position.set(-LANE_W * 1.5 - 7.2, 3.5, -CL / 2); grp.add(wallL);
        const wallR = new THREE.Mesh(gWall, matWall); wallR.position.set(LANE_W * 1.5 + 7.2, 3.5, -CL / 2); grp.add(wallR);
        // ties on side rails
        for (let k = 0; k < 8; k++) {
            const z = -6 - k * 5.4;
            const t1 = new THREE.Mesh(gTie, matTie); t1.position.set(-LANE_W * 1.5 - 1.4, 0.06, z); grp.add(t1);
            const t2 = new THREE.Mesh(gTie, matTie); t2.position.set(LANE_W * 1.5 + 1.4, 0.06, z); grp.add(t2);
        }
        // buildings + lamps
        const bL = new THREE.Mesh(gTow, matTow); bL.position.set(-LANE_W * 1.5 - 13, 0, -CL / 2); grp.add(bL);
        const bR = new THREE.Mesh(gTow, matTow); bR.position.set(LANE_W * 1.5 + 13, 0, -CL / 2); grp.add(bR);
        const lampL = new THREE.Mesh(gLampPost, matLampPost); lampL.position.set(-LANE_W * 1.5 - 2.6, 2.3, -CL * 0.3); grp.add(lampL);
        const headL = new THREE.Mesh(gLampHead, matLampHead); headL.position.copy(lampL.position).setY(4.7); grp.add(headL); lampHeads.push(headL);
        const lampR = new THREE.Mesh(gLampPost, matLampPost); lampR.position.set(LANE_W * 1.5 + 2.6, 2.3, -CL * 0.8); grp.add(lampR);
        const headR = new THREE.Mesh(gLampHead, matLampHead); headR.position.copy(lampR.position).setY(4.7); grp.add(headR); lampHeads.push(headR);
        scene.add(grp);
        chunks.push({ grp, bL, bR });
    }
    return { chunks, lampHeads };
}

// ---------------- Obstacle pool ----------------
export function createObstaclePool(scene) {
    const pool = [];
    const mk = (geo, mats, kind) => {
        const m = new THREE.Mesh(geo, mats[0]);
        m.castShadow = true; m.visible = false; m.userData.kind = kind;
        m.frustumCulled = false; // positions change dynamically; keep frustum culling off
        scene.add(m);
        pool.push({ mesh: m, mats });
    };
    mk(gTrain, matTrains, 'train');
    mk(gBarrier, [matBarrier], 'barrier');
    mk(gRamp, [matRamp], 'ramp');
    // extra trains for density
    for (let i = 0; i < 14; i++) mk(gTrain, matTrains, 'train');
    for (let i = 0; i < 12; i++) mk(gBarrier, [matBarrier], 'barrier');
    for (let i = 0; i < 6; i++) mk(gRamp, [matRamp], 'ramp');
    return pool;
}

export function acquireObstacle(pool, kind) {
    for (const o of pool) if (!o.mesh.visible && o.mesh.userData.kind === kind) { o.mesh.visible = true; return o; }
    return null;
}

// ---------------- Coins: one InstancedMesh ----------------
export const COIN_MAX = 160;
export function createCoins(scene, timeUniform) {
    const im = new THREE.InstancedMesh(gCoin, matCoin, COIN_MAX);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.frustumCulled = false;
    // spin in vertex shader around world Y
    matCoin.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = timeUniform;
        sh.vertexShader = sh.vertexShader
            .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform vec2 uCurve;')
            .replace('#include <begin_vertex>', [
                'vec3 transformed = vec3( position );',
                'float ca = cos(uTime * 3.0 + instanceMatrix[3].x * 2.1);',
                'float sa = sin(uTime * 3.0 + instanceMatrix[3].x * 2.1);',
                'transformed.xz = mat2(ca, -sa, sa, ca) * transformed.xz;',
            ].join('\n'))
            .replace('#include <project_vertex>', [
                'vec4 mvPosition = vec4( transformed, 1.0 );',
                '#ifdef USE_INSTANCING',
                '  mvPosition = instanceMatrix * mvPosition;',
                '#endif',
                'float bendK = smoothstep(-20.0, -60.0, mvPosition.z);',
                'mvPosition.xy += uCurve * mvPosition.z * mvPosition.z * bendK;',
                'gl_Position = projectionMatrix * mvPosition;',
            ].join('\n'));
    };
    matCoin.customProgramCacheKey = () => 'coins-curved';
    scene.add(im);
    return im;
}

// ---------------- Weather (GPU points) ----------------
export function createWeather(scene, timeUniform) {
    function mkPoints(count, color, size) {
        const geo = new THREE.BufferGeometry();
        const pos = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            pos[i * 3] = (Math.random() - 0.5) * 70;
            pos[i * 3 + 1] = Math.random() * 46;
            pos[i * 3 + 2] = -Math.random() * 150 + 12;
        }
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        const mat = new THREE.ShaderMaterial({
            uniforms: { uTime: timeUniform, uCamY: { value: 4 }, uAmt: { value: 0 }, uFall: { value: color === 0xffffff ? 9 : 26 }, uSize: { value: size }, uCol: { value: new THREE.Color(color) } },
            transparent: true, depthWrite: false, fog: false,
            vertexShader: `
                uniform float uTime; uniform float uCamY; uniform float uAmt; uniform float uFall; uniform float uSize;
                varying float vA;
                void main() {
                    vec3 p = position;
                    float drift = sin(uTime * 0.7 + p.x) * (uFall < 12 ? 2.5 : 1.2);
                    p.x += drift;
                    p.y = mod(p.y - uTime * uFall, 46.0);
                    p.y += uCamY - 23.0;
                    vA = uAmt;
                    vec4 mv = modelViewMatrix * vec4(p, 1.0);
                    gl_PointSize = uSize * (30.0 / max(-mv.z, 1.0));
                    gl_Position = projectionMatrix * mv;
                }`,
            fragmentShader: `
                uniform vec3 uCol; varying float vA;
                void main() {
                    if (vA <= 0.01) discard;
                    vec2 d = gl_PointCoord - 0.5;
                    float a = smoothstep(0.5, 0.15, length(d)) * vA;
                    gl_FragColor = vec4(uCol, a);
                }`,
        });
        const pts = new THREE.Points(geo, mat);
        pts.frustumCulled = false; pts.visible = false;
        scene.add(pts);
        return { pts, mat };
    }
    return { rain: mkPoints(700, 0xbfd6e8, 2.4), snow: mkPoints(500, 0xffffff, 3.2) };
}
