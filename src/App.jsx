import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "react-oidc-context";
import Studio, { StudioStatus } from "./Studio";
import useMediaQuery from "./useMediaQuery";
import useTheme from "./useTheme";
import "./App.css";

const OrbScene = lazy(() => import("./OrbScene"));

const API_URL = import.meta.env.VITE_API_URL;
const JOBS_API_URL = `${API_URL}/requests`;
const MAX_FILE_SIZE = 4 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MULTIVIEW_NAMES = ["front", "left", "back"];
const DRAFT_STORAGE_KEY = "atomsphere_pending_draft";
const STEPS = ["input", "category", "plan", "account"];

const MODEL_CATEGORIES = [
  { value: "building_structure", label: "Buildings", hint: "Architecture & structures" },
  { value: "furniture_decor", label: "Furniture", hint: "Home & decor" },
  { value: "vehicle", label: "Vehicles", hint: "Cars, bikes & more" },
  { value: "consumer_product", label: "Products", hint: "Everyday objects" },
  { value: "mechanical_device", label: "Machines", hint: "Robots & mechanisms" },
  { value: "home_appliance", label: "Appliances", hint: "Home electronics" },
  { value: "character_creature", label: "Characters", hint: "Creatures & people" },
  { value: "nature_landscape", label: "Nature", hint: "Landscapes & plants" },
  { value: "other", label: "Something else", hint: "Any other idea" },
];

const PLANS = {
  standard: {
    id: "standard",
    name: "Standard",
    price: 2,
    model: "hunyuan",
    tagline: "For quick drafts",
    description: "The fastest way to test an idea, silhouette or layout.",
    points: ["Clean baseline mesh", "Great for iteration"],
  },
  polished: {
    id: "polished",
    name: "Polished",
    price: 4,
    model: "meshy",
    tagline: "For production",
    description: "Finer geometry and richer materials for final, production-quality assets.",
    points: ["High-fidelity detail", "Takes a little longer"],
  },
};

const ACTIVE_STATUSES = new Set(["uploading", "queued", "processing", "running"]);

function statusGroup(status) {
  const value = String(status || "unknown").toLowerCase();
  if (ACTIVE_STATUSES.has(value)) return "active";
  if (["generated", "complete", "completed"].includes(value)) return "ready";
  if (["failed", "error"].includes(value)) return "failed";
  return "other";
}

function statusLabel(status) {
  const labels = {
    uploading: "Uploading",
    queued: "Queued",
    processing: "Generating",
    running: "Generating",
    generated: "Ready",
    complete: "Ready",
    completed: "Ready",
    failed: "Failed",
    error: "Failed",
  };
  return labels[String(status || "unknown").toLowerCase()] || "Processing";
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

function categoryLabel(value) {
  return MODEL_CATEGORIES.find((category) => category.value === value)?.label || "3D asset";
}

function useObjectUrl(file) {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);

  useEffect(() => {
    if (!url) return undefined;
    return () => URL.revokeObjectURL(url);
  }, [url]);

  return url;
}

function photoLabel(index, count) {
  if (count === 1) return "Reference";
  if (count === 3) return MULTIVIEW_NAMES[index].replace(/^./, (letter) => letter.toUpperCase());
  return `Photo ${index + 1}`;
}

function PhotoThumb({ file, label, onRemove }) {
  const preview = useObjectUrl(file);

  return (
    <div className="photo-thumb">
      {preview ? <img src={preview} alt="" /> : <span className="photo-thumb-fallback" />}
      <span className="photo-thumb-label">{label}</span>
      <button
        type="button"
        className="photo-remove"
        aria-label={`Remove ${label.toLowerCase()}`}
        onClick={onRemove}
      >
        ✕
      </button>
    </div>
  );
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M12 2v3M12 19v3M2 12h3M19 12h3"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5 8.6 8.6 0 1 0 20.5 14.2Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function OrbStage({ theme }) {
  return (
    <aside className="orb-stage" aria-hidden="true">
      <div className="orb-glow" />
      <Suspense fallback={null}>
        <OrbScene theme={theme} />
      </Suspense>
      <div className="orb-caption">
        <span className="mono">WEBGL · LIVE</span>
        <span className="orb-caption-line" />
        <span>Move your pointer to orbit</span>
      </div>
    </aside>
  );
}

