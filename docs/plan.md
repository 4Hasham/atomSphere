# atomSphere: Master Plan & Architecture Blueprint

## 1. Product Overview & Vision
* **Core Value Proposition:** Instantly converting 2D real estate floorplans, sketches, or plot elevation images into **structured**, explorable 3D properties (levels, rooms, walls, openings) with WebAR and realistic environmental simulations driven by weather presets or real weather telemetry.
* **How floorplans become 3D:** Floorplans are not sent through Hunyuan3D (image-to-object models return a closed mesh with no rooms or interior). Instead:
  1. **AI floorplan parsing** detects walls, doors, windows, and room labels and outputs a structured property document.
  2. The **Studio generates the 3D building** from that document.
  3. The user **corrects mistakes in the in-Studio floorplan editor**.
  * Hunyuan3D remains the engine for exteriors from elevation images, furniture, and props.
* **Target Niches:** 
  * Mid-tier real estate marketing agencies and housing societies in Islamabad/Rawalpindi (Blue Area, G-11).
  * Architectural visualization and interior design studios needing rapid prototyping props.
  * Overseas Pakistani (NRP) property portals requiring remote spatial verification.

---

## 2. End-to-End Technical Architecture

```
[ User Input: Image / Prompt / Floorplan / Own Model / Weather Feed ]
       │
       ▼
[ AWS API Gateway & Cognito ] -> [ SQS Queue ]
       │
       ├──────────────────────────────┐
       ▼                              ▼
[ Modal GPU Worker (Hunyuan3D) ]   [ Floorplan Parser ]
  (exteriors, furniture, props)     (walls, openings, rooms → property JSON)
       │                              │
       ▼                              │
[ Post-Processing Pipeline ]          │
  ├── PBR Texture Enhancement (Normal, Roughness, AO maps)
  ├── Mesh Decimation & Optimization (<100k polygons)
  └── Format Conversion (.glb for Android/Web + .usdz for iOS QuickLook)
       │                              │
       ▼                              ▼
[ Amazon S3 + CloudFront CDN ]  +  [ DynamoDB: scene & property documents ]
       │
       │        [ Weather Proxy Lambda ] ◄── Open-Meteo / user stations (CSV, HTTP, WebSocket/MQTT)
       │                 │
       ├─────────────────┴────────────────────────┐
       ▼                                          ▼
[ React Three Fiber (R3F) Studio ]         [ Mobile WebAR Layer ]
  ├── Mapbox Terrain + Satellite Imagery     ├── <model-viewer> (one-tap AR, WhatsApp links)
  ├── Multi-Object Scene & Uploads           └── WebXR mode (Android: weather + walkthrough)
  ├── Property Mode (plan / dollhouse / walkthrough)
  ├── Data-Driven Weather & Sky Rendering
  └── Telemetry Timeline & Playback
```

---

## 3. Development Roadmap & MCP Integration

### Phase 1: Pipeline & Asset Optimization
* Lock down asynchronous SQS messaging between AWS Lambda and Modal.
* Automate PBR texture generation and `.glb` to `.usdz` conversion scripts.
* Enforce the **<100k polygon budget** for anything that ships to AR/mobile (whole houses including furniture).

### Phase 2: Studio Foundations
* Move Studio state into a single store (Zustand) backed by a serializable **scene document** (site, objects, property, weather source, time range, render settings) — enables save/load, share links, and undo/redo.
* Local **geo reference frame**: an East-North-Up tangent plane anchored at the site origin (1 unit = 1 meter) with `latLonToLocal()` / `localToLatLon()` helpers used by terrain, placement, sun position, and wind.
* Split `ModelViewer.jsx` into `terrain/`, `objects/`, `property/`, `weather/`, `timeline/`, `ui/` modules.

### Phase 3: Weather Rendering & Presets
* **A preset is a constant weather series**, so presets and live telemetry share one renderer.
* Presets: clear day, overcast, light rain, monsoon downpour, thunderstorm, fog, snow, dust storm, heatwave haze, golden hour, night.
* Variable → visual mapping:
  * lat/lon + time → sun/moon position (`suncalc`), physical sky (`@takram/three-atmosphere` or drei `<Sky>`), stars.
  * Cloud cover (low/mid/high) → volumetric clouds; dims the sun and softens shadows.
  * Visibility → exponential fog density (`3.912 / visibility`).
  * Precipitation rate + temperature/weather code → GPU instanced rain/snow/sleet.
  * Wind speed/direction → slanted precipitation, debris, vegetation sway, wind HUD.
  * Precipitation history → wet-surface shader, snow accumulation on up-facing surfaces.
  * WMO codes 95–99 → lightning.
* **Sun study:** pick a date and time and see true sun position and shadows at the property's location.

### Phase 4: Property Mode (Real Estate)
* **Property document:** `Property → Levels[] → Rooms[] (polygon, name, type, area, flooring) + Walls[] (thickness, openings[])`. The 3D building is generated from it.
* **Inputs:** AI floorplan parsing (primary), floorplan image tracing with scale calibration, in-Studio wall/door/window editor, architect imports (GLB/FBX, IFC via `web-ifc`), later room scans (RoomPlan / Polycam USDZ).
* **Views:** Exterior, Dollhouse (roof off, cutaway), Floorplan (orthographic, room labels, areas, dimensions, PNG/PDF export), Walkthrough (first-person with **Hotspot Teleportation** room-to-room).
* Level isolation via clipping planes, measure tool, flooring/paint material swaps, basic furniture staging.
* Interior weather: sunlight through windows by sun angle, rain on glass, overcast interior lighting.

