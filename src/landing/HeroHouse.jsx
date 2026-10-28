import { useEffect, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { ContactShadows, OrbitControls } from "@react-three/drei";
import PropertyModel from "../studio/property/PropertyModel";
import { createSampleProperty } from "../studio/property/propertyDocument";

// Whole house, then cut open at each floor: what property mode does, shown live.
const VIEWS = [
  { level: "all", label: "Whole house" },
  { level: "1", label: "First floor" },
  { level: "0", label: "Ground floor" },
];
const VIEW_MS = 3600;

/** The sample two-storey house, made by the same builder as Studio, slowly turning. */
export default function HeroHouse({ theme }) {
  const property = useMemo(() => createSampleProperty(), []);
  const [view, setView] = useState(0);
  const reducedMotion = useMemo(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches, []);

  useEffect(() => {
    if (reducedMotion) return undefined;
    const id = window.setInterval(() => setView((index) => (index + 1) % VIEWS.length), VIEW_MS);
    return () => window.clearInterval(id);
  }, [reducedMotion]);

  return (
    <div className="lp-house">
      <Canvas
        shadows
        dpr={[1, 1.5]}
        gl={{ alpha: true, antialias: true }}
        camera={{ position: [18, 14, 20], fov: 34 }}
        aria-label="A two-storey house made in atomSphere, shown whole and cut open floor by floor"
        role="img"
      >
        <hemisphereLight args={["#ffffff", "#c8c2b6", 1.6]} />
        <directionalLight
          position={[8, 14, 6]}
          intensity={2.2}
          castShadow
          shadow-mapSize={[1024, 1024]}
          shadow-camera-left={-12}
          shadow-camera-right={12}
          shadow-camera-top={12}
          shadow-camera-bottom={-12}
        />
        <directionalLight position={[-10, 6, -8]} intensity={0.6} />
        <group position={[0, -2.2, 0]}>
          <PropertyModel property={property} level={VIEWS[view].level} roof theme={theme} />
          <ContactShadows position={[0, 0.005, 0]} scale={26} far={8} blur={2.4} opacity={0.35} />
        </group>
        <OrbitControls
          enableZoom={false}
          enablePan={false}
          autoRotate={!reducedMotion}
          autoRotateSpeed={0.6}
          minPolarAngle={0.6}
          maxPolarAngle={1.2}
        />
      </Canvas>
      <span className="lp-house-chip" aria-hidden="true">{VIEWS[view].label}</span>
    </div>
  );
}