function CreateView({ auth, theme, onJobCreated, onNavigateLibrary }) {
  const isWelcomeWide = useMediaQuery("(min-width: 1024px)");
  const isFlowWide = useMediaQuery("(min-width: 1280px)");
  const [step, setStep] = useState("welcome");
  const [prompt, setPrompt] = useState("");
  const [photos, setPhotos] = useState([]);
  const [category, setCategory] = useState("");
  const [plan, setPlan] = useState("standard");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [dragging, setDragging] = useState(false);

  const stepIndex = STEPS.indexOf(step);
  const photoCount = photos.length;
  const totalPhotoBytes = photos.reduce((total, file) => total + file.size, 0);
  const photosValid = photoCount === 0 || photoCount === 1 || photoCount === 3;
  const photoBytesValid = photoCount < 3 || totalPhotoBytes <= MAX_FILE_SIZE;
  const hasInput = Boolean(prompt.trim()) || photoCount > 0;
  const inputReady = hasInput && photosValid && photoBytesValid;
  const selectedCategory = MODEL_CATEGORIES.find((item) => item.value === category);
  const selectedPlan = PLANS[plan];
  const email = auth.user?.profile?.email;
  const inputMode = photoCount === 3 ? "multiview" : photoCount === 1 ? "single" : "prompt";

  const inputSummary = photoCount === 3
    ? "3 angles"
    : photoCount === 1
      ? "1 reference photo"
      : "Text description";
  const fullInputSummary = prompt.trim() && photoCount > 0
    ? `${inputSummary} + description`
    : inputSummary;

  function goTo(nextStep) {
    setStep(nextStep);
    setErrorMessage("");
    setSuccessMessage("");
  }

  function goBack() {
    if (step === "input") {
      goTo("welcome");
      return;
    }
    const index = STEPS.indexOf(step);
    goTo(STEPS[Math.max(0, index - 1)]);
  }

  function goNext() {
    if (!canContinue) return;
    if (step === "input") goTo("category");
    else if (step === "category") goTo("plan");
    else if (step === "plan") goTo("account");
  }

  function addPhotos(fileList) {
    const incoming = Array.from(fileList || []);
    if (!incoming.length) return;

    const room = 3 - photos.length;
    if (room <= 0) {
      setErrorMessage("You can add up to three photos. Remove one to add another.");
      return;
    }

    let localError = "";
    const accepted = [];
    for (const file of incoming) {
      if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
        localError = "Please choose JPG, PNG or WEBP images.";
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        localError = "Each photo must be 4 MB or smaller.";
        continue;
      }
      accepted.push(file);
    }

    if (!accepted.length) {
      setErrorMessage(localError || "Those files could not be added.");
      return;
    }

    if (accepted.length > room) {
      localError = "Only the first three photos were added.";
    }

    setPhotos([...photos, ...accepted].slice(0, 3));
    setErrorMessage(localError);
    setSuccessMessage("");
  }

  function removePhoto(index) {
    setPhotos((current) => current.filter((_, itemIndex) => itemIndex !== index));
    setErrorMessage("");
  }

  async function handleLaunch() {
    setErrorMessage("");
    setSuccessMessage("");

    if (!inputReady) {
      goTo("input");
      setErrorMessage("Add a photo or describe your object first.");
      return;
    }

    if (!category) {
      goTo("category");
      setErrorMessage("Choose a category first.");
      return;
    }

    const selectedModel = selectedPlan.model;

    // Not signed in: save the draft, sign in, then auto-submit on return.
    if (!auth.isAuthenticated) {
      try {
        setSubmitting(true);
        const draft = {
          inputMode,
          model: selectedModel,
          plan,
          category,
          prompt: prompt.trim(),
        };

        if (inputMode === "single") {
          draft.singleFile = {
            name: photos[0].name,
            type: photos[0].type,
            base64: await fileToBase64(photos[0]),
          };
        } else if (inputMode === "multiview") {
          draft.views = {};
          for (let index = 0; index < MULTIVIEW_NAMES.length; index += 1) {
            draft.views[MULTIVIEW_NAMES[index]] = {
              type: photos[index].type,
              base64: await fileToBase64(photos[index]),
            };
          }
        }

        sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
        await auth.signinRedirect();
      } catch {
        setErrorMessage("Could not start sign in. Please try again.");
        setSubmitting(false);
      }
      return;
    }

    try {
      setSubmitting(true);
      const accessToken = auth.user?.access_token;
      if (!accessToken) {
        throw new Error("Your session expired. Please sign in again.");
      }

      let fileBase64;
      const viewsPayload = {};
      if (inputMode === "single") {
        fileBase64 = await fileToBase64(photos[0]);
      } else if (inputMode === "multiview") {
        for (let index = 0; index < MULTIVIEW_NAMES.length; index += 1) {
          viewsPayload[MULTIVIEW_NAMES[index]] = {
            contentType: photos[index].type,
            fileBase64: await fileToBase64(photos[index]),
          };
        }
      }

      const requestBody = {
        inputMode,
        model: selectedModel,
        category,
        prompt: prompt.trim(),
        ...(inputMode === "single" && {
          contentType: photos[0].type,
          fileBase64,
        }),
        ...(inputMode === "multiview" && { views: viewsPayload }),
      };

      const response = await fetch(`${API_URL}/meteoclone-add-request`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(requestBody),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || `Request failed (${response.status})`);
      }

      setSuccessMessage("Generation started — opening your library…");
      window.setTimeout(() => {
        onJobCreated();
        onNavigateLibrary();
      }, 1000);
    } catch (error) {
      setErrorMessage(error.message || "Couldn't start generation. Please try again.");
      setSubmitting(false);
    }
  }

  const canContinue = step === "input"
    ? inputReady
    : step === "category"
      ? Boolean(category)
      : true;

  let footerHint = "";
  if (step === "input") {
    if (photoCount === 2) footerHint = "Add one more angle or remove a photo.";
    else if (!photoBytesValid) footerHint = "The three photos must total 4 MB or less.";
    else if (!hasInput) footerHint = "Add a photo or a few words to continue.";
    else footerHint = "You can refine the details as you go.";
  } else if (step === "category") {
    footerHint = category ? "This helps tune the shape." : "Pick the closest match to continue.";
  } else if (step === "plan") {
    footerHint = "You can change this before generating.";
  } else if (step === "account") {
    footerHint = auth.isAuthenticated ? "Generation starts right away." : "Sign-in only takes a moment.";
  }

  if (step === "welcome") {
    return (
      <section className="stage welcome-stage">
        <div className="welcome-copy">
          <span className="eyebrow">
            <span className="eyebrow-dot" />
            atomSphere · 3D asset studio
          </span>
          <h1 className="welcome-title">
            Ideas in.
            <span>3D objects out.</span>
          </h1>
          <p className="welcome-lede">
            Describe something in a sentence or add a reference photo. atomSphere turns it into a
            game-ready 3D model you can orbit, refine and keep — no 3D software required.
          </p>
          <div className="welcome-actions">
            <button
              className="primary-btn primary-btn-lg"
              type="button"
              onClick={() => goTo("input")}
            >
              Start creating
              <span className="btn-arrow" aria-hidden="true">→</span>
            </button>
            <span className="welcome-note">Free while in preview</span>
          </div>
          <div className="welcome-steps" aria-label="How it works">
            <div className="welcome-step">
              <span className="welcome-step-num">01</span>
              <strong>Describe or show</strong>
              <span>Text, photos, or both</span>
            </div>
            <div className="welcome-step">
              <span className="welcome-step-num">02</span>
              <strong>Pick a category</strong>
              <span>Helps shape the model</span>
            </div>
            <div className="welcome-step">
              <span className="welcome-step-num">03</span>
              <strong>Generate</strong>
              <span>Opens in your library</span>
            </div>
          </div>
        </div>
        {isWelcomeWide && <OrbStage theme={theme} />}
      </section>
    );
  }

  return (
    <section className="stage flow-stage">
      <div className="wizard">
        <div className="wizard-top">
          <button className="back-link" type="button" onClick={goBack}>
            <span aria-hidden="true">←</span> Back
          </button>
          <span className="wizard-count">{stepIndex + 1} / {STEPS.length}</span>
        </div>

        <div className="wizard-progress" aria-hidden="true">
          {STEPS.map((item, index) => (
            <span
              key={item}
              className={`progress-seg ${index < stepIndex ? "is-done" : ""} ${index === stepIndex ? "is-current" : ""}`}
            />
          ))}
        </div>

        <div className="wizard-body">
          {step === "input" && (
            <div className="step" key="input">
              <div className="step-head">
                <h1 className="step-title">What are we making?</h1>
                <p className="step-lede">
                  Describe your idea, add up to three reference photos, or use both. One photo is
                  enough; three angles give the most accurate model.
                </p>
              </div>

              <div className="step-content input-fields">
                <div className="field">
                  <div className="field-top">
                    <label className="field-title" htmlFor="prompt-input">Describe it</label>
                    <span className="field-optional">Optional if you add photos</span>
                  </div>
                  <div className="prompt-box">
                    <textarea
                      id="prompt-input"
                      rows={3}
                      value={prompt}
                      onChange={(event) => {
                        setPrompt(event.target.value);
                        setErrorMessage("");
                        setSuccessMessage("");
                      }}
                      placeholder="A mid-century walnut lounge chair with cream leather cushions…"
                    />
                    <div className="prompt-meta">
                      <span>Shape, material, style — a sentence is plenty.</span>
                      <span>{prompt.length}</span>
                    </div>
                  </div>
                </div>

                <div
                  className={`field photo-field ${dragging ? "is-dragging" : ""}`}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDragging(false);
                    addPhotos(event.dataTransfer.files);
                  }}
                >
                  <div className="field-top">
                    <span className="field-title">Reference photos</span>
                    <span className="field-optional">Optional if you describe it</span>
                  </div>

                  <input
                    id="reference-photos"
                    className="sr-only"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    onChange={(event) => {
                      addPhotos(event.target.files);
                      event.target.value = "";
                    }}
                  />

                  {photoCount === 0 ? (
                    <label className="photo-drop" htmlFor="reference-photos">
                      <span className="photo-drop-icon" aria-hidden="true">＋</span>
                      <span className="photo-drop-text">
                        <strong>Add reference photos</strong>
                        <span>Drop them here or browse · JPG, PNG or WEBP</span>
                      </span>
                    </label>
                  ) : (
                    <div className="photo-thumbs">
                      {photos.map((file, index) => (
                        <PhotoThumb
                          key={`${file.name}-${file.lastModified}-${index}`}
                          file={file}
                          label={photoLabel(index, photoCount)}
                          onRemove={() => removePhoto(index)}
                        />
                      ))}
                      {photoCount < 3 && (
                        <label className="photo-add" htmlFor="reference-photos">
                          <span aria-hidden="true">＋</span>
                          <strong>{photoCount === 1 ? "Add an angle" : "Add the last angle"}</strong>
                        </label>
                      )}
                    </div>
                  )}

                  <p className={`field-help ${photoCount === 2 || !photoBytesValid ? "is-warning" : ""}`}>
                    {photoCount === 2
                      ? "Add the third angle, or remove one photo — we use one or all three."
                      : !photoBytesValid
                        ? "All three photos together must be 4 MB or smaller. Use smaller images or remove one."
                        : photoCount === 3
                          ? "Front, left and back — this gives the most accurate result."
                          : photoCount === 1
                            ? "One photo works. Add the other two angles for more accuracy."
                            : "One photo is enough. For best results, add front, left and back in that order."}
                  </p>
                </div>
              </div>
            </div>
          )}

          {step === "category" && (
            <div className="step" key="category">
              <div className="step-head">
                <h1 className="step-title">What kind of object is it?</h1>
                <p className="step-lede">
                  Pick the closest category. It helps atomSphere tune the geometry — automatic
                  detection is coming soon.
                </p>
              </div>

              <div className="step-content">
                <div className="category-grid" role="radiogroup" aria-label="Object category">
                  {MODEL_CATEGORIES.map((item) => {
                    const selected = category === item.value;
                    return (
                      <button
                        key={item.value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        className={`category-card ${selected ? "is-selected" : ""}`}
                        onClick={() => {
                          setCategory(item.value);
                          setErrorMessage("");
                        }}
                      >
                        <span className="category-label">{item.label}</span>
                        <span className="category-hint">{item.hint}</span>
                        {selected && <span className="category-check" aria-hidden="true">✓</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {step === "plan" && (
            <div className="step" key="plan">
              <div className="step-head">
                <h1 className="step-title">Choose your finish.</h1>
                <p className="step-lede">
                  Standard is best for quick tests and drafts. Polished is for final,
                  production-quality assets.
                </p>
              </div>

              <div className="step-content plan-content">
                <div className="plan-grid" role="radiogroup" aria-label="Generation plan">
                  {Object.values(PLANS).map((item) => {
                    const selected = plan === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        className={`plan-card ${selected ? "is-selected" : ""}`}
                        onClick={() => setPlan(item.id)}
                      >
                        <span className="plan-top">
                          <span className="plan-name">{item.name}</span>
                          <span className="plan-price">${item.price}</span>
                        </span>
                        <span className="plan-tag">{item.tagline}</span>
                        <span className="plan-desc">{item.description}</span>
                        <span className="plan-points">
                          {item.points.map((point) => (
                            <span key={point} className="plan-point">{point}</span>
                          ))}
                        </span>
                        <span className="plan-select">{selected ? "Selected" : "Select"}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="plan-note">
                  Free during preview — you won't be charged today. Pricing applies at launch.
                </p>
              </div>
            </div>
          )}

          {step === "account" && (
            <div className="step" key="account">
              <div className="step-head">
                <h1 className="step-title">
                  {auth.isAuthenticated ? "Ready when you are." : "Save it to your library."}
                </h1>
                <p className="step-lede">
                  {auth.isAuthenticated
                    ? `Signed in as ${email || "your account"}. We'll start your model and open your library.`
                    : "Sign in so your model is easy to find, reopen and manage later. We only ask for your email — no profiles, no marketing."}
                </p>
              </div>

              <div className="step-content account-step">
                {!auth.isAuthenticated && (
                  <ul className="trust-list">
                    <li className="trust-item">
                      <span className="trust-icon" aria-hidden="true">✓</span>
                      <span className="trust-copy">
                        <strong>Just your email</strong>
                        <span className="trust-text">Cognito handles sign-in. We use it only for your account.</span>
                      </span>
                    </li>
                    <li className="trust-item">
                      <span className="trust-icon" aria-hidden="true">✓</span>
                      <span className="trust-copy">
                        <strong>Private to you</strong>
                        <span className="trust-text">Your models stay in your own library.</span>
                      </span>
                    </li>
                    <li className="trust-item">
                      <span className="trust-icon" aria-hidden="true">✓</span>
                      <span className="trust-copy">
                        <strong>Come back anytime</strong>
                        <span className="trust-text">Reopen and organize your work.</span>
                      </span>
                    </li>
                  </ul>
                )}

                <div className="summary-card">
                  <div className="summary-item">
                    <span className="summary-label">Input</span>
                    <span className="summary-value">{fullInputSummary}</span>
                  </div>
                  <div className="summary-item">
                    <span className="summary-label">Category</span>
                    <span className="summary-value">{selectedCategory?.label}</span>
                  </div>
                  <div className="summary-item">
                    <span className="summary-label">Plan</span>
                    <span className="summary-value">{selectedPlan.name} · ${selectedPlan.price}</span>
                  </div>
                </div>

                <p className="signin-note">
                  {auth.isAuthenticated
                    ? "Generation usually takes a few minutes. You can leave the library and come back."
                    : "After signing in, generation starts automatically and opens your library."}
                </p>
              </div>
            </div>
          )}
        </div>

        {errorMessage && <p className="wizard-alert" role="alert">{errorMessage}</p>}
        {successMessage && <p className="wizard-success" role="status">{successMessage}</p>}

        <footer className="wizard-footer">
          <span className="wizard-hint">{footerHint}</span>
          {step === "account" ? (
            <button
              className="primary-btn"
              type="button"
              onClick={handleLaunch}
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <span className="spinner" aria-hidden="true" />
                  Preparing…
                </>
              ) : (
                <>
                  {auth.isAuthenticated ? "Generate my model" : "Sign in & generate"}
                  <span className="btn-arrow" aria-hidden="true">→</span>
                </>
              )}
            </button>
          ) : (
            <button
              className="primary-btn"
              type="button"
              onClick={goNext}
              disabled={!canContinue}
            >
              {step === "plan"
                ? `Continue with ${selectedPlan.name} · $${selectedPlan.price}`
                : "Continue"}
              <span className="btn-arrow" aria-hidden="true">→</span>
            </button>
          )}
        </footer>
      </div>

      {isFlowWide && <OrbStage theme={theme} />}
    </section>
  );
}

function JobCard({ job, onOpen }) {
  const status = String(job.status || "unknown").toLowerCase();
  const group = statusGroup(status);
  const title = job.prompt || job.input_key?.split("/").at(-1) || "Image-based 3D model";
  const date = job.createdAt
    ? new Date(job.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : "";

  return (
    <article className="job-card">
      <div className="job-top">
        <span className={`status-pill status-${status}`}>
          <span className="status-dot" aria-hidden="true" />
          {statusLabel(status)}
        </span>
        {date && <span className="job-date">{date}</span>}
      </div>

      <h2 className="job-title">{title}</h2>
      <p className="job-category">{categoryLabel(job.category)}</p>

      <div className="job-bottom">
        {group === "ready" ? (
          <button className="job-open" type="button" onClick={() => onOpen(job)}>
            Open in Studio
            <span aria-hidden="true">→</span>
          </button>
        ) : group === "active" ? (
          <span className="job-progress">
            <span className="progress-line" aria-hidden="true"><span /></span>
            <span>This updates automatically.</span>
          </span>
        ) : (
          <span className="job-failed">Generation did not finish.</span>
        )}
      </div>
    </article>
  );
}

function LibraryView({ auth, refreshKey, onViewModel, onNavigateCreate }) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(Boolean(auth.isAuthenticated));
  const [error, setError] = useState("");
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    let active = true;
    let inFlight = false;

    async function loadJobs() {
      if (!auth.isAuthenticated || inFlight) return;
      inFlight = true;
      try {
        const response = await fetch(JOBS_API_URL, {
          headers: {
            Authorization: `Bearer ${auth.user?.access_token}`,
          },
        });
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.error || `Failed to fetch requests (${response.status})`);
        }
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
    const intervalId = window.setInterval(loadJobs, 10000);
    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [auth.isAuthenticated, auth.user?.access_token, refreshKey, retryTick]);

  const sortedJobs = useMemo(() => {
    const rank = (job) => {
      const group = statusGroup(job.status);
      if (group === "active") return 0;
      if (group === "ready") return 1;
      return 2;
    };

    return [...jobs].sort((a, b) => {
      const difference = rank(a) - rank(b);
      if (difference !== 0) return difference;
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });
  }, [jobs]);

  const activeCount = jobs.filter((job) => statusGroup(job.status) === "active").length;
  const readyCount = jobs.filter((job) => statusGroup(job.status) === "ready").length;
  const failedCount = jobs.filter((job) => statusGroup(job.status) === "failed").length;
  const statusParts = [
    activeCount > 0 ? `${activeCount} generating now` : "",
    readyCount > 0 ? `${readyCount} ready` : "",
    failedCount > 0 ? `${failedCount} failed` : "",
  ].filter(Boolean);
  const librarySummary = jobs.length === 0
    ? "Everything you create will live here."
    : statusParts.join(" · ") || `${jobs.length} saved model${jobs.length === 1 ? "" : "s"}`;

  return (
    <section className="stage library-stage">
      <div className="library-view">
        <header className="library-head">
          <div className="library-heading">
            <span className="eyebrow">
              <span className="eyebrow-dot" />
              Library
            </span>
            <h1 className="library-title">
              Your models
              <span className="library-count">{jobs.length}</span>
            </h1>
            <p className="library-sub">{librarySummary}</p>
          </div>

          <button
            className="primary-btn primary-btn-sm"
            type="button"
            onClick={onNavigateCreate}
          >
            New model
            <span className="btn-arrow" aria-hidden="true">＋</span>
          </button>
        </header>

        {error && (
          <div className="library-alert" role="alert">
            <span>{error}</span>
            <button type="button" className="text-btn" onClick={() => setRetryTick((value) => value + 1)}>
              Try again
            </button>
          </div>
        )}

        <div className="library-scroll">
          {loading && (
            <div className="job-grid" aria-label="Loading models">
              {[0, 1, 2, 3, 4, 5].map((index) => (
                <div className="job-card skeleton-card" key={index}>
                  <span className="skeleton skeleton-line skeleton-short" />
                  <span className="skeleton skeleton-line" />
                  <span className="skeleton skeleton-line skeleton-medium" />
                  <span className="skeleton skeleton-block" />
                </div>
              ))}
            </div>
          )}

          {!loading && !error && sortedJobs.length === 0 && (
            <div className="library-empty">
              <span className="brand-mark brand-mark-lg" aria-hidden="true" />
              <h2>Your library is empty</h2>
              <p>
                Create your first model — you'll see it here while it generates, then open it in
                Studio.
              </p>
              <button className="primary-btn" type="button" onClick={onNavigateCreate}>
                Create a model
                <span className="btn-arrow" aria-hidden="true">→</span>
              </button>
            </div>
          )}

          {!loading && !error && sortedJobs.length > 0 && (
            <div className="job-grid">
              {sortedJobs.map((job) => (
                <JobCard key={`${job.jobId}-${job.createdAt || ""}`} job={job} onOpen={onViewModel} />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function App() {
  const auth = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [currentView, setCurrentView] = useState("create");
  const [refreshKey, setRefreshKey] = useState(0);
  const [pathname, setPathname] = useState(window.location.pathname);
  const [studioError, setStudioError] = useState("");
  const pendingSubmissionRef = useRef(false);

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
      : currentView === "dashboard"
        ? "Library — atomSphere"
        : "atomSphere — Ideas in. 3D objects out.";
  }, [pathname, currentView]);

  // Auto-submit a draft that was saved before the Cognito redirect.
  useEffect(() => {
    if (auth.isAuthenticated && !pendingSubmissionRef.current) {
      const rawDraft = sessionStorage.getItem(DRAFT_STORAGE_KEY);
      if (rawDraft) {
        pendingSubmissionRef.current = true;
        try {
          const draft = JSON.parse(rawDraft);
          sessionStorage.removeItem(DRAFT_STORAGE_KEY);

          const submitPendingDraft = async () => {
            const accessToken = auth.user?.access_token;
            if (!accessToken) return;

            const requestBody = {
              inputMode: draft.inputMode,
              model: draft.model,
              category: draft.category,
              prompt: draft.prompt || "",
              ...(draft.singleFile && {
                contentType: draft.singleFile.type,
                fileBase64: draft.singleFile.base64,
              }),
              ...(draft.views && {
                views: {
                  front: { contentType: draft.views.front.type, fileBase64: draft.views.front.base64 },
                  left: { contentType: draft.views.left.type, fileBase64: draft.views.left.base64 },
                  back: { contentType: draft.views.back.type, fileBase64: draft.views.back.base64 },
                },
              }),
            };

            await fetch(`${API_URL}/meteoclone-add-request`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${accessToken}`,
              },
              body: JSON.stringify(requestBody),
            });

            setRefreshKey((key) => key + 1);
            setCurrentView("dashboard");
          };

          submitPendingDraft().catch((error) => console.error("Failed to auto-submit pending draft:", error));
        } catch {
          sessionStorage.removeItem(DRAFT_STORAGE_KEY);
        }
      }
    }
  }, [auth.isAuthenticated, auth.user?.access_token]);

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
      <main className="boot-screen">
        <span className="brand-mark brand-mark-lg" aria-hidden="true" />
        <p className="boot-text">Connecting to atomSphere…</p>
        <span className="boot-line" aria-hidden="true" />
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

  const email = auth.user?.profile?.email;

  return (
    <div className="app-shell">
      <header className="app-header">
        <button
          className="brand"
          type="button"
          onClick={() => setCurrentView("create")}
          aria-label="atomSphere home"
        >
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-text">atomSphere</span>
        </button>

        {auth.isAuthenticated && (
          <nav className="nav-pill" aria-label="Workspace">
            <button
              type="button"
              className={currentView === "create" ? "is-active" : ""}
              aria-current={currentView === "create" ? "page" : undefined}
              onClick={() => setCurrentView("create")}
            >
              Create
            </button>
            <button
              type="button"
              className={currentView === "dashboard" ? "is-active" : ""}
              aria-current={currentView === "dashboard" ? "page" : undefined}
              onClick={() => setCurrentView("dashboard")}
            >
              Library
            </button>
          </nav>
        )}

        <div className="header-account">
          <button
            className="icon-btn theme-btn"
            type="button"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
          </button>

          {auth.isAuthenticated ? (
            <>
              <span className="email-chip" title={email}>{email}</span>
              <button
                className="ghost-btn"
                type="button"
                onClick={() => {
                  setCurrentView("create");
                  auth.removeUser();
                }}
              >
                Sign out
              </button>
            </>
          ) : (
            <button className="ghost-btn accent" type="button" onClick={() => auth.signinRedirect()}>
              Sign in
            </button>
          )}
        </div>
      </header>

      <main className="app-main">
        {studioError && (
          <div className="toast" role="alert">
            {studioError}
            <button type="button" onClick={() => setStudioError("")} aria-label="Dismiss">✕</button>
          </div>
        )}

        {currentView === "create" ? (
          <CreateView
            auth={auth}
            theme={theme}
            onJobCreated={() => setRefreshKey((key) => key + 1)}
            onNavigateLibrary={() => setCurrentView("dashboard")}
          />
        ) : (
          <LibraryView
            auth={auth}
            refreshKey={refreshKey}
            onViewModel={openModel}
            onNavigateCreate={() => setCurrentView("create")}
          />
        )}
      </main>
    </div>
  );
}

export default App;
