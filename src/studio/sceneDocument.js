import { SCENE_PRESETS } from "./weather/scenePresets";

export const SCENE_DOCUMENT_VERSION = 1;
export const DEFAULT_MODEL_SIZE_METERS = 4.5;

// Everything needed to rebuild a scene, as plain JSON. Runtime data such as signed
// model URLs and loaded terrain tiles is resolved from it, never stored in it.
//
// {
//   version: 1,
//   site: { latitude, longitude } | null,   // origin of the world frame (see geo.js)
//   backdrop: "none" | a backdrops.js id,
//   weather: { presetId },
//   objects: [{ id, name, sizeMeters, source: { type: "job", jobId } }],  // sizeMeters: largest side
//   property: a property document (property/propertyDocument.js) | null,
// }
export function createSceneDocument({ objects = [], property = null } = {}) {
  return {
    version: SCENE_DOCUMENT_VERSION,
    site: null,
    backdrop: "none",
    weather: { presetId: SCENE_PRESETS[0].id },
    objects,
    property,
  };
}

// Largest side Studio accepts (matches the size control), so a model exported in the
// wrong units (e.g. millimetres) still opens at a usable size.
const MIN_SIZE_METERS = 0.1;
const MAX_SIZE_METERS = 500;

export function createJobObject(jobId, name, sizeMeters) {
  const size = Number(sizeMeters) > 0
    ? Math.min(MAX_SIZE_METERS, Math.max(MIN_SIZE_METERS, Number(sizeMeters)))
    : DEFAULT_MODEL_SIZE_METERS;
  return {
    id: `job-${jobId}`,
    name,
    sizeMeters: Math.round(size * 100) / 100,
    source: { type: "job", jobId },
  };
}
