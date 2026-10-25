import { Component, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, Lightformer } from "@react-three/drei";
import { AdditiveBlending, BackSide, Color, MathUtils, NormalBlending } from "three";
import useMediaQuery from "./useMediaQuery";

const PALETTES = {
  dark: {
    core: "#9dabbc",
    wire: "#7ce7c8",
    wireOpacity: 0.14,
    atmosphere: "#7ce7c8",
    atmosphereOpacity: 0.07,
    ring: "#a9b6c3",
    ringAccent: "#a9ffe8",
    satellite: "#eef3f9",
    satelliteAccent: "#c8fff0",
    satelliteGlow: "#7ce7c8",
    dust: "#dbe6f2",
    dustOpacity: 0.5,
    dustAdditive: true,
    rim: "#8bf7da",
    rimStrength: 0.68,
    pointA: "#7ce7c8",
    pointB: "#97a6ff",
    ambient: 0.32,
    directional: 1.15,
    pointAIntensity: 16,
    pointBIntensity: 12,
  },
  light: {
    core: "#6f7c8a",
    wire: "#0f766e",
    wireOpacity: 0.2,
    atmosphere: "#0f766e",
    atmosphereOpacity: 0.04,
    ring: "#3f4a56",
    ringAccent: "#0f766e",
    satellite: "#3f4a56",
    satelliteAccent: "#0b5f59",
    satelliteGlow: "#0f766e",
    dust: "#5f6b78",
    dustOpacity: 0.38,
    dustAdditive: false,
    rim: "#0f766e",
    rimStrength: 0.5,
    pointA: "#0f766e",
    pointB: "#6366f1",
    ambient: 0.7,
    directional: 1.35,
    pointAIntensity: 8,
    pointBIntensity: 5,
  },
};

const RIM_VERTEX = `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  void main() {
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vViewDir = normalize(-viewPosition.xyz);
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const RIM_FRAGMENT = `
  uniform vec3 uColor;
  uniform float uPower;
  uniform float uStrength;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  void main() {
    float fresnel = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewDir))), uPower);
    gl_FragColor = vec4(uColor, fresnel * uStrength);
  }
