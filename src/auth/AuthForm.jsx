import { useState } from "react";
import { trackEvent } from "../analytics";
import { useAuth } from "./useAuth";
import { friendlyMessage, isEmailTaken, PASSWORD_RULES } from "./cognito";

// An account waiting for its email code: { username, email }. Kept so a reload, or
// coming back later, can still finish it (the email only signs in once verified).
const PENDING_SIGNUP_KEY = "atomsphere_pending_signup";

function readPending() {
  try {
    return JSON.parse(localStorage.getItem(PENDING_SIGNUP_KEY) || "null");
  } catch {
    return null;
  }
}

function writePending(pending) {
  try {
    if (pending) localStorage.setItem(PENDING_SIGNUP_KEY, JSON.stringify(pending));
    else localStorage.removeItem(PENDING_SIGNUP_KEY);
  } catch {
    // Storage blocked: the code step still works until the page closes.
  }
}

/** Why a new password won't be accepted (the pool's policy), or "". */
function passwordProblem(password) {
  const ok = password.length >= 8 && /[a-z]/.test(password) && /[A-Z]/.test(password)
    && /\d/.test(password) && /[^A-Za-z0-9]/.test(password);
  return ok ? "" : PASSWORD_RULES;
}

const looksLikeEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

const TITLES = {
  confirm: "Check your email",
  forgot: "Reset your password",
  reset: "Choose a new password",
};

/**
 * Create an account or sign in, inside atomSphere. Steps: signup → confirm (the
 * 6-digit code Cognito emails) → signed in; signin; forgot → reset → signed in.
 * `onDone(session)` runs once signed in. `labels` overrides the main buttons' text.
 */
