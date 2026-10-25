import { ContactShadows, Environment } from "@react-three/drei";
import { groundFor } from "./backdrops";

// Catches the sun's shadows on y = 0 without drawing a surface of its own.
// Darkness follows the sun's strength, so overcast light gives faint shadows.
function ShadowCatcher({ size, sunStrength }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]} receiveShadow>
      <planeGeometry args={[size, size]} />
      <shadowMaterial transparent opacity={0.45 * sunStrength} />
    </mesh>
  );
}

// Soft occlusion where the model meets the ground, whatever the light direction.
function GroundContact({ modelSize }) {
  return (
    <ContactShadows
      position={[0, 0.005, 0]}
      scale={modelSize * 2.5}
      far={modelSize}
      blur={2.5}
      opacity={0.6}
      resolution={512}
    />
  );
}

// Everything around the model when there is no real-world terrain. The ground is
// always y = 0, which is where models stand.
export default function Backdrop({ backdrop, environmentIntensity, modelSize }) {
  const sunStrength = backdrop.sunStrength ?? 0.8;

  if (!backdrop.file) {
    const gridSize = Math.max(12, Math.ceil(modelSize * 3));
    return (
      <>
        <gridHelper args={[gridSize, gridSize * 2, "#42534e", "#273733"]} />
        <ShadowCatcher size={gridSize} sunStrength={sunStrength} />
        <GroundContact modelSize={modelSize} />
      </>
    );
  }

  if (!backdrop.ground) {
    return (
      <>
        <color attach="background" args={[backdrop.background]} />
        <Environment files={backdrop.file} environmentIntensity={environmentIntensity} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[400, 400]} />
          <meshStandardMaterial color={backdrop.floorColor} roughness={0.9} />
        </mesh>
        <GroundContact modelSize={modelSize} />
      </>
    );
  }

  const ground = groundFor(backdrop, modelSize);
  return (
    <>
      <Environment
        files={backdrop.file}
        background
        environmentIntensity={environmentIntensity}
        ground={{ ...ground, scale: ground.radius * 4 }}
      />
      <ShadowCatcher size={ground.radius * 2} sunStrength={sunStrength} />
      <GroundContact modelSize={modelSize} />
    </>
  );
}