`;

function RimGlow({ palette }) {
  const uniforms = useMemo(
    () => ({
      uColor: { value: new Color(palette.rim) },
      uPower: { value: 3 },
      uStrength: { value: palette.rimStrength },
    }),
    [palette],
  );

  return (
    <mesh scale={1.045}>
      <sphereGeometry args={[1.02, 48, 48]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={RIM_VERTEX}
        fragmentShader={RIM_FRAGMENT}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
      />
    </mesh>
  );
}

class SceneBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.warn("The 3D preview could not start:", error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function OrbitRing({ radius, tilt, speed, accent = false, palette }) {
  const spinner = useRef();

  useFrame((_, delta) => {
    if (spinner.current) spinner.current.rotation.z += delta * speed * 0.42;
  });

  return (
    <group rotation={tilt}>
      <group ref={spinner}>
        <mesh>
          <torusGeometry args={[radius, accent ? 0.006 : 0.0045, 10, 220]} />
          <meshBasicMaterial
            color={accent ? palette.ringAccent : palette.ring}
            toneMapped={false}
          />
        </mesh>
        <mesh position={[radius, 0, 0]}>
          <sphereGeometry args={[accent ? 0.035 : 0.022, 18, 18]} />
          <meshBasicMaterial
            color={accent ? palette.satelliteAccent : palette.satellite}
            toneMapped={false}
          />
        </mesh>
        <mesh position={[radius, 0, 0]} scale={3.4}>
          <sphereGeometry args={[accent ? 0.035 : 0.022, 18, 18]} />
          <meshBasicMaterial
            color={palette.satelliteGlow}
            transparent
            opacity={accent ? 0.22 : 0.12}
            blending={AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      </group>
    </group>
  );
}

function Core({ motion, palette }) {
  const spin = useRef();
  const parallax = useRef();

  useFrame((state, delta) => {
    const speed = motion ? 1 : 0;
    if (spin.current) {
      spin.current.rotation.y += delta * 0.1 * speed;
      spin.current.rotation.x += delta * 0.03 * speed;
    }
    if (parallax.current) {
      parallax.current.rotation.y = MathUtils.lerp(
        parallax.current.rotation.y,
        state.pointer.x * 0.22,
        0.045,
      );
      parallax.current.rotation.x = MathUtils.lerp(
        parallax.current.rotation.x,
        state.pointer.y * 0.16,
        0.045,
      );
    }
  });

  return (
    <group ref={parallax}>
      <group ref={spin}>
        <mesh>
          <icosahedronGeometry args={[1.02, 4]} />
          <meshStandardMaterial
            color={palette.core}
            metalness={1}
            roughness={0.3}
            envMapIntensity={1.15}
          />
        </mesh>
        <mesh scale={1.028}>
          <icosahedronGeometry args={[1.02, 1]} />
          <meshBasicMaterial
            color={palette.wire}
            wireframe
            transparent
            opacity={palette.wireOpacity}
          />
        </mesh>
        <mesh scale={1.16}>
          <sphereGeometry args={[1.02, 32, 32]} />
          <meshBasicMaterial
            color={palette.atmosphere}
            side={BackSide}
            transparent
            opacity={palette.atmosphereOpacity}
            blending={AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
        <RimGlow palette={palette} />
      </group>

      <OrbitRing radius={1.52} tilt={[1.24, 0.16, 0.28]} speed={motion ? 1 : 0} accent palette={palette} />
      <OrbitRing radius={1.86} tilt={[0.42, 0.7, -0.5]} speed={motion ? -0.75 : 0} palette={palette} />
      <OrbitRing radius={2.16} tilt={[1.62, -0.24, 0.9]} speed={motion ? 0.55 : 0} accent palette={palette} />
    </group>
  );
}

function Dust({ palette }) {
  const positions = useMemo(() => {
    const count = 320;
    const values = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      const seed = (index + 1) * 12.9898;
      const random = (offset) => {
        const value = Math.sin(seed + offset * 78.233) * 43758.5453;
        return value - Math.floor(value);
      };
      const radius = 2.7 + random(1) * 3.4;
      const theta = random(2) * Math.PI * 2;
      const phi = Math.acos(2 * random(3) - 1);
      values[index * 3] = Math.sin(phi) * Math.cos(theta) * radius;
      values[index * 3 + 1] = Math.cos(phi) * radius * 0.72;
      values[index * 3 + 2] = Math.sin(phi) * Math.sin(theta) * radius;
    }
    return values;
  }, []);

  const points = useRef();

  useFrame((_, delta) => {
    if (points.current) points.current.rotation.y += delta * 0.014;
  });

  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.016}
        color={palette.dust}
        transparent
        opacity={palette.dustOpacity}
        sizeAttenuation
        depthWrite={false}
        blending={palette.dustAdditive ? AdditiveBlending : NormalBlending}
      />
    </points>
  );
}

function Scene({ motion, palette }) {
  return (
    <>
      <ambientLight intensity={palette.ambient} />
      <directionalLight position={[4, 3, 5]} intensity={palette.directional} color="#ffffff" />
      <pointLight
        position={[-3.4, -1.4, 2.2]}
        intensity={palette.pointAIntensity}
        distance={14}
        color={palette.pointA}
      />
      <pointLight
        position={[3.4, 2.2, -3]}
        intensity={palette.pointBIntensity}
        distance={16}
        color={palette.pointB}
      />

      <group position={[0, 0.05, 0]} scale={0.88}>
        <Core motion={motion} palette={palette} />
        <Dust palette={palette} />
      </group>

      <Environment resolution={128}>
        <Lightformer
          form="rect"
          intensity={1.5}
          color="#ffffff"
          position={[0, 5, 0.5]}
          scale={[12, 6, 1]}
          onUpdate={(self) => self.lookAt(0, 0, 0)}
        />
        <Lightformer
          form="rect"
          intensity={1.15}
          color="#b6ffe9"
          position={[-5, 0.5, 2.5]}
          scale={[7, 9, 1]}
          onUpdate={(self) => self.lookAt(0, 0, 0)}
        />
        <Lightformer
          form="rect"
          intensity={0.9}
          color="#97a6ff"
          position={[5, 1, -1.5]}
          scale={[7, 7, 1]}
          onUpdate={(self) => self.lookAt(0, 0, 0)}
        />
        <Lightformer
          form="rect"
          intensity={1.7}
          color="#ffffff"
          position={[1.8, 2.6, 3.4]}
          scale={[2.4, 2.4, 1]}
          onUpdate={(self) => self.lookAt(0, 0, 0)}
        />
        <Lightformer
          form="rect"
          intensity={0.55}
          color="#ffffff"
          position={[0, -4.5, 1]}
          scale={[10, 4, 1]}
          onUpdate={(self) => self.lookAt(0, 0, 0)}
        />
        <Lightformer
          form="ring"
          intensity={0.8}
          color="#ffffff"
          position={[0, 0, -5]}
          scale={4}
          onUpdate={(self) => self.lookAt(0, 0, 0)}
        />
      </Environment>
    </>
  );
}

export default function OrbScene({ theme = "dark" }) {
  const isWide = useMediaQuery("(min-width: 1024px)");
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const palette = PALETTES[theme] ?? PALETTES.dark;

  if (!isWide) return null;

  return (
    <div className="orb-canvas">
      <SceneBoundary>
        <Canvas
          dpr={[1, 1.75]}
          camera={{ position: [0, 0.15, 6.6], fov: 38 }}
          gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
        >
          <Scene motion={!reduceMotion} palette={palette} />
        </Canvas>
      </SceneBoundary>
    </div>
  );
}
