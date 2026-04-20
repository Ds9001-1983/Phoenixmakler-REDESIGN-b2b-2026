import { Canvas, useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Aurora: three flowing gradient blobs via smooth noise + palette
const fragmentShader = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform vec2 uResolution;
  uniform vec3 uColor1; // Navy deep
  uniform vec3 uColor2; // Navy mid
  uniform vec3 uColor3; // Copper
  uniform vec3 uColor4; // Off-white tint

  // 2D noise (Perlin-ish via hash + smoothstep)
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p *= 2.0;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 uv = vUv;
    float t = uTime * 0.05;

    float n1 = fbm(uv * 2.0 + vec2(t, t * 0.8));
    float n2 = fbm(uv * 3.0 + vec2(-t * 0.6, t * 1.2) + 4.0);
    float n3 = fbm(uv * 1.4 + vec2(t * 0.3, -t) + 9.0);

    vec3 col = uColor1;
    col = mix(col, uColor2, smoothstep(0.3, 0.8, n1));
    col = mix(col, uColor3, smoothstep(0.5, 0.9, n2) * 0.6);
    col = mix(col, uColor4, smoothstep(0.7, 1.0, n3) * 0.15);

    // Darken edges
    float d = distance(uv, vec2(0.5, 0.5));
    col *= smoothstep(1.1, 0.2, d);

    gl_FragColor = vec4(col, 1.0);
  }
`;

function Plane() {
  const mat = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uColor1: { value: new THREE.Color('#050d26') },
      uColor2: { value: new THREE.Color('#0a1940') },
      uColor3: { value: new THREE.Color('#b8865b') },
      uColor4: { value: new THREE.Color('#faf7f2') },
    }),
    []
  );

  useFrame(({ clock }) => {
    if (mat.current) {
      mat.current.uniforms.uTime.value = clock.elapsedTime;
    }
  });

  return (
    <mesh>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={mat}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
      />
    </mesh>
  );
}

export default function AuroraCanvas() {
  return (
    <Canvas
      orthographic
      camera={{ position: [0, 0, 1], zoom: 1 }}
      gl={{ antialias: false, alpha: false, powerPreference: 'default' }}
      dpr={[1, 1.5]}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      }}
    >
      <Plane />
    </Canvas>
  );
}
