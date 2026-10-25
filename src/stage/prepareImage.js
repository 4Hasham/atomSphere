// Shrinks a picked photo before upload. Photos travel to the create-job Lambda as
// base64 inside one JSON request (6 MB Lambda limit, 4 MB of images after encoding)
// and through sessionStorage during sign-in, so phone originals (3–12 MB) won't fit.
// Generation never needs that much: Hunyuan works at 512 px (1024 px for background
// removal), so a 2048 px long side keeps all the useful detail at ~0.5–1 MB.
//
// Re-encoding also applies the photo's EXIF rotation, which the backend ignores, so
// portrait phone photos no longer reach the model sideways.

const LONG_SIDES = [2048, 1536, 1024];
const JPEG_QUALITY = 0.88;

function canvasFor(width, height) {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function encode(canvas, type, quality) {
  if (canvas.convertToBlob) return canvas.convertToBlob({ type, quality });
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not encode the image."))), type, quality);
  });
}

function hasTransparency(context, width, height) {
  const { data } = context.getImageData(0, 0, width, height);
  for (let index = 3; index < data.length; index += 4) {
    if (data[index] < 255) return true;
  }
  return false;
}

function renamed(name, type) {
  const extension = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
  const base = name.replace(/\.[^.]+$/, "") || "photo";
  return `${base}.${extension}`;
}

/**
 * Returns a smaller copy of `file` that is at most `maxBytes`, keeping its name (with a
 * new extension). Cut-outs with transparency stay transparent (WebP, or PNG where the
 * browser can't encode WebP); everything else becomes JPEG.
 */
export default async function prepareImage(file, maxBytes) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("Couldn't read this photo. Try a JPG or PNG.");
  }

  try {
    let transparent = null;
    let smallest = null;

    for (const longSide of LONG_SIDES) {
      const scale = Math.min(1, longSide / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = canvasFor(width, height);
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(bitmap, 0, 0, width, height);

      // Only PNG and WebP can carry transparency; check once, at the first size.
      if (transparent === null) {
        transparent = file.type !== "image/jpeg" && hasTransparency(context, width, height);
      }

      const blob = await encode(canvas, transparent ? "image/webp" : "image/jpeg", JPEG_QUALITY);
      if (!smallest || blob.size < smallest.size) smallest = blob;
      if (blob.size <= maxBytes) break;
    }

    if (smallest.size > maxBytes) {
      throw new Error("This photo is too detailed to upload. Try a smaller or simpler image.");
    }
    return new File([smallest], renamed(file.name, smallest.type), { type: smallest.type });
  } finally {
    bitmap.close();
  }
}
