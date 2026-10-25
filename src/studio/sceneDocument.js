import { SCENE_PRESETS } from "./weather/scenePresets";

export const SCENE_DOCUMENT_VERSION = 1;

// Everything needed to rebuild a scene, as plain JSON. Runtime data such as signed
// model URLs and loaded terrain tiles is resolved from it, never stored in it.
//
// {
//   version: 1,
//   site: { latitude, longitude } | null,   // origin of the world frame (see geo.js)
//   backdrop: "none" | "city" | "mountains",
//   weather: { presetId },
//   objects: [{ id, name, source: { type: "job", jobId } }],
// }
export function createSceneDocument({ objects = [] } = {}) {
  return {
    version: SCENE_DOCUMENT_VERSION,
    site: null,
    backdrop: "none",
    weather: { presetId: SCENE_PRESETS[0].id },
    objects,
  };
}

export function createJobObject(jobId, name) {
  return { id: `job-${jobId}`, name, source: { type: "job", jobId } };
}
