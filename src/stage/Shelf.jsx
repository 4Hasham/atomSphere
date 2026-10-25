import { useMemo, useState } from "react";
import Cube from "./Cube";
import { findCategory, jobTitle, statusGroup } from "./model";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "ready", label: "Ready" },
  { id: "active", label: "Making" },
  { id: "failed", label: "Didn't finish" },
];

function ShelfItem({ job, onOpen }) {
  const group = statusGroup(job.status);
  const date = job.createdAt
    ? new Date(job.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : "";
  const meta = [findCategory(job.category)?.label, date].filter(Boolean).join(" · ");
  const cubeState = group === "ready" ? "ready" : group === "active" ? "making" : "failed";

  const body = (
    <>
      <span className="st-pedestal">
        <Cube state={cubeState} size={60} />
        <span className="st-pedestal-shadow" aria-hidden="true" />
        {group === "active" && <span className="st-badge is-dark">Making</span>}
      </span>
      <span className="st-item-text">
        <b>{jobTitle(job)}</b>
        <span className={group === "failed" ? "is-danger" : ""}>
          {group === "failed" ? `Didn't finish${date ? ` · ${date}` : ""}` : meta}
        </span>
      </span>
    </>
  );

  if (group === "ready") {
    return (
      <li>
        <button type="button" className="st-item is-link" onClick={() => onOpen(job)} aria-label={`Open ${jobTitle(job)} in Studio`}>
          {body}
        </button>
      </li>
    );
  }

  return (
    <li>
      <div className="st-item">{body}</div>
    </li>
  );
}

export default function Shelf({ jobs, loading, error, onReload, onOpen, onNew }) {
  const [filter, setFilter] = useState("all");

  const counts = useMemo(() => {
    const result = { all: jobs.length, ready: 0, active: 0, failed: 0 };
    jobs.forEach((job) => {
      const group = statusGroup(job.status);
      if (group in result) result[group] += 1;
    });
    return result;
  }, [jobs]);

  const visible = useMemo(() => {
    const rank = { active: 0, ready: 1, failed: 2, other: 3 };
    return jobs
      .filter((job) => filter === "all" || statusGroup(job.status) === filter)
      .sort((a, b) => {
        const difference = rank[statusGroup(a.status)] - rank[statusGroup(b.status)];
        return difference || new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
      });
  }, [jobs, filter]);

  return (
    <>
      <div className="st-shelf-bar">
        <div role="group" aria-label="Filter" className="st-filters">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={filter === item.id}
              className={filter === item.id ? "is-on" : ""}
              onClick={() => setFilter(item.id)}
            >
              {item.label} <span>{counts[item.id]}</span>
            </button>
          ))}
        </div>
        <button type="button" className="st-secondary" onClick={onNew}>New model</button>
      </div>

      {error && (
        <p className="st-alert" role="alert">
          {error}{" "}
          <button type="button" className="st-link" onClick={onReload}>Try again</button>
        </p>
      )}

      {loading ? (
        <p className="st-hint" role="status">Loading your shelf…</p>
      ) : visible.length === 0 ? (
        <p className="st-hint">{jobs.length === 0 ? "Nothing here yet. Your models will appear here while they're made." : "Nothing in this filter."}</p>
      ) : (
        <ul className="st-shelf">
          {visible.map((job) => (
            <ShelfItem key={`${job.jobId}-${job.createdAt || ""}`} job={job} onOpen={onOpen} />
          ))}
        </ul>
      )}
    </>
  );
}
