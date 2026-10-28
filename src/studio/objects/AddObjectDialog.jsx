import { useEffect, useRef, useState } from "react";
import { PhotoSlot } from "../../stage/Steps";
import prepareImage from "../../stage/prepareImage";
import {
  MAX_FILE_SIZE,
  MAX_NAME_LENGTH,
  MAX_PROMPT_LENGTH,
  MODEL_CATEGORIES,
  MULTIVIEW_NAMES,
  PLANS,
  buildRequestBody,
  checkImage,
  findCategory,
  jobSize,
  jobTitle,
  nameFromFile,
  photoBudget,
  statusGroup,
} from "../../stage/model";
import { useObjectLibrary } from "./objectLibrary";

const TABS = [
  { id: "library", label: "Your objects" },
  { id: "prompt", label: "Describe it" },
  { id: "photos", label: "From photos" },
  { id: "upload", label: "Upload .glb" },
];

const EMPTY = {
  prompt: "",
  name: "",
  photoMode: "single",
  single: null,
  views: { front: null, left: null, back: null },
  category: "furniture_decor",
  plan: "standard",
};

/** Whether the photos tab has what it needs, and why not. */
function photoState(draft) {
  if (draft.photoMode === "single") {
    return draft.single ? { ok: true } : { ok: false, hint: "Add one clear photo of the whole object." };
  }
  const views = MULTIVIEW_NAMES.map((name) => draft.views[name]).filter(Boolean);
  if (views.length < 3) return { ok: false, hint: `Add all three angles · ${views.length} of 3 added.` };
  if (views.reduce((sum, file) => sum + file.size, 0) > MAX_FILE_SIZE) {
    return { ok: false, hint: "All three photos together must be 4 MB or smaller." };
  }
  return { ok: true };
}

/**
 * Picks or makes an object for a property. `onPlace({ jobId, name, sizeMeters })` hands
 * it over to be placed with a click; one still being made shows as a placeholder until
 * it's ready. `onUpload` switches to the .glb upload.
 */
