// Procedural CanvasTextures: asphalt, rails, bricks, facade, train metal, grass.
import * as THREE from '../three.module.js';

function hash2(x, y) {
    let h = (x * 374761393 + y * 668265263) | 0;
    h = (h ^ (h >> 13)) * 1274126177;
    return ((h ^ (h >> 16)) >>> 0) / 4294967295;
}

function mk(size, draw) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    draw(g, size);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    return t;
}

export function texAsphalt(base = '#5a5f63') {
    return mk(256, (g, s) => {
        g.fillStyle = base; g.fillRect(0, 0, s, s);
        const img = g.getImageData(0, 0, s, s);
        for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
            const i = (y * s + x) * 4;
            const n = (hash2(x, y) - 0.5) * 34;
            img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
        }
        g.putImageData(img, 0, 0);
        // lane guide lines (dark bands at the road edges) so lanes read even with flat lighting
        const bw = Math.round(s * 0.06);
        g.fillStyle = 'rgba(24,28,32,0.55)'; g.fillRect(bw, 0, bw * 1.4, s); g.fillRect(s - bw * 2.4, 0, bw * 1.4, s);
        // cracks
        g.strokeStyle = 'rgba(30,30,30,0.35)'; g.lineWidth = 1;
        for (let i = 0; i < 6; i++) {
            g.beginPath();
            let x = hash2(i, 7) * s, y = hash2(i, 13) * s;
            g.moveTo(x, y);
            for (let k = 0; k < 5; k++) { x += (hash2(i, k) - 0.5) * 40; y += (hash2(k, i) - 0.5) * 40; g.lineTo(x, y); }
            g.stroke();
        }
    });
}

export function texRails() {
    return mk(128, (g, s) => {
        g.fillStyle = '#6b6152'; g.fillRect(0, 0, s, s); // ballast
        const img = g.getImageData(0, 0, s, s);
        for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
            const i = (y * s + x) * 4;
            const n = (hash2(x * 3, y * 3) - 0.5) * 40;
            img.data[i] += n; img.data[i + 1] += n * 0.9; img.data[i + 2] += n * 0.8;
        }
        g.putImageData(img, 0, 0);
        // sleepers (horizontal stripes)
        g.fillStyle = '#4a3c2e';
        for (let y = 6; y < s; y += 26) g.fillRect(0, y, s, 10);
        // rails
        g.fillStyle = '#b9bec4';
        g.fillRect(s * 0.22 - 3, 0, 6, s);
        g.fillRect(s * 0.78 - 3, 0, 6, s);
        g.fillStyle = '#dfe4e8';
        g.fillRect(s * 0.22 - 1, 0, 2, s);
        g.fillRect(s * 0.78 - 1, 0, 2, s);
    });
}

export function texBricks(base = '#a5645a') {
    return mk(256, (g, s) => {
        g.fillStyle = '#8d8d86'; g.fillRect(0, 0, s, s); // mortar
        for (let row = 0; row < 16; row++) {
            const off = (row % 2) * 8;
            for (let col = -1; col < 17; col++) {
                const x = col * 16 + off, y = row * 16;
                const h = hash2(col, row);
                g.fillStyle = base;
                g.fillRect(x + 1, y + 1, 14, 14);
                g.fillStyle = `rgba(0,0,0,${h * 0.18})`;
                g.fillRect(x + 1, y + 1, 14, 14);
            }
        }
    });
}

export function texFacade(base = '#9aa3ad') {
    return mk(256, (g, s) => {
        g.fillStyle = base; g.fillRect(0, 0, s, s);
        const img = g.getImageData(0, 0, s, s);
        for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
            const i = (y * s + x) * 4;
            const n = (hash2(x, y) - 0.5) * 18;
            img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
        }
        g.putImageData(img, 0, 0);
        // window grid (lit at night via emissive map trick: brighter windows)
        for (let row = 0; row < 8; row++) for (let col = 0; col < 6; col++) {
            const x = 12 + col * 40, y = 12 + row * 30;
            g.fillStyle = '#2e3a46'; g.fillRect(x, y, 26, 18);
            g.fillStyle = '#c8d4dd'; g.fillRect(x, y, 26, 2);
            if (hash2(col, row) > 0.55) { g.fillStyle = 'rgba(255,220,140,0.9)'; g.fillRect(x + 2, y + 3, 22, 13); }
        }
    });
}

export function texTrain(color = '#c23b3b') {
    return mk(256, (g, s) => {
        g.fillStyle = color; g.fillRect(0, 0, s, s);
        const img = g.getImageData(0, 0, s, s);
        for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
            const i = (y * s + x) * 4;
            const n = (hash2(x, y * 2) - 0.5) * 16;
            img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
        }
        g.putImageData(img, 0, 0);
        // stripe
        g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillRect(0, s * 0.42, s, 14);
        g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, s * 0.42 + 14, s, 3);
        // windows band
        for (let col = 0; col < 6; col++) {
            const x = 10 + col * 42;
            g.fillStyle = '#25313c'; g.fillRect(x, s * 0.18, 30, 42);
            g.fillStyle = 'rgba(180,210,230,0.5)'; g.fillRect(x + 2, s * 0.18 + 2, 12, 38);
        }
        // rivets
        g.fillStyle = 'rgba(0,0,0,0.2)';
        for (let y = s * 0.7; y < s; y += 12) for (let x = 6; x < s; x += 12) { g.beginPath(); g.arc(x, y, 2, 0, 7); g.fill(); }
    });
}

export function texGrass(base = '#5d9a4e') {
    return mk(128, (g, s) => {
        g.fillStyle = base; g.fillRect(0, 0, s, s);
        const img = g.getImageData(0, 0, s, s);
        for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
            const i = (y * s + x) * 4;
            const n = (hash2(x * 2, y) - 0.5) * 30;
            img.data[i] += n * 0.7; img.data[i + 1] += n; img.data[i + 2] += n * 0.5;
        }
        g.putImageData(img, 0, 0);
    });
}

export function texConcrete(base = '#8f9499') {
    return mk(128, (g, s) => {
        g.fillStyle = base; g.fillRect(0, 0, s, s);
        const img = g.getImageData(0, 0, s, s);
        for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
            const i = (y * s + x) * 4;
            const n = (hash2(x, y) - 0.5) * 22;
            img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
        }
        g.putImageData(img, 0, 0);
        g.strokeStyle = 'rgba(60,64,68,0.5)'; g.lineWidth = 2;
        g.strokeRect(1, 1, s - 2, s - 2);
    });
}
