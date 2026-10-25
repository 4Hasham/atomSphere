import { Suspense, useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Bounds, Environment, Html, Lightformer, OrbitControls } from "@react-three/drei";
import { Physics, RigidBody } from "@react-three/rapier";
import ThemeToggle from "../brand/ThemeToggle";
import Backdrop from "./backdrops/Backdrop";
import { findBackdrop, groundFor, STUDIO_SURFACES } from "./backdrops/backdrops";
import SunLight from "./lighting/SunLight";
import { DroppedModel, LoadedModel } from "./objects/SceneModel";
import ViewerErrorBoundary from "./objects/ViewerErrorBoundary";
import { createJobObject, createSceneDocument } from "./sceneDocument";
import { createSceneStore, SceneStoreContext, useScene } from "./sceneStore";
import CameraGroundGuard from "./terrain/CameraGroundGuard";
import TerrainSurface from "./terrain/TerrainSurface";
import useTerrain from "./terrain/useTerrain";
import SceneControls from "./ui/SceneControls";
import { SCENE_PRESETS } from "./weather/scenePresets";
import { LightningFlash, WeatherEffect } from "./weather/WeatherEffect";

// Touch screens pinch to zoom; mice scroll.
const ORBIT_HINT = window.matchMedia("(pointer: coarse)").matches
  ? "Drag to orbit · Pinch to zoom"
  : "Drag to orbit · Scroll to zoom";

function isTextEntry(target) {
  return target instanceof HTMLElement
    && (target.isContentEditable || target.matches("input, textarea"));
}

export default function StudioViewer({ url, jobId, prompt, theme = "dark", onToggleTheme, onBack }) {
  const [store] = useState(() => createSceneStore(
    createSceneDocument({ objects: [createJobObject(jobId, prompt)] }),
  ));
  // Signed URLs expire, so they live beside the document rather than in it.
  const modelUrls = { [jobId]: url };

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        onBack();
        return;
      }
      if (!(event.ctrlKey || event.metaKey) || isTextEntry(event.target)) return;

      const key = event.key.toLowerCase();
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        store.getState().undo();
      } else if ((key === "z" && event.shiftKey) || key === "y") {
        event.preventDefault();
        store.getState().redo();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onBack, store]);

  return (
    <SceneStoreContext value={store}>
      <main className="studio-page">
        <section className="model-viewer" aria-labelledby="viewer-title">
          <header className="viewer-header">
            <button className="studio-back" type="button" onClick={onBack}>
              <span aria-hidden="true">←</span> Shelf
            </button>
            <div>
              <span className="eyebrow"><span className="eyebrow-dot" /> STUDIO · EDIT YOUR SCENE</span>
              <h2 id="viewer-title">{prompt || "Generated model"}</h2>
              <span className="viewer-id">ID · {jobId}</span>
            </div>
            <div className="viewer-tools">
              <span className="studio-wordmark">atomSphere Studio</span>
              <ThemeToggle theme={theme} onToggle={onToggleTheme} className="studio-icon" size={16} />
            </div>
          </header>

          <StudioWorkspace modelUrls={modelUrls} theme={theme} />
        </section>
      </main>
    </SceneStoreContext>
  );
}

