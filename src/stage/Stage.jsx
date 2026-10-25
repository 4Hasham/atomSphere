import { useMemo, useState } from "react";
import { apiRequest } from "../api";
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

function SunIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <circle cx="9" cy="9" r="3.4" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M9 1.5V3.3M9 14.7V16.5M1.5 9H3.3M14.7 9H16.5M3.7 3.7l1.2 1.2M13.1 13.1l1.2 1.2M3.7 14.3l1.2-1.2M13.1 4.9l1.2-1.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path d="M15 11.2A6.5 6.5 0 0 1 6.8 3a6.5 6.5 0 1 0 8.2 8.2Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

export default function Stage({ auth, theme, toggleTheme, step, setStep, refreshKey, onCreated, onOpenModel }) {
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { jobs, loading, error: jobsError, reload } = useJobs(auth, refreshKey);

  const update = (patch) => setDraft((current) => ({ ...current, ...patch }));
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
        <button type="button" className="st-brand" onClick={() => go("input")}>atomSphere</button>

        <nav aria-label="Steps">
          <ol className="st-steps">
            {STEPS.map((item, index) => {
              const current = index === stepIndex;
              const complete = index < stepIndex && item.id !== "shelf";
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
                    <span className="st-step-label">{item.label}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="st-account">
          <button
            type="button"
            className="st-round"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
          </button>
          {auth.isAuthenticated ? (
            <>
              <span className="st-email" title={email}>{email}</span>
              <button type="button" className="st-pill" onClick={() => { setStep("input"); auth.removeUser(); }}>
                Sign out
              </button>
            </>
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
              onNew={() => go("input")}
            />
          )}
        </div>
      </section>
    </div>
  );
}