### Phase 5: AR
* `<model-viewer>` share links for one-tap AR on Android (WebXR / Scene Viewer) and iOS (QuickLook via USDZ) — tabletop and 1:1 placement.
* Richer **WebXR mode on Android** (`@react-three/xr`): weather particles and full-scale interior walkthrough. iOS QuickLook cannot render custom weather effects and iOS Safari has no WebXR, so iOS gets the static model.
* GPS-anchored placement on the real plot requires native ARCore/ARKit geospatial APIs — deferred to a future native app.

### Phase 6: Terrain & Bring-Your-Own Models
* Integrate Mapbox elevation tiles to anchor assets to real GPS coordinates: location search (Mapbox Geocoding) + map box-select, multi-tile stitching at zoom 13–15 decoded in a Web Worker, satellite imagery draping.
  * Fix: terrain currently centers on the tile, not the requested coordinate.
* Optional context: extruded OSM buildings, or Google Photorealistic 3D Tiles via `3d-tiles-renderer`.
* Multiple objects per scene: generated-job library + user uploads (GLB/GLTF/OBJ/FBX) through the S3 presigned flow.
* Native real-world scale (unit picker, "scale to X m"), transform gizmo (drei `PivotControls`), snap-to-ground, place at lat/lon + heading, outliner panel.

### Phase 7: Weather Telemetry & Timeline
* Adapter layer normalizing every source to `{ t, temp, rh, pressure, windSpeed, windDir, gust, precipRate, precipType, cloudLow/Mid/High, visibility, solarRad, weatherCode }`.
* Sources: **Open-Meteo** default (forecast + historical, hourly and 15-minutely where available); user stations via CSV upload, polled HTTP/JSON, or WebSocket/MQTT (true 1-minute data generally comes from these). Column/unit mapping UI for user data.
* Interpolation between samples (circular for wind direction); weather proxy Lambda for caching, API keys, and CORS.
* Timeline scrubber with playback speeds (1 min/s, 1 hr/s), live mode, readings HUD and sparklines.

### Phase 8: Custom MCP Server
* Develop a custom **Model Context Protocol (MCP)** server (using Node.js/TypeScript SDK) to expose backend capabilities as standardized tools:
  * `generate_3d_asset`: Triggers the Modal + Hunyuan3D pipeline.
  * `convert_to_ar`: Processes `.glb` to `.usdz` assets.
  * `get_mapbox_terrain_mesh`: Fetches local elevation data.
  * `parse_floorplan`: Converts a floorplan image into a property document.
  * `get_weather_series`: Fetches normalized weather telemetry for a location and time range.

### Ongoing: Output & Performance
* Screenshot and canvas video export (`MediaRecorder`), embeddable read-only viewer for listings.
* Post-processing (`@react-three/postprocessing`), adaptive quality (drei `PerformanceMonitor`), terrain LOD, low-power mobile profile.

### Open Questions
* Is the Phase 1 pipeline stable enough to start Studio work (Phases 2–5) in parallel?
* Property mode: separate entry point for agents (e.g. `/studio?mode=property`) or extra panels in the same Studio?
* AR v1: are `<model-viewer>` share links enough, or is Android-only weather-in-AR required at launch?

---

## 4. Islamabad Go-to-Market Strategy

### Step-by-Step Execution Plan
1. **Demo Asset Creation:** Generate 3 distinct local housing plot/villa models through your pipeline.
2. **AR Field Capture:** Record a 15-second screen recording showing a 3D building projected onto an outdoor terrace via iPhone QuickLook in Islamabad (F-6 / Blue Area).
3. **Direct Pitching:** Walk in or message lead creatives at marketing firms.
4. **Value Offer:** Offer free AR-enabled listing conversions for 3 properties to prove lead conversion lifts.

### Target Audience Summary

| Niche | Target Location / Partner | Value Proposition |
| :--- | :--- | :--- |
| **Real Estate Marketing Agencies** | Sky Marketing, Zavyans, Ghafari (Blue Area / G-11) | Instant WhatsApp AR links for plot listings that increase ad conversion rates. |
| **Architectural Studios** | Third Space, Timeline Design, MOSS (F-6 / F-7) | Automated prop generation and high-speed client staging tools. |
| **PropTech / NRP Portals** | COLABS, The Hive (Blue Area) | Interactive 3D/AR spatial verification for Overseas Pakistanis buying plots remotely. |

---

## How to Save This Context in an Incognito Session

Since incognito tabs wipe your local browser data and cookies when closed, you can preserve this entire roadmap and technical context easily:

1. **Save as a Local Markdown File (`.md`):**
   * Copy the raw markdown code block above, paste it into a text file or code editor (like VS Code), and save it locally on your computer as `atomsphere-master-plan.md`.
2. **Initialize a GitHub Repository README:**
   * Create a private or public GitHub repository for `atomSphere`, paste this blueprint directly into your `README.md` file, and commit it. 
3. **Restore Context Later:**
   * If you need to spin up a fresh chat later, you can simply drop your saved markdown file or text back into the prompt box to instantly restore full project context.
