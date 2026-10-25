import { useEffect, useState } from "react";
import { jobTitle, statusGroup } from "./model";

const STATUS_TEXT = {
  uploading: "Uploading",
  queued: "In queue",
  processing: "Generating",
  running: "Generating",
};

// Wide enough that the open tray fits beside the centred card without covering it.
const OPEN_BY_DEFAULT_QUERY = "(min-width: 1440px)";

function elapsedSince(createdAt, now) {
  const started = Date.parse(createdAt);
  if (!Number.isFinite(started)) return "";
  const seconds = Math.max(0, Math.floor((now - started) / 1000));
  const minutes = Math.floor(seconds / 60);
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * Sticky list of the user's running generations. Jobs that finish while it is on
 * screen stay listed as ready (or failed) until dismissed, so the result is never missed.
 */
export default function GenerationTray({ jobs, onOpen }) {
  const [open, setOpen] = useState(() => window.matchMedia(OPEN_BY_DEFAULT_QUERY).matches);
  const [now, setNow] = useState(() => Date.now());
  const [watched, setWatched] = useState(() => new Set());
  const [dismissed, setDismissed] = useState(() => new Set());

  const active = jobs.filter((job) => statusGroup(job.status) === "active");
  const unwatched = active.filter((job) => !watched.has(job.jobId));
  if (unwatched.length > 0) {
    setWatched((current) => new Set([...current, ...unwatched.map((job) => job.jobId)]));
  }
  const finished = jobs.filter((job) => (
    watched.has(job.jobId) && statusGroup(job.status) !== "active" && !dismissed.has(job.jobId)
  ));

  const ticking = active.length > 0;
  useEffect(() => {
    if (!ticking) return undefined;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [ticking]);

  if (active.length === 0 && finished.length === 0) return null;

  const readyCount = finished.filter((job) => statusGroup(job.status) === "ready").length;
  const summary = active.length > 0
    ? `Generating ${active.length}`
    : `${readyCount} ready`;

  function dismiss(jobId) {
    setDismissed((current) => new Set([...current, jobId]));
  }

  return (
    <aside className={`st-tray ${open ? "is-open" : ""}`} aria-label="Model generations">
      <button
        type="button"
        className="st-tray-head"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className={`st-tray-dot ${active.length > 0 ? "is-busy" : ""}`} aria-hidden="true" />
        <span className="st-tray-summary">{summary}</span>
        <span className="st-tray-toggle">{open ? "Hide" : "Show"}</span>
      </button>

      {/* Announces arrivals and completions, not the ticking timers. */}
      <p className="sr-only" aria-live="polite">
        {active.length} generating{readyCount > 0 ? `, ${readyCount} ready` : ""}
      </p>

      {open && (
        <ul className="st-tray-list">
          {active.map((job) => {
            const status = String(job.status || "").toLowerCase();
            const elapsed = elapsedSince(job.createdAt, now);
            return (
              <li key={job.jobId} className="st-tray-item">
                <b title={jobTitle(job)}>{jobTitle(job)}</b>
                <span className="st-tray-meta">
                  {STATUS_TEXT[status] ?? "Working"}
                  {elapsed && <span aria-hidden="true"> · {elapsed}</span>}
                </span>
                <span className="st-tray-bar" aria-hidden="true"><span /></span>
              </li>
            );
          })}
          {finished.map((job) => {
            const ready = statusGroup(job.status) === "ready";
            return (
              <li key={job.jobId} className="st-tray-item is-finished">
                <b title={jobTitle(job)}>{jobTitle(job)}</b>
                <span className="st-tray-actions">
                  {ready ? (
                    <button type="button" className="st-link" onClick={() => onOpen(job)}>
                      Open in Studio
                    </button>
                  ) : (
                    <span className="is-danger">Didn&apos;t finish</span>
                  )}
                  <button
                    type="button"
                    className="st-tray-dismiss"
                    aria-label={`Dismiss ${jobTitle(job)}`}
                    onClick={() => dismiss(job.jobId)}
                  >
                    ✕
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
