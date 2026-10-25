import { Suspense, useEffect, useRef, useState } from "react";
import { useAuth } from "react-oidc-context";
import { apiRequest } from "./api";
import Studio, { StudioStatus } from "./Studio";
import Landing from "./landing/Landing";
import Stage from "./stage/Stage";
import { CREATE_JOB_URL, DRAFT_STORAGE_KEY, jobTitle } from "./stage/model";
import useTheme from "./useTheme";
import "./studio/studio.css";

function App() {
  const auth = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [step, setStep] = useState("input");
  const [refreshKey, setRefreshKey] = useState(0);
  const [pathname, setPathname] = useState(window.location.pathname);
  const [notice, setNotice] = useState("");
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
      : pathname === "/" && !auth.isAuthenticated
        ? "atomSphere — Ideas in. 3D objects out."
        : step === "shelf"
        ? "Shelf — atomSphere"
        : "atomSphere — Ideas in. 3D objects out.";
  }, [pathname, step, auth.isAuthenticated]);

  // Submit a draft that was saved before the Cognito redirect, then show the shelf.
  useEffect(() => {
    if (!auth.isAuthenticated || pendingSubmissionRef.current) return;
    const rawDraft = sessionStorage.getItem(DRAFT_STORAGE_KEY);
    if (!rawDraft) return;

    pendingSubmissionRef.current = true;
    sessionStorage.removeItem(DRAFT_STORAGE_KEY);

    const token = auth.user?.access_token;
    apiRequest(CREATE_JOB_URL, token, { method: "POST", body: rawDraft })
      .then(() => {
        setRefreshKey((key) => key + 1);
        setStep("shelf");
      })
      .catch((error) => {
        setNotice(error.message || "We couldn't start that model. Please try again.");
      });
  }, [auth.isAuthenticated, auth.user?.access_token]);

  function openModel(job) {
    const params = new URLSearchParams({ job: job.jobId, prompt: jobTitle(job) });
    window.history.pushState({}, "", `/studio?${params}`);
    setPathname("/studio");
  }

  function navigate(path) {
    window.history.pushState({}, "", path);
    setPathname(path);
    window.scrollTo(0, 0);
  }

  function leaveStudio() {
    window.history.pushState({}, "", "/");
    setPathname("/");
    setStep("shelf");
  }

  if (auth.isLoading) {
    return (
      <main className="boot-screen">
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
          theme={theme}
          onToggleTheme={toggleTheme}
          onBack={leaveStudio}
        />
      </Suspense>
    );
  }

  if (pathname === "/" && !auth.isAuthenticated) {
    return (
      <Landing
        theme={theme}
        toggleTheme={toggleTheme}
        onStart={() => navigate("/create")}
        onSignIn={() => auth.signinRedirect()}
      />
    );
  }

  return (
    <>
      {notice && (
        <div className="toast" role="alert">
          {notice}
          <button type="button" onClick={() => setNotice("")} aria-label="Dismiss">✕</button>
        </div>
      )}
      <Stage
        auth={auth}
        theme={theme}
        toggleTheme={toggleTheme}
        step={step}
        setStep={setStep}
        refreshKey={refreshKey}
        onCreated={() => {
          setRefreshKey((key) => key + 1);
          setStep("shelf");
        }}
        onOpenModel={openModel}
      />
    </>
  );
}

export default App;
