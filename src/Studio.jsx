import { lazy, Suspense, useEffect, useState } from "react";
import { apiRequest } from "./api";

const MODEL_URL_API_URL = `${import.meta.env.VITE_API_URL}/requests/model-url`;
const StudioViewer = lazy(() => import("./studio/StudioViewer"));

export default function Studio({ accessToken, jobId, prompt, theme, onBack }) {
  const [model, setModel] = useState(null);
  const [error, setError] = useState(jobId ? "" : "No model was selected for Studio.");
  const [loading, setLoading] = useState(Boolean(jobId));

  useEffect(() => {
    let active = true;

    async function loadModel() {
      try {
        const result = await apiRequest(MODEL_URL_API_URL, accessToken, {
          method: "POST",
          body: JSON.stringify({ job_id: jobId }),
        });
        const url = result.url || result.presignedUrl || result.presigned_url;
        if (!url) throw new Error("The model URL service returned no signed URL.");
        if (active) {
          setModel({ url, jobId, prompt });
          setError("");
        }
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Could not load this model.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    if (jobId) loadModel();
    return () => {
      active = false;
    };
  }, [accessToken, jobId, prompt]);

  if (model) {
    return (
      <Suspense fallback={<StudioStatus onBack={onBack} message="Preparing Studio…" />}>
        <StudioViewer
          key={model.jobId}
          jobId={model.jobId}
          prompt={model.prompt}
          url={model.url}
          theme={theme}
          onBack={onBack}
        />
      </Suspense>
    );
  }

  return (
    <StudioStatus
      onBack={onBack}
      message={loading ? "Loading your model…" : error}
      isError={!loading && Boolean(error)}
    />
  );
}

export function StudioStatus({ onBack, message, isError = false }) {
  return (
    <main className="studio-page">
      <header className="studio-topbar">
        <button className="studio-back" type="button" onClick={onBack}>← Back to shelf</button>
        <span className="studio-wordmark">atomSphere STUDIO</span>
      </header>
      <section className="studio-status">
        {isError && <span className="eyebrow">COULD NOT OPEN STUDIO</span>}
        <p className={isError ? "studio-load-error" : "requests-state"} role={isError ? "alert" : "status"}>
          {message}
        </p>
      </section>
    </main>
  );
}