function StudioWorkspace({ modelUrls, theme }) {
  const site = useScene((state) => state.document.site);
  const backdrop = findBackdrop(useScene((state) => state.document.backdrop));
  const presetId = useScene((state) => state.document.weather.presetId);
  const objects = useScene((state) => state.document.objects);
  const terrainStatus = useTerrain(site);
  const terrain = terrainStatus.terrain;
  const scenePreset = SCENE_PRESETS.find((preset) => preset.id === presetId) ?? SCENE_PRESETS[0];
  const modelSize = Math.max(...objects.map((object) => object.sizeMeters));
  // An image backdrop lights the scene itself; the preset's light rig is only for the
  // grid and terrain. Its sun still casts the shadows, aimed where the photo's sun is.
  const imageLit = Boolean(backdrop.file);
  const surface = STUDIO_SURFACES[theme] ?? STUDIO_SURFACES.dark;
  const background = scenePreset.id === "studio" ? surface.background : scenePreset.background;

  // A new key per site rebuilds the terrain collider and re-drops the models.
  const siteKey = site ? `${site.latitude},${site.longitude}` : "no-site";

  return (
    <div className="viewer-workspace">
      <div className="viewer-stage">
        <div className="viewer-canvas">
          <Canvas
            shadows
            camera={{ position: [20, 5, 6], fov: 42, near: 0.5, far: 200000 }}
            gl={{ logarithmicDepthBuffer: true }}
            dpr={[1, 1.5]}
          >
            {!imageLit && (
              <>
                <color attach="background" args={[background]} />
                <hemisphereLight
                  args={[scenePreset.ambientColor, "#4b4a43", scenePreset.ambientIntensity]}
                />
                <Environment resolution={256} environmentIntensity={scenePreset.envIntensity}>
                  <color attach="background" args={[background]} />
                  <Lightformer form="rect" intensity={2} color={scenePreset.sunColor} position={[5, 6, 4]} scale={[10, 10, 1]} onUpdate={(l) => l.lookAt(0, 0, 0)} />
                  <Lightformer form="rect" intensity={1} color={scenePreset.fillColor} position={[-6, 3, -4]} scale={[10, 6, 1]} onUpdate={(l) => l.lookAt(0, 0, 0)} />
                  <Lightformer form="ring" intensity={1.5} color={scenePreset.ambientColor} position={[0, 8, 0]} scale={10} onUpdate={(l) => l.lookAt(0, 0, 0)} />
                </Environment>
                <directionalLight
                  position={[-4000, 2000, -3000]}
                  intensity={scenePreset.fillIntensity}
                  color={scenePreset.fillColor}
                />
              </>
            )}
            {scenePreset.fog && <fog attach="fog" args={scenePreset.fog} />}
            <SunLight
              direction={backdrop.sunDirection ?? scenePreset.sunDirection}
              intensity={scenePreset.sunIntensity * (backdrop.sunStrength ?? 1)}
              color={scenePreset.sunColor}
              extent={Math.max(terrain ? 25 : 8, modelSize * 1.5)}
            />
            {!terrain && (
              // A backdrop that fails to download falls back to the grid with a note,
              // rather than taking the whole Studio down with it.
              <ViewerErrorBoundary
                key={backdrop.id}
                logLabel="Failed to load the backdrop image:"
                fallback={(
                  <>
                    <hemisphereLight args={["#ffffff", "#4b4a43", 1.2]} />
                    <Backdrop
                      backdrop={findBackdrop("none")}
                      environmentIntensity={scenePreset.envIntensity}
                      modelSize={modelSize}
                      gridColors={surface.grid}
                    />
                    <Html fullscreen>
                      <p className="viewer-failure viewer-notice" role="alert">
                        Couldn&apos;t load the {backdrop.name} backdrop. Check your connection or pick another one.
                      </p>
                    </Html>
                  </>
                )}
              >
                <Suspense fallback={<Html center className="viewer-loading">Loading backdrop…</Html>}>
                  <Backdrop
                    backdrop={backdrop}
                    environmentIntensity={scenePreset.envIntensity}
                    modelSize={modelSize}
                    gridColors={surface.grid}
                  />
                </Suspense>
              </ViewerErrorBoundary>
            )}
            {scenePreset.weather && <WeatherEffect type={scenePreset.weather} />}
            {scenePreset.weather === "rain" && <LightningFlash />}

            <Physics gravity={[0, -9.81, 0]}>
              {terrain && (
                <RigidBody
                  key={`terrain-${siteKey}`}
                  type="fixed"
                  colliders="trimesh"
                  restitution={0}
                  friction={1}
                >
                  <TerrainSurface terrain={terrain} />
                </RigidBody>
              )}

              {terrain && <CameraGroundGuard />}

              {terrainStatus.loading && (
                <Html center className="viewer-loading">Loading Mapbox terrain…</Html>
              )}

              <Suspense fallback={<Html center className="viewer-loading">Loading GLB…</Html>}>
                <ViewerErrorBoundary>
                  {terrain ? (
                    objects.map((object) => (
                      <DroppedModel
                        key={`${object.id}-${siteKey}-${object.sizeMeters}`}
                        url={modelUrls[object.source.jobId]}
                        sizeMeters={object.sizeMeters}
                      />
                    ))
                  ) : (
                    // Keyed on model sizes so a resize reframes the camera.
                    <Bounds key={objects.map((object) => object.sizeMeters).join()} fit observe margin={1.25}>
                      {objects.map((object) => (
                        <LoadedModel
                          key={object.id}
                          url={modelUrls[object.source.jobId]}
                          sizeMeters={object.sizeMeters}
                        />
                      ))}
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
              // Stay inside the projected ground, and above it when there is no terrain.
              maxDistance={terrain ? 30000 : backdrop.ground ? groundFor(backdrop, modelSize).radius * 0.8 : undefined}
              maxPolarAngle={terrain ? Math.PI : Math.PI / 2 - 0.02}
            />
          </Canvas>
        </div>
        <p className="viewer-hint">{ORBIT_HINT}</p>
      </div>
      <SceneControls terrainStatus={terrainStatus} />
    </div>
  );
}
