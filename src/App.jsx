import { lazy, Suspense, useEffect, useState } from "react";
import { useAuth } from "./auth/useAuth";
import SignInPage from "./auth/SignInPage";
import PropertyStudio from "./PropertyStudio";
import Studio, { StudioStatus } from "./Studio";
import Landing from "./landing/Landing";
import Stage from "./stage/Stage";
import { jobTitle } from "./stage/model";
import useTheme from "./useTheme";
import "./studio/studio.css";

// Development-only sample scenes; loaded on demand so the 3D engine stays out of the
// landing page's bundle.
const DemoStudio = lazy(() => import("./studio/DemoStudio"));

const currentLocation = () => window.location.pathname + window.location.search;

function App() {
  const auth = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [step, setStep] = useState("input");
  const [refreshKey, setRefreshKey] = useState(0);
  // The path and query: a new query alone (e.g. /signin?mode=signup) re-renders too.
  const [location, setLocation] = useState(currentLocation);
  const pathname = location.split("?")[0];

  useEffect(() => {
    function handlePopState() {
      setLocation(currentLocation());
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    document.title = pathname === "/studio"
      ? "Studio — atomSphere"
      : pathname === "/signin"
        ? "Sign in — atomSphere"
      : pathname === "/" && !auth.isAuthenticated
        ? "atomSphere — See the house before you buy it."
        : step === "shelf"
        ? "Shelf — atomSphere"
        : "atomSphere — See the house before you buy it.";
  }, [pathname, step, auth.isAuthenticated]);

  // /signin once signed in (a bookmark, another tab) shows the shelf's page instead.
  const signedInOnSignInPage = pathname === "/signin" && auth.isAuthenticated;
  useEffect(() => {
    if (signedInOnSignInPage) window.history.replaceState({}, "", "/");
  }, [signedInOnSignInPage]);

  function openProperty({ id }) {
    window.history.pushState({}, "", `/studio?${new URLSearchParams({ property: id })}`);
    setLocation(currentLocation());
  }

  function openModel(job) {
    if (job.inputMode === "property") {
      openProperty({ id: job.jobId });
      return;
    }
    const params = new URLSearchParams({ job: job.jobId, prompt: jobTitle(job) });
    // Uploaded models open at their real size; generated ones use Studio's default.
    if (job.sizeMeters) params.set("size", String(job.sizeMeters));
    window.history.pushState({}, "", `/studio?${params}`);
    setLocation(currentLocation());
  }

  function navigate(path) {
    window.history.pushState({}, "", path);
    setLocation(currentLocation());
    window.scrollTo(0, 0);
  }

  function leaveStudio() {
    window.history.pushState({}, "", "/");
    setLocation(currentLocation());
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

  // Development only, until the Floorplan input exists: /studio?demo=property opens a
  // sample two-storey house, /studio?demo=blank an empty property to trace.
  const demo = import.meta.env.DEV && pathname === "/studio" ? new URLSearchParams(window.location.search).get("demo") : null;
  if (demo === "property" || demo === "blank") {
    return (
      <Suspense fallback={<StudioStatus onBack={leaveStudio} message="Preparing Studio…" />}>
        <DemoStudio demo={demo} theme={theme} onToggleTheme={toggleTheme} onBack={leaveStudio} />
      </Suspense>
    );
  }

  if (pathname === "/studio" && new URLSearchParams(window.location.search).get("property")) {
    const propertyId = new URLSearchParams(window.location.search).get("property");
    return (
      <PropertyStudio
        key={propertyId}
        accessToken={auth.user?.access_token}
        propertyId={propertyId}
        theme={theme}
        onToggleTheme={toggleTheme}
        onBack={leaveStudio}
      />
    );
  }

  if (pathname === "/studio") {
    const params = new URLSearchParams(window.location.search);
    const jobId = params.get("job");
    const prompt = params.get("prompt") || "Generated model";
    const sizeMeters = Number(params.get("size")) || undefined;

    return (
      <Suspense fallback={<StudioStatus onBack={leaveStudio} message="Preparing Studio…" />}>
        <Studio
          key={jobId || "missing-job"}
          accessToken={auth.user?.access_token}
          jobId={jobId}
          prompt={prompt}
          sizeMeters={sizeMeters}
          theme={theme}
          onToggleTheme={toggleTheme}
          onBack={leaveStudio}
        />
      </Suspense>
    );
  }

  if (pathname === "/signin" && !auth.isAuthenticated) {
    const mode = new URLSearchParams(window.location.search).get("mode") === "signup" ? "signup" : "signin";
    return (
      <SignInPage
        key={mode}
        theme={theme}
        toggleTheme={toggleTheme}
        initialMode={mode}
        onHome={() => navigate("/")}
        onDone={() => {
          setStep("shelf");
          navigate("/");
        }}
      />
    );
  }

  if (pathname === "/" && !auth.isAuthenticated) {
    return (
      <Landing
        theme={theme}
        toggleTheme={toggleTheme}
        onStart={() => navigate("/create")}
        onSignIn={() => navigate("/signin")}
      />
    );
  }

  return (
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
      onOpenProperty={openProperty}
      onSignIn={() => navigate("/signin")}
    />
  );
}

export default App;
