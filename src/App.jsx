import { Suspense, useEffect, useState } from "react";
import { useAuth } from "react-oidc-context";
import Studio, { StudioStatus } from "./Studio";
import "./App.css";

const API_URL = import.meta.env.VITE_API_URL;
const JOBS_API_URL = `${API_URL}/requests`;
const MAX_FILE_SIZE = 4 * 1024 * 1024;
const MULTIVIEW_NAMES = ["front", "left", "back"];
const MODEL_CATEGORIES = [
  { value: "building_structure", label: "Building / structure" },
  { value: "mechanical_device", label: "Mechanical device" },
  { value: "home_appliance", label: "Home utility / appliance" },
  { value: "vehicle", label: "Vehicle" },
  { value: "furniture_decor", label: "Furniture / decor" },
  { value: "consumer_product", label: "Consumer product" },
  { value: "character_creature", label: "Character / creature" },
  { value: "nature_landscape", label: "Nature / landscape" },
  { value: "other", label: "Other" },
];
const ACTIVE_STATUSES = new Set(["uploading", "queued", "processing", "running"]);

function statusGroup(status) {
  const value = String(status || "unknown").toLowerCase();
  if (ACTIVE_STATUSES.has(value)) return "active";
  if (["generated", "complete", "completed"].includes(value)) return "ready";
  if (["failed", "error"].includes(value)) return "failed";
  return "all";
}

function statusLabel(status) {
  const labels = {
    uploading: "Uploading input",
    queued: "Queued",
    processing: "Generating model",
    running: "Generating model",
    generated: "Ready",
    complete: "Ready",
    completed: "Ready",
    failed: "Failed",
    error: "Failed",
  };
  return labels[String(status || "unknown").toLowerCase()] || "Status unknown";
}

