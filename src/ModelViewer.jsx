import { Component, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Bounds, Center, Environment, Html, Lightformer, OrbitControls, useGLTF } from "@react-three/drei";
import { Physics, RigidBody, useRapier } from "@react-three/rapier";
import {
  Box3,
  BufferGeometry,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Vector3,
} from "three";
import SceneControls, { TerrainSurface } from "./SceneControls";
import { SceneBackdrop } from "./SceneBackdrop";
import useTerrain from "./useTerrain";
import { SCENE_PRESETS } from "./scenePresets";

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
    clone.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        if (child.material) child.material.envMapIntensity = 1.2;
      }
    });
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
        <LoadedModel url={url} terrainBackdrop />
      </group>
    </RigidBody>
  );
}

// Directional sun whose tight shadow frustum follows the orbit target, so the car gets
// crisp, high-resolution shadows no matter how large or far-away the scene is.
function SunLight({ direction, color, intensity, extent }) {
  const light = useRef();
  const dir = useMemo(() => new Vector3(...direction).normalize(), [direction]);

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

function WeatherEffect({ type }) {
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

function LightningFlash() {
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
  const [scenePresetId, setScenePresetId] = useState("studio");
  const [sceneBackground, setSceneBackground] = useState("none");
  const scenePreset = SCENE_PRESETS.find((preset) => preset.id === scenePresetId)
    ?? SCENE_PRESETS[0];

  // New key whenever the terrain changes: rebuilds the collider and re-drops the car.
  const terrainKey = useMemo(() => ++terrainVersion, []);

  // A real-world terrain and the procedural City/Mountains scene occupy the same
  // origin, so they must never be active together (the backdrop would loom over
  // the model). Loading terrain clears the preset background; choosing a preset
  // background clears the terrain.
  function handleTerrainSubmit(event) {
    const started = terrainState.handleSubmit(event);
    if (started) setSceneBackground("none");
  }

  function handleSceneBackgroundChange(nextBackground) {
    if (nextBackground !== "none" && terrainState.terrain) {
      terrainState.clearTerrain();
    }
    setSceneBackground(nextBackground);
  }

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
                shadows
                camera={{ position: [20, 5, 6], fov: 42, near: 0.5, far: 200000 }}
                gl={{ logarithmicDepthBuffer: true }}
                dpr={[1, 1.5]}
              >
                <color attach="background" args={[scenePreset.background]} />
                {scenePreset.fog && <fog attach="fog" args={scenePreset.fog} />}
                <hemisphereLight
                  args={[scenePreset.ambientColor, "#4b4a43", scenePreset.ambientIntensity]}
                />
                <SunLight
                  direction={scenePreset.sunDirection}
                  intensity={scenePreset.sunIntensity}
                  color={scenePreset.sunColor}
                  extent={terrain || sceneBackground !== "none" ? 25 : 8}
                />
                <Environment resolution={256} environmentIntensity={scenePreset.envIntensity}>
                  <color attach="background" args={[scenePreset.background]} />
                  <Lightformer form="rect" intensity={2} color={scenePreset.sunColor} position={[5, 6, 4]} scale={[10, 10, 1]} onUpdate={(l) => l.lookAt(0, 0, 0)} />
                  <Lightformer form="rect" intensity={1} color={scenePreset.fillColor} position={[-6, 3, -4]} scale={[10, 6, 1]} onUpdate={(l) => l.lookAt(0, 0, 0)} />
                  <Lightformer form="ring" intensity={1.5} color={scenePreset.ambientColor} position={[0, 8, 0]} scale={10} onUpdate={(l) => l.lookAt(0, 0, 0)} />
                </Environment>
                <directionalLight
                  position={[-4000, 2000, -3000]}
                  intensity={scenePreset.fillIntensity}
                  color={scenePreset.fillColor}
                />
                {!terrain && <SceneBackdrop type={sceneBackground} />}
                {scenePreset.weather && <WeatherEffect type={scenePreset.weather} />}
                {scenePreset.weather === "rain" && <LightningFlash />}

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
                  ) : sceneBackground === "none" && (
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
          <SceneControls
            {...terrainState}
            handleSubmit={handleTerrainSubmit}
            scenePreset={scenePresetId}
            onScenePresetChange={setScenePresetId}
            sceneBackground={sceneBackground}
            onSceneBackgroundChange={handleSceneBackgroundChange}
          />
        </div>
      </section>
    </main>
  );
}