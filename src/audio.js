// Procedural WebAudio: music sequencer, SFX, weather ambience. No assets.
let ctx = null, master = null, musicGain = null, sfxGain = null, ambGain = null;
let musicTimer = null, step = 0;
let rainSrc = null, windSrc = null;
let enabled = true;

function makeNoiseBuffer(c) {
    const len = c.sampleRate * 2;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
}

export function initAudio() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createDynamicsCompressor();
    master.threshold.value = -14; master.ratio.value = 6;
    master.connect(ctx.destination);
    musicGain = ctx.createGain(); musicGain.gain.value = 0.22; musicGain.connect(master);
    sfxGain = ctx.createGain(); sfxGain.gain.value = 0.55; sfxGain.connect(master);
    ambGain = ctx.createGain(); ambGain.gain.value = 0.0; ambGain.connect(master);

    // Rain loop: filtered noise
    const noise = makeNoiseBuffer(ctx);
    rainSrc = ctx.createBufferSource(); rainSrc.buffer = noise; rainSrc.loop = true;
    const rf = ctx.createBiquadFilter(); rf.type = 'bandpass'; rf.frequency.value = 3000; rf.Q.value = 0.6;
    const rg = ctx.createGain(); rg.gain.value = 1;
    rainSrc.connect(rf); rf.connect(rg); rg.connect(ambGain); rainSrc.start();

    // Wind loop: low-passed noise
    windSrc = ctx.createBufferSource(); windSrc.buffer = noise; windSrc.loop = true;
    const wf = ctx.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 350;
    const wg = ctx.createGain(); wg.gain.value = 0.6;
    windSrc.connect(wf); wf.connect(wg); wg.connect(ambGain); windSrc.start();

    startMusic();
}

export function setAudioEnabled(on) {
    enabled = on;
    if (master) master.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, 0.05);
}

export function resumeAudio() { if (ctx && ctx.state === 'suspended') ctx.resume(); }

// ---- SFX ----
function tone(freq, dur, type = 'square', vol = 0.3, slide = 0) {
    if (!ctx || !enabled) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), ctx.currentTime + dur);
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g); g.connect(sfxGain);
    o.start(); o.stop(ctx.currentTime + dur + 0.02);
}

function noiseBurst(dur = 0.25, freq = 800, vol = 0.4) {
    if (!ctx || !enabled) return;
    const s = ctx.createBufferSource(); s.buffer = makeNoiseBuffer(ctx);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    s.connect(f); f.connect(g); g.connect(sfxGain);
    s.start(); s.stop(ctx.currentTime + dur);
}

export const sfx = {
    coin() { tone(880, 0.09, 'square', 0.22); setTimeout(() => tone(1320, 0.12, 'square', 0.2), 60); },
    jump() { tone(300, 0.18, 'sine', 0.35, 500); },
    roll() { noiseBurst(0.22, 400, 0.3); },
    crash() { noiseBurst(0.5, 250, 0.6); tone(90, 0.5, 'sawtooth', 0.4, -40); },
    lane() { tone(520, 0.06, 'triangle', 0.18); },
    powerup() { [660, 880, 1100, 1320].forEach((f, i) => setTimeout(() => tone(f, 0.14, 'square', 0.25), i * 90)); },
    thunder() { noiseBurst(1.2, 120, 0.7); },
    swoosh() { noiseBurst(0.15, 1600, 0.18); },
};

// ---- Weather ambience mix ----
export function setAmbience(rainAmt, windAmt) {
    if (!ctx) return;
    ambGain.gain.setTargetAtTime(Math.min(0.5, rainAmt * 0.35 + windAmt * 0.12), ctx.currentTime, 0.4);
}

// ---- Music: 16-step sequencer, tempo follows speed ----
const BASS = [55, 55, 82.4, 55, 73.4, 55, 65.4, 82.4]; // A1 pattern
const LEAD = [440, 523, 659, 523, 587, 440, 659, 784, 659, 523, 440, 587, 523, 659, 880, 784];

export function startMusic() {
    if (!ctx || musicTimer) return;
    let speedMul = 1;
    const tick = () => {
        if (enabled) {
            const s = step % 16;
            // bass every 2 steps
            if (s % 2 === 0) tone(BASS[(step / 2) % 8] * 2, 0.16, 'triangle', 0.25);
            // lead every step
            tone(LEAD[s], 0.11, 'square', 0.09);
            // hat on odd steps
            if (s % 2 === 1) noiseBurst(0.04, 6000, 0.05);
        }
        step++;
    };
    musicTimer = setInterval(tick, 140);
}

export function setMusicTempo(speedNorm) {
    if (!musicTimer) return;
    const ms = 170 - speedNorm * 60; // faster run => faster music
    clearInterval(musicTimer); musicTimer = null;
    startMusicAdaptive(ms);
}

function startMusicAdaptive(ms) {
    const tick = () => {
        if (enabled) {
            const s = step % 16;
            if (s % 2 === 0) tone(BASS[(step / 2) % 8] * 2, ms * 0.0013, 'triangle', 0.25);
            tone(LEAD[s], ms * 0.0009, 'square', 0.09);
            if (s % 2 === 1) noiseBurst(0.04, 6000, 0.05);
        }
        step++;
    };
    musicTimer = setInterval(tick, ms);
}
