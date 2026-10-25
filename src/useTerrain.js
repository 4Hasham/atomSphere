import { useEffect, useState } from "react";

const MAPBOX_ACCESS_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;
const TERRAIN_ZOOM = 11;
const EARTH_CIRCUMFERENCE_METERS = 40075016.68557849;

function getTilePosition(latitude, longitude, zoom) {
  const scale = 2 ** zoom;
  const latitudeRadians = (latitude * Math.PI) / 180;
  const worldX = Math.min(((longitude + 180) / 360) * scale, scale - 1e-10);
  const worldY = (
    (1 - Math.asinh(Math.tan(latitudeRadians)) / Math.PI) / 2
  ) * scale;
  const tileY = Math.min(Math.floor(worldY), scale - 1);

  return {
    x: Math.floor(worldX),
    y: tileY,
    centerX: worldX - Math.floor(worldX),
    centerY: Math.min(worldY - tileY, 1),
    metersPerTile: (EARTH_CIRCUMFERENCE_METERS * Math.cos(latitudeRadians)) / scale,
  };
}

async function loadTerrain(latitude, longitude, signal) {
  const tile = getTilePosition(latitude, longitude, TERRAIN_ZOOM);
  const url = new URL(
    `https://api.mapbox.com/v4/mapbox.terrain-rgb/${TERRAIN_ZOOM}/${tile.x}/${tile.y}.pngraw`,
  );
  url.searchParams.set("access_token", MAPBOX_ACCESS_TOKEN);

  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`Mapbox terrain request failed (${response.status}). Check your access token and try again.`);
  }

  const bitmap = await createImageBitmap(await response.blob());
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Could not read the terrain tile image.");
    context.drawImage(bitmap, 0, 0);

    return {
      ...tile,
      width: bitmap.width,
      height: bitmap.height,
      pixels: context.getImageData(0, 0, bitmap.width, bitmap.height).data,
    };
  } finally {
    bitmap.close();
  }
}

export default function useTerrain() {
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [location, setLocation] = useState(null);
  const [terrain, setTerrain] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!location || !MAPBOX_ACCESS_TOKEN) return undefined;

    const controller = new AbortController();
    loadTerrain(location.latitude, location.longitude, controller.signal)
      .then(setTerrain)
      .catch((loadError) => {
        if (!controller.signal.aborted) setError(loadError.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [location]);

  function handleSubmit(event) {
    event.preventDefault();
    const parsedLatitude = Number(latitude);
    const parsedLongitude = Number(longitude);

    if (
      !Number.isFinite(parsedLatitude)
      || parsedLatitude < -85.051129
      || parsedLatitude > 85.051129
      || !Number.isFinite(parsedLongitude)
      || parsedLongitude < -180
      || parsedLongitude > 180
    ) {
      setError("Enter a latitude from -85.051129 to 85.051129 and a longitude from -180 to 180.");
      setTerrain(null);
      setLoading(false);
      return false;
    }

    if (!MAPBOX_ACCESS_TOKEN) {
      setError("Configure VITE_MAPBOX_ACCESS_TOKEN to add a Mapbox terrain backdrop.");
      setTerrain(null);
      setLoading(false);
      return false;
    }

    setError("");
    setLoading(true);
    setTerrain(null);
    setLocation({ latitude: parsedLatitude, longitude: parsedLongitude });
    return true;
  }

  function clearTerrain() {
    setLocation(null);
    setTerrain(null);
    setError("");
    setLoading(false);
  }

  return {
    latitude,
    setLatitude,
    longitude,
    setLongitude,
    terrain,
    loading,
    error,
    handleSubmit,
    clearTerrain,
  };
}
