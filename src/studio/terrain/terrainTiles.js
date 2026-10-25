import { latLonToMercator, mercatorMetersAt } from "../geo";

const MAPBOX_ACCESS_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;
const TERRAIN_ZOOM = 11;

async function fetchTile(x, y, signal) {
  const url = new URL(
    `https://api.mapbox.com/v4/mapbox.terrain-rgb/${TERRAIN_ZOOM}/${x}/${y}.pngraw`,
  );
  url.searchParams.set("access_token", MAPBOX_ACCESS_TOKEN);

  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`Mapbox terrain request failed (${response.status}). Check your access token and try again.`);
  }
  return createImageBitmap(await response.blob());
}

// Loads a one-tile-wide square of elevations centered on the site. The 2x2 block of
// tiles around the site is stitched first so the square never runs off a tile edge.
export async function loadTerrain({ latitude, longitude }, signal) {
  const scale = 2 ** TERRAIN_ZOOM;
  const site = latLonToMercator(latitude, longitude);
  const siteTileX = site.x * scale;
  const siteTileY = site.y * scale;
  const firstX = Math.floor(siteTileX - 0.5);
  const firstY = Math.min(Math.max(Math.floor(siteTileY - 0.5), 0), scale - 2);

  const bitmaps = await Promise.all(
    [[0, 0], [1, 0], [0, 1], [1, 1]].map(([dx, dy]) => (
      fetchTile((((firstX + dx) % scale) + scale) % scale, firstY + dy, signal)
    )),
  );

  try {
    const tileSize = bitmaps[0].width;
    const canvas = document.createElement("canvas");
    canvas.width = tileSize * 2;
    canvas.height = tileSize * 2;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Could not read the terrain tile image.");
    bitmaps.forEach((bitmap, index) => {
      context.drawImage(bitmap, (index % 2) * tileSize, Math.floor(index / 2) * tileSize);
    });

    // An odd sample count puts one sample on the pixel that contains the site.
    const size = tileSize + 1;
    const sitePixelX = (siteTileX - firstX) * tileSize;
    const sitePixelY = (siteTileY - firstY) * tileSize;
    const maxStart = canvas.width - size;
    const startX = Math.min(Math.max(Math.floor(sitePixelX) - tileSize / 2, 0), maxStart);
    const startY = Math.min(Math.max(Math.floor(sitePixelY) - tileSize / 2, 0), maxStart);
    const pixels = context.getImageData(startX, startY, size, size).data;

    // Decode Mapbox Terrain-RGB into meters
    const elevations = new Float32Array(size * size);
    for (let index = 0; index < elevations.length; index += 1) {
      const p = index * 4;
      elevations[index] = -10000 + (pixels[p] * 65536 + pixels[p + 1] * 256 + pixels[p + 2]) * 0.1;
    }

    const metersPerPixel = mercatorMetersAt(latitude) / (scale * tileSize);
    const siteColumn = Math.min(Math.max(Math.floor(sitePixelX) - startX, 0), size - 1);
    const siteRow = Math.min(Math.max(Math.floor(sitePixelY) - startY, 0), size - 1);

    return {
      size,
      elevations,
      metersPerPixel,
      // Local x/z of sample (0, 0). Samples sit at pixel centers.
      originX: (startX + 0.5 - sitePixelX) * metersPerPixel,
      originZ: (startY + 0.5 - sitePixelY) * metersPerPixel,
      siteElevation: elevations[siteRow * size + siteColumn],
    };
  } finally {
    bitmaps.forEach((bitmap) => bitmap.close());
  }
}

export const hasMapboxToken = Boolean(MAPBOX_ACCESS_TOKEN);
