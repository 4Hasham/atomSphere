// Lengths are stored in metres. Floorplans here are drawn in feet and inches (12'-6"),
// so the editor shows and accepts both.
export const METRES_PER_FOOT = 0.3048;
const METRES_PER_INCH = 0.0254;
const SQ_METRES_PER_SQ_FOOT = METRES_PER_FOOT * METRES_PER_FOOT;

export function formatLength(metres, unit = "ft") {
  if (unit === "m") return `${metres.toFixed(2)} m`;
  const totalInches = Math.round(metres / METRES_PER_INCH);
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return inches ? `${feet}'${inches}"` : `${feet}'`;
}

export function formatArea(squareMetres, unit = "ft") {
  if (unit === "m") return `${squareMetres.toFixed(1)} m²`;
  return `${Math.round(squareMetres / SQ_METRES_PER_SQ_FOOT).toLocaleString()} sq ft`;
}

/**
 * Reads a typed length into metres, or null. Accepts 12'6", 12' 6, 12ft 6in, 12.5 ft,
 * 12-6 (feet-inches), 150", 3.8 m, 380 cm, 3800 mm. A bare number uses `unit`.
 */
export function parseLength(text, unit = "ft") {
  const value = String(text).trim().toLowerCase().replace(/[′’]/g, "'").replace(/[″”]/g, '"');
  if (!value) return null;

  let match = value.match(/^(\d+(?:\.\d+)?)\s*(mm|cm|m|metres?|meters?)$/);
  if (match) {
    const number = Number(match[1]);
    const factor = match[2] === "mm" ? 0.001 : match[2] === "cm" ? 0.01 : 1;
    return positive(number * factor);
  }

  // feet and optional inches: 12'6", 12' 6, 12ft 6in, 12 ft, 12-6
  match = value.match(/^(\d+(?:\.\d+)?)\s*(?:'|ft|feet|foot|-)\s*(?:(\d+(?:\.\d+)?)\s*(?:"|in|inch|inches)?)?$/);
  if (match) return positive(Number(match[1]) * METRES_PER_FOOT + Number(match[2] ?? 0) * METRES_PER_INCH);

  match = value.match(/^(\d+(?:\.\d+)?)\s*(?:"|in|inch|inches)$/);
  if (match) return positive(Number(match[1]) * METRES_PER_INCH);

  match = value.match(/^\d+(?:\.\d+)?$/);
  if (match) return positive(Number(value) * (unit === "m" ? 1 : METRES_PER_FOOT));

  return null;
}

function positive(metres) {
  return Number.isFinite(metres) && metres > 0 ? metres : null;
}
