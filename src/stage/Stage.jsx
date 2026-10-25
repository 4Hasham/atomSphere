import { useMemo, useState } from "react";
import { apiRequest } from "../api";
import Logo from "../brand/Logo";
import { PlusIcon, ShelfIcon } from "../brand/icons";
import ThemeToggle from "../brand/ThemeToggle";
import AccountMenu from "./AccountMenu";
import Cube from "./Cube";
import GenerationTray from "./GenerationTray";
import Shelf from "./Shelf";
import useJobs from "./useJobs";
import { AccountStep, CategoryStep, InputStep, PaymentStep } from "./Steps";
import useTypewriter from "./useTypewriter";
import {
  CREATE_JOB_URL,
  DRAFT_STORAGE_KEY,
  EMPTY_DRAFT,
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

export default function Stage({ auth, theme, toggleTheme, step, setStep, refreshKey, onCreated, onOpenModel }) {
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { jobs, loading, error: jobsError, reload } = useJobs(auth, refreshKey);

  // Accepts a patch, or a function of the current draft for updates that land after an await.
  const update = (patch) => setDraft((current) => ({
    ...current,
    ...(typeof patch === "function" ? patch(current) : patch),
  }));
  const input = inputState(draft);
  const suggested = useMemo(() => suggestCategory(draft), [draft]);
  const stepIndex = STEPS.findIndex((item) => item.id === step);
  const email = auth.user?.profile?.email;

  const reachable = {
    input: true,
    category: input.ok,
    payment: input.ok && Boolean(draft.category),
    account: input.ok && Boolean(draft.category),
    shelf: auth.isAuthenticated,
  };

  function go(next) {
    if (!reachable[next]) return;
    setError("");
    if (next === "category" && !draft.category && suggested) update({ category: suggested });
    setStep(next);
  }

  async function submit() {
    setError("");
    setSubmitting(true);
    try {
      const body = await buildRequestBody(draft);

      if (!auth.isAuthenticated) {
        // Keep the draft through the Cognito redirect; App submits it on return.
        sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(body));
        await auth.signinRedirect();
        return;
      }

      const token = auth.user?.access_token;
      if (!token) throw new Error("Your session expired. Please sign in again.");
      await apiRequest(CREATE_JOB_URL, token, { method: "POST", body: JSON.stringify(body) });
      setDraft(EMPTY_DRAFT);
      onCreated();
    } catch (submitError) {
      const quota = submitError?.name === "QuotaExceededError";
      setError(quota
        ? "These photos are too large to keep through sign-in. Sign in first, then try again."
        : submitError.message || "Couldn't start generation. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const activeCount = jobs.filter((job) => statusGroup(job.status) === "active").length;
  const headline = {
    input: "What should we make?",
    category: suggested ? `Looks like ${findCategory(suggested)?.noun}.` : "What kind of object is it?",
    payment: "Standard, or polished?",
    account: auth.isAuthenticated ? "Ready when you are." : "Where should it live?",
    shelf: loading
      ? "Your shelf."
      : activeCount > 0
        ? "On your shelf. Shaping it now."
        : jobs.length > 0
          ? "Your shelf."
          : "Your shelf is empty.",
  }[step];
  const { typed, done } = useTypewriter(headline);

  const plan = findPlan(draft.plan);
  const recap = [
    { step: "input", text: inputSummary(draft) },
    { step: "category", text: findCategory(draft.category)?.label },
    { step: "payment", text: `${plan.name} · $${plan.price}` },
  ].filter((item, index) => index < stepIndex && step !== "shelf" && item.text);

  const showCube = step === "shelf" && jobs.length > 0;

  return (
    <div className="st-root" data-step={step} style={{ "--shift": `${(stepIndex - 2) * 70}px` }}>
      <div className="st-glow-pos" aria-hidden="true"><div className="st-glow" /></div>
      <div className="st-floor" aria-hidden="true" />

      <header className="st-header">
        <button type="button" className="st-brand" onClick={() => go("input")} aria-label="atomSphere, start a new model">
          <Logo />
        </button>

        {/* The steps cover making a model; the shelf is a place, reached from the header
            button. The nav stays in the DOM on the shelf to hold the centre column. */}
        <nav aria-label="Steps">
          {step !== "shelf" && (
          <ol className="st-steps">
            {CREATE_STEPS.map((item, index) => {
              const current = index === stepIndex;
              const complete = index < stepIndex;
              const label = item.id === "account" && auth.isAuthenticated ? "Generate" : item.label;
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
              onClick={() => go("input")}
              aria-label="New model"
              title="New model"
            >
              <PlusIcon />
            </button>
          ) : (
            <button
              type="button"
              className="st-round st-shelf-link"
              onClick={() => go("shelf")}
              aria-label={`Shelf, ${jobs.length} ${jobs.length === 1 ? "model" : "models"}${activeCount > 0 ? `, ${activeCount} generating` : ""}`}
              title="Shelf"
            >
              <ShelfIcon />
              {jobs.length > 0 && <span className="st-badge-count" aria-hidden="true">{jobs.length > 99 ? "99+" : jobs.length}</span>}
              {activeCount > 0 && <span className="st-tray-dot is-busy st-badge-busy" aria-hidden="true" />}
            </button>
          ))}
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
          {auth.isAuthenticated ? (
            <AccountMenu email={email} onSignOut={() => { setStep("input"); auth.removeUser(); }} />
          ) : (
            <button type="button" className="st-pill" onClick={() => auth.signinRedirect()}>Sign in</button>
          )}
        </div>
      </header>

      <GenerationTray jobs={jobs} onOpen={onOpenModel} />

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

      <section className="st-convo" aria-label={step === "shelf" ? "Shelf" : "Create a model"}>
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
            <InputStep draft={draft} update={update} status={input} setError={setError} onNext={() => go("category")} />
          )}
          {step === "category" && (
            <CategoryStep draft={draft} update={update} suggested={suggested} onNext={() => go("payment")} />
          )}
          {step === "payment" && <PaymentStep draft={draft} update={update} onNext={() => go("account")} />}
          {step === "account" && <AccountStep auth={auth} submitting={submitting} onSubmit={submit} />}
          {step === "shelf" && (
            <Shelf
              jobs={jobs}
              loading={loading}
              error={jobsError}
              onReload={reload}
              onOpen={onOpenModel}
            />
          )}
        </div>
      </section>
    </div>
  );
}