async function apiRequest(url, accessToken, options = {}) {
  if (!url) {
    throw new Error("This feature needs its API URL configured.");
  }

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || `Request failed (${response.status})`);
  }

  return result;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const dataUrl = reader.result;
      resolve(dataUrl.slice(dataUrl.indexOf(",") + 1));
    };

    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function UploadForm({ getAccessToken, onJobCreated }) {
  const [inputMode, setInputMode] = useState("single");
  const [file, setFile] = useState(null);
  const [viewFiles, setViewFiles] = useState({ front: null, left: null, back: null });
  const [prompt, setPrompt] = useState("");
  const [category, setCategory] = useState("");
  const [message, setMessage] = useState(null);
  const [isUploading, setIsUploading] = useState(false);

  function handleFileChange(event) {
    setFile(event.target.files?.[0] ?? null);
    setMessage(null);
  }

  function handleViewFileChange(view, event) {
    setViewFiles((current) => ({ ...current, [view]: event.target.files?.[0] ?? null }));
    setMessage(null);
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!category) {
      setMessage({ type: "error", text: "Choose a category for your model." });
      return;
    }

    if (inputMode === "single" && !file) {
      setMessage({
        type: "error",
        text: "Choose an image to get started.",
      });
      return;
    }

    if (inputMode === "multiview" && MULTIVIEW_NAMES.some((view) => !viewFiles[view])) {
      setMessage({ type: "error", text: "Add front, left, and back images for multiview generation." });
      return;
    }

    if (inputMode === "prompt" && !prompt.trim()) {
      setMessage({
        type: "error",
        text: "Describe your model to get started.",
      });
      return;
    }

    const uploadSize = inputMode === "single"
      ? file?.size || 0
      : inputMode === "multiview"
        ? MULTIVIEW_NAMES.reduce((total, view) => total + (viewFiles[view]?.size || 0), 0)
        : 0;
    if (uploadSize > MAX_FILE_SIZE) {
      setMessage({ type: "error", text: "Images must total 4 MiB or less per request." });
      return;
    }

    try {
      setIsUploading(true);
      setMessage({
        type: "loading",
        text: inputMode === "single"
          ? "Uploading your image…"
          : inputMode === "multiview"
            ? "Uploading your views…"
            : "Sending your description…",
      });

      const fileBase64 = inputMode === "single" && file ? await fileToBase64(file) : undefined;
      const views = {};
      if (inputMode === "multiview") {
        for (const view of MULTIVIEW_NAMES) {
          views[view] = {
            contentType: viewFiles[view].type,
            fileBase64: await fileToBase64(viewFiles[view]),
          };
        }
      }
      const accessToken = await getAccessToken();
      const response = await fetch(`${API_URL}/meteoclone-add-request`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          inputMode,
          category,
          prompt: inputMode === "prompt" ? prompt.trim() : "",
          ...(inputMode === "single" && file && {
            contentType: file.type,
            fileBase64,
          }),
          ...(inputMode === "multiview" && { views }),
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || `Request failed (${response.status})`);
      }

      setMessage({
        type: "success",
        text: "Your request is in the pipeline.",
      });
      onJobCreated();
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Something went wrong. Please try again.",
      });
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <form className="upload-form" onSubmit={handleSubmit}>
      <div className="form-heading">
        <span className="step-label">01 <span>—</span> YOUR INPUT</span>
        <h2>Bring your idea to life.</h2>
        <p>Choose one way to get started: an image or a written description.</p>
      </div>

      <div className="field-group category-field">
        <label className="field-label" htmlFor="model-category">What are you creating?</label>
        <select
          id="model-category"
          className="category-select"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          required
        >
          <option value="" disabled>Select a category</option>
          {MODEL_CATEGORIES.map((option) => (
            <option value={option.value} key={option.value}>{option.label}</option>
          ))}
        </select>
      </div>

      <div className="input-mode" role="group" aria-label="Choose your input type">
        <button
          className={`mode-button${inputMode === "single" ? " active" : ""}`}
          type="button"
          aria-pressed={inputMode === "single"}
          onClick={() => {
            setInputMode("single");
            setMessage(null);
          }}
        >
          Single image
        </button>
        <button
          className={`mode-button${inputMode === "multiview" ? " active" : ""}`}
          type="button"
          aria-pressed={inputMode === "multiview"}
          onClick={() => {
            setInputMode("multiview");
            setMessage(null);
          }}
        >
          Multi-view
        </button>
        <button
          className={`mode-button${inputMode === "prompt" ? " active" : ""}`}
          type="button"
          aria-pressed={inputMode === "prompt"}
          onClick={() => {
            setInputMode("prompt");
            setMessage(null);
          }}
        >
          <span aria-hidden="true">Aa</span> Text prompt
        </button>
      </div>

      {inputMode === "single" ? (
        <div className="field-group">
          <label className="field-label" htmlFor="image-upload">
            Your image <span>JPG, PNG, or WEBP · up to 4 MiB</span>
          </label>
          <label className={`upload-zone${file ? " has-file" : ""}`} htmlFor="image-upload">
            <input
              id="image-upload"
              className="visually-hidden"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileChange}
              required
            />
            <span className="upload-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 15.5v3A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-3" />
              </svg>
            </span>
            <span className="upload-copy">
              <strong>{file ? file.name : "Drop your image here"}</strong>
              <span>
                {file
                  ? `${(file.size / (1024 * 1024)).toFixed(2)} MiB · Choose another`
                  : "or click to browse files"}
              </span>
            </span>
            <span className="browse-button">{file ? "Replace" : "Browse"}</span>
          </label>
        </div>
      ) : inputMode === "multiview" ? (
        <div className="field-group">
          <label className="field-label">
            Reference views <span>Front, left, and back · combined 4 MiB max</span>
          </label>
          <div className="multiview-inputs">
            {MULTIVIEW_NAMES.map((view) => {
              const viewFile = viewFiles[view];
              return (
                <label className={`view-upload${viewFile ? " has-file" : ""}`} htmlFor={`view-${view}`} key={view}>
                  <input
                    id={`view-${view}`}
                    className="visually-hidden"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) => handleViewFileChange(view, event)}
                    required
                  />
                  <span className="view-name">{view}</span>
                  <strong>{viewFile?.name || "Choose image"}</strong>
                  <span className="view-size">
                    {viewFile ? `${(viewFile.size / (1024 * 1024)).toFixed(2)} MiB` : "JPG · PNG · WEBP"}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="field-group">
          <label className="field-label" htmlFor="model-prompt">
            Describe your 3D model
          </label>
          <textarea
            id="model-prompt"
            className="prompt-input"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="A small ceramic house with a mossy green roof…"
            rows={5}
            required
          />
        </div>
      )}

      <button className="submit-button" type="submit" disabled={isUploading}>
        <span>{isUploading ? "Preparing your model…" : "Generate my 3D model"}</span>
        {!isUploading && <span aria-hidden="true">↗</span>}
        {isUploading && <span className="button-spinner" aria-hidden="true" />}
      </button>

      {message && (
        <p className={`form-message ${message.type}`} role={message.type === "error" ? "alert" : "status"}>
          {message.text}
        </p>
      )}

      <p className="form-footnote">
        {inputMode === "multiview"
          ? "Three reference angles help preserve the shape around the whole model."
          : "Only your selected input is used to generate your model."}
      </p>
    </form>
  );
}

