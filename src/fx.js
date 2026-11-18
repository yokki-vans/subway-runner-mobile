// FX: pooled particles (sparks, puffs, debris), coin sparkle, lightning flash.
import * as THREE from '../three.module.js';

const puffGeo = new THREE.SphereGeometry(0.35, 6, 5);
const MAX_P = 90;

export function createFx(scene) {
    const parts = [];
    let flashLight = null;

    function spawn(x, y, z, opts) {
        if (parts.length >= MAX_P) return;
        const col = opts.color ?? 0xffcc66;
        const mat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 1 });
        const m = new THREE.Mesh(puffGeo, mat);
        m.position.set(x, y, z);
        scene.add(m);
        parts.push({
            mesh: m, mat,
            vx: opts.vx ?? (Math.random() - 0.5) * 3,
            vy: opts.vy ?? (1 + Math.random() * 3),
            vz: opts.vz ?? (Math.random() - 0.5) * 3,
            t: 0, life: opts.life ?? 0.6, grow: opts.grow ?? 1.2, grav: opts.grav ?? -4,
        });
    }

    return {
        burst(x, y, z, color, n = 8) {
            for (let i = 0; i < n; i++) spawn(x, y, z, { color, vy: 2 + Math.random() * 4, vx: (Math.random() - 0.5) * 6, vz: (Math.random() - 0.5) * 6, life: 0.5 });
        },
        dust(x, y, z) {
            spawn(x, y, z, { color: 0xd8cfae, vy: 1.5, grow: 2.4, grav: -1, life: 0.7 });
        },
        sparkle(x, y, z) {
            spawn(x, y, z, { color: 0xffd968, vy: 3, vx: (Math.random() - 0.5) * 2, vz: (Math.random() - 0.5) * 2, life: 0.4, grow: 0.6 });
        },
        lightning(light) {
            if (!flashLight) { flashLight = new THREE.PointLight(0xdfe8ff, 0, 160); scene.add(flashLight); }
            flashLight.intensity = 220;
        },
        update(dt) {
            for (let i = parts.length - 1; i >= 0; i--) {
                const p = parts[i];
                p.t += dt;
                if (p.t >= p.life) { scene.remove(p.mesh); p.mat.dispose(); parts.splice(i, 1); continue; }
                const k = p.t / p.life;
                p.vy += p.grav * dt;
                p.mesh.position.x += p.vx * dt; p.mesh.position.y += p.vy * dt; p.mesh.position.z += p.vz * dt;
                p.mesh.scale.setScalar(0.6 + k * p.grow);
                p.mat.opacity = 1 - k;
            }
            if (flashLight && flashLight.intensity > 0) flashLight.intensity = Math.max(0, flashLight.intensity - 900 * dt);
        },
    };
}
