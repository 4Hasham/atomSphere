import { Component, Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Bounds, Center, Html, OrbitControls, useGLTF } from "@react-three/drei";
import { Physics, RigidBody, useRapier } from "@react-three/rapier";
import { Box3, Vector3 } from "three";
import SceneControls, { TerrainSurface } from "./SceneControls";
import useTerrain from "./useTerrain";

// 1 world unit = 1 meter, so the car is a real car next to a real mountain.
const MODEL_SIZE_METERS = 4.5;
const RAY_START_Y = 20000;      // above K2 (~8600 m)
const SPAWN_CLEARANCE = 0.1;    // meters between the car's underside and the ground (no visible drop)
const CAMERA_OFFSET = { x: 6, y: 5, z: 9 }; // meters from the car: a close-up (~12 m away)
const KILL_Y = -20000;
const CAMERA_MIN_HEIGHT = 2;    // meters the camera must stay above the terrain surface

let terrainVersion = 0;

function LoadedModel({ url, terrainBackdrop = false }) {
  const { scene } = useGLTF(url);
  const model = useMemo(() => {
    const clone = scene.clone(true);
    if (terrainBackdrop) {
      const bounds = new Box3().setFromObject(clone);
      const size = bounds.getSize(new Vector3());
      const largest = Math.max(size.x, size.y, size.z);

      if (largest > 0) {
        clone.scale.multiplyScalar(MODEL_SIZE_METERS / largest);
        clone.updateMatrixWorld(true);
        // Center on its own origin so the RigidBody origin is the car's center
        const scaled = new Box3().setFromObject(clone);
        clone.position.sub(scaled.getCenter(new Vector3()));
      }
    }
    return clone;
  }, [scene, terrainBackdrop]);

  return <primitive object={model} />;
}

// Parks the car high up, waits for the terrain collider, finds the ground height under
// the car's footprint, places the car resting on it (no fall), and frames a close-up camera.
function DroppedModel({ url }) {
  const body = useRef();
  const visual = useRef();
  const { world, rapier } = useRapier();
  const placed = useRef(false);
  const frames = useRef(0);
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

    if (b.translation().y < KILL_Y) {
      b.setTranslation(spawn.current, true);
      b.setLinvel({ x: 0, y: 0, z: 0 }, true);
      b.setAngvel({ x: 0, y: 0, z: 0 }, true);
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
        <LoadedModel url={url} terrainBackdrop />
      </group>
    </RigidBody>
  );
}

// Keeps the camera above the terrain: every frame, finds the ground height directly
// under the camera and pushes the camera up if it is lower than ground + CAMERA_MIN_HEIGHT.
function CameraGroundGuard() {
  const { world, rapier } = useRapier();

  useFrame((state) => {
    const cam = state.camera;
    const startY = Math.max(RAY_START_Y, cam.position.y + 100);
    const ray = new rapier.Ray({ x: cam.position.x, y: startY, z: cam.position.z }, { x: 0, y: -1, z: 0 });
    // Ignore the car (dynamic); only the fixed terrain counts as ground
    const hit = world.castRay(ray, startY + 20000, true, rapier.QueryFilterFlags.EXCLUDE_DYNAMIC);
    if (!hit) return;

    const groundY = startY - (hit.timeOfImpact ?? hit.toi);
    const minY = groundY + CAMERA_MIN_HEIGHT;
    if (cam.position.y < minY) cam.position.y = minY;
  });

  return null;
}

class ViewerErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error("Failed to load GLB in the model viewer:", error);
  }

  render() {
    if (this.state.failed) {
      return (
        <Html center>
          <p className="viewer-failure" role="alert">
            Could not load this model. The signed link may have expired or S3 CORS may block it.
          </p>
        </Html>
      );
    }
    return this.props.children;
  }
}

export default function ModelViewer({ url, jobId, prompt, onBack }) {
  const terrainState = useTerrain();
  const terrain = terrainState.terrain;

  // New key whenever the terrain changes: rebuilds the collider and re-drops the car.
  const terrainKey = useMemo(() => ++terrainVersion, []);

  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key === "Escape") onBack();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onBack]);

  return (
    <main className="studio-page">
      <section className="model-viewer" aria-labelledby="viewer-title">
        <header className="viewer-header">
          <button className="studio-back" type="button" onClick={onBack}>
            <span aria-hidden="true">←</span> Workspace
          </button>
          <div>
            <span className="eyebrow"><span className="eyebrow-dot" /> STUDIO · EDIT YOUR SCENE</span>
            <h2 id="viewer-title">{prompt || "Generated model"}</h2>
            <span className="viewer-id">ID · {jobId}</span>
          </div>
          <span className="studio-wordmark">atomSphere Studio</span>
        </header>

        <div className="viewer-workspace">
          <div className="viewer-stage">
            <div className="viewer-canvas">
              <Canvas
                camera={{ position: [20, 5, 6], fov: 42, near: 0.5, far: 200000 }}
                gl={{ logarithmicDepthBuffer: true }}
                dpr={[1, 1.5]}
              >
                <color attach="background" args={["#101920"]} />
                <ambientLight intensity={1.6} />
                <directionalLight position={[4000, 6000, 5000]} intensity={3} />
                <directionalLight position={[-4000, 2000, -3000]} intensity={1.2} color="#9ed9ca" />

                <Physics gravity={[0, -9.81, 0]}>
                  {terrain ? (
                    <RigidBody
                      key={`terrain-${terrainKey}`}
                      type="fixed"
                      colliders="trimesh"
                      restitution={0}
                      friction={1}
                    >
                      <TerrainSurface terrain={terrain} />
                    </RigidBody>
                  ) : (
                    <gridHelper args={[12, 24, "#42534e", "#273733"]} position={[0, -1.2, 0]} />
                  )}

                  {terrain && <CameraGroundGuard />}

                  {terrainState.loading && (
                    <Html center className="viewer-loading">Loading Mapbox terrain…</Html>
                  )}

                  <Suspense fallback={<Html center className="viewer-loading">Loading GLB…</Html>}>
                    <ViewerErrorBoundary>
                      {terrain ? (
                        <DroppedModel key={`model-${terrainKey}`} url={url} />
                      ) : (
                        <Bounds fit clip observe margin={1.25}>
                          <Center><LoadedModel url={url} /></Center>
                        </Bounds>
                      )}
                    </ViewerErrorBoundary>
                  </Suspense>
                </Physics>

                <OrbitControls
                  makeDefault
                  autoRotate={!terrain}
                  autoRotateSpeed={0.7}
                  enableDamping
                  minDistance={terrain ? 3 : undefined}
                  maxDistance={terrain ? 30000 : undefined}
                />
              </Canvas>
            </div>
            <p className="viewer-hint">Drag to orbit · Scroll to zoom</p>
          </div>
          <SceneControls {...terrainState} />
        </div>
      </section>
    </main>
  );
}