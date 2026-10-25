import { useMemo, useEffect } from "react";
import { Color, Float32BufferAttribute, PlaneGeometry } from "three";
import { SCENE_PRESETS } from "./scenePresets";

// 1 world unit = 1 meter.
// The terrain is metersPerTile wide, elevations are in real meters,
// and the MIDDLE of the mesh is at x = 0, z = 0 (y = 0 at the middle height).
export function TerrainSurface({ terrain }) {
  const geometry = useMemo(() => {
    const { width, height, pixels, metersPerTile } = terrain;
    const SIZE = metersPerTile;

    const surface = new PlaneGeometry(SIZE, SIZE, width - 1, height - 1);
    const positions = surface.attributes.position;
    const colors = new Float32Array(positions.count * 3);
    const elevations = new Float32Array(positions.count);

    // Decode Mapbox Terrain-RGB into meters
    for (let row = 0; row < height; row += 1) {
      for (let column = 0; column < width; column += 1) {
        const p = (row * width + column) * 4;
        elevations[row * width + column] =
          -10000 + (pixels[p] * 65536 + pixels[p + 1] * 256 + pixels[p + 2]) * 0.1;
      }
    }

    // y = 0 at the middle of the tile
    const midColumn = Math.round((width - 1) / 2);
    const midRow = Math.round((height - 1) / 2);
    const middleElevation = elevations[midRow * width + midColumn];

    const lowColor = new Color("#397b50");
    const middleColor = new Color("#a28c63");
    const highColor = new Color("#c5c7b2");
    const rockColor = new Color("#77766a");
    const color = new Color();
    const cellSize = SIZE / (width - 1);

    for (let row = 0; row < height; row += 1) {
      for (let column = 0; column < width; column += 1) {
        const vertex = row * width + column;
        const elevation = elevations[vertex];

        positions.setXYZ(
          vertex,
          (column / (width - 1) - 0.5) * SIZE, // x: -SIZE/2 .. +SIZE/2
          elevation - middleElevation,         // y: real meters, up
          (row / (height - 1) - 0.5) * SIZE    // z: -SIZE/2 .. +SIZE/2
        );

        if (elevation < 1200) {
          color.copy(lowColor).lerp(middleColor, Math.max(0, elevation / 1200));
        } else {
          color.copy(middleColor).lerp(highColor, Math.min((elevation - 1200) / 2300, 1));
        }
        const left = elevations[row * width + Math.max(0, column - 1)];
        const right = elevations[row * width + Math.min(width - 1, column + 1)];
        const above = elevations[Math.max(0, row - 1) * width + column];
        const below = elevations[Math.min(height - 1, row + 1) * width + column];
        const slope = Math.hypot(
          (right - left) / (2 * cellSize),
          (below - above) / (2 * cellSize),
        );
        if (slope > 0.55) color.lerp(rockColor, Math.min((slope - 0.55) * 0.45, 0.65));
        const variation = (Math.sin(column * 12.9898 + row * 78.233) * 43758.5453) % 1;
        color.multiplyScalar(0.97 + Math.abs(variation) * 0.06);
        colors.set([color.r, color.g, color.b], vertex * 3);
      }
    }

    surface.setAttribute("color", new Float32BufferAttribute(colors, 3));
    positions.needsUpdate = true;
    surface.computeVertexNormals();
    surface.computeBoundingBox();
    surface.computeBoundingSphere();
    return surface;
  }, [terrain]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial vertexColors roughness={0.92} />
    </mesh>
  );
}

export default function SceneControls({
  latitude,
  setLatitude,
  longitude,
  setLongitude,
  terrain,
  loading,
  error,
  handleSubmit,
  clearTerrain,
  scenePreset,
  onScenePresetChange,
  sceneBackground,
  onSceneBackgroundChange,
}) {
  const selectedPreset = SCENE_PRESETS.find((preset) => preset.id === scenePreset);

  return (
    <aside className="scene-controls" aria-labelledby="scene-controls-title">
      <div className="scene-controls-heading">
        <span className="terrain-label">SCENE CONTROLS</span>
        <h3 id="scene-controls-title">Scene presets</h3>
        <p>Choose a weather and lighting setup for your 3D scene.</p>
      </div>
      <div className="scene-preset-control">
        <label htmlFor="scene-preset">Preset</label>
        <select
          id="scene-preset"
          value={scenePreset}
          onChange={(event) => onScenePresetChange(event.target.value)}
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
          value={sceneBackground}
          onChange={(event) => onSceneBackgroundChange(event.target.value)}
        >
          <option value="none">Studio</option>
          <option value="city">City</option>
          <option value="mountains">Mountains</option>
        </select>
        <p>
          {terrain
            ? "Real-world terrain is active. Choosing a preset background replaces it."
            : sceneBackground === "city"
              ? "A small city with streets and surrounding buildings."
              : sceneBackground === "mountains"
                ? "A green mountain setting with a forest of trees."
                : "Keep the original clean studio background."}
        </p>
      </div>

      <section className="terrain-section" aria-labelledby="terrain-title">
        <h3 id="terrain-title">Terrain backdrop</h3>
        <p className="terrain-description">Set a location to add real-world terrain to your scene.</p>
        <form className="terrain-form" onSubmit={handleSubmit}>
          <label>
            <span>Latitude</span>
            <input
              aria-label="Terrain latitude"
              type="number"
              min="-85.051129"
              max="85.051129"
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
          {terrain && (
            <button className="terrain-clear" type="button" onClick={clearTerrain}>
              Remove
            </button>
          )}
        </form>
        {error && <p className="terrain-error" role="alert">{error}</p>}
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