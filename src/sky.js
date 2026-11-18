// Shader sky: gradient + sun/moon + stars + clouds. BackSide sphere, no assets.
import * as THREE from '../three.module.js';

export function createSky() {
    const uniforms = {
        uDay: { value: 1 },        // 0 night .. 1 day
        uSunDir: { value: new THREE.Vector3(0.3, 0.6, -0.7) },
        uSkyTop: { value: new THREE.Color(0x5ab0ff) },
        uSkyBot: { value: new THREE.Color(0xcfe8ff) },
        uNight: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
        uniforms,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        vertexShader: `
            varying vec3 vDir;
            void main() {
                vDir = normalize(position);
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }`,
        fragmentShader: `
            uniform float uDay; uniform float uNight; uniform vec3 uSunDir;
            uniform vec3 uSkyTop; uniform vec3 uSkyBot;
            varying vec3 vDir;

            float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
            float noise(vec2 p){
                vec2 i = floor(p), f = fract(p);
                float a = hash(i), b = hash(i+vec2(1,0)), c = hash(i+vec2(0,1)), d = hash(i+vec2(1,1));
                vec2 u = f*f*(3.0-2.0*f);
                return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
            }
            float fbm(vec2 p){ float v=0.0; float a=0.5; for(int i=0;i<4;i++){ v+=a*noise(p); p*=2.1; a*=0.5; } return v; }

            void main() {
                vec3 dir = normalize(vDir);
                float h = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
                vec3 col = mix(uSkyBot, uSkyTop, pow(h, 0.8));

                // stars at night
                if (uNight > 0.02 && dir.y > -0.05) {
                    float st = hash(floor(dir.xy * 260.0));
                    float tw = 0.6 + 0.4 * sin(st * 90.0);
                    col += vec3(step(0.985, st)) * tw * uNight;
                }

                // sun / moon disc
                float sd = dot(dir, normalize(uSunDir));
                float disc = smoothstep(0.9965, 0.999, sd);
                vec3 sunCol = mix(vec3(0.85,0.88,1.0), vec3(1.0,0.92,0.7), uDay); // moon pale / sun warm
                col += disc * sunCol * (1.0 + uDay);
                float glow = pow(max(sd, 0.0), 24.0) * 0.35;
                col += glow * mix(vec3(0.3,0.4,0.6), vec3(1.0,0.75,0.45), uDay);

                // clouds (only above horizon)
                if (dir.y > 0.02) {
                    vec2 cp = dir.xz / (dir.y + 0.35);
                    float c = fbm(cp * 1.6);
                    float cloud = smoothstep(0.48, 0.75, c) * clamp(dir.y * 2.5, 0.0, 1.0);
                    vec3 cloudCol = mix(vec3(0.25,0.3,0.42), vec3(1.0,0.98,0.94), uDay);
                    col = mix(col, cloudCol, cloud * 0.75);
                }
                gl_FragColor = vec4(col, 1.0);
            }`,
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(900, 24, 16), mat);
    mesh.frustumCulled = false;
    return { mesh, uniforms: uniforms, mat };
}
