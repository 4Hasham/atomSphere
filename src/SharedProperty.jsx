import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { StudioStatus } from "./Studio";
import { loadSharedProperty } from "./stage/propertyApi";
import { ObjectLibraryContext } from "./studio/objects/objectLibrary";
import { createSceneDocument } from "./studio/sceneDocument";

const StudioViewer = lazy(() => import("./studio/StudioViewer"));

/**
 * /p/<token>: a property someone shared, for anyone with the link. The same 3D view as
 * Studio, view-only; its objects' models come signed with the property (shared.js).
 */
export default function SharedProperty({ token, theme, onToggleTheme, onHome, onStart }) {
  const [loaded, setLoaded] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    loadSharedProperty(token)
      .then((result) => {
        if (active) setLoaded(result);
      })
      .catch((loadError) => {
        if (active) setError(loadError.message);
      });
    return () => {
      active = false;
    };
  }, [token]);

  // The placed objects' models, as a library whose jobs are all ready.
  const library = useMemo(() => loaded && {
    jobs: Object.keys(loaded.modelUrls).map((jobId) => ({ jobId, status: "generated" })),
    jobsLoading: false,
    reload: () => {},
    getModelUrl: async (jobId) => loaded.modelUrls[jobId],
    token: null,
  }, [loaded]);

  if (error) return <StudioStatus onBack={onHome} message={error} isError />;
  if (!loaded) return <StudioStatus onBack={onHome} message="Opening the property…" />;

  return (
    <ObjectLibraryContext value={library}>
      <Suspense fallback={<StudioStatus onBack={onHome} message="Preparing the 3D view…" />}>
        <StudioViewer
          viewOnly
          prompt={loaded.title}
          // Fields the saved scene doesn't have keep Studio's defaults.
          initialScene={{
            ...createSceneDocument(),
            ...Object.fromEntries(Object.entries(loaded.scene).filter(([, value]) => value != null)),
          }}
          initialEditor={{ mode: "3d" }}
          backLabel="atomSphere"
          headerActions={(
            <button type="button" className="studio-share is-on" onClick={onStart}>
              Make your own
            </button>
          )}
          theme={theme}
          onToggleTheme={onToggleTheme}
          onBack={onHome}
        />
      </Suspense>
    </ObjectLibraryContext>
  );
}
