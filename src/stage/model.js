// Shared data and helpers for the Stage flow: input → category → payment → account → shelf.

export const API_URL = import.meta.env.VITE_API_URL;
export const JOBS_API_URL = `${API_URL}/requests`;
export const CREATE_JOB_URL = `${API_URL}/meteoclone-add-request`;
export const DRAFT_STORAGE_KEY = "atomsphere_pending_draft";

export const MAX_FILE_SIZE = 4 * 1024 * 1024;
export const MAX_PROMPT_LENGTH = 500;
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MULTIVIEW_NAMES = ["front", "left", "back"];

export const STEPS = [
  { id: "input", label: "Input" },
  { id: "category", label: "Category" },
  { id: "payment", label: "Payment" },
  { id: "account", label: "Account" },
  { id: "shelf", label: "Shelf" },
];

export const INPUT_MODES = [
  { id: "prompt", label: "Describe it", hint: "A sentence or two" },
  { id: "single", label: "1 photo", hint: "Quickest from an image" },
  { id: "multiview", label: "3 photos", hint: "Front, left, back · most accurate" },
];

export const MODEL_CATEGORIES = [
  { value: "building_structure", label: "Buildings", noun: "a building", hint: "Architecture & structures" },
  { value: "furniture_decor", label: "Furniture", noun: "furniture", hint: "Home & decor" },
  { value: "vehicle", label: "Vehicles", noun: "a vehicle", hint: "Cars, bikes & more" },
  { value: "consumer_product", label: "Products", noun: "a product", hint: "Everyday objects" },
  { value: "mechanical_device", label: "Machines", noun: "a machine", hint: "Robots & mechanisms" },
  { value: "home_appliance", label: "Appliances", noun: "an appliance", hint: "Home electronics" },
  { value: "character_creature", label: "Characters", noun: "a character", hint: "Creatures & people" },
  { value: "nature_landscape", label: "Nature", noun: "something from nature", hint: "Landscapes & plants" },
  { value: "other", label: "Something else", noun: "something new", hint: "Any other idea" },
];

export const PLANS = [
  {
    id: "standard",
    name: "Standard",
    price: 2,
    model: "hunyuan",
    description: "The fastest way to test an idea, silhouette or layout. Clean baseline mesh.",
  },
  {
    id: "polished",
    name: "Polished",
    price: 4,
    model: "meshy",
    description: "Finer geometry and richer materials for production. Takes a little longer.",
  },
];

export function findCategory(value) {
  return MODEL_CATEGORIES.find((category) => category.value === value);
}

export function findPlan(id) {
  return PLANS.find((plan) => plan.id === id) || PLANS[0];
}

/**
 * Category suggestion hook-point. Returns a category value, or null when there is no
 * suggestion. Replace with the AI classifier when it exists; the UI already shows a
 * "Suggested" tag and a matching headline whenever this returns a value.
 */
export function suggestCategory() {
  return null;
}

const ACTIVE_STATUSES = new Set(["uploading", "queued", "processing", "running"]);

export function statusGroup(status) {
  const value = String(status || "unknown").toLowerCase();
  if (ACTIVE_STATUSES.has(value)) return "active";
  if (["generated", "complete", "completed"].includes(value)) return "ready";
  if (["failed", "error"].includes(value)) return "failed";
  return "other";
}

export function normalizeJobs(result) {
  const jobs = Array.isArray(result) ? result : result.jobs || result.items || [];
  return jobs.map((job) => ({
    ...job,
    jobId: job.job_id || job.jobId,
    createdAt: job.created_at || job.createdAt,
    outputKey: job.output_key || job.outputKey,
  }));
}

export function jobTitle(job) {
  return job.prompt || job.input_key?.split("/").at(-1) || "Image-based 3D model";
}

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      resolve(dataUrl.slice(dataUrl.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Checks one picked file. Returns an error message, or "" when it is fine. */
export function checkImage(file) {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) return "Please choose a JPG, PNG or WEBP image.";
  if (file.size > MAX_FILE_SIZE) return "Each photo must be 4 MB or smaller.";
  return "";
}

/** The draft as the create-request API expects it. */
export async function buildRequestBody(draft) {
  const plan = findPlan(draft.plan);
  const body = {
    inputMode: draft.mode,
    model: plan.model,
    category: draft.category,
    prompt: draft.mode === "prompt" ? draft.prompt.trim() : "",
  };

  if (draft.mode === "single") {
    body.contentType = draft.single.type;
    body.fileBase64 = await fileToBase64(draft.single);
  }

  if (draft.mode === "multiview") {
    body.views = {};
    for (const name of MULTIVIEW_NAMES) {
      body.views[name] = {
        contentType: draft.views[name].type,
        fileBase64: await fileToBase64(draft.views[name]),
      };
    }
  }

  return body;
}

export function inputSummary(draft) {
  if (draft.mode === "single") return `1 photo: ${draft.single?.name || "reference"}`;
  if (draft.mode === "multiview") return "3 photos: front, left, back";
  const text = draft.prompt.trim();
  return text.length > 40 ? `${text.slice(0, 40)}…` : text;
}

/** Whether the input step is complete, and why not when it isn't. */
export function inputState(draft) {
  if (draft.mode === "prompt") {
    if (!draft.prompt.trim()) return { ok: false, hint: "Write a sentence or two to continue." };
    return { ok: true, hint: "Shape, material, style. A sentence is plenty." };
  }
  if (draft.mode === "single") {
    if (!draft.single) return { ok: false, hint: "Add one clear, well-lit photo of the whole object." };
    return { ok: true, hint: "One photo works. Three angles give a closer match." };
  }
  const views = MULTIVIEW_NAMES.map((name) => draft.views[name]).filter(Boolean);
  if (views.length < 3) return { ok: false, hint: `Add all three angles · ${views.length} of 3 added.` };
  const total = views.reduce((sum, file) => sum + file.size, 0);
  if (total > MAX_FILE_SIZE) return { ok: false, hint: "All three photos together must be 4 MB or smaller." };
  return { ok: true, hint: "Front, left and back. This gives the most accurate model." };
}

export const EMPTY_DRAFT = {
  mode: "prompt",
  prompt: "",
  single: null,
  views: { front: null, left: null, back: null },
  category: "",
  plan: "standard",
};
