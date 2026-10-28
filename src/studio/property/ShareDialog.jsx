import { useEffect, useRef, useState } from "react";
import { shareUrl } from "../../stage/propertyApi";
import { useJobsById } from "../objects/objectLibrary";
import { useScene } from "../sceneStore";

// Objects a shared link can show: Meshy (Polished) and uploads. Hunyuan3D (Standard)
// outputs may not be shown in the EU, UK or South Korea, so links leave them out
// (backend/lambdas/shared.js decides; this only explains it).
const SHOWABLE_MODELS = new Set(["meshy", "upload"]);

/**
 * The Studio header's Share button for a property, and its dialog: turn the link on,
 * copy it or send it on WhatsApp, or turn it off. `sharing` is { token, title,
 * share(): Promise, unshare(): Promise } from PropertyStudio.
 */
export default function ShareButton({ sharing }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={`studio-share ${sharing.token ? "is-on" : ""}`} onClick={() => setOpen(true)}>
        {sharing.token ? "Shared" : "Share"}
      </button>
      {open && <ShareDialog sharing={sharing} onClose={() => setOpen(false)} />}
    </>
  );
}

function ShareDialog({ sharing, onClose }) {
  const dialog = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const objects = useScene((state) => state.document.objects);
  const jobsById = useJobsById();

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  // Placed objects the link won't show: made with Standard, or not finished yet.
  const leftOut = objects.filter((object) => {
    const job = jobsById.get(object.source.jobId);
    return object.placement && job && !(SHOWABLE_MODELS.has(job.model) && job.status === "generated");
  });
  const url = sharing.token ? shareUrl(sharing.token) : "";
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(`${sharing.title} in 3D: ${url}`)}`;

  async function run(action) {
    setError("");
    setBusy(true);
    try {
      await action();
    } catch (actionError) {
      setError(actionError.message || "That didn't work. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Clipboard blocked: the link is selected for copying by hand.
      document.getElementById("share-link")?.select();
    }
  }

  return (
    <dialog ref={dialog} className="st-dialog share-dialog" aria-labelledby="share-title" onClose={onClose}>
      <div className="st-dialog-head">
        <h2 id="share-title">Share this property</h2>
        <button type="button" className="st-tray-dismiss" aria-label="Close" onClick={() => dialog.current?.close()}>✕</button>
      </div>
      <p className="st-hint">
        Anyone with the link can open the house in 3D, floor by floor, without an account.
        They can&apos;t change it, and they don&apos;t see your floorplan images.
      </p>
      {error && <p className="st-alert" role="alert">{error}</p>}

      {sharing.token ? (
        <>
          <div className="share-link">
            <label htmlFor="share-link" className="sr-only">Share link</label>
            <input id="share-link" className="st-input" readOnly value={url} onFocus={(event) => event.target.select()} />
            <button type="button" className="st-primary" onClick={copy}>{copied ? "Copied" : "Copy link"}</button>
          </div>
          <div className="share-actions">
            <a className="st-secondary share-whatsapp" href={whatsapp} target="_blank" rel="noreferrer">Send on WhatsApp</a>
            <a className="st-link" href={url} target="_blank" rel="noreferrer">Open as a viewer</a>
          </div>
        </>
      ) : (
        <div className="st-footer">
          <span className="st-hint">The link stays the same until you turn it off.</span>
          <button type="button" className="st-primary" disabled={busy} onClick={() => run(sharing.share)}>
            {busy ? "Creating…" : "Create link"}
          </button>
        </div>
      )}

      {leftOut.length > 0 && (
        <p className="share-note">
          {leftOut.length === 1 ? "1 object" : `${leftOut.length} objects`} won&apos;t appear in the link
          ({leftOut.map((object) => object.name).join(", ")}). Objects made with Standard can&apos;t
          be shown in the UK, EU or South Korea, so links leave them out; make them with Polished, or
          upload your own, to include them. Objects still being made appear once they&apos;re ready
          if they&apos;re Polished.
        </p>
      )}

      {sharing.token && (
        <div className="st-footer">
          <span className="st-hint">Turning it off stops the link working. A new link can be made later.</span>
          <button type="button" className="st-secondary" disabled={busy} onClick={() => run(sharing.unshare)}>
            {busy ? "Turning off…" : "Turn off link"}
          </button>
        </div>
      )}
    </dialog>
  );
}
