import { useMemo, useState } from "react";
import { apiRequest } from "../api";
import Logo from "../brand/Logo";
import { PlusIcon, ShelfIcon } from "../brand/icons";
import ThemeToggle from "../brand/ThemeToggle";
import AccountMenu from "./AccountMenu";
import UploadModel from "./UploadModel";
import { createProperty, saveProperty, uploadPlanImage, sceneToSave } from "./propertyApi";
import preparePlanImage, { initialUnderlay } from "../studio/property/planImage";
import { createEmptyProperty } from "../studio/property/propertyEdits";
import { createSceneDocument } from "../studio/sceneDocument";
import Cube from "./Cube";
import GenerationTray from "./GenerationTray";
import Shelf from "./Shelf";
import useJobs from "./useJobs";
import { AccountStep, CategoryStep, InputStep, PaymentStep } from "./Steps";
import useTypewriter from "./useTypewriter";
import {
  CREATE_JOB_URL,
  EMPTY_DRAFT,
  INPUT_MODES,
  STEPS,
  buildRequestBody,
  findCategory,
  findPlan,
  inputState,
  inputSummary,
  statusGroup,
  suggestCategory,
} from "./model";
import "./stage.css";

// The steps of making a model. The shelf is a destination, reached from the header.
const CREATE_STEPS = STEPS.filter((item) => item.id !== "shelf");
// A property has no category or payment step (property pricing isn't set yet).
const PROPERTY_STEPS = CREATE_STEPS.filter((item) => item.id === "input" || item.id === "account");

/** The draft a visit starts with: ?mode= picks the input (e.g. from the landing page). */
function initialDraft() {
  const mode = new URLSearchParams(window.location.search).get("mode");
  return INPUT_MODES.some((item) => item.id === mode) ? { ...EMPTY_DRAFT, mode } : EMPTY_DRAFT;
}

