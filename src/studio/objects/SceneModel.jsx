import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { RigidBody, useRapier } from "@react-three/rapier";
import { Box3, Vector3 } from "three";
import { RAY_START_Y } from "../constants";

const SPAWN_CLEARANCE = 0.1;    // meters between the car's underside and the ground (no visible drop)
const CAMERA_OFFSET = { x: 6, y: 5, z: 9 }; // meters from the car: a close-up (~12 m away)
const KILL_Y = -20000;

// 1 world unit = 1 meter: the model is scaled so its largest side is sizeMeters.
// anchor "base" stands it on y = 0; "center" puts its middle at the origin, which
// is the RigidBody origin when it is dropped onto terrain.
export function LoadedModel({ url, sizeMeters, anchor = "base" }) {
  const { scene } = useGLTF(url);
  const model = useMemo(() => {
    const clone = scene.clone(true);
    const bounds = new Box3().setFromObject(clone);
    const size = bounds.getSize(new Vector3());
    const largest = Math.max(size.x, size.y, size.z);

    if (largest > 0) {
      clone.scale.multiplyScalar(sizeMeters / largest);
      clone.updateMatrixWorld(true);
      const scaled = new Box3().setFromObject(clone);
      const center = scaled.getCenter(new Vector3());
      if (anchor === "base") center.y = scaled.min.y;
      clone.position.sub(center);
    }
    clone.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        if (child.material) child.material.envMapIntensity = 1.2;
      }
    });
    return clone;
  }, [scene, sizeMeters, anchor]);

  return <primitive object={model} />;
}

// Parks the car high up, waits for the terrain collider, finds the ground height under
// the car's footprint, places the car resting on it (no fall), and frames a close-up camera.
export function DroppedModel({ url, sizeMeters }) {
  const body = useRef();
  const visual = useRef();
  const { world, rapier } = useRapier();
  const placed = useRef(false);
  const frames = useRef(0);
  const groundHalf = useRef(0.7);
  const spawn = useRef({ x: 0, y: 50, z: 0 });

  useFrame((state) => {
    const b = body.current;
    if (!b) return;

    if (!placed.current) {
      // Wait for Rapier to build the terrain collider and for OrbitControls to exist
      if (++frames.current < 5 || !visual.current || !state.controls) return;

      // Measure the car so we can rest its underside on the ground
      const box = new Box3().setFromObject(visual.current);
      const half = box.getSize(new Vector3()).multiplyScalar(0.5);
      const ringRadius = Math.max(half.x, half.z);

      const samples = [[0, 0]];
      for (let i = 0; i < 8; i += 1) {
        const a = (i / 8) * Math.PI * 2;
        samples.push([Math.cos(a) * ringRadius, Math.sin(a) * ringRadius]);
      }

      let top = -Infinity;
      for (const [x, z] of samples) {
        const ray = new rapier.Ray({ x, y: RAY_START_Y, z }, { x: 0, y: -1, z: 0 });
        const hit = world.castRay(ray, RAY_START_Y * 3, true);
        if (hit) {
          const t = hit.timeOfImpact ?? hit.toi;
          top = Math.max(top, RAY_START_Y - t);
        }
      }
      if (top === -Infinity) return; // collider not ready yet, retry next frame

      groundHalf.current = half.y * 0.8;
      const s = { x: 0, y: top + half.y + SPAWN_CLEARANCE, z: 0 };
      spawn.current = s;
      b.setTranslation(s, true);
      b.setLinvel({ x: 0, y: 0, z: 0 }, true);
      b.setAngvel({ x: 0, y: 0, z: 0 }, true);
      b.setGravityScale(1, true);

      // Close-up camera on the car
      state.camera.position.set(s.x + CAMERA_OFFSET.x, s.y + CAMERA_OFFSET.y, s.z + CAMERA_OFFSET.z);
      state.controls.target.set(s.x, s.y, s.z);
      state.controls.update();

      placed.current = true;
      return;
    }

    const t = b.translation();
    if (t.y < KILL_Y) {
      b.setTranslation(spawn.current, true);
      b.setLinvel({ x: 0, y: 0, z: 0 }, true);
      b.setAngvel({ x: 0, y: 0, z: 0 }, true);
      return;
    }

    // Anti-tunneling: if the car's center sank below the terrain surface, lift it back on top
    const ray = new rapier.Ray({ x: t.x, y: t.y + 5000, z: t.z }, { x: 0, y: -1, z: 0 });
    const hit = world.castRay(ray, 20000, true, undefined, undefined, undefined, b);
    if (hit) {
      const ground = t.y + 5000 - (hit.timeOfImpact ?? hit.toi);
      const minY = ground + groundHalf.current;
      if (t.y < minY - 0.05) {
        b.setTranslation({ x: t.x, y: minY + SPAWN_CLEARANCE, z: t.z }, true);
        const v = b.linvel();
        b.setLinvel({ x: v.x, y: Math.max(v.y, 0), z: v.z }, true);
      }
    }
  });

  return (
    <RigidBody
      ref={body}
      ccd
      colliders="hull"
      position={[0, RAY_START_Y * 2, 0]} // parked above the ray start until placed
      gravityScale={0}
      restitution={0}
      friction={1}
      linearDamping={0.05}
      angularDamping={0.5}
    >
      <group ref={visual}>
        <LoadedModel url={url} sizeMeters={sizeMeters} anchor="center" />
      </group>
    </RigidBody>
  );
}
