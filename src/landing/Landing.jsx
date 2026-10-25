import { useEffect, useState } from "react";
import Logo from "../brand/Logo";
import Cube from "../stage/Cube";
import useTypewriter from "../stage/useTypewriter";
import "../stage/stage.css";
import "./landing.css";

const EXAMPLES = [
  "A brass desk lamp with a folding arm",
  "A two-storey villa with a flat roof",
  "A ceramic owl with a matte glaze",
  "A vintage scooter in mint green",
];

const STEPS = [
  {
    title: "Describe or show",
    body: "A sentence, one photo, or three photos from the front, left and back.",
  },
  {
    title: "Choose a finish",
    body: "Standard for quick drafts, Polished for finer geometry and richer materials.",
  },
  {
    title: "Stage it",
    body: "Open it in Studio to change the light and weather, set its size and place it on real terrain.",
  },
];

function ThemeIcon({ theme }) {
  return theme === "dark" ? (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <circle cx="9" cy="9" r="3.4" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M9 1.5V3.3M9 14.7V16.5M1.5 9H3.3M14.7 9H16.5M3.7 3.7l1.2 1.2M13.1 13.1l1.2 1.2M3.7 14.3l1.2-1.2M13.1 4.9l1.2-1.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path d="M15 11.2A6.5 6.5 0 0 1 6.8 3a6.5 6.5 0 1 0 8.2 8.2Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

export default function Landing({ theme, toggleTheme, onStart, onSignIn }) {
  const [index, setIndex] = useState(0);
  const { typed, done } = useTypewriter(EXAMPLES[index], 45);

  useEffect(() => {
    if (!done) return undefined;
    const id = window.setTimeout(() => setIndex((value) => (value + 1) % EXAMPLES.length), 2600);
    return () => window.clearTimeout(id);
  }, [done]);

  return (
    <div className="st-root lp-root">
      <div className="st-glow-pos" aria-hidden="true"><div className="st-glow" /></div>
      <div className="st-floor lp-floor" aria-hidden="true" />

      <header className="st-header">
        <Logo />
        <div className="st-account">
          <button
            type="button"
            className="st-round"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            <ThemeIcon theme={theme} />
          </button>
          <button type="button" className="st-pill" onClick={onSignIn}>Sign in</button>
        </div>
      </header>

      <main className="lp-main">
        <section className="lp-hero" aria-labelledby="lp-title">
          <h1 id="lp-title" className="lp-title">
            Ideas in. <span>3D objects out.</span>
          </h1>
          <p className="lp-lede">
            Describe an object, or show it with one photo or three. atomSphere turns it into a 3D
            model you can light, place on real terrain and keep.
          </p>

          <div className="lp-demo" aria-hidden="true">
            <div className="lp-object">
              <Cube state={done ? "ready" : "making"} size={96} />
              <span className="st-hero-shadow" />
            </div>
            <div className="lp-prompt">
              <span className="lp-prompt-text">{typed}<span className={`st-caret ${done ? "is-idle" : ""}`} /></span>
              <span className="lp-send">
                <svg width="16" height="16" viewBox="0 0 16 16"><path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </span>
            </div>
          </div>

          <div className="lp-actions">
            <button type="button" className="st-primary lp-cta" onClick={onStart}>Start creating</button>
            <span className="st-hint">Free while in preview</span>
          </div>
        </section>

        <section className="lp-steps" aria-label="How it works">
          {STEPS.map((step, i) => (
            <article key={step.title} className="lp-step">
              <span className="lp-step-num">{String(i + 1).padStart(2, "0")}</span>
              <h2>{step.title}</h2>
              <p>{step.body}</p>
            </article>
          ))}
        </section>
      </main>

      <footer className="lp-footer">
        <Logo size={16} />
        <span>© {new Date().getFullYear()} atomSphere</span>
      </footer>
    </div>
  );
}
