// Radial curve applied in the vertex shader of every material.
// World geometry stays straight (gameplay on a straight axis); the bend is
// purely visual: xy offset grows with z^2 => smooth arc, no corners.
import * as THREE from '../three.module.js';

export const U = {
    uCurve: { value: new THREE.Vector2(0, -0.0008) },
};

let _mode = 'std';

export function setCurveMode(mode) { _mode = mode; }

// Patch a standard material (Lambert/Phong/Standard) so its vertex shader bends the world.
export function curveify(mat) {
    mat.onBeforeCompile = (shader) => {
        mat.userData.shader = shader;
        shader.uniforms.uCurve = U.uCurve;
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nuniform vec2 uCurve;')
            .replace('#include <project_vertex>', [
                'vec4 mvPosition = vec4( transformed, 1.0 );',
                '#ifdef USE_BATCHING',
                '  mvPosition = batchingMatrix * mvPosition;',
                '#endif',
                '#ifdef USE_INSTANCING',
                '  mvPosition = instanceMatrix * mvPosition;',
                '#endif',
                'mvPosition = modelViewMatrix * mvPosition;',
                // Bend only far ahead: fade in from z=-25 to -70 so the near ground stays flat/visible.
                'float bendK = smoothstep(-25.0, -70.0, mvPosition.z);',
                '#ifndef FLAT_SHADED',
                'vec3 bn = normal;',
                '#ifdef USE_INSTANCING',
                '  bn = mat3(instanceMatrix) * bn;',
                '#endif',
                'bn = normalize(mat3(modelViewMatrix) * bn);',
                'vNormal = normalize(bn + vec3(0.0, 0.12, 0.0)); // tilt keeps grazing ground lit',
                '#endif',
                'mvPosition.xy += uCurve * mvPosition.z * mvPosition.z * bendK;',
                'gl_Position = projectionMatrix * mvPosition;',
            ].join('\n'));
    };
    mat.customProgramCacheKey = () => 'curved-' + _mode;
    return mat;
}

// Bend a world-space point (x, y, z where z is negative ahead) for camera placement.
export function bendPoint(x, y, z) {
    const c = U.uCurve.value;
    return new THREE.Vector3(x + c.x * z * z, y + c.y * z * z, z);
}

// Animate gentle wander of the bend based on travelled distance.
export function updateCurve(d) {
    U.uCurve.value.set(
        (Math.sin(d * 0.0052) * 0.65 + Math.sin(d * 0.0021 + 1.7) * 0.35) * 0.004,
        -0.0018 + 0.0006 * Math.sin(d * 0.0031),
    );
}
