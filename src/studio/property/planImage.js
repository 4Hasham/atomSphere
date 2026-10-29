// Turns a picked floorplan (JPG / PNG / WEBP, or a PDF page) into an image to trace
// over and upload. PDFs are drawn with pdf.js, loaded only when a PDF is picked.

export const MAX_PLAN_FILE_BYTES = 40 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // the properties API's limit per image
// Long side for rendered PDF pages and oversized photos: sharp enough to trace 4.5"
// walls on a whole-house plan, small enough to upload quickly.
const LONG_SIDE = 4000;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function isPdf(file) {
  return file?.type === "application/pdf" || /\.pdf$/i.test(file?.name ?? "");
}

export function checkPlanFile(file) {
  if (!file) return "";
  if (!isPdf(file) && !IMAGE_TYPES.includes(file.type)) return "Use a PDF, JPG, PNG or WEBP floorplan.";
  if (file.size > MAX_PLAN_FILE_BYTES) return "Floorplan files must be 40 MB or smaller.";
  return "";
}

function canvas(width, height) {
  const element = document.createElement("canvas");
  element.width = width;
  element.height = height;
  return element;
}

const toBlob = (element, type, quality) => new Promise((resolve, reject) => {
  element.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't prepare the floorplan image."))), type, quality);
});

async function renderPdfPage(file, pageNumber) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  let pdf;
  try {
    pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  } catch (error) {
    throw new Error("This PDF couldn't be opened. If it's password-protected, export the plan as an image.", { cause: error });
  }
  try {
    const page = await pdf.getPage(Math.min(Math.max(1, pageNumber), pdf.numPages));
    const unscaled = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: LONG_SIDE / Math.max(unscaled.width, unscaled.height) });
    const element = canvas(Math.round(viewport.width), Math.round(viewport.height));
    const context = element.getContext("2d");
    // Plans are often transparent line art; trace over white.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, element.width, element.height);
    await page.render({ canvasContext: context, viewport }).promise;
    // PNG keeps thin lines crisp, and line art compresses well.
    const blob = await toBlob(element, "image/png");
    return { blob, width: element.width, height: element.height, pageCount: pdf.numPages };
  } finally {
    pdf.destroy();
  }
}

async function prepareImage(file) {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }).catch((error) => {
    throw new Error("This image couldn't be opened.", { cause: error });
  });
  try {
    const longest = Math.max(bitmap.width, bitmap.height);
    if (longest <= LONG_SIDE * 1.5 && file.size <= MAX_UPLOAD_BYTES) {
      return { blob: file, width: bitmap.width, height: bitmap.height, pageCount: 1 };
    }
    const scale = LONG_SIDE / longest;
    const element = canvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
    element.getContext("2d").drawImage(bitmap, 0, 0, element.width, element.height);
    const blob = await toBlob(element, "image/jpeg", 0.9);
    return { blob, width: element.width, height: element.height, pageCount: 1 };
  } finally {
    bitmap.close();
  }
}

/** { blob, width, height, pageCount }: an image of the plan (page `page` of a PDF). */
export default async function preparePlanImage(file, page = 1) {
  const problem = checkPlanFile(file);
  if (problem) throw new Error(problem);
  const result = isPdf(file) ? await renderPdfPage(file, page) : await prepareImage(file);
  if (result.blob.size > MAX_UPLOAD_BYTES) throw new Error("This floorplan is too detailed to upload. Try a smaller image.");
  return result;
}

/** Initial placement for a new plan: assumed ~15 m wide until its scale is set. */
// Long edge of the image sent to the AI plan reader: enough for small dimension text,
// small enough for a quick upload.
const READING_LONG_EDGE = 2048;

/**
 * The floor's plan image for the AI plan reader: shrunk to fit, on a white square with
 * the plan at its top-left. The model reads images as squares (a wide plan comes back
 * squashed otherwise), so sending one makes its coordinates exact. Returns { image
 * (base64 JPEG), contentType, width, height (the square's side), scale (square pixels
 * per plan-image pixel), pixels (the plan's RGBA pixels at that size, for finding its
 * walls: { data, width, height }), gray (its brightness, for wallSnapping) }.
 */
export async function planImageForReading(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Couldn't load the floorplan image.");
  const bitmap = await createImageBitmap(await response.blob());
  const longEdge = Math.max(bitmap.width, bitmap.height);
  const side = Math.min(READING_LONG_EDGE, longEdge);
  const scale = side / longEdge;
  const canvas = document.createElement("canvas");
  canvas.width = side;
  canvas.height = side;
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, side, side);
  const planWidth = Math.round(bitmap.width * scale);
  const planHeight = Math.round(bitmap.height * scale);
  context.drawImage(bitmap, 0, 0, planWidth, planHeight);
  bitmap.close();
  const rgba = context.getImageData(0, 0, planWidth, planHeight).data;
  const gray = new Uint8Array(planWidth * planHeight);
  for (let index = 0; index < gray.length; index += 1) {
    gray[index] = 0.299 * rgba[index * 4] + 0.587 * rgba[index * 4 + 1] + 0.114 * rgba[index * 4 + 2];
  }
  const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
  return {
    image: dataUrl.slice(dataUrl.indexOf(",") + 1),
    contentType: "image/jpeg",
    width: side,
    height: side,
    scale,
    pixels: { data: rgba, width: planWidth, height: planHeight },
    gray: { data: gray, width: planWidth, height: planHeight, scale },
  };
}

export function initialUnderlay({ width, height }, imageKey) {
  return { imageKey, width, height, metresPerPixel: 15 / width, origin: [0, 0], opacity: 0.55, calibrated: false };
}
