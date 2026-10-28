import { lazy, Suspense, useEffect, useState } from "react";
import Logo from "../brand/Logo";
import ThemeToggle from "../brand/ThemeToggle";
import Cube from "../stage/Cube";
import useTypewriter from "../stage/useTypewriter";
import "../stage/stage.css";
import "./landing.css";

// The 3D house loads after the page appears, so the first paint stays light on mobile data.
const HeroHouse = lazy(() => import("./HeroHouse"));

const STEPS = [
  {
    title: "Upload the floorplan",
    body: "A PDF or a photo of the plan. Mark one measurement you know and it's to scale.",
  },
  {
    title: "Trace it in minutes",
    body: "Walls, doors, windows and rooms snap into place, in feet and inches. Add every floor.",
  },
  {
    title: "Explore it in 3D",
    body: "Open the house floor by floor, set it on its real location, and change the light and weather.",
  },
];

const AUDIENCES = [
  {
    title: "Housing societies & developers",
    body: "Show buyers every house design in the society, room by room, not just a flythrough.",
  },
  {
    title: "Real estate agencies",
    body: "A 3D house for each listing, made from the plan you already have.",
  },
  {
    title: "Overseas buyers",
    body: "Check the layout, room sizes and location before sending money.",
  },
];

// What people furnish a house with, typed out one after another.
const OBJECT_EXAMPLES = [
  "A teak sofa set for the drawing room",
  "A white Corolla in the porch",
  "A water tank on the roof",
  "A king-size bed with two side tables",
];

function ObjectDemo() {
  const [index, setIndex] = useState(0);
  const { typed, done } = useTypewriter(OBJECT_EXAMPLES[index], 45);

  useEffect(() => {
    if (!done) return undefined;
    const id = window.setTimeout(() => setIndex((value) => (value + 1) % OBJECT_EXAMPLES.length), 2600);
    return () => window.clearTimeout(id);
  }, [done]);

  return (
    <div className="lp-demo" aria-hidden="true">
      <div className="lp-object">
        <Cube state={done ? "ready" : "making"} size={84} />
        <span className="st-hero-shadow" />
      </div>
      <div className="lp-prompt">
        <span className="lp-prompt-text">{typed}<span className={`st-caret ${done ? "is-idle" : ""}`} /></span>
        <span className="lp-send">
          <svg width="16" height="16" viewBox="0 0 16 16"><path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
      </div>
    </div>
  );
}

export default function Landing({ theme, toggleTheme, onStart, onSignIn }) {
  return (
    <div className="st-root lp-root">
      <div className="st-glow-pos" aria-hidden="true"><div className="st-glow" /></div>
      <div className="st-floor lp-floor" aria-hidden="true" />

      <header className="st-header">
        <Logo />
        <div className="st-account">
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
          <button type="button" className="st-pill" onClick={onSignIn}>Sign in</button>
        </div>
      </header>

      <main className="lp-main">
        <section className="lp-hero" aria-labelledby="lp-title">
          <h1 id="lp-title" className="lp-title">
            See the house <span>before you buy it.</span>
          </h1>
          <p className="lp-lede">
            Upload a floorplan and atomSphere turns it into a 3D house you can explore. Open it
            floor by floor, check every room&apos;s size, and see it on its real location.
          </p>

          <Suspense fallback={<div className="lp-house is-loading"><Cube state="making" size={96} /></div>}>
            <HeroHouse />
          </Suspense>

          <div className="lp-actions">
            <button type="button" className="st-primary lp-cta" onClick={onStart}>Start with a floorplan</button>
            <span className="st-hint">PDF or image · free while in preview</span>
          </div>
        </section>

        <section className="lp-section" aria-labelledby="lp-how">
          <h2 id="lp-how" className="lp-section-title">How it works</h2>
          <div className="lp-steps">
            {STEPS.map((step, index) => (
              <article key={step.title} className="lp-step">
                <span className="lp-step-num">{String(index + 1).padStart(2, "0")}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="lp-objects" aria-labelledby="lp-objects-title">
          <div className="lp-objects-copy">
            <span className="lp-eyebrow">Furnish it</span>
            <h2 id="lp-objects-title">Stage every room from a sentence or a photo</h2>
            <p>
              Describe a sofa set, a car for the porch or a water tank for the roof, or show it in a
              photo. atomSphere makes it in 3D and you place it in the house, room by room, so
              buyers see a home, not an empty shell.
            </p>
            <div className="lp-actions is-left">
              <button type="button" className="st-secondary" onClick={onStart}>Start with a floorplan</button>
              <span className="st-hint">Objects from $3 · free while in preview</span>
            </div>
          </div>
          <ObjectDemo />
        </section>

        <section className="lp-section" aria-labelledby="lp-who">
          <h2 id="lp-who" className="lp-section-title">Made for property in Pakistan</h2>
          <div className="lp-steps">
            {AUDIENCES.map((audience) => (
              <article key={audience.title} className="lp-step">
                <h3>{audience.title}</h3>
                <p>{audience.body}</p>
              </article>
            ))}
          </div>
        </section>

      </main>

      <footer className="lp-footer">
        <Logo size={16} />
        <span>© {new Date().getFullYear()} atomSphere</span>
      </footer>
    </div>
  );
}
