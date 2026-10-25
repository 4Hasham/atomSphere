// Image-based backdrops: CC0 HDRIs from Poly Haven (https://polyhaven.com) at 2k, served
// from VITE_HDRI_BASE_URL (S3; defaults to /hdri, i.e. public/hdri) and loaded only when
// picked. Each HDRI both lights the scene and, when `ground` is set, is projected onto a
// ground disk around the model.
//
// sunDirection points at the brightest region of each image (measured offline), so the
// shadow-casting sun agrees with the photo. sunStrength scales it down for soft light.
// ground.height is the camera height the photo was taken at, in meters.
const HDRI_BASE_URL = (import.meta.env.VITE_HDRI_BASE_URL || "/hdri").replace(/\/$/, "");

export const BACKDROPS = [
  {
    id: "none",
    name: "Studio grid",
    description: "Keep the original clean studio background.",
  },
  {
    id: "photo-studio",
    name: "Photo studio",
    description: "Seamless studio floor with soft key light, for product-style shots.",
    file: `${HDRI_BASE_URL}/cyclorama_hard_light_2k.hdr`,
    floorColor: "#d8d6d0",
    background: "#cfcdc8",
    sunDirection: [0.74, 0.41, 0.534],
    sunStrength: 0.6,
  },
  {
    id: "suburban-garden",
    name: "Suburban garden",
    description: "Sunny lawn and garden around a house, midday.",
    file: `${HDRI_BASE_URL}/suburban_garden_2k.hdr`,
    ground: { height: 1.7, radius: 60 },
    sunDirection: [0.352, 0.9, 0.256],
    sunStrength: 1,
  },
  {
    id: "suburban-street",
    name: "Suburban street",
    description: "Residential street with houses and parked cars at dusk.",
    file: `${HDRI_BASE_URL}/stuttgart_suburbs_2k.hdr`,
    ground: { height: 1.7, radius: 60 },
    sunDirection: [0.862, 0.281, 0.422],
    sunStrength: 0.25,
  },
  {
    id: "alpine-meadow",
    name: "Alpine meadow",
    description: "Open grass field with forest and mountains on the horizon.",
    file: `${HDRI_BASE_URL}/alps_field_2k.hdr`,
    ground: { height: 1.7, radius: 60 },
    sunDirection: [0.599, 0.67, 0.438],
    sunStrength: 1,
  },
  {
    id: "city-street",
    name: "City street",
    description: "Waterfront city street with modern buildings in clear sun.",
    file: `${HDRI_BASE_URL}/docklands_02_2k.hdr`,
    ground: { height: 1.7, radius: 60 },
    sunDirection: [0.665, 0.569, 0.484],
    sunStrength: 1,
  },
  {
    id: "overcast-field",
    name: "Overcast field",
    description: "Flat field under even cloud, shadow-free light for site evaluation.",
    file: `${HDRI_BASE_URL}/suburban_field_01_2k.hdr`,
    ground: { height: 1.7, radius: 60 },
    sunDirection: [0.578, 0.748, 0.327],
    sunStrength: 0.15,
  },
];

// The plain Studio grid follows the app theme, so in the light theme it doesn't sit
// in the page as a dark hole. Weather presets keep their own sky colours.
export const STUDIO_SURFACES = {
  light: { background: "#e8e4dc", grid: ["#a9a397", "#cfc9be"] },
  dark: { background: "#17181a", grid: ["#4a4c52", "#2c2e33"] },
};

export function findBackdrop(id) {
  return BACKDROPS.find((backdrop) => backdrop.id === id) ?? BACKDROPS[0];
}

// A projected photo only looks right while the camera stays near where it was taken.
// Framing a large model pulls the camera far back, so the photo's world is scaled up
// with the model instead: a 14 m house sees the scene the way a 6 m object would.
const TRUE_SCALE_MODEL_SIZE = 6;

export function groundFor(backdrop, modelSize) {
  const scale = Math.max(1, modelSize / TRUE_SCALE_MODEL_SIZE);
  return { height: backdrop.ground.height * scale, radius: backdrop.ground.radius * scale };
}
