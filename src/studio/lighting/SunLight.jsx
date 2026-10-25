import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Vector3 } from "three";

// Directional sun whose tight shadow frustum follows the orbit target, so the car gets
// crisp, high-resolution shadows no matter how large or far-away the scene is.
export default function SunLight({ direction, color, intensity, extent }) {
  const light = useRef();
  const dir = useMemo(() => new Vector3(...direction).normalize(), [direction]);

  // The shadow-camera props below only change the bounds; three.js keeps using the old
  // projection until it is rebuilt, which clips every shadow once the light moves out.
  useLayoutEffect(() => {
    light.current?.shadow.camera.updateProjectionMatrix();
  }, [extent]);

  useFrame((state) => {
    const l = light.current;
    if (!l) return;
    const target = state.controls?.target ?? new Vector3();
    l.position.copy(target).addScaledVector(dir, extent * 4);
    l.target.position.copy(target);
    l.target.updateMatrixWorld();
  });

  return (
    <directionalLight
      ref={light}
      color={color}
      intensity={intensity}
      castShadow
      shadow-mapSize-width={4096}
      shadow-mapSize-height={4096}
      shadow-camera-left={-extent}
      shadow-camera-right={extent}
      shadow-camera-top={extent}
      shadow-camera-bottom={-extent}
      shadow-camera-near={1}
      shadow-camera-far={extent * 10}
      shadow-bias={-0.0002}
      shadow-normalBias={0.03}
      shadow-radius={3}
    />
  );
}
