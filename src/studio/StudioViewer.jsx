import { Suspense, useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Bounds, Environment, Html, Lightformer, OrbitControls } from "@react-three/drei";
import { Physics, RigidBody } from "@react-three/rapier";
import ThemeToggle from "../brand/ThemeToggle";
import Backdrop from "./backdrops/Backdrop";
import { findBackdrop, groundFor, STUDIO_SURFACES } from "./backdrops/backdrops";
import SunLight from "./lighting/SunLight";
import FurnishedProperty from "./objects/FurnishedProperty";
import { DroppedModel, LoadedModel } from "./objects/SceneModel";
import ViewerErrorBoundary from "./objects/ViewerErrorBoundary";
import EditorPanel from "./property/editor/EditorPanel";
import PlanEditor from "./property/editor/PlanEditor";
import PropertyAutosave from "./property/PropertyAutosave";
import PropertyCamera from "./property/PropertyCamera";
import { propertySize } from "./property/propertyDocument";
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

export default function StudioViewer({
  url,
  jobId,
  prompt,
  sizeMeters,
  property = null,
  initialScene = null,
  initialUnderlayImages,
  initialEditor,
  persistence = null,
  // A shared property's viewer: no editing, no plan, no furnishing.
  viewOnly = false,
  // Extra header controls (Share for a property's owner, a call to action for viewers).
  headerActions = null,
  backLabel = "Shelf",
  theme = "dark",
  onToggleTheme,
  onBack,
}) {
  const [store] = useState(() => createSceneStore(
    initialScene ?? createSceneDocument({
      objects: url ? [createJobObject(jobId, prompt, sizeMeters)] : [],
      property,
    }),
    { underlayImages: initialUnderlayImages, editor: initialEditor, persistence, readOnly: viewOnly },
  ));
  // Signed URLs expire, so they live beside the document rather than in it.
  const modelUrls = { [jobId]: url };

  // Saving and uploading carry the signed-in token, which is renewed every hour: the
  // store keeps the calls made with the current one.
  useEffect(() => {
    store.setState({ persistence });
  }, [store, persistence]);

  useEffect(() => {
    function handleKeyDown(event) {
      // Keys in a dialog (adding an object) belong to it; viewers have nothing to undo.
      if (event.target instanceof Element && event.target.closest("dialog")) return;
      if (store.getState().readOnly) return;
      const { editor, staging, setStaging, removeObject } = store.getState();
      const inPlan = editor.mode === "plan";
      // Esc steps back: stop placing, then clear the selection, then leave Studio. In
      // the floorplan editor it cancels drawing instead.
      if (event.key === "Escape" && !inPlan) {
        if (staging.placing) setStaging({ placing: null });
        else if (staging.selected) setStaging({ selected: null });
        else onBack();
        return;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && !inPlan && staging.selected
        && !isTextEntry(event.target)) {
        event.preventDefault();
        removeObject(staging.selected);
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
              <span aria-hidden="true">←</span> {backLabel}
            </button>
            <div>
              <span className="eyebrow">
                <span className="eyebrow-dot" /> {viewOnly ? "SHARED PROPERTY · VIEW IN 3D" : "STUDIO · EDIT YOUR SCENE"}
              </span>
              <h2 id="viewer-title">{prompt || "Generated model"}</h2>
              {!viewOnly && <span className="viewer-id">ID · {jobId}</span>}
            </div>
            <div className="viewer-tools">
              {headerActions}
              {persistence && <PropertyAutosave save={persistence.save} />}
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
  const property = useScene((state) => state.document.property);
  const propertyView = useScene((state) => state.propertyView);
  const editorMode = useScene((state) => state.editor.mode);
  const setEditor = useScene((state) => state.setEditor);
  const staging = useScene((state) => state.staging);
  const setStaging = useScene((state) => state.setStaging);
  const setPropertyView = useScene((state) => state.setPropertyView);
  const readOnly = useScene((state) => state.readOnly);
  // Objects placed in a property render with it; any others stand at the centre.
  const looseObjects = objects.filter((object) => !object.placement);
  const terrainStatus = useTerrain(site);
  const terrain = terrainStatus.terrain;
  const scenePreset = SCENE_PRESETS.find((preset) => preset.id === presetId) ?? SCENE_PRESETS[0];
  const modelSize = Math.max(
    ...objects.map((object) => object.sizeMeters),
    property ? propertySize(property) : 0,
  );
  const propertyModel = property && <FurnishedProperty theme={theme} />;
  // An image backdrop lights the scene itself; the preset's light rig is only for the
  // grid and terrain. Its sun still casts the shadows, aimed where the photo's sun is.
  const imageLit = Boolean(backdrop.file);
  const surface = STUDIO_SURFACES[theme] ?? STUDIO_SURFACES.dark;
  const background = scenePreset.id === "studio" ? surface.background : scenePreset.background;

  // A new key per site rebuilds the terrain collider and re-drops the models.
  const siteKey = site ? `${site.latitude},${site.longitude}` : "no-site";

  const modeSwitch = property && !readOnly && (
    <div className="viewer-mode" role="tablist" aria-label="View">
      {[["3d", "3D"], ["plan", "Plan"]].map(([mode, text]) => (
        <button
          key={mode}
          type="button"
          role="tab"
          aria-selected={editorMode === mode}
          className={editorMode === mode ? "is-on" : ""}
          onClick={() => {
            setEditor({ mode, selection: null });
            setStaging({ placing: null, selected: null });
          }}
        >
          {text}
        </button>
      ))}
    </div>
  );

  if (property && editorMode === "plan") {
    return (
      <div className="viewer-workspace">
        <div className="viewer-stage">
          <div className="viewer-canvas is-plan">
            <PlanEditor />
          </div>
          {modeSwitch}
        </div>
        <EditorPanel />
      </div>
    );
  }

  return (
    <div className="viewer-workspace">
      <div className="viewer-stage">
        <div className="viewer-canvas">
          <Canvas
            shadows
            // Buildings read best from a raised 3/4 view; objects from near eye level.
            camera={{ position: property ? [18, 16, 24] : [20, 5, 6], fov: 42, near: 0.5, far: 200000 }}
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
                    <>
                      {/* The site's ground height is y = 0, where the property stands. */}
                      {propertyModel}
                      {looseObjects.map((object) => (
                        <DroppedModel
                          key={`${object.id}-${siteKey}-${object.sizeMeters}`}
                          url={modelUrls[object.source.jobId]}
                          sizeMeters={object.sizeMeters}
                        />
                      ))}
                    </>
                  ) : (
                    // Keyed on model sizes so a resize reframes the camera (not for
                    // objects placed in a property: arranging them keeps the view).
                    <Bounds key={looseObjects.map((object) => object.sizeMeters).join()} fit observe margin={1.25}>
                      {propertyModel}
                      {looseObjects.map((object) => (
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

            {property && <PropertyCamera level={propertyView.level} />}
            <OrbitControls
              makeDefault
              // Holds still while furnishing, so clicks land where they're aimed.
              autoRotate={!terrain && !staging.placing && !staging.selected}
              autoRotateSpeed={0.7}
              enableDamping
              minDistance={terrain ? 3 : undefined}
              // Stay inside the projected ground, and above it when there is no terrain.
              maxDistance={terrain ? 30000 : backdrop.ground ? groundFor(backdrop, modelSize).radius * 0.8 : undefined}
              maxPolarAngle={terrain ? Math.PI : Math.PI / 2 - 0.02}
            />
          </Canvas>
        </div>
        {modeSwitch}
        {staging.placing ? (
          <div className="viewer-placing" role="status">
            <span>Click where it goes: a floor, the roof or the ground outside.</span>
            <div className="viewer-placing-floors" role="group" aria-label="Show floor">
              {[["all", "Whole house"], ...property.levels.map((level, index) => [String(index), level.name])].map(([value, text]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={propertyView.level === value}
                  className={propertyView.level === value ? "is-on" : ""}
                  onClick={() => setPropertyView({ level: value })}
                >
                  {text}
                </button>
              ))}
            </div>
            <button type="button" className="viewer-placing-cancel" onClick={() => setStaging({ placing: null })}>
              Cancel
            </button>
          </div>
        ) : (
          <p className="viewer-hint">{ORBIT_HINT}</p>
        )}
      </div>
      <SceneControls terrainStatus={terrainStatus} />
    </div>
  );
}
