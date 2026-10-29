import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest } from "./api";
import { StudioStatus } from "./Studio";
import { CREATE_JOB_URL, MODEL_URL_API_URL } from "./stage/model";
import { loadProperty, readPlan, saveProperty, shareProperty, unshareProperty, uploadPlanImage } from "./stage/propertyApi";
import useJobs from "./stage/useJobs";
import { ObjectLibraryContext } from "./studio/objects/objectLibrary";
import ShareButton from "./studio/property/ShareDialog";
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
  const [shareToken, setShareToken] = useState(null);

  useEffect(() => {
    let active = true;
    loadProperty(accessToken, propertyId)
      .then((result) => {
        if (!active) return;
        const saved = result.scene ?? {};
        const scene = {
          ...createSceneDocument({ property: createEmptyProperty() }),
          ...saved,
          // Only objects placed in the house belong to it.
          objects: (saved.objects ?? []).filter((object) => object.placement),
        };
        // Each floor's plan image, by level id, from the signed URLs.
        const underlayImages = {};
        scene.property.levels.forEach((level) => {
          const url = level.underlay?.imageKey && result.imageUrls?.[level.underlay.imageKey];
          if (url) underlayImages[level.id] = url;
        });
        setLoaded({ title: result.title, scene, underlayImages, editor: openingEditor(scene.property) });
        setShareToken(result.shareToken ?? null);
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
    readPlan: (image) => readPlan(accessToken, image),
  }), [save, accessToken, propertyId]);

  // The user's objects (made or uploaded), to furnish the property with.
  const { jobs, loading: jobsLoading, reload } = useJobs(accessToken);
  const library = useMemo(() => ({
    jobs,
    jobsLoading,
    reload,
    token: accessToken,
    getModelUrl: async (jobId) => {
      const result = await apiRequest(MODEL_URL_API_URL, accessToken, {
        method: "POST",
        body: JSON.stringify({ job_id: jobId }),
      });
      if (!result.url) throw new Error("The model URL service returned no signed URL.");
      return result.url;
    },
    createObject: (body) => apiRequest(CREATE_JOB_URL, accessToken, { method: "POST", body: JSON.stringify(body) }),
  }), [jobs, jobsLoading, reload, accessToken]);

  const sharing = {
    token: shareToken,
    title: loaded?.title ?? "",
    share: async () => setShareToken(await shareProperty(accessToken, propertyId)),
    unshare: async () => {
      await unshareProperty(accessToken, propertyId);
      setShareToken(null);
    },
  };

  if (error) return <StudioStatus onBack={onBack} message={error} isError />;
  if (!loaded) return <StudioStatus onBack={onBack} message="Opening your property…" />;

  return (
    <ObjectLibraryContext value={library}>
      <Suspense fallback={<StudioStatus onBack={onBack} message="Preparing Studio…" />}>
        <StudioViewer
          jobId={propertyId}
          prompt={loaded.title}
          initialScene={loaded.scene}
          initialUnderlayImages={loaded.underlayImages}
          initialEditor={loaded.editor}
          persistence={persistence}
          headerActions={<ShareButton sharing={sharing} />}
          theme={theme}
          onToggleTheme={onToggleTheme}
          onBack={onBack}
        />
      </Suspense>
    </ObjectLibraryContext>
  );
}