export default function AuthForm({ initialMode = "signup", labels = {}, onDone }) {
  const auth = useAuth();
  // Back with an account still waiting for its code: carry on from that step.
  const [mode, setMode] = useState(() => (initialMode === "signup" && readPending() ? "confirm" : initialMode));
  const [email, setEmail] = useState(() => readPending()?.email ?? "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState("");
  const [username, setUsername] = useState(null); // the account awaiting its code
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(() => (
    initialMode === "signup" && readPending() ? `Enter the 6-digit code we emailed to ${readPending().email}.` : ""
  ));
  const [busy, setBusy] = useState(false);

  function go(next, message = "") {
    setMode(next);
    setError("");
    setNotice(message);
    setCode("");
  }

  async function run(action) {
    setError("");
    setBusy(true);
    try {
      await action();
    } catch (actionError) {
      setError(friendlyMessage(actionError));
    } finally {
      setBusy(false);
    }
  }

  // Waiting for a code: ask for it again (Cognito sends a new one) and show that step.
  async function toConfirm(account) {
    setUsername(account);
    await auth.resendCode(account).catch(() => {});
    go("confirm", `We've emailed a new 6-digit code to ${email.trim()}.`);
  }

  const submit = {
    signup: () => run(async () => {
      if (!looksLikeEmail(email)) throw new Error("Please enter a valid email address.");
      const problem = passwordProblem(password);
      if (problem) throw new Error(`That password is too weak. ${problem}`);
      let account;
      try {
        account = await auth.signUp(email, password);
      } catch (signUpError) {
        // Already someone's: on to signing in, email kept.
        if (isEmailTaken(signUpError)) go("signin");
        throw signUpError;
      }
      if (account.confirmed) {
        trackEvent("sign_up", { method: "email" });
        onDone?.(await auth.signIn(email, password));
        return;
      }
      writePending({ username: account.username, email: email.trim() });
      setUsername(account.username);
      go("confirm", `We've emailed a 6-digit code to ${email.trim()}.`);
    }),

    confirm: () => run(async () => {
      const account = username ?? readPending()?.username;
      try {
        await auth.confirmSignUp(account, code);
      } catch (confirmError) {
        if (isEmailTaken(confirmError)) {
          writePending(null);
          go("signin");
        }
        throw confirmError;
      }
      writePending(null);
      trackEvent("sign_up", { method: "email" });
      if (password) {
        onDone?.(await auth.signIn(email, password));
      } else {
        go("signin", "Your email is confirmed. Sign in to continue.");
      }
    }),

    signin: () => run(async () => {
      try {
        onDone?.(await auth.signIn(email, password));
      } catch (signInError) {
        const pending = readPending();
        // An email that isn't confirmed yet can't sign in by itself; its account can,
        // and says so, which takes the person to the code step.
        const unconfirmed = signInError.code === "UserNotConfirmedException";
        if (!unconfirmed && pending?.email.toLowerCase() === email.trim().toLowerCase()) {
          try {
            onDone?.(await auth.signIn(pending.username, password));
            return;
          } catch (pendingError) {
            if (pendingError.code === "UserNotConfirmedException") {
              await toConfirm(pending.username);
              return;
            }
          }
        }
        if (unconfirmed && pending) {
          await toConfirm(pending.username);
          return;
        }
        throw signInError;
      }
    }),

    forgot: () => run(async () => {
      if (!email.trim()) throw new Error("Please enter your email address.");
      await auth.forgotPassword(email);
      setPassword("");
      go("reset", `If ${email.trim()} has an account, we've emailed it a 6-digit code.`);
    }),

    reset: () => run(async () => {
      const problem = passwordProblem(password);
      if (problem) throw new Error(`That password is too weak. ${problem}`);
      await auth.resetPassword(email, code, password);
      onDone?.(await auth.signIn(email, password));
    }),
  }[mode];

  const buttonText = {
    signup: labels.signup ?? "Create account",
    signin: labels.signin ?? "Sign in",
    confirm: labels.confirm ?? "Confirm email",
    forgot: "Email me a code",
    reset: "Set password & sign in",
  }[mode];
  const showsEmail = mode !== "confirm" && mode !== "reset";
  const showsPassword = mode === "signup" || mode === "signin" || mode === "reset";
  const showsCode = mode === "confirm" || mode === "reset";

  return (
    <form
      className="auth-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (!busy) submit();
      }}
    >
      {mode === "signup" || mode === "signin" ? (
        <div role="tablist" aria-label="Account" className="st-tabs st-tabs-small">
          {[["signup", "Create account"], ["signin", "Sign in"]].map(([id, text]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={mode === id}
              className={mode === id ? "is-on" : ""}
              onClick={() => go(id)}
            >
              <b>{text}</b>
            </button>
          ))}
        </div>
      ) : (
        <h2 className="auth-title">{TITLES[mode]}</h2>
      )}

      {notice && <p className="auth-notice" role="status">{notice}</p>}
      {error && <p className="st-alert" role="alert">{error}</p>}

      {showsEmail && (
        <div className="st-field">
          <label htmlFor="auth-email" className="st-label">Email</label>
          <input
            id="auth-email"
            className="st-input"
            type="email"
            // Sign-in also takes a username: accounts made on Cognito's hosted page have one.
            autoComplete={mode === "signup" ? "email" : "username"}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </div>
      )}

      {showsCode && (
        <div className="st-field">
          <label htmlFor="auth-code" className="st-label">6-digit code</label>
          <input
            id="auth-code"
            className="st-input auth-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
            required
          />
        </div>
      )}

      {showsPassword && (
        <div className="st-field">
          <label htmlFor="auth-password" className="st-label">
            {mode === "reset" ? "New password" : "Password"}
          </label>
          <div className="auth-password">
            <input
              id="auth-password"
              className="st-input"
              type={showPassword ? "text" : "password"}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <button
              type="button"
              className="auth-show"
              aria-pressed={showPassword}
              onClick={() => setShowPassword((value) => !value)}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
          {mode !== "signin" && <span className="st-hint">{PASSWORD_RULES}</span>}
        </div>
      )}

      <div className="st-footer">
        <span className="auth-links">
          {mode === "signin" && (
            <button type="button" className="st-link" onClick={() => go("forgot")}>Forgot password?</button>
          )}
          {mode === "confirm" && (
            <>
              <button
                type="button"
                className="st-link"
                disabled={busy}
                onClick={() => run(async () => {
                  await auth.resendCode(username ?? readPending()?.username);
                  setNotice("We've sent a new code. It can take a minute to arrive.");
                })}
              >
                Send a new code
              </button>
              <button
                type="button"
                className="st-link"
                onClick={() => {
                  writePending(null);
                  setUsername(null);
                  setPassword("");
                  go("signup");
                }}
              >
                Use a different email
              </button>
            </>
          )}
          {(mode === "forgot" || mode === "reset") && (
            <button type="button" className="st-link" onClick={() => go("signin")}>Back to sign in</button>
          )}
        </span>
        <button type="submit" className="st-primary" disabled={busy}>
          {busy ? "Please wait…" : buttonText}
        </button>
      </div>
    </form>
  );
}
