import { useMemo, useState } from "react";
import { HouseIcon, PlusIcon, UploadIcon } from "../brand/icons";
import Cube from "./Cube";
import { findCategory, jobTitle, statusGroup } from "./model";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "ready", label: "Ready" },
  { id: "active", label: "Making" },
  { id: "failed", label: "Didn't finish" },
];

function shortDate(createdAt) {
  return createdAt ? new Date(createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";
}

function PropertyItem({ job, onOpen }) {
  const date = shortDate(job.createdAt);
  return (
    <li>
      <button type="button" className="st-item is-link" onClick={() => onOpen(job)} aria-label={`Open ${jobTitle(job)} in Studio`}>
        <span className="st-pedestal is-property">
          <HouseIcon size={52} />
        </span>
        <span className="st-item-text">
          <b>{jobTitle(job)}</b>
          <span>{date ? `Property · ${date}` : "Property"}</span>
        </span>
      </button>
    </li>
  );
}

function ObjectItem({ job, onOpen }) {
  const group = statusGroup(job.status);
  const date = shortDate(job.createdAt);
  const meta = [findCategory(job.category)?.label, date].filter(Boolean).join(" · ");
  const cubeState = group === "ready" ? "ready" : group === "active" ? "making" : "failed";

  const body = (
    <>
      <span className="st-pedestal">
        <Cube state={cubeState} size={60} />
        <span className="st-pedestal-shadow" aria-hidden="true" />
        {group === "active" && (
          <span className="st-badge is-dark">{job.inputMode === "upload" ? "Uploading" : "Making"}</span>
        )}
        {group === "ready" && job.inputMode === "upload" && <span className="st-badge is-light">Uploaded</span>}
      </span>
      <span className="st-item-text" title={job.description || undefined}>
        <b>{jobTitle(job)}</b>
        <span className={group === "failed" ? "is-danger" : ""} title={group === "failed" ? job.failureReason : undefined}>
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

/**
 * The signed-in user's properties, then their objects: the furniture, cars and other
 * models they place in properties (made there or here, or uploaded).
 */
export default function Shelf({ jobs, loading, error, onReload, onOpen, onUpload, onNewProperty, onMakeObject }) {
  const [filter, setFilter] = useState("all");

  const properties = useMemo(() => jobs
    .filter((job) => job.inputMode === "property")
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)), [jobs]);
  const objects = useMemo(() => jobs.filter((job) => job.inputMode !== "property"), [jobs]);

  const counts = useMemo(() => {
    const result = { all: objects.length, ready: 0, active: 0, failed: 0 };
    objects.forEach((job) => {
      const group = statusGroup(job.status);
      if (group in result) result[group] += 1;
    });
    return result;
  }, [objects]);

  const visible = useMemo(() => {
    const rank = { active: 0, ready: 1, failed: 2, other: 3 };
    return objects
      .filter((job) => filter === "all" || statusGroup(job.status) === filter)
      .sort((a, b) => {
        const difference = rank[statusGroup(a.status)] - rank[statusGroup(b.status)];
        return difference || new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
      });
  }, [objects, filter]);

  return (
    <>
      {error && (
        <p className="st-alert" role="alert">
          {error}{" "}
          <button type="button" className="st-link" onClick={onReload}>Try again</button>
        </p>
      )}

      <section className="st-shelf-section" aria-labelledby="st-properties-title">
        <div className="st-shelf-bar">
          <h2 id="st-properties-title" className="st-shelf-title">
            Properties {!loading && <span>{properties.length}</span>}
          </h2>
          <button type="button" className="st-secondary st-upload-open" onClick={onNewProperty}>
            <PlusIcon size={16} /> New property
          </button>
        </div>
        {loading ? (
          <p className="st-hint" role="status">Loading your shelf…</p>
        ) : properties.length === 0 ? (
          <p className="st-hint">No properties yet. Start one from its floorplan: a PDF or a photo of the plan.</p>
        ) : (
          <ul className="st-shelf">
            {properties.map((job) => <PropertyItem key={job.jobId} job={job} onOpen={onOpen} />)}
          </ul>
        )}
      </section>

      {!loading && (
        <section className="st-shelf-section" aria-labelledby="st-objects-title">
          <div className="st-shelf-bar">
            <h2 id="st-objects-title" className="st-shelf-title">
              Objects <span>{objects.length}</span>
            </h2>
            <div className="st-shelf-actions">
              <button type="button" className="st-secondary st-upload-open" onClick={onMakeObject}>
                <PlusIcon size={16} /> Make an object
              </button>
              <button type="button" className="st-secondary st-upload-open" onClick={onUpload}>
                <UploadIcon /> Upload model
              </button>
            </div>
          </div>
          <p className="st-hint">
            Furniture, cars, plants: made from a sentence or photos, or uploaded. To put one in a
            property, open the property and choose Add an object.
          </p>
          {objects.length > 0 && (
            <>
              <div role="group" aria-label="Filter objects" className="st-filters">
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
              {visible.length === 0 ? (
                <p className="st-hint">Nothing in this filter.</p>
              ) : (
                <ul className="st-shelf">
                  {visible.map((job) => (
                    <ObjectItem key={`${job.jobId}-${job.createdAt || ""}`} job={job} onOpen={onOpen} />
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      )}
    </>
  );
}
