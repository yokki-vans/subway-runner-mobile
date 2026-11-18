// Subway-Surfers-style runner characters, built from boxes with pivot limbs.
import * as THREE from '../three.module.js';

const skinTones = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];

export function buildCharacter(opts = {}) {
    const jacket = opts.jacket ?? 0xf2a51e;
    const pants = opts.pants ?? 0x2b3a67;
    const cap = opts.cap ?? 0xe23b3b;
    const skin = skinTones[(opts.skinIdx ?? 1) % skinTones.length];

    const g = new THREE.Group();
    const M = (c, extra = {}) => new THREE.MeshLambertMaterial({ color: c, ...extra });

    const bodyMat = M(jacket);
    const pantsMat = M(pants);
    const skinMat = M(skin);
    const capMat = M(cap);
    const shoeMat = M(0x222222);

    // torso (hoodie)
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.34), bodyMat);
    torso.position.y = 1.06; torso.castShadow = true;
    g.add(torso);
    // hood behind head
    const hood = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.28, 0.2), bodyMat);
    hood.position.set(0, 1.36, -0.14); g.add(hood);

    // head + cap
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.32), skinMat);
    head.position.y = 1.56; head.castShadow = true; g.add(head);
    const capTop = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.1, 0.34), capMat);
    capTop.position.y = 1.76; g.add(capTop);
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.05, 0.16), capMat);
    brim.position.set(0, 1.72, 0.24); g.add(brim);

    // arms: pivot at shoulder
    function limb(w, h, d, mat) {
        const geo = new THREE.BoxGeometry(w, h, d);
        geo.translate(0, -h / 2, 0);
        return new THREE.Mesh(geo, mat);
    }
    const armL = limb(0.16, 0.5, 0.16, bodyMat); armL.position.set(-0.34, 1.32, 0); g.add(armL);
    const armR = limb(0.16, 0.5, 0.16, bodyMat); armR.position.set(0.34, 1.32, 0); g.add(armR);
    const handL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.14), skinMat);
    handL.position.y = -0.5; armL.add(handL);
    const handR = handL.clone(); armR.add(handR);

    // legs: pivot at hip
    const legL = limb(0.19, 0.62, 0.19, pantsMat); legL.position.set(-0.14, 0.75, 0); g.add(legL);
    const legR = limb(0.19, 0.62, 0.19, pantsMat); legR.position.set(0.14, 0.75, 0); g.add(legR);
    const shoeL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.26), shoeMat);
    shoeL.position.set(0, -0.64, 0.05); legL.add(shoeL);
    const shoeR = shoeL.clone(); legR.add(shoeR);

    // backpack (signature)
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.42, 0.16), M(opts.pack ?? 0x35b06f));
    pack.position.set(0, 1.1, -0.26); g.add(pack);

    return { group: g, armL, armR, legL, legR, torso, head };
}

// Animate run cycle. phase advances with speed; amp grows with speed.
export function animateRun(ch, t, speedNorm) {
    const amp = 0.55 + speedNorm * 0.75;
    ch.armL.rotation.x = Math.sin(t) * amp;
    ch.armR.rotation.x = -Math.sin(t) * amp;
    ch.legL.rotation.x = -Math.sin(t) * amp * 1.1;
    ch.legR.rotation.x = Math.sin(t) * amp * 1.1;
    ch.torso.position.y = 1.06 + Math.abs(Math.sin(t)) * 0.05;
    ch.head.position.y = 1.56 + Math.abs(Math.sin(t)) * 0.05;
}

export function animateJump(ch, k) { // k: 0..1 jump progress
    const s = Math.sin(k * Math.PI);
    ch.armL.rotation.x = -2.4 * s; ch.armR.rotation.x = -2.4 * s;
    ch.legL.rotation.x = 0.9 * s; ch.legR.rotation.x = -0.5 * s;
}

export function animateRoll(ch, k) { // tuck + forward spin handled by group pitch outside
    const s = Math.sin(k * Math.PI);
    ch.armL.rotation.x = -1.6 * s; ch.armR.rotation.x = -1.6 * s;
    ch.legL.rotation.x = 1.5 * s; ch.legR.rotation.x = 1.5 * s;
    ch.torso.position.y = 1.06 - 0.34 * s;
    ch.head.position.y = 1.56 - 0.3 * s;
}
