// Игрок: полосы, прыжок, перекат, анимации персонажа.
import * as THREE from 'three';
import { curved } from './curve.js';
import { loadCharacter, radialTexture } from './assets.js';
import { LW } from './world.js';

const GRAV = -52, JUMP = 16.8, ROLL_T = 0.62, LANE_SPEED = 17;

export class Player {
  constructor(scene) {
    this.root = new THREE.Group();      // позиция в мире
    this.spin = new THREE.Group();      // центр вращения при перекате
    this.spin.position.y = 0.9;
    this.holder = new THREE.Group();    // сюда кладётся модель
    this.holder.position.y = -0.9;
    this.spin.add(this.holder); this.root.add(this.spin); scene.add(this.root);

    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.9).rotateX(-Math.PI / 2),
      curved(new THREE.MeshBasicMaterial({ map: radialTexture(64, 'rgba(0,0,0,1)', 'rgba(0,0,0,0)'), transparent: true, opacity: 0.5, depthWrite: false })));
    this.shadow.renderOrder = 2;
    scene.add(this.shadow);

    this.shieldFx = new THREE.Mesh(new THREE.IcosahedronGeometry(1.25, 1),
      new THREE.MeshBasicMaterial({ color: 0x3fc1ff, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, wireframe: false }));
    this.shieldFx.position.y = 0.95; this.shieldFx.visible = false; this.root.add(this.shieldFx);

    this.models = {}; this.actions = {}; this.mixer = null; this.cur = null; this.charName = null;
    this.events = [];
    this.reset();
  }

  async setCharacter(name) {
    if (!this.models[name]) {
      const gltf = await loadCharacter(name);
      const model = gltf.scene;
      model.rotation.y = Math.PI; model.scale.setScalar(0.86);
      model.traverse((o) => {
        if (!o.isMesh) return;
        o.frustumCulled = false;
        const map = o.material.map;
        o.material = curved(new THREE.MeshLambertMaterial({ map }));
      });
      const mixer = new THREE.AnimationMixer(model), actions = {};
      for (const clip of gltf.animations) actions[clip.name] = mixer.clipAction(clip);
      this.models[name] = { model, mixer, actions };
    }
    if (this.charName) this.holder.remove(this.models[this.charName].model);
    const m = this.models[name];
    this.charName = name; this.holder.add(m.model);
    this.mixer = m.mixer; this.actions = m.actions; this.cur = null;
    this.mixer.stopAllAction();
    this.play(this.state === 'menu' ? 'Idle' : 'Running_A', 0);
  }

  play(name, fade = 0.12, once = false) {
    const a = this.actions[name];
    if (!a || this.cur === a) return;
    a.reset(); a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); a.clampWhenFinished = once;
    a.setEffectiveTimeScale(1).setEffectiveWeight(1).play();
    if (this.cur && fade > 0) this.cur.crossFadeTo(a, fade, false); else if (this.cur) this.cur.stop();
    this.cur = a; this.curName = name;
  }

  reset() {
    this.lane = 1; this.x = 0; this.y = 0; this.vy = 0; this.d = 0;
    this.grounded = true; this.rollT = 0; this.bumpT = 0; this.bumpDir = 0; this.jumpBuf = 0; this.coyote = 0; this.rollQueued = false;
    this.state = 'menu'; this.airT = 0;
    this.spin.rotation.set(0, 0, 0); this.spin.scale.setScalar(1); this.spin.position.y = 0.9;
    this.root.rotation.set(0, 0, 0);
    if (this.mixer) { this.mixer.stopAllAction(); this.cur = null; this.play('Idle', 0); }
  }
  start() { this.state = 'run'; this.play('Running_A', 0.15); }

  get rolling() { return this.rollT > 0; }

  input(cmd, world) {
    if (this.state !== 'run') return;
    if (cmd === 'L' || cmd === 'R') {
      const dir = cmd === 'L' ? -1 : 1, nl = this.lane + dir;
      if (nl < 0 || nl > 2 || world.blocked((nl - 1) * LW, this.d - 0.7, this.d + 2.2, this.y)) {
        this.bumpT = 0.22; this.bumpDir = dir; this.events.push('bump');
      } else { this.lane = nl; this.events.push('swipe'); }
    } else if (cmd === 'U') {
      this.jumpBuf = 0.14;
    } else if (cmd === 'D') {
      if (this.grounded) this.startRoll(); else { this.vy = Math.min(this.vy, -30); this.rollQueued = true; }
    }
  }
  startRoll() { this.rollT = ROLL_T; this.events.push('roll'); this.play('Jump_Idle', 0.08); }

  update(dt, world, speed) {
    this.mixer?.update(dt);
    const sh = this.shadow;
    if (this.state === 'menu') {
      this.root.position.set(this.x, this.y, -this.d);
      sh.position.set(this.x, 0.05, -this.d); sh.scale.setScalar(1);
      return;
    }
    if (this.state === 'dead') {
      this.vy += GRAV * dt; this.y = Math.max(this.deadGround, this.y + this.vy * dt);
      this.d -= this.kb * dt; this.kb *= Math.exp(-dt * 5);
      this.root.position.set(this.x, this.y, -this.d);
      sh.position.set(this.x, this.deadGround + 0.05, -this.d);
      return;
    }

    this.d += speed * dt;
    // полосы
    const tx = (this.lane - 1) * LW, dx = tx - this.x, step = LANE_SPEED * dt;
    this.x += Math.abs(dx) <= step ? dx : Math.sign(dx) * step;
    this.bumpT = Math.max(0, this.bumpT - dt);
    const bump = this.bumpT > 0 ? Math.sin((this.bumpT / 0.22) * Math.PI) * 0.45 * this.bumpDir : 0;

    // вертикаль
    const g = world.groundAt(this.x, this.d, this.y);
    this.jumpBuf -= dt; this.coyote -= dt;
    if (this.grounded) {
      if (g < this.y - 0.5) { this.grounded = false; this.coyote = 0.09; } // сошёл с крыши
      else { this.y = g; this.vy = 0; }
    }
    if (this.jumpBuf > 0 && (this.grounded || this.coyote > 0)) {
      this.vy = JUMP; this.grounded = false; this.jumpBuf = 0; this.coyote = 0; this.rollT = 0; this.rollQueued = false; this.airT = 0;
      this.events.push('jump');
    }
    if (!this.grounded) {
      this.airT += dt;
      this.vy += GRAV * dt; this.y += this.vy * dt;
      if (this.vy <= 0 && this.y <= g) {
        this.y = g; this.vy = 0; this.grounded = true; this.events.push('land');
        if (this.rollQueued) { this.rollQueued = false; this.startRoll(); }
      }
    }

    // перекат (кувырок вокруг центра тела)
    if (this.rollT > 0) {
      this.rollT -= dt;
      const t = 1 - Math.max(0, this.rollT) / ROLL_T;
      this.spin.rotation.x = -Math.PI * 2 * t;
      const sq = 0.62 + 0.38 * Math.pow(Math.abs(2 * t - 1), 3);
      this.spin.scale.setScalar(sq); this.spin.position.y = 0.9 * sq * 0.78;
      if (this.rollT <= 0) { this.spin.rotation.x = 0; this.spin.scale.setScalar(1); this.spin.position.y = 0.9; }
    }

    // анимация
    if (this.rollT <= 0) {
      if (!this.grounded) this.play('Jump_Idle', 0.1);
      else { this.play('Running_A', 0.1); this.cur.setEffectiveTimeScale(Math.min(2.1, 0.75 + speed / 24)); }
    }
    this.root.position.set(this.x + bump, this.y, -this.d);
    this.root.rotation.z = -dx * 0.09 - bump * 0.3;
    this.root.rotation.y = -dx * 0.16;

    const hgt = this.y - g;
    sh.position.set(this.x + bump, g + 0.05, -this.d);
    sh.scale.setScalar(Math.max(0.35, 1 - hgt * 0.22));
    sh.material.opacity = 0.5 * Math.max(0.3, 1 - hgt * 0.2);
  }

  die(world) {
    this.state = 'dead'; this.kb = 9; this.vy = 6;
    this.deadGround = world.groundAt(this.x, this.d - 1.2, 0.5);
    this.rollT = 0; this.spin.rotation.x = 0; this.spin.scale.setScalar(1); this.spin.position.y = 0.9;
    this.root.rotation.set(0, 0, 0);
    this.play('Death_A', 0.08, true);
  }
}
