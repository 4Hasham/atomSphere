// Client for the properties API (backend/lambdas/properties.js). Owner-only: every call
// carries the signed-in user's token.
import { apiRequest, postToS3 } from "../api";

export const PROPERTIES_URL = `${import.meta.env.VITE_API_URL}/properties`;

const call = (token, body) => apiRequest(PROPERTIES_URL, token, { method: "POST", body: JSON.stringify(body) });

export const createProperty = (token, title) => call(token, { action: "create", title });
export const loadProperty = (token, id) => call(token, { action: "load", id });
export const saveProperty = (token, id, scene) => call(token, { action: "save", id, scene });

/**
 * Reads a floorplan image with AI (backend/lambdas/readPlan.js):
 * { reading, coordinates, model }. `image` is from planImageForReading().
 */
export const readPlan = (token, image) => apiRequest(`${import.meta.env.VITE_API_URL}/read-plan`, token, {
  method: "POST",
  body: JSON.stringify(image),
});

/** Turns on the property's share link; resolves with its token (the same until unshared). */
export const shareProperty = async (token, id) => (await call(token, { action: "share", id })).token;
export const unshareProperty = (token, id) => call(token, { action: "unshare", id });

/** The public link for a share token. */
export const shareUrl = (shareToken) => `${window.location.origin}/p/${shareToken}`;

/**
 * A shared property, for anyone with the link (no sign-in): { title, scene, modelUrls,
 * hiddenObjects }. See backend/lambdas/shared.js.
 */
export async function loadSharedProperty(shareToken) {
  const response = await fetch(`${import.meta.env.VITE_API_URL}/shared/${encodeURIComponent(shareToken)}`);
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Couldn't open this property.");
  return result;
}

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
  const { version, site, backdrop, weather, objects, property } = document;
  return { version, site, backdrop, weather, objects, property };
}
