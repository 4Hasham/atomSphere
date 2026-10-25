import { Suspense, useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Bounds, Center, Environment, Html, Lightformer, OrbitControls } from "@react-three/drei";
import { Physics, RigidBody } from "@react-three/rapier";
import { SceneBackdrop } from "./backdrops/SceneBackdrop";
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

function isTextEntry(target) {
  return target instanceof HTMLElement
    && (target.isContentEditable || target.matches("input, textarea"));
}

export default function StudioViewer({ url, jobId, prompt, onBack }) {
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
              <span aria-hidden="true">←</span> Workspace
            </button>
            <div>
              <span className="eyebrow"><span className="eyebrow-dot" /> STUDIO · EDIT YOUR SCENE</span>
              <h2 id="viewer-title">{prompt || "Generated model"}</h2>
              <span className="viewer-id">ID · {jobId}</span>
            </div>
            <span className="studio-wordmark">atomSphere Studio</span>
          </header>

          <StudioWorkspace modelUrls={modelUrls} />
        </section>
      </main>
    </SceneStoreContext>
  );
}

function StudioWorkspace({ modelUrls }) {
  const site = useScene((state) => state.document.site);
  const backdrop = useScene((state) => state.document.backdrop);
  const presetId = useScene((state) => state.document.weather.presetId);
  const objects = useScene((state) => state.document.objects);
  const terrainStatus = useTerrain(site);
  const terrain = terrainStatus.terrain;
  const scenePreset = SCENE_PRESETS.find((preset) => preset.id === presetId) ?? SCENE_PRESETS[0];

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
            <color attach="background" args={[scenePreset.background]} />
            {scenePreset.fog && <fog attach="fog" args={scenePreset.fog} />}
            <hemisphereLight
              args={[scenePreset.ambientColor, "#4b4a43", scenePreset.ambientIntensity]}
            />
            <SunLight
              direction={scenePreset.sunDirection}
              intensity={scenePreset.sunIntensity}
              color={scenePreset.sunColor}
              extent={terrain || backdrop !== "none" ? 25 : 8}
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
            {!terrain && <SceneBackdrop type={backdrop} />}
            {scenePreset.weather && <WeatherEffect type={scenePreset.weather} />}
            {scenePreset.weather === "rain" && <LightningFlash />}

            <Physics gravity={[0, -9.81, 0]}>
              {terrain ? (
                <RigidBody
                  key={`terrain-${siteKey}`}
                  type="fixed"
                  colliders="trimesh"
                  restitution={0}
                  friction={1}
                >
                  <TerrainSurface terrain={terrain} />
                </RigidBody>
              ) : backdrop === "none" && (
                <gridHelper args={[12, 24, "#42534e", "#273733"]} position={[0, -1.2, 0]} />
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
                        key={`${object.id}-${siteKey}`}
                        url={modelUrls[object.source.jobId]}
                      />
                    ))
                  ) : (
                    <Bounds fit clip observe margin={1.25}>
                      <Center>
                        {objects.map((object) => (
                          <LoadedModel key={object.id} url={modelUrls[object.source.jobId]} />
                        ))}
                      </Center>
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
      <SceneControls terrainStatus={terrainStatus} />
    </div>
  );
}
