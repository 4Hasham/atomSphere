import { useEffect, useRef, useState } from "react";
import { apiRequest } from "../api";
import inspectModel, { HEAVY_TRIANGLE_COUNT } from "./inspectModel";
import { MAX_NAME_LENGTH, MODEL_CATEGORIES, MODEL_UPLOAD_URL } from "./model";

function readableName(fileName) {
  const base = fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return base ? (base[0].toUpperCase() + base.slice(1)).slice(0, MAX_NAME_LENGTH) : "";
}

function megabytes(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

// Sends the file straight to S3 with the presigned POST; XHR for upload progress.
function postToS3(upload, file, onProgress) {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    Object.entries(upload.fields).forEach(([name, value]) => form.append(name, value));
    form.append("file", file); // must be the last field
    const request = new XMLHttpRequest();
    request.open("POST", upload.url);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    request.onload = () => (request.status >= 200 && request.status < 300
      ? resolve()
      : reject(new Error(request.status === 400
        ? "The storage service refused this file (it may be too large)."
        : `Upload failed (${request.status}).`)));
    request.onerror = () => reject(new Error("Upload failed. Check your connection and try again."));
    request.send(form);
  });
}

/**
 * Upload your own .glb (signed-in users only; the shelf that opens this requires it).
 * The model is private: only its owner can get a link to view it.
 */
export default function UploadModel({ auth, onClose, onUploaded }) {
  const [file, setFile] = useState(null);
  const [details, setDetails] = useState(null);
  const [checking, setChecking] = useState(false);
  const [name, setName] = useState("");
  // The name follows the picked file until the person types their own.
  const [nameEdited, setNameEdited] = useState(false);
  const [category, setCategory] = useState("building_structure");
  const [rights, setRights] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState("");
  const dialog = useRef(null);
  const uploading = progress !== null;

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  async function pick(picked) {
    if (!picked) return;
    setError("");
    setFile(null);
    setDetails(null);
    setChecking(true);
    try {
      const result = await inspectModel(picked);
      setFile(picked);
      setDetails(result);
      if (!nameEdited) setName(readableName(picked.name));
    } catch (inspectError) {
      setError(inspectError.message);
    } finally {
      setChecking(false);
    }
  }

  async function upload() {
    const token = auth.user?.access_token;
    if (!auth.isAuthenticated || !token) {
      setError("Sign in to upload a model.");
      return;
    }
    setError("");
    setProgress(0);
    let jobId = null;
    try {
      const started = await apiRequest(MODEL_UPLOAD_URL, token, {
        method: "POST",
        body: JSON.stringify({
          action: "start",
          title: name.trim(),
          category,
          size: file.size,
          sizeMeters: details.sizeMeters,
        }),
      });
      jobId = started.jobId;
      await postToS3(started.upload, file, setProgress);
      await apiRequest(MODEL_UPLOAD_URL, token, {
        method: "POST",
        body: JSON.stringify({ action: "complete", jobId }),
      });
      onUploaded();
    } catch (uploadError) {
      if (jobId) {
        apiRequest(MODEL_UPLOAD_URL, token, {
          method: "POST",
          body: JSON.stringify({ action: "cancel", jobId }),
        }).catch(() => {});
      }
      setError(uploadError.message || "Upload failed. Please try again.");
      setProgress(null);
    }
  }

  const ready = file && details && name.trim() && rights && !uploading;

  return (
    <dialog
      ref={dialog}
      className="st-dialog"
      aria-labelledby="st-upload-title"
      onCancel={(event) => {
        if (uploading) event.preventDefault();
      }}
      onClose={onClose}
    >
      <div className="st-dialog-head">
        <h2 id="st-upload-title">Upload your model</h2>
        <button
          type="button"
          className="st-tray-dismiss"
          aria-label="Close"
          disabled={uploading}
          onClick={() => dialog.current?.close()}
        >
          ✕
        </button>
      </div>
      <p className="st-hint">
        A .glb file up to 200 MB, such as an architect&apos;s export from SketchUp, Revit or Blender.
        Only you can see it.
      </p>

      {error && <p className="st-alert" role="alert">{error}</p>}

      <label
        htmlFor="st-model-file"
        className={`st-slot st-model-slot ${file ? "is-filled" : ""}`}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          if (!uploading) pick(event.dataTransfer.files?.[0]);
        }}
      >
        <input
          id="st-model-file"
          className="sr-only"
          type="file"
          accept=".glb,model/gltf-binary"
          disabled={uploading}
          onChange={(event) => {
            pick(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        {checking ? (
          <strong>Checking the model…</strong>
        ) : file ? (
          <>
            <strong>{file.name}</strong>
            <span className="st-slot-sub">
              {megabytes(file.size)} · {details.triangles.toLocaleString()} triangles
              {details.sizeMeters ? ` · ${details.sizeMeters.toFixed(1)} m across` : ""}
            </span>
            {!uploading && <span className="st-slot-sub">Choose another file</span>}
          </>
        ) : (
          <>
            <span className="st-slot-caption">GLB · up to 200 MB</span>
            <strong>Drop a .glb, or browse</strong>
          </>
        )}
      </label>

      {details && details.triangles > HEAVY_TRIANGLE_COUNT && (
        <p className="st-hint is-warn">
          This is a heavy model ({details.triangles.toLocaleString()} triangles). It will work, but may be
          slow on phones and in AR.
        </p>
      )}

      {file && (
        <div className="st-details">
          <div className="st-field">
            <label htmlFor="st-model-name" className="st-label">Name</label>
            <input
              id="st-model-name"
              className="st-input"
              maxLength={MAX_NAME_LENGTH}
              value={name}
              disabled={uploading}
              onChange={(event) => {
                setName(event.target.value);
                setNameEdited(true);
              }}
            />
          </div>
          <div className="st-field">
            <label htmlFor="st-model-category" className="st-label">Category</label>
            <select
              id="st-model-category"
              className="st-input"
              value={category}
              disabled={uploading}
              onChange={(event) => setCategory(event.target.value)}
            >
              {MODEL_CATEGORIES.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </div>
          <label className="st-check">
            <input
              type="checkbox"
              checked={rights}
              disabled={uploading}
              onChange={(event) => setRights(event.target.checked)}
            />
            <span>I own this model or have permission to use it.</span>
          </label>
        </div>
      )}

      <div className="st-footer">
        <span className="st-hint">
          {uploading ? `Uploading… ${Math.round(progress * 100)}%` : "Opens in Studio at its real size."}
        </span>
        <button type="button" className="st-primary" disabled={!ready} onClick={upload}>
          {uploading ? "Uploading…" : "Upload model"}
        </button>
      </div>
      {uploading && (
        <span className="st-tray-bar st-upload-bar" aria-hidden="true">
          <span style={{ width: `${Math.round(progress * 100)}%`, animation: "none" }} />
        </span>
      )}
    </dialog>
  );
}