export default function AddObjectDialog({ onClose, onPlace, onUpload }) {
  const library = useObjectLibrary();
  const dialog = useRef(null);
  const objects = library.jobs.filter((job) => (
    job.inputMode !== "property" && ["ready", "active"].includes(statusGroup(job.status))
  ));
  const [tab, setTab] = useState(objects.length ? "library" : "prompt");
  const [draft, setDraft] = useState(EMPTY);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const update = (patch) => setDraft((current) => ({
    ...current,
    ...(typeof patch === "function" ? patch(current) : patch),
  }));

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const state = tab === "prompt"
    ? (draft.prompt.trim() ? { ok: true } : { ok: false, hint: "Describe it in a sentence or two." })
    : photoState(draft);

  async function pickPhoto(file, apply) {
    const problem = checkImage(file);
    if (problem) {
      setError(problem);
      return;
    }
    setError("");
    try {
      apply(await prepareImage(file, photoBudget(draft.photoMode === "multiview" ? "multiview" : "single")));
    } catch (prepareError) {
      setError(prepareError.message);
    }
  }

  async function make() {
    setError("");
    setSubmitting(true);
    const mode = tab === "prompt" ? "prompt" : draft.photoMode;
    const category = findCategory(draft.category);
    const name = (draft.name.trim() || (mode === "prompt" ? draft.prompt.trim() : "") || category.item)
      .slice(0, MAX_NAME_LENGTH);
    try {
      // Our own id, so the object can be placed now and filled in when it's ready.
      const jobId = `job-${crypto.randomUUID()}`;
      const body = await buildRequestBody({ ...draft, mode, name, description: "" });
      await library.createObject({ ...body, jobId });
      library.reload();
      onPlace({ jobId, name, sizeMeters: category.size });
    } catch (makeError) {
      setError(makeError.message || "Couldn't start making it. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      className="st-dialog add-object"
      aria-labelledby="add-object-title"
      onCancel={(event) => {
        if (submitting) event.preventDefault();
      }}
      onClose={onClose}
    >
      <div className="st-dialog-head">
        <h2 id="add-object-title">Add to this property</h2>
        <button
          type="button"
          className="st-tray-dismiss"
          aria-label="Close"
          disabled={submitting}
          onClick={() => dialog.current?.close()}
        >
          ✕
        </button>
      </div>

      <div role="tablist" aria-label="Where it comes from" className="st-tabs add-object-tabs">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={tab === item.id ? "is-on" : ""}
            disabled={submitting}
            onClick={() => {
              setError("");
              setTab(item.id);
            }}
          >
            <b>{item.label}</b>
          </button>
        ))}
      </div>

      {error && <p className="st-alert" role="alert">{error}</p>}

      {tab === "library" && (
        objects.length ? (
          <ul className="add-object-list">
            {objects.map((job) => (
              <li key={job.jobId}>
                <span className="add-object-name">
                  <b>{jobTitle(job)}</b>
                  <span>
                    {[findCategory(job.category)?.label, statusGroup(job.status) === "active" ? "Being made" : null]
                      .filter(Boolean).join(" · ")}
                  </span>
                </span>
                <button type="button" className="st-secondary" onClick={() => onPlace({
                  jobId: job.jobId,
                  name: jobTitle(job),
                  sizeMeters: jobSize(job),
                })}
                >
                  Place
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="st-hint">
            Nothing yet. Describe an object or add photos of one, and it&apos;s kept here to use
            in any of your properties.
          </p>
        )
      )}

      {tab === "prompt" && (
        <div className="st-field">
          <label htmlFor="add-object-prompt" className="sr-only">Describe the object</label>
          <textarea
            id="add-object-prompt"
            className="st-prompt"
            rows={3}
            maxLength={MAX_PROMPT_LENGTH}
            value={draft.prompt}
            placeholder="A teak sofa set with cream cushions"
            onChange={(event) => update({ prompt: event.target.value })}
          />
        </div>
      )}

      {tab === "photos" && (
        <>
          <div role="radiogroup" aria-label="Photos" className="add-object-segment">
            {[["single", "1 photo"], ["multiview", "3 photos"]].map(([id, text]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={draft.photoMode === id}
                className={draft.photoMode === id ? "is-on" : ""}
                onClick={() => update({ photoMode: id })}
              >
                {text}
              </button>
            ))}
          </div>
          {draft.photoMode === "single" ? (
            <PhotoSlot
              id="add-object-single"
              file={draft.single}
              title="Drop one photo, or browse"
              caption="JPG, PNG or WEBP"
              onPick={(file) => pickPhoto(file, (accepted) => update((current) => ({
                single: accepted,
                name: current.name || nameFromFile(accepted),
              })))}
              onRemove={() => update({ single: null })}
            />
          ) : (
            <div className="st-views">
              {MULTIVIEW_NAMES.map((name, index) => (
                <PhotoSlot
                  key={name}
                  id={`add-object-${name}`}
                  file={draft.views[name]}
                  title={name.replace(/^./, (letter) => letter.toUpperCase())}
                  caption={`${index * 90}°`}
                  onPick={(file) => pickPhoto(file, (accepted) => update((current) => ({
                    views: { ...current.views, [name]: accepted },
                  })))}
                  onRemove={() => update((current) => ({ views: { ...current.views, [name]: null } }))}
                />
              ))}
            </div>
          )}
        </>
      )}

      {(tab === "prompt" || tab === "photos") && (
        <>
          <div className="add-object-fields">
            <div className="st-field">
              <label htmlFor="add-object-name" className="st-label">Name <span>optional</span></label>
              <input
                id="add-object-name"
                className="st-input"
                maxLength={MAX_NAME_LENGTH}
                value={draft.name}
                autoComplete="off"
                placeholder="Sofa set"
                onChange={(event) => update({ name: event.target.value })}
              />
            </div>
            <div className="st-field">
              <label htmlFor="add-object-category" className="st-label">Kind</label>
              <select
                id="add-object-category"
                className="st-input"
                value={draft.category}
                onChange={(event) => update({ category: event.target.value })}
              >
                {MODEL_CATEGORIES.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div role="radiogroup" aria-label="Finish" className="add-object-segment">
            {PLANS.map((plan) => (
              <button
                key={plan.id}
                type="button"
                role="radio"
                aria-checked={draft.plan === plan.id}
                className={draft.plan === plan.id ? "is-on" : ""}
                onClick={() => update({ plan: plan.id })}
              >
                {plan.name} · ${plan.price}
              </button>
            ))}
          </div>
          <div className="st-footer">
            <span className={`st-hint ${state.ok ? "" : "is-warn"}`}>
              {state.ok
                ? "Takes a few minutes. Place it now and it appears when it's ready. Free during preview."
                : state.hint}
            </span>
            <button type="button" className="st-primary" disabled={!state.ok || submitting} onClick={make}>
              {submitting ? "Starting…" : "Make it & place it"}
            </button>
          </div>
        </>
      )}

      {tab === "upload" && (
        <>
          <p className="st-hint">
            A .glb file, such as an architect&apos;s export from SketchUp, Revit or Blender. It&apos;s
            placed at its real size, and only you can see it.
          </p>
          <div className="st-footer">
            <span className="st-hint">Up to 200 MB.</span>
            <button type="button" className="st-primary" onClick={onUpload}>Choose a .glb file</button>
          </div>
        </>
      )}
    </dialog>
  );
}