export default function Stage({ auth, theme, toggleTheme, step, setStep, refreshKey, onCreated, onOpenModel, onOpenProperty, onSignIn }) {
  const [draft, setDraft] = useState(initialDraft);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const { jobs, loading, error: jobsError, reload } = useJobs(auth.isAuthenticated ? auth.user?.access_token : null, refreshKey);

  // Accepts a patch, or a function of the current draft for updates that land after an await.
  const update = (patch) => setDraft((current) => ({
    ...current,
    ...(typeof patch === "function" ? patch(current) : patch),
  }));
  const input = inputState(draft);
  const suggested = useMemo(() => suggestCategory(draft), [draft]);
  const stepIndex = STEPS.findIndex((item) => item.id === step);
  const email = auth.user?.profile?.email;

  const isProperty = draft.mode === "floorplan";
  const shownSteps = isProperty ? PROPERTY_STEPS : CREATE_STEPS;
  const reachable = {
    input: true,
    category: input.ok && !isProperty,
    payment: input.ok && Boolean(draft.category) && !isProperty,
    account: input.ok && (isProperty || Boolean(draft.category)),
    shelf: auth.isAuthenticated,
  };

  function go(next) {
    if (!reachable[next]) return;
    setError("");
    if (next === "category" && !draft.category && suggested) update({ category: suggested });
    setStep(next);
  }

  // Floorplan: create the property, upload the plan if one was picked, and open Studio.
  // Both flows take the session when called straight after signing in (see AccountStep);
  // from the button they get the click event and use the current one.
  async function createPropertyFlow(signedIn) {
    setError("");
    const name = draft.name.trim();
    const token = signedIn?.accessToken ?? auth.user?.access_token;
    setSubmitting(true);
    try {
      if (!token) throw new Error("Your session expired. Please sign in again.");
      // Read the plan before creating anything, so a bad file doesn't leave an empty property.
      setProgress(draft.planFile ? "Reading the floorplan…" : "Creating…");
      const plan = draft.planFile ? await preparePlanImage(draft.planFile) : null;
      setProgress("Creating the property…");
      const { id } = await createProperty(token, name);
      const property = createEmptyProperty();
      if (plan) {
        setProgress("Uploading the floorplan…");
        const key = await uploadPlanImage(token, id, property.levels[0].id, plan.blob);
        property.levels[0].underlay = initialUnderlay(plan, key);
      }
      await saveProperty(token, id, sceneToSave(createSceneDocument({ property })));
      setDraft(EMPTY_DRAFT);
      onOpenProperty({ id, title: name });
    } catch (createError) {
      setError(createError.message || "Couldn't create the property. Please try again.");
    } finally {
      setSubmitting(false);
      setProgress("");
    }
  }

  async function submit(signedIn) {
    setError("");
    setSubmitting(true);
    try {
      const body = await buildRequestBody(draft);
      const token = signedIn?.accessToken ?? auth.user?.access_token;
      if (!token) throw new Error("Your session expired. Please sign in again.");
      await apiRequest(CREATE_JOB_URL, token, { method: "POST", body: JSON.stringify(body) });
      setDraft(EMPTY_DRAFT);
      onCreated();
    } catch (submitError) {
      setError(submitError.message || "Couldn't start generation. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // Start a property (the header's + and the brand), or an object on its own (the shelf).
  function startNew(mode) {
    setError("");
    update({ mode });
    setStep("input");
  }

  const activeCount = jobs.filter((job) => statusGroup(job.status) === "active").length;
  const propertyCount = jobs.filter((job) => job.inputMode === "property").length;
  const headline = {
    input: isProperty ? "Start with the floorplan." : "What should we make?",
    category: suggested ? `Looks like ${findCategory(suggested)?.noun}.` : "What kind of object is it?",
    payment: "Standard, or polished?",
    account: auth.isAuthenticated
      ? (isProperty ? "Ready to trace." : "Ready when you are.")
      : "Where should it live?",
    shelf: loading || propertyCount > 0 ? "Your properties." : "No properties yet.",
  }[step];
  const { typed, done } = useTypewriter(headline);

  const plan = findPlan(draft.plan);
  const recap = [
    { step: "input", text: inputSummary(draft) },
    { step: "category", text: findCategory(draft.category)?.label },
    { step: "payment", text: `${plan.name} · $${plan.price}` },
  ].filter((item, index) => index < stepIndex && step !== "shelf" && item.text && (!isProperty || item.step === "input"));

  const showCube = step === "shelf" && jobs.length > 0;

  return (
    <div className="st-root" data-step={step} style={{ "--shift": `${(stepIndex - 2) * 70}px` }}>
      <div className="st-glow-pos" aria-hidden="true"><div className="st-glow" /></div>
      <div className="st-floor" aria-hidden="true" />

      <header className="st-header">
        <button type="button" className="st-brand" onClick={() => startNew("floorplan")} aria-label="atomSphere, start a new property">
          <Logo />
        </button>

        {/* The steps cover making a model; the shelf is a place, reached from the header
            button. The nav stays in the DOM on the shelf to hold the centre column. */}
        <nav aria-label="Steps">
          {step !== "shelf" && (
          <ol className="st-steps">
            {shownSteps.map((item, index) => {
              const position = shownSteps.findIndex((shown) => shown.id === step);
              const current = index === position;
              const complete = index < position;
              const label = item.id === "account" && auth.isAuthenticated
                ? (isProperty ? "Create" : "Generate")
                : item.label;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className={current ? "is-current" : complete ? "is-done" : ""}
                    aria-current={current ? "step" : undefined}
                    disabled={!reachable[item.id] && !current}
                    onClick={() => go(item.id)}
                  >
                    <span className="st-step-mark" aria-hidden="true">{complete ? "✓" : index + 1}</span>
                    <span className="st-step-label">{label}</span>
                  </button>
                </li>
              );
            })}
          </ol>
          )}
        </nav>

        {/* Navigation first, then settings, then the account menu (email + sign out). */}
        <div className="st-account">
          {auth.isAuthenticated && (step === "shelf" ? (
            <button
              type="button"
              className="st-round"
              onClick={() => startNew("floorplan")}
              aria-label="New property"
              title="New property"
            >
              <PlusIcon />
            </button>
          ) : (
            <button
              type="button"
              className="st-round st-shelf-link"
              onClick={() => go("shelf")}
              aria-label={`Shelf, ${propertyCount} ${propertyCount === 1 ? "property" : "properties"}${activeCount > 0 ? `, ${activeCount} objects being made` : ""}`}
              title="Shelf"
            >
              <ShelfIcon />
              {propertyCount > 0 && <span className="st-badge-count" aria-hidden="true">{propertyCount > 99 ? "99+" : propertyCount}</span>}
              {activeCount > 0 && <span className="st-tray-dot is-busy st-badge-busy" aria-hidden="true" />}
            </button>
          ))}
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
          {auth.isAuthenticated ? (
            <AccountMenu email={email} onSignOut={() => { setStep("input"); auth.signOut(); }} />
          ) : (
            <button type="button" className="st-pill" onClick={onSignIn}>Sign in</button>
          )}
        </div>
      </header>

      <GenerationTray jobs={jobs} onOpen={onOpenModel} />

      {/* Uploads are for signed-in users only: the shelf that opens this requires it,
          and the upload API rejects requests without a signed-in owner. */}
      {uploadOpen && auth.isAuthenticated && (
        <UploadModel
          token={auth.user?.access_token}
          onClose={() => setUploadOpen(false)}
          onUploaded={() => {
            setUploadOpen(false);
            reload();
          }}
        />
      )}

      <section className="st-stage" aria-label="Stage">
        {showCube && (
          <div className="st-hero-object">
            <Cube state={activeCount > 0 ? "making" : "ready"} size={120} />
            <span className="st-hero-shadow" aria-hidden="true" />
          </div>
        )}
        <h1 className={`st-headline ${step === "shelf" ? "is-small" : ""}`}>
          <span className="sr-only">{headline}</span>
          <span aria-hidden="true">{typed}</span>
          <span className={`st-caret ${done ? "is-idle" : ""}`} aria-hidden="true" />
        </h1>
      </section>

      <section className="st-convo" aria-label={step === "shelf" ? "Shelf" : isProperty ? "Create a property" : "Make an object"}>
        {recap.length > 0 && (
          <div className="st-recap" aria-label="Your answers so far">
            {recap.map((item) => (
              <button key={item.step} type="button" onClick={() => go(item.step)} title="Change this">
                {item.text}
              </button>
            ))}
          </div>
        )}

        <div className="st-card">
          {error && <p className="st-alert" role="alert">{error}</p>}

          {step === "input" && (
            <InputStep draft={draft} update={update} status={input} setError={setError} onNext={() => go(isProperty ? "account" : "category")} />
          )}
          {step === "category" && (
            <CategoryStep draft={draft} update={update} suggested={suggested} onNext={() => go("payment")} />
          )}
          {step === "payment" && <PaymentStep draft={draft} update={update} onNext={() => go("account")} />}
          {step === "account" && (
            <AccountStep
              auth={auth}
              submitting={submitting}
              onSubmit={isProperty ? createPropertyFlow : submit}
              // Carry straight on, with the new session (this render's `auth` predates it).
              onSignedIn={(session) => (isProperty ? createPropertyFlow : submit)(session)}
              property={isProperty}
              progress={progress}
            />
          )}
          {step === "shelf" && (
            <Shelf
              jobs={jobs}
              loading={loading}
              error={jobsError}
              onReload={reload}
              onOpen={onOpenModel}
              onUpload={() => setUploadOpen(true)}
              onNewProperty={() => startNew("floorplan")}
              onMakeObject={() => startNew("prompt")}
            />
          )}
        </div>
      </section>
    </div>
  );
}
