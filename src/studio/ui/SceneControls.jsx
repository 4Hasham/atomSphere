import { useState } from "react";
import { RedoIcon, UndoIcon } from "../../brand/icons";
import { BACKDROPS, findBackdrop } from "../backdrops/backdrops";
import { isValidSite, MAX_MERCATOR_LATITUDE } from "../geo";
import { useScene } from "../sceneStore";
import { SCENE_PRESETS } from "../weather/scenePresets";

export default function SceneControls({ terrainStatus }) {
  const site = useScene((state) => state.document.site);
  const backdrop = findBackdrop(useScene((state) => state.document.backdrop));
  const objects = useScene((state) => state.document.objects);
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
        <div className="scene-controls-top">
          <span className="terrain-label">SCENE CONTROLS</span>
          <div className="scene-history" role="group" aria-label="History">
            <button
              className="studio-icon"
              type="button"
              onClick={undo}
              disabled={!canUndo}
              aria-label="Undo"
              title="Undo (Ctrl+Z)"
            >
              <UndoIcon />
            </button>
            <button
              className="studio-icon"
              type="button"
              onClick={redo}
              disabled={!canRedo}
              aria-label="Redo"
              title="Redo (Ctrl+Shift+Z)"
            >
              <RedoIcon />
            </button>
          </div>
        </div>
        <h3 id="scene-controls-title">Scene presets</h3>
        <p>Choose a weather and lighting setup for your 3D scene.</p>
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
          value={backdrop.id}
          onChange={(event) => setBackdrop(event.target.value)}
        >
          {BACKDROPS.map((option) => (
            <option key={option.id} value={option.id}>{option.name}</option>
          ))}
        </select>
        <p>
          {terrain
            ? "Real-world terrain is active. Choosing a preset background replaces it."
            : backdrop.description}
        </p>
        {backdrop.file && (
          <p className="terrain-attribution">
            HDRI from <a href="https://polyhaven.com" target="_blank" rel="noreferrer">Poly Haven</a> (CC0)
          </p>
        )}
      </div>

      {objects.map((object) => (
        <ModelSizeControl key={`${object.id}-${object.sizeMeters}`} object={object} />
      ))}

      <PropertyViewControls />

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

const MIN_MODEL_SIZE = 0.1;
const MAX_MODEL_SIZE = 500;

// Applies on Enter or blur rather than per keystroke, so each resize is one undo step.
function ModelSizeControl({ object }) {
  const setObjectSize = useScene((state) => state.setObjectSize);
  const [value, setValue] = useState(String(object.sizeMeters));
  const inputId = `model-size-${object.id}`;

  function apply() {
    const size = Number(value);
    if (Number.isFinite(size) && size >= MIN_MODEL_SIZE && size <= MAX_MODEL_SIZE) {
      if (size !== object.sizeMeters) setObjectSize(object.id, size);
    } else {
      setValue(String(object.sizeMeters));
    }
  }

  return (
    <form
      className="scene-preset-control"
      onSubmit={(event) => {
        event.preventDefault();
        apply();
      }}
    >
      <label htmlFor={inputId}>Model size (m)</label>
      <input
        id={inputId}
        type="number"
        min={MIN_MODEL_SIZE}
        max={MAX_MODEL_SIZE}
        step="any"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={apply}
      />
      <p>Length of the model&apos;s longest side. A car is about 4.5 m, a house 10–20 m.</p>
    </form>
  );
}

function PropertyViewControls() {
  const property = useScene((state) => state.document.property);
  const view = useScene((state) => state.propertyView);
  const setView = useScene((state) => state.setPropertyView);
  if (!property) return null;

  const showingAll = view.level === "all";
  return (
    <section className="terrain-section" aria-labelledby="property-view-title">
      <h3 id="property-view-title">Property</h3>
      <div className="scene-preset-control">
        <label htmlFor="property-level">Show</label>
        <select
          id="property-level"
          value={view.level}
          onChange={(event) => setView({ level: event.target.value })}
        >
          <option value="all">Whole house</option>
          {property.levels.map((level, index) => (
            <option key={level.id} value={String(index)}>Up to {level.name.toLowerCase()}</option>
          ))}
        </select>
        <p>Picking a floor hides the ones above it, so you can look inside.</p>
      </div>
      <label className="scene-toggle">
        <input
          type="checkbox"
          checked={view.roof && showingAll}
          disabled={!showingAll}
          onChange={(event) => setView({ roof: event.target.checked })}
        />
        <span>Roof</span>
      </label>
    </section>
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
