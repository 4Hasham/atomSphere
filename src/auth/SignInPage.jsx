import Logo from "../brand/Logo";
import ThemeToggle from "../brand/ThemeToggle";
import AuthForm from "./AuthForm";
import "../stage/stage.css";
import "./auth.css";

/** /signin: create an account or sign in, then carry on to the shelf. */
export default function SignInPage({ theme, toggleTheme, initialMode = "signin", onDone, onHome }) {
  return (
    <div className="st-root">
      <div className="st-glow-pos" aria-hidden="true"><div className="st-glow" /></div>
      <div className="st-floor" aria-hidden="true" />

      <header className="st-header">
        <button type="button" className="st-brand" onClick={onHome} aria-label="atomSphere, home">
          <Logo />
        </button>
        {/* The header's middle column (the Stage's steps); empty here. */}
        <span aria-hidden="true" />
        <div className="st-account">
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </div>
      </header>

      <main className="auth-main">
        <h1 className="auth-headline">See the house before you buy it.</h1>
        <div className="st-card">
          <AuthForm initialMode={initialMode} onDone={onDone} />
        </div>
        <p className="auth-aside">Just your email: no profile, no marketing. Only you see your properties.</p>
      </main>
    </div>
  );
}
