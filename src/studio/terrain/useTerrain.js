import { useEffect, useState } from "react";
import { hasMapboxToken, loadTerrain } from "./terrainTiles";

const IDLE = { terrain: null, loading: false, error: "" };
const MISSING_TOKEN = {
  ...IDLE,
  error: "Configure VITE_MAPBOX_ACCESS_TOKEN to add a Mapbox terrain backdrop.",
};

// Loads terrain for the scene's site. The result is tagged with the site it was
// loaded for, so a changed site reads as loading until its own terrain arrives.
export default function useTerrain(site) {
  const [result, setResult] = useState({ site: null, terrain: null, error: "" });

  useEffect(() => {
    if (!site || !hasMapboxToken) return undefined;

    const controller = new AbortController();
    loadTerrain(site, controller.signal)
      .then((terrain) => setResult({ site, terrain, error: "" }))
      .catch((loadError) => {
        if (!controller.signal.aborted) setResult({ site, terrain: null, error: loadError.message });
      });

    return () => controller.abort();
  }, [site]);

  if (!site) return IDLE;
  if (!hasMapboxToken) return MISSING_TOKEN;
  if (result.site !== site) return { ...IDLE, loading: true };
  return { terrain: result.terrain, loading: false, error: result.error };
}
