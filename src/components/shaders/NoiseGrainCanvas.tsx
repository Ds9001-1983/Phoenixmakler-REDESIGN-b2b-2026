import { Canvas, useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform float uIntensity;

  // Hash-based pseudo-random
  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  // Film grain: animated noise + slight vignette
  void main() {
    vec2 uv = vUv;
    float n = hash(uv * 1000.0 + uTime * 60.0);
    float grain = (n - 0.5) * uIntensity;

    // Slight horizontal scanline
    float scan = sin(uv.y * 900.0) * 0.015;

    // Soft radial vignette
    float d = distance(uv, vec2(0.5));
    float vign = smoothstep(0.9, 0.3, d) * 0.25;

    float value = 0.5 + grain + scan - vign;
    gl_FragColor = vec4(vec3(value), 1.0);
  }
`;

function Plane({ intensity }: { intensity: number }) {
  const mat = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uIntensity: { value: intensity },
    }),
    [intensity]
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

export default function NoiseGrainCanvas({ intensity = 0.22 }: { intensity?: number }) {
  // A11y: Bei reduced-motion (Widget oder System) Shader gar nicht mounten —
  // spart GPU-Zeit. Das CSS-SVG-Grain im Hero bleibt als statischer Ersatz.
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const html = document.documentElement;
    const check = () =>
      setReduced(html.getAttribute('data-a11y-motion') === 'reduced');
    check();
    const obs = new MutationObserver(check);
    obs.observe(html, { attributes: true, attributeFilter: ['data-a11y-motion'] });
    return () => obs.disconnect();
  }, []);
  if (reduced) return null;

  return (
    <Canvas
      orthographic
      camera={{ position: [0, 0, 1], zoom: 1 }}
      gl={{ antialias: false, alpha: false, powerPreference: 'low-power' }}
      dpr={[1, 1.5]}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        mixBlendMode: 'overlay',
        opacity: 0.55,
      }}
    >
      <Plane intensity={intensity} />
    </Canvas>
  );
}
