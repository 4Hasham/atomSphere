import { useState } from "react";
import { isValidSite, MAX_MERCATOR_LATITUDE } from "../geo";
import { useScene } from "../sceneStore";
import { SCENE_PRESETS } from "../weather/scenePresets";

export default function SceneControls({ terrainStatus }) {
  const site = useScene((state) => state.document.site);
  const backdrop = useScene((state) => state.document.backdrop);
  const presetId = useScene((state) => state.document.weather.presetId);
  const setBackdrop = useScene((state) => state.setBackdrop);
  const setWeatherPreset = useScene((state) => state.setWeatherPreset);
  const canUndo = useScene((state) => state.past.length > 0);
  const canRedo = useScene((state) => state.future.length > 0);
  const undo = useScene((state) => state.undo);
  const redo = useScene((state) => state.redo);
  const selectedPreset = SCENE_PRESETS.find((preset) => preset.id === presetId);
  const terrain = terrainStatus.terrain;

  return (
    <aside className="scene-controls" aria-labelledby="scene-controls-title">
      <div className="scene-controls-heading">
        <span className="terrain-label">SCENE CONTROLS</span>
        <h3 id="scene-controls-title">Scene presets</h3>
        <p>Choose a weather and lighting setup for your 3D scene.</p>
      </div>
      <div className="scene-history">
        <button className="terrain-clear" type="button" onClick={undo} disabled={!canUndo}>
          Undo
        </button>
        <button className="terrain-clear" type="button" onClick={redo} disabled={!canRedo}>
          Redo
        </button>
      </div>
      <div className="scene-preset-control">
        <label htmlFor="scene-preset">Preset</label>
        <select
          id="scene-preset"
          value={presetId}
          onChange={(event) => setWeatherPreset(event.target.value)}
        >
          {SCENE_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>{preset.name}</option>
          ))}
        </select>
        <p>{selectedPreset?.description}</p>
      </div>
      <div className="scene-preset-control">
        <label htmlFor="scene-background">Background</label>
        <select
          id="scene-background"
          value={backdrop}
          onChange={(event) => setBackdrop(event.target.value)}
        >
          <option value="none">Studio</option>
          <option value="city">City</option>
          <option value="mountains">Mountains</option>
        </select>
        <p>
          {terrain
            ? "Real-world terrain is active. Choosing a preset background replaces it."
            : backdrop === "city"
              ? "A small city with streets and surrounding buildings."
              : backdrop === "mountains"
                ? "A green mountain setting with a forest of trees."
                : "Keep the original clean studio background."}
        </p>
      </div>

      <section className="terrain-section" aria-labelledby="terrain-title">
        <h3 id="terrain-title">Terrain backdrop</h3>
        <p className="terrain-description">Set a location to add real-world terrain to your scene.</p>
        {/* Remount on site changes (including undo/redo) so the inputs show the current site. */}
        <TerrainForm
          key={site ? `${site.latitude},${site.longitude}` : "no-site"}
          site={site}
          terrainStatus={terrainStatus}
        />
        {terrain && (
          <p className="terrain-attribution">
            Terrain data © <a href="https://www.mapbox.com/about/maps/" target="_blank" rel="noreferrer">Mapbox</a>
            {" · "}© OpenStreetMap contributors
          </p>
        )}
      </section>
    </aside>
  );
}

function TerrainForm({ site, terrainStatus }) {
  const setSite = useScene((state) => state.setSite);
  const [latitude, setLatitude] = useState(site ? String(site.latitude) : "");
  const [longitude, setLongitude] = useState(site ? String(site.longitude) : "");
  const [inputError, setInputError] = useState("");
  const { terrain, loading, error } = terrainStatus;

  function handleSubmit(event) {
    event.preventDefault();
    const nextSite = { latitude: Number(latitude), longitude: Number(longitude) };

    if (!isValidSite(nextSite)) {
      setInputError(
        `Enter a latitude from -${MAX_MERCATOR_LATITUDE} to ${MAX_MERCATOR_LATITUDE} and a longitude from -180 to 180.`,
      );
      return;
    }

    setInputError("");
    setSite(nextSite);
  }

  const message = inputError || error;

  return (
    <>
      <form className="terrain-form" onSubmit={handleSubmit}>
        <label>
          <span>Latitude</span>
          <input
            aria-label="Terrain latitude"
            type="number"
            min={-MAX_MERCATOR_LATITUDE}
            max={MAX_MERCATOR_LATITUDE}
            step="any"
            placeholder="37.7749"
            value={latitude}
            onChange={(event) => setLatitude(event.target.value)}
            required
          />
        </label>
        <label>
          <span>Longitude</span>
          <input
            aria-label="Terrain longitude"
            type="number"
            min="-180"
            max="180"
            step="any"
            placeholder="-122.4194"
            value={longitude}
            onChange={(event) => setLongitude(event.target.value)}
            required
          />
        </label>
        <button className="terrain-submit" type="submit" disabled={loading}>
          {loading ? "Loading…" : terrain ? "Update terrain" : "Add terrain"}
        </button>
        {site && (
          <button className="terrain-clear" type="button" onClick={() => setSite(null)}>
            Remove
          </button>
        )}
      </form>
      {message && <p className="terrain-error" role="alert">{message}</p>}
    </>
  );
}
