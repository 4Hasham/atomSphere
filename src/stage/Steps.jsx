import { useEffect, useMemo, useState } from "react";
import {
  INPUT_MODES,
  MAX_PROMPT_LENGTH,
  MODEL_CATEGORIES,
  MULTIVIEW_NAMES,
  PLANS,
  checkImage,
  findPlan,
} from "./model";

function useObjectUrl(file) {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => (url ? () => URL.revokeObjectURL(url) : undefined), [url]);
  return url;
}

function Footer({ hint, hintTone, children }) {
  return (
    <div className="st-footer">
      <span className={`st-hint ${hintTone === "warn" ? "is-warn" : ""}`}>{hint}</span>
      {children}
    </div>
  );
}

function PhotoSlot({ id, file, title, caption, tall, onPick, onRemove }) {
  const preview = useObjectUrl(file);
  const [dragging, setDragging] = useState(false);

  function handleFiles(list) {
    const picked = list?.[0];
    if (picked) onPick(picked);
  }

  if (file) {
    return (
      <figure className={`st-slot is-filled ${tall ? "is-tall" : ""}`}>
        {preview && <img src={preview} alt="" />}
        <figcaption>
          <span>{title}</span>
          <button type="button" onClick={onRemove} aria-label={`Remove ${title.toLowerCase()} photo`}>
            Remove
          </button>
        </figcaption>
      </figure>
    );
  }

  return (
    <label
      htmlFor={id}
      className={`st-slot ${tall ? "is-tall" : ""} ${dragging ? "is-dragging" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        handleFiles(event.dataTransfer.files);
      }}
    >
      <input
        id={id}
        className="sr-only"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(event) => {
          handleFiles(event.target.files);
          event.target.value = "";
        }}
      />
      {caption && <span className="st-slot-caption">{caption}</span>}
      <strong>{title}</strong>
      <span className="st-slot-sub">Drop or browse</span>
    </label>
  );
}

export function InputStep({ draft, update, status, onNext, setError }) {
  function pickFile(file, apply) {
    const problem = checkImage(file);
    if (problem) {
      setError(problem);
      return;
    }
    setError("");
    apply(file);
  }

  return (
    <>
      <div role="tablist" aria-label="Input type" className="st-tabs">
        {INPUT_MODES.map((mode) => (
          <button
            key={mode.id}
            type="button"
            role="tab"
            aria-selected={draft.mode === mode.id}
            className={draft.mode === mode.id ? "is-on" : ""}
            onClick={() => {
              setError("");
              update({ mode: mode.id });
            }}
          >
            <b>{mode.label}</b>
            <span>{mode.hint}</span>
          </button>
        ))}
      </div>

      {draft.mode === "prompt" && (
        <div className="st-field">
          <label htmlFor="st-prompt" className="sr-only">Describe the object</label>
          <textarea
            id="st-prompt"
            className="st-prompt"
            rows={4}
            maxLength={MAX_PROMPT_LENGTH}
            value={draft.prompt}
            placeholder="A brass desk lamp with a folding arm and a green glass shade"
            onChange={(event) => update({ prompt: event.target.value })}
          />
          <span className="st-count" aria-live="polite">{draft.prompt.length} / {MAX_PROMPT_LENGTH}</span>
        </div>
      )}

      {draft.mode === "single" && (
        <PhotoSlot
          id="st-single"
          tall
          file={draft.single}
          title="Drop one photo, or browse"
          caption="JPG, PNG or WEBP · up to 4 MB"
          onPick={(file) => pickFile(file, (accepted) => update({ single: accepted }))}
          onRemove={() => update({ single: null })}
        />
      )}

      {draft.mode === "multiview" && (
        <div className="st-views">
          {MULTIVIEW_NAMES.map((name, index) => (
            <PhotoSlot
              key={name}
              id={`st-view-${name}`}
              file={draft.views[name]}
              title={name.replace(/^./, (letter) => letter.toUpperCase())}
              caption={`${index * 90}°`}
              onPick={(file) => pickFile(file, (accepted) => update({ views: { ...draft.views, [name]: accepted } }))}
              onRemove={() => update({ views: { ...draft.views, [name]: null } })}
            />
          ))}
        </div>
      )}

      <Footer hint={status.hint} hintTone={!status.ok && draft.mode !== "prompt" ? "warn" : ""}>
        <button type="button" className="st-primary" onClick={onNext} disabled={!status.ok}>
          Continue to category
        </button>
      </Footer>
    </>
  );
}

export function CategoryStep({ draft, update, suggested, onNext }) {
  return (
    <>
      <div className="st-grid st-cats" role="radiogroup" aria-label="Category">
        {MODEL_CATEGORIES.map((category) => {
          const selected = draft.category === category.value;
          return (
            <button
              key={category.value}
              type="button"
              role="radio"
              aria-checked={selected}
              className={`st-choice ${selected ? "is-on" : ""}`}
              onClick={() => update({ category: category.value })}
            >
              <b>{category.label}</b>
              <span>{category.hint}</span>
              {suggested === category.value && <em className="st-tag">Suggested</em>}
            </button>
          );
        })}
      </div>
      <Footer hint={draft.category ? "This tunes the shape." : "Pick the closest match to continue."}>
        <button type="button" className="st-primary" onClick={onNext} disabled={!draft.category}>
          Continue to payment
        </button>
      </Footer>
    </>
  );
}

export function PaymentStep({ draft, update, onNext }) {
  const plan = findPlan(draft.plan);
  return (
    <>
      <div className="st-grid st-plans" role="radiogroup" aria-label="Finish">
        {PLANS.map((item) => {
          const selected = draft.plan === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={selected}
              className={`st-choice st-plan ${selected ? "is-on" : ""}`}
              onClick={() => update({ plan: item.id })}
            >
              <span className="st-plan-top">
                <b>{item.name}</b>
                <span className="st-price">${item.price}</span>
              </span>
              <span>{item.description}</span>
            </button>
          );
        })}
      </div>
      <Footer hint="Free during preview. You won't be charged today; pricing applies at launch.">
        <button type="button" className="st-primary" onClick={onNext}>
          Continue with {plan.name} · ${plan.price}
        </button>
      </Footer>
    </>
  );
}

export function AccountStep({ auth, submitting, onSubmit }) {
  const [tab, setTab] = useState("signup");
  const email = auth.user?.profile?.email;

  if (auth.isAuthenticated) {
    return (
      <>
        <p className="st-signed">
          Signed in as <b>{email || "your account"}</b>. Your model goes on your shelf.
        </p>
        <Footer hint="Generation usually takes a few minutes.">
          <button type="button" className="st-primary" onClick={onSubmit} disabled={submitting}>
            {submitting ? "Starting…" : "Generate my model"}
          </button>
        </Footer>
      </>
    );
  }

  return (
    <>
      <div role="tablist" aria-label="Account" className="st-tabs st-tabs-small">
        <button type="button" role="tab" aria-selected={tab === "signup"} className={tab === "signup" ? "is-on" : ""} onClick={() => setTab("signup")}>
          <b>Create account</b>
        </button>
        <button type="button" role="tab" aria-selected={tab === "signin"} className={tab === "signin" ? "is-on" : ""} onClick={() => setTab("signin")}>
          <b>Sign in</b>
        </button>
      </div>
      <ul className="st-trust">
        <li><b>Just your email</b>No profile, no marketing.</li>
        <li><b>Private shelf</b>Only you see your models.</li>
        <li><b>Come back anytime</b>Reopen and stage them later.</li>
      </ul>
      <Footer hint="Your draft is kept. Generation starts as soon as you're in.">
        <button type="button" className="st-primary" onClick={onSubmit} disabled={submitting}>
          {submitting ? "Opening sign-in…" : tab === "signup" ? "Create account & generate" : "Sign in & generate"}
        </button>
      </Footer>
    </>
  );
}
