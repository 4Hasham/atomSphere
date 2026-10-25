import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { BufferGeometry, DynamicDrawUsage, Float32BufferAttribute } from "three";

export function WeatherEffect({ type }) {
  const group = useRef();
  const lines = useRef();
  const points = useMemo(() => {
    const count = type === "rain" ? 420 : 110;
    const positions = new Float32Array(count * 6);
    const starts = new Float32Array(count * 3);
    const randomValue = (index, seed) => {
      const value = Math.sin((index + 1) * 12.9898 + seed * 78.233) * 43758.5453;
      return value - Math.floor(value);
    };

    for (let index = 0; index < count; index += 1) {
      const offset = index * 3;
      starts[offset] = (randomValue(index, 1) - 0.5) * 30;
      starts[offset + 1] = randomValue(index, 2) * 18;
      starts[offset + 2] = (randomValue(index, 3) - 0.5) * 30;
    }

    return { count, positions, starts };
  }, [type]);

  const geometry = useMemo(() => {
    const buffer = new Float32BufferAttribute(points.positions, 3);
    buffer.setUsage(DynamicDrawUsage);
    const result = new BufferGeometry();
    result.setAttribute("position", buffer);
    return result;
  }, [points]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame((state) => {
    const target = state.controls?.target;
    if (target) group.current.position.copy(target);

    const position = lines.current.geometry.attributes.position;
    const speed = type === "rain" ? 25 : 10;
    const elapsed = state.clock.elapsedTime;

    for (let index = 0; index < points.count; index += 1) {
      const start = index * 3;
      const baseX = points.starts[start];
      const baseY = points.starts[start + 1];
      const z = points.starts[start + 2];

      if (type === "rain") {
        const y = ((baseY - elapsed * speed + 2) % 20 + 20) % 20 - 2;
        const x = baseX;
        position.setXYZ(index * 2, x, y, z);
        position.setXYZ(index * 2 + 1, x - 0.12, y - 0.65, z);
      } else {
        const x = ((baseX + elapsed * speed + 16) % 32 + 32) % 32 - 16;
        const y = baseY;
        position.setXYZ(index * 2, x, y, z);
        position.setXYZ(index * 2 + 1, x - 1.2, y - 0.1, z);
      }
    }
    position.needsUpdate = true;
  });

  return (
    <group ref={group}>
      <lineSegments ref={lines} geometry={geometry} frustumCulled={false}>
        <lineBasicMaterial
          color={type === "rain" ? "#b9d8f0" : "#d9dfbd"}
          transparent
          opacity={type === "rain" ? 0.48 : 0.32}
        />
      </lineSegments>
    </group>
  );
}

export function LightningFlash() {
  const light = useRef();
  const nextFlash = useRef(3);
  const flashDuration = useRef(0);

  useFrame((state, delta) => {
    if (!light.current) return;

    flashDuration.current = Math.max(0, flashDuration.current - delta);
    nextFlash.current -= delta;
    if (nextFlash.current <= 0) {
      flashDuration.current = 0.08 + Math.random() * 0.12;
      nextFlash.current = 3 + Math.random() * 6;
    }
    light.current.intensity = flashDuration.current > 0 ? 7 : 0;
    const target = state.controls?.target;
    if (target) light.current.position.set(target.x, target.y + 20, target.z);
  });

  return <pointLight ref={light} color="#d9e7ff" intensity={0} distance={120} />;
}
