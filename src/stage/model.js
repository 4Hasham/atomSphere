// Shared data and helpers for the Stage flow: input → category → payment → account → shelf.

export const API_URL = import.meta.env.VITE_API_URL;
export const JOBS_API_URL = `${API_URL}/requests`;
export const CREATE_JOB_URL = `${API_URL}/meteoclone-add-request`;
export const MODEL_UPLOAD_URL = `${API_URL}/model-upload`;
export const DRAFT_STORAGE_KEY = "atomsphere_pending_draft";

// Photos are shrunk in the browser (see prepareImage.js), so people can pick phone
// originals; what is uploaded must still fit the create-job request.
export const MAX_SOURCE_FILE_SIZE = 20 * 1024 * 1024;
export const MAX_FILE_SIZE = 4 * 1024 * 1024;
export const MAX_PROMPT_LENGTH = 500;
export const MAX_NAME_LENGTH = 80;
export const MAX_DESCRIPTION_LENGTH = 500;
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
  { value: "building_structure", label: "Buildings", noun: "a building", item: "Building", hint: "Architecture & structures" },
  { value: "furniture_decor", label: "Furniture", noun: "furniture", item: "Furniture piece", hint: "Home & decor" },
  { value: "vehicle", label: "Vehicles", noun: "a vehicle", item: "Vehicle", hint: "Cars, bikes & more" },
  { value: "consumer_product", label: "Products", noun: "a product", item: "Product", hint: "Everyday objects" },
  { value: "mechanical_device", label: "Machines", noun: "a machine", item: "Machine", hint: "Robots & mechanisms" },
  { value: "home_appliance", label: "Appliances", noun: "an appliance", item: "Appliance", hint: "Home electronics" },
  { value: "character_creature", label: "Characters", noun: "a character", item: "Character", hint: "Creatures & people" },
  { value: "nature_landscape", label: "Nature", noun: "something from nature", item: "Nature scene", hint: "Landscapes & plants" },
  { value: "other", label: "Something else", noun: "something new", item: "Model", hint: "Any other idea" },
];

export const PLANS = [
  {
    id: "standard",
    name: "Standard",
    price: 3,
    model: "hunyuan",
    description: "Realistic materials that react to light. Quick to make, great for testing an idea or layout.",
  },
  {
    id: "polished",
    name: "Polished",
    price: 5,
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

// An upload still "uploading" after this long was abandoned (tab closed mid-upload).
const STALE_UPLOAD_MS = 60 * 60 * 1000;

export function normalizeJobs(result) {
  const jobs = Array.isArray(result) ? result : result.jobs || result.items || [];
  return jobs.map((job) => {
    const normalized = {
      ...job,
      jobId: job.job_id || job.jobId,
      createdAt: job.created_at || job.createdAt,
      outputKey: job.output_key || job.outputKey,
      inputMode: job.input_mode || job.inputMode,
      sizeMeters: job.size_m ?? job.sizeMeters,
    };
    const stale = Date.now() - Date.parse(normalized.createdAt) > STALE_UPLOAD_MS;
    if (normalized.inputMode === "upload" && normalized.status === "uploading" && stale) {
      normalized.status = "failed";
    }
    return normalized;
  });
}

function photoSource(mode) {
  return mode === "multiview" ? "3 photos" : "a photo";
}

/**
 * Photo uploads are always stored as input.* / front.*, so the file key is never a
 * useful name. Jobs created before titles existed fall back to their category.
 */
export function jobTitle(job) {
  if (job.title) return job.title;
  if (job.prompt) return job.prompt;
  return `${findCategory(job.category)?.item ?? "Model"} from ${photoSource(job.inputMode)}`;
}

// Camera, phone and messenger default names carry no meaning ("IMG_2034", "DSC00123",
// "WhatsApp Image 2025-10-20 at 10.15.32", "front").
const DEFAULT_FILE_NAME = /^(img|dsc[nf]?|pxl|mvimg|photo|image|picture|screenshot|scan|whatsapp image|signal|input|front|left|back|untitled)(?![a-z])/i;

/** A name suggested by a photo's file name, or "" when the name is a camera default. */
export function nameFromFile(file) {
  const base = (file?.name || "")
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const meaningful = base.replace(DEFAULT_FILE_NAME, "").replace(/\bat\b/gi, "");
  if (!/[a-z]{3,}/i.test(meaningful)) return "";
  return (base[0].toUpperCase() + base.slice(1)).slice(0, MAX_NAME_LENGTH);
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

/**
 * Bytes one prepared photo may use. One photo gets room to spare; three share the
 * 4 MB request. Both stay well inside sessionStorage for the sign-in redirect.
 */
export function photoBudget(mode) {
  return mode === "multiview" ? 1.25 * 1024 * 1024 : 3 * 1024 * 1024;
}

/** Checks one picked file. Returns an error message, or "" when it is fine. */
export function checkImage(file) {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) return "Please choose a JPG, PNG or WEBP image.";
  if (file.size > MAX_SOURCE_FILE_SIZE) return "Each photo must be 20 MB or smaller.";
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
    title: draft.name.trim(),
  };
  // A text prompt already describes the object; photos get an optional note.
  const description = draft.description.trim();
  if (draft.mode !== "prompt" && description) body.description = description;

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
  const name = draft.name.trim();
  const text = name || (draft.mode === "prompt" ? draft.prompt.trim() : "");
  const source = draft.mode === "single" ? "1 photo" : draft.mode === "multiview" ? "3 photos" : "";
  const label = text.length > 40 ? `${text.slice(0, 40)}…` : text;
  return [label, source].filter(Boolean).join(" · ");
}

/** Whether the input step is complete, and why not when it isn't. */
export function inputState(draft) {
  const content = contentState(draft);
  if (!content.ok) return content;
  if (!draft.name.trim()) return { ok: false, hint: "Give it a name so you can find it on your shelf." };
  return content;
}

function contentState(draft) {
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
  name: "",
  description: "",
  single: null,
  views: { front: null, left: null, back: null },
  category: "",
  plan: "standard",
};