function normalizeJobs(result) {
  const jobs = Array.isArray(result) ? result : result.jobs || result.items || [];
  return jobs.map((job) => ({
    ...job,
    jobId: job.job_id || job.jobId,
    createdAt: job.created_at || job.createdAt,
    outputKey: job.output_key || job.outputKey,
  }));
}

function RequestHistory({ accessToken, refreshKey, onViewModel }) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [manualRefresh, setManualRefresh] = useState(0);
  const [pipelineOpen, setPipelineOpen] = useState(true);

  useEffect(() => {
    let active = true;
    let inFlight = false;

    async function loadJobs() {
      if (inFlight) return;
      inFlight = true;
      try {
        const result = await apiRequest(JOBS_API_URL, accessToken);
        if (active) {
          setJobs(normalizeJobs(result));
          setError("");
        }
      } catch (loadError) {
        if (active) setError(loadError.message);
      } finally {
        inFlight = false;
        if (active) setLoading(false);
      }
    }

    loadJobs();
    const intervalId = window.setInterval(loadJobs, 15000);
    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [accessToken, manualRefresh, refreshKey]);

  const activeJobs = jobs
    .filter((job) => statusGroup(job.status) === "active")
    .sort((first, second) => new Date(second.createdAt || 0) - new Date(first.createdAt || 0));
  const readyJobs = jobs.filter((job) => statusGroup(job.status) === "ready");
  const failedJobs = jobs.filter((job) => statusGroup(job.status) === "failed");
  const filteredJobs = jobs.filter((job) => filter === "all" || statusGroup(job.status) === filter);
  const filters = [
    { id: "all", label: "All", count: jobs.length },
    { id: "active", label: "Active", count: activeJobs.length },
    { id: "ready", label: "Ready", count: readyJobs.length },
    { id: "failed", label: "Failed", count: failedJobs.length },
  ];

  return (
    <>
      {activeJobs.length > 0 && (
        <aside className={`pipeline-panel${pipelineOpen ? "" : " is-collapsed"}`} aria-label="Active requests" aria-live="polite">
          <div className="pipeline-heading">
            <div className="pipeline-title-wrap">
              <span className="pipeline-pulse" aria-hidden="true" />
              <div>
                <span className="pipeline-kicker">LIVE PIPELINE</span>
                <strong>{activeJobs.length} {activeJobs.length === 1 ? "request" : "requests"} in progress</strong>
              </div>
            </div>
            <button
              className="pipeline-toggle"
              type="button"
              aria-expanded={pipelineOpen}
              aria-label={pipelineOpen ? "Collapse active requests" : "Expand active requests"}
              onClick={() => setPipelineOpen((open) => !open)}
            >
              {pipelineOpen ? "−" : "+"}
            </button>
          </div>
          {pipelineOpen && (
            <div className="pipeline-list">
              {activeJobs.slice(0, 4).map((job) => {
                const status = String(job.status || "unknown").toLowerCase();
                return (
                  <article className="pipeline-item" key={job.jobId}>
                    <div className="pipeline-item-top">
                      <strong>{job.prompt || job.input_key?.split("/").at(-1) || "Image-based model"}</strong>
                      <span className={`pipeline-status status-${status}`}>{statusLabel(status)}</span>
                    </div>
                    <span className="pipeline-id">ID · {job.jobId}</span>
                    <div className={`pipeline-track stage-${status}`} aria-hidden="true">
                      <span /><span /><span />
                    </div>
                  </article>
                );
              })}
              {activeJobs.length > 4 && (
                <span className="pipeline-more">+{activeJobs.length - 4} more active</span>
              )}
            </div>
          )}
        </aside>
      )}

      <section className="requests-section" aria-labelledby="requests-title">
        <div className="requests-heading">
          <div>
            <span className="eyebrow"><span className="eyebrow-dot" /> YOUR WORK</span>
            <h2 id="requests-title">Request history</h2>
          </div>
          <button
            className="refresh-requests"
            type="button"
            aria-label="Refresh requests"
            title="Refresh requests"
            onClick={() => setManualRefresh((value) => value + 1)}
          >
            <span aria-hidden="true">↻</span> Refresh
          </button>
        </div>

        <div className="history-toolbar">
          <div className="history-filters" role="group" aria-label="Filter request history">
            {filters.map((item) => (
              <button
                className={`history-filter${filter === item.id ? " active" : ""}`}
                key={item.id}
                type="button"
                aria-pressed={filter === item.id}
                onClick={() => setFilter(item.id)}
              >
                {item.label}<span>{item.count}</span>
              </button>
            ))}
          </div>
          <span className="request-count">{filteredJobs.length} shown</span>
        </div>

        {loading && <p className="requests-state">Loading your requests…</p>}
        {!loading && error && <p className="requests-state requests-error" role="alert">{error}</p>}
        {!loading && !error && filteredJobs.length === 0 && (
          <p className="requests-state">
            {jobs.length === 0 ? "Your requests will appear here." : `No ${filter} requests yet.`}
          </p>
        )}

        {filteredJobs.length > 0 && (
          <div className="request-list">
            {filteredJobs.map((job) => {
              const status = String(job.status || "unknown").toLowerCase();
              const canView = statusGroup(status) === "ready";
              return (
                <article className="request-row" key={`${job.jobId}-${job.createdAt || ""}`}>
                  <div className="request-main">
                    <strong className="request-description">
                      {job.prompt || job.input_key?.split("/").at(-1) || "Image-based model"}
                    </strong>
                    <span className="request-id">ID · {job.jobId}</span>
                    <time className="request-date" dateTime={job.createdAt || undefined}>
                      {job.createdAt ? new Date(job.createdAt).toLocaleString() : "Date unavailable"}
                    </time>
                  </div>
                  <div className="request-actions">
                    <span className={`status-pill status-${status}`}>{statusLabel(status)}</span>
                    {canView && (
                      <button
                        className="view-model-button"
                        onClick={() => onViewModel(job)}
                      >
                        View model <span aria-hidden="true">↗</span>
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}

function App() {
  const auth = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const [pathname, setPathname] = useState(window.location.pathname);
  const [studioError, setStudioError] = useState("");

  useEffect(() => {
    function handlePopState() {
      setPathname(window.location.pathname);
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    document.title = pathname === "/studio"
      ? "Studio — atomSphere"
      : "atomSphere — Make something out of this world";
  }, [pathname]);

  function openModel(job) {
    setStudioError("");
    const params = new URLSearchParams({
      job: job.jobId,
      prompt: job.prompt || job.input_key?.split("/").at(-1) || "Image-based model",
    });
    const studioWindow = window.open(`/studio?${params}`, "_blank");
    if (studioWindow) {
      studioWindow.opener = null;
    } else {
      setStudioError("Allow pop-ups for this site to open your model in Studio.");
    }
  }

  function leaveStudio() {
    window.history.pushState({}, "", "/");
    setPathname("/");
  }

  if (auth.isLoading) {
    return (
      <main className="auth-screen">
        <div className="loading-indicator" aria-label="Loading your account" />
        <p>Checking your skies…</p>
      </main>
    );
  }

  if (auth.error) {
    return (
      <main className="auth-screen">
        <p className="auth-error">We couldn’t sign you in: {auth.error.message}</p>
        <button className="text-button" onClick={() => auth.signinRedirect()}>
          Try again
        </button>
      </main>
    );
  }

  if (!auth.isAuthenticated) {
    return (
      <main className="auth-screen">
        <div className="login-card">
          <Brand />
          <span className="eyebrow">A NEW KIND OF FORECAST</span>
          <h1>Your imagination,<br />in another dimension.</h1>
          <p>Turn an image or a written idea into a detailed 3D model with a little help from the cloud.</p>
          <button className="submit-button" onClick={() => auth.signinRedirect()}>
            <span>Sign in to get started</span><span aria-hidden="true">↗</span>
          </button>
        </div>
      </main>
    );
  }

  if (pathname === "/studio") {
    const params = new URLSearchParams(window.location.search);
    const jobId = params.get("job");
    const prompt = params.get("prompt") || "Generated model";

    return (
      <Suspense fallback={<StudioStatus onBack={leaveStudio} message="Preparing Studio…" />}>
        <Studio
          key={jobId || "missing-job"}
          accessToken={auth.user?.access_token}
          jobId={jobId}
          prompt={prompt}
          onBack={leaveStudio}
        />
      </Suspense>
    );
  }

  const email = auth.user?.profile.email;

  return (
    <main className="app-shell">
      <header className="topbar">
        <Brand />
        <div className="account-area">
          <span className="account-email">{email}</span>
          <button className="text-button" onClick={() => auth.removeUser()}>
            Sign out
          </button>
        </div>
      </header>

      <section className="workspace">
        <div className="intro">
          <span className="eyebrow"><span className="eyebrow-dot" /> YOUR CREATIVE WEATHER</span>
          <h1>Make something<br /><span>out of this world.</span></h1>
          <p>Start with an image or a written idea. Pick one and let the forecast unfold.</p>
          <div className="forecast-note">
            <span className="sun-mark" aria-hidden="true">✳</span>
            <span><strong>Conditions are looking creative.</strong><br />Your next idea is just a few clicks away.</span>
          </div>
        </div>

        <UploadForm
          getAccessToken={() => auth.user?.access_token}
          onJobCreated={() => setRefreshKey((value) => value + 1)}
        />
      </section>

      <RequestHistory
        accessToken={auth.user?.access_token}
        refreshKey={refreshKey}
        onViewModel={openModel}
      />
      {studioError && <p className="viewer-error" role="alert">{studioError}</p>}

      <footer className="page-footer">
        <span>atomSphere STUDIO</span>
        <span>Good ideas are in the air.</span>
      </footer>
    </main>
  );
}

function Brand() {
  return (
    <a className="brand" href="/" aria-label="atomSphere home">
      <span className="brand-mark" aria-hidden="true">✳</span>
      <span>atom<span>Sphere</span></span>
    </a>
  );
}

export default App;
