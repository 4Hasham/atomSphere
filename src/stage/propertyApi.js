// Client for the properties API (backend/lambdas/properties.js). Owner-only: every call
// carries the signed-in user's token.
import { apiRequest, postToS3 } from "../api";

export const PROPERTIES_URL = `${import.meta.env.VITE_API_URL}/properties`;

const call = (token, body) => apiRequest(PROPERTIES_URL, token, { method: "POST", body: JSON.stringify(body) });

export const createProperty = (token, title) => call(token, { action: "create", title });
export const loadProperty = (token, id) => call(token, { action: "load", id });
export const saveProperty = (token, id, scene) => call(token, { action: "save", id, scene });

/** Uploads a floorplan image for one level; returns its storage key. */
export async function uploadPlanImage(token, id, levelId, blob, onProgress) {
  const { key, upload } = await call(token, {
    action: "image",
    id,
    levelId,
    contentType: blob.type,
    size: blob.size,
  });
  await postToS3(upload, blob, onProgress);
  return key;
}

/** The parts of a scene document worth saving with a property. */
export function sceneToSave(document) {
  const { version, site, backdrop, weather, property } = document;
  return { version, site, backdrop, weather, property };
}
