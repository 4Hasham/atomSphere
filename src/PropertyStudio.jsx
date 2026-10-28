import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { StudioStatus } from "./Studio";
import { loadProperty, saveProperty, uploadPlanImage } from "./stage/propertyApi";
import { createEmptyProperty } from "./studio/property/propertyEdits";
import { createSceneDocument } from "./studio/sceneDocument";

const StudioViewer = lazy(() => import("./studio/StudioViewer"));

/** How a property opens: a traced house in 3D; otherwise the plan, ready for the next step. */
function openingEditor(property) {
  const uncalibrated = property.levels.some((level) => level.underlay && !level.underlay.calibrated);
  const traced = property.levels.some((level) => level.walls.length > 0);
  if (uncalibrated) return { mode: "plan", tool: "scale" };
  if (traced) return { mode: "3d", tool: "select" };
  return { mode: "plan", tool: "wall" };
}

/** Loads a saved property (owner only) and opens it in Studio, saving as it changes. */
export default function PropertyStudio({ accessToken, propertyId, theme, onToggleTheme, onBack }) {
  const [loaded, setLoaded] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    loadProperty(accessToken, propertyId)
      .then((result) => {
        if (!active) return;
        const scene = { ...createSceneDocument({ property: createEmptyProperty() }), ...(result.scene ?? {}), objects: [] };
        // Each floor's plan image, by level id, from the signed URLs.
        const underlayImages = {};
        scene.property.levels.forEach((level) => {
          const url = level.underlay?.imageKey && result.imageUrls?.[level.underlay.imageKey];
          if (url) underlayImages[level.id] = url;
        });
        setLoaded({ title: result.title, scene, underlayImages, editor: openingEditor(scene.property) });
      })
      .catch((loadError) => {
        if (active) setError(loadError.message || "Couldn't open this property.");
      });
    return () => {
      active = false;
    };
  }, [accessToken, propertyId]);

  const save = useCallback((scene) => saveProperty(accessToken, propertyId, scene), [accessToken, propertyId]);
  const persistence = useMemo(() => ({
    save,
    uploadPlanImage: (levelId, blob, onProgress) => uploadPlanImage(accessToken, propertyId, levelId, blob, onProgress),
  }), [save, accessToken, propertyId]);

  if (error) return <StudioStatus onBack={onBack} message={error} isError />;
  if (!loaded) return <StudioStatus onBack={onBack} message="Opening your property…" />;

  return (
    <Suspense fallback={<StudioStatus onBack={onBack} message="Preparing Studio…" />}>
      <StudioViewer
        jobId={propertyId}
        prompt={loaded.title}
        initialScene={loaded.scene}
        initialUnderlayImages={loaded.underlayImages}
        initialEditor={loaded.editor}
        persistence={persistence}
        theme={theme}
        onToggleTheme={onToggleTheme}
        onBack={onBack}
      />
    </Suspense>
  );
}
