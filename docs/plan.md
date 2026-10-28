# atomSphere: Master Plan & Architecture Blueprint

*Last updated 2026-10-28. Task-level status lives in `mvp.csv` (one level above this repo); the `#n` numbers below refer to its milestones.*

## 1. Product Overview & Vision
* **Core value proposition:** Turn a real property's floorplan and photos into an **accurate, explorable 3D house** (floors, rooms, walls, doors, windows) that can be staged on real terrain, under real light and weather, and shared as a link or in AR.
* **Everything revolves around properties.** One product with two engines, both feeding the same Studio, Shelf, accounts, AR, backdrops, terrain and weather:
  1. **Property mode (the product):** floorplan + photos → a structured, accurate house with rooms you can walk through. This is what real-estate customers pay for.
  2. **Object generation (furnishing the property):** a sentence or 1–3 photos → a 3D object via Hunyuan3D or Meshy, made from inside a property and placed in it (sofas, beds, cars in the drive, water tanks on the roof). Approximate by nature. Objects can also be made on their own from the Shelf's *Make an object* button (or `/create?mode=prompt`); they never appear as a separate product on the landing page or the Stage.
* **Why floorplans don't go through Hunyuan/Meshy:** image-to-3D models return one closed shell with guessed dimensions, no interior and wavy walls on buildings. It can't be lined up with an accurate plan. Instead:
  1. The plan becomes a **property document** (traced in the editor today; AI-read later, #54).
  2. The **Studio generates the 3D building** from that document.
  3. **Exterior photos** supply the outside appearance and facade details (Section 3, Phase 4).
* **Target niches:**
  * Mid-tier real estate marketing agencies and housing societies in Islamabad/Rawalpindi (Blue Area, G-11).
  * Overseas Pakistani (NRP) buyers and portals needing remote spatial verification.
  * Architectural visualization and interior design studios (staging, quick props).
* **Positioning (done, #61–#64):** the landing page leads with "See the house before you buy it." (from `marketing.md`) and a live 3D house; objects appear only as "Furnish it", part of the property story. The Stage creates properties only; the Shelf leads with Properties, with Objects as the library you furnish them from.

---

## 2. Technical Architecture (current)

```
[ Browser: Landing → Stage (new property: Input → Create) → Shelf → Studio (trace, then furnish) ]
   │  photos shrunk in the browser (2048 px, EXIF rotation applied)
   │  .glb uploads go straight to S3 (presigned POST)
   ▼
[ API Gateway + Cognito authorizer ] ─► Lambdas:
   add.js            create a job (title, description, category, input mode, plan)
   upload.js         SQS consumer → Modal (Standard) or Meshy (Polished)
   listRequests.js   the user's Shelf (owner-only)
   modelUrl.js       short-lived signed GET for the owner only
   modelUpload.js    bring-your-own .glb: start / complete / cancel
   generated.js      S3 trigger: assets/<job>.glb → status "generated"
   meshy-callback.js Meshy webhooks (text / image / multi-image)
   properties.js     properties: create / load / save scene JSON, plan image uploads (owner-only)
   │
   ├─► [ Modal: hunyuan3d-21-pipeline (api_21.py, L40S) ]   Standard plan entry point
   │      text & 1 photo → Hunyuan3D-2.1 shape + PBR textures (2048 px albedo, metallic-roughness)
   │      3 photos → run_multiview_job: shape from the 2.0 multi-view model on
   │                 [ Modal: hunyuan3d-2-multimodal-pipeline (api.py, A10) ], then 2.1 PBR textures
   │                 (2.1's painter uses one reference image, so it textures from the front photo)
   │
   └─► [ Meshy API ]  Polished plan: text / image / multi-image to 3D
   ▼
[ S3 ]  input bucket (uploads/) · output bucket meteoclone-3d-models (assets/ generated, user-models/ uploads,
        private; read only through modelUrl.js) · atomsphere-static (public HDRIs)
[ DynamoDB ]  job table (owner_id GSI); properties are rows in it (input_mode "property")

[ Studio (React Three Fiber) ]
   ├── Scene document + Zustand store with undo/redo; site-anchored geo frame (1 unit = 1 m)
   ├── Backdrops: studio grid, 6 ground-projected HDRIs (Poly Haven CC0), Mapbox terrain at a lat/lon
   ├── Weather presets: Studio, Sunny morning, Thunderstorm, Windy, Overcast, Golden hour
   ├── Objects: generated jobs and uploaded .glb files at real size
   └── Property mode: 3D (whole house, dollhouse per floor, roof toggle) and Plan (trace editor);
       objects placed in it (floor / roof / ground outside) and saved with the property
```

Planned additions: share links (#17), credits and local payments (#48, #49), AR share links (#4), weather proxy and telemetry (#21).

---

## 3. Development Roadmap

### Phase 1: Pipeline & Asset Optimization — mostly done
* Done: SQS → Modal / Meshy (#1, #2); Hunyuan quality wins (octree 384, fixed seed, SDXL base for text, BiRefNet) (#22); **Hunyuan3D-2.1 with PBR** as its own Modal app (#23); 3-photo Standard as a 2.0-shape + 2.1-PBR hybrid (#46); browser photo shrinking (#39).
* `api.py` (2.0) stays deployed: 3-photo jobs need its multi-view shape step. Its own `trigger_job` endpoint is a rollback path; remove it once 2.1 is proven, keeping the app and class names (api_21 calls them by name).
* USDZ for iOS: `<model-viewer>` generates it on the device from the GLB (#3 superseded). Add a server-side export only if on-device conversion proves too slow.
* Polygon budget **<100k** for anything that ships to AR/mobile.
* Later: normal-map baking (#24), texture upscaling (#25), GLB compression for uploads and AR (#45).
* Licence (Tencent Hunyuan 3D 2.0 / 2.1 Community License): commercial use allowed; **outputs may not be used or shown in the EU, UK or South Korea**; separate licence above 1M monthly active users; the terms of use must carry Tencent's acceptable-use restrictions and give users a copy of the licence.

### Phase 2: Studio Foundations — done
* Scene document + Zustand store with undo/redo (#10); site-anchored geo frame; Studio split into `terrain/`, `objects/`, `property/`, `weather/`, `backdrops/`, `ui/`.
* Theme-aware Studio (light/dark toggle in the header), icon undo/redo, mobile layout.

### Phase 3: Weather Rendering & Sun Study — presets done, data-driven pending (#19)
* **A preset is a constant weather series**, so presets and live telemetry will share one renderer.
* Variable → visual mapping (to build):
  * lat/lon + time → sun/moon position (`suncalc`), physical sky, stars.
  * Cloud cover → clouds; dims the sun and softens shadows.
  * Visibility → fog density (`3.912 / visibility`).
  * Precipitation rate + temperature/weather code → instanced rain/snow/sleet.
  * Wind speed/direction → slanted precipitation, vegetation sway, wind HUD.
  * Precipitation history → wet surfaces, snow accumulation.
  * WMO codes 95–99 → lightning.
* **Sun study:** a date and time give the true sun position and shadows at the property's location.

### Phase 4: Property Mode (Real Estate) — in progress (#20)
**Done**
* **Property document (#50):** `levels[]` (bottom to top, on a 0.3 m plinth) → `walls[]` (thickness, door/window openings) + `rooms[]` (polygon, name, type). Elevations follow from the level order. Pakistani defaults: 9" outer walls, 4.5" partitions, 3.2 m floors, flat roof.
* **3D builder (#50):** pure function; walls built in pieces around each opening; corners and T-junctions joined; slabs, room floors, glass, roof. In Studio: whole house, dollhouse cut at any floor, roof toggle.
* **Floorplan trace editor (#51):** Plan view next to 3D; floorplan image per floor with scale set from two points and a typed distance (feet/inches or metres); walls with snapping (corners, walls, straight lines, alignment); doors, windows, rooms, floors; select / edit / delete / drag corners; undo/redo.

**Decisions made**
* Entry point: **Floorplan as a 4th input on the Stage**, opening the same Studio with property tools (not a separate app).
* **Trace editor before AI reading**, so AI mistakes can be corrected.
* **Multiple storeys from the start.**

* **Furnish a property (#62):** in a property's Studio, *Add an object* picks one of your objects or makes one (describe it, 1 or 3 photos, upload a .glb); a click places it on a floor, the roof or the ground outside; size, turn, move, remove, undo. Placements are stored in the property's plan coordinates (floor + height), so they survive wall edits and hide with their floor in the dollhouse view. Objects still being made show as placeholders and fill in when ready (the client picks the job id, so no backend change was needed).
* **Property-first Stage, Shelf and landing (#63, #64):** see Positioning above.
* **Floorplan input & saving (#52):** Floorplan is the first Stage input (name + optional PDF / image); properties are saved per user (scene JSON and plan images in the private bucket, via `properties.js`) and autosaved from Studio; they live on the Shelf. PDFs are drawn in the browser with pdf.js. Deploy: #60.

**Next** (per `marketing.md` §5, the minimum before outreach: share link, walkthrough, one exterior finish; order agreed: restructure (done), share link, then AI floorplan reading)
1. **Share a property as a link (#17).** Must also sign the placed objects' models for viewers. Licence: Hunyuan3D (Standard) models may not be shown in the UK / EU (`marketing.md` §9), so a shared property either uses Meshy (Polished) objects or hides Hunyuan ones for viewers there.
2. **Plan view & walkthrough (#53):** plan view with names, areas, dimensions and PNG export; first-person walkthrough with tap-to-teleport between rooms; stairs.
3. **Exterior from photos** (how the house's real look gets in). The plan gives the shape and rooms; the user's exterior photos give the appearance:
   * **Materials & details (#55):** finishes per wall and floor (stone cladding, paint, marble) from a library or a patch of a photo; ready-made parts (parapet, boundary wall, gate, window frames, railings).
   * **Facade photos on walls (#56):** each exterior photo is straightened and laid onto the matching wall of the 3D house.
   * **Elevation tracer (#57):** front elevation drawing or straight-on photo → balconies, chajjas, porch, columns, parapet and floor heights as real 3D parts (a plan gives none of these).
   * **AI facade detection (#58):** a vision model finds facade corners, windows, balconies and chajjas so the user only confirms and corrects them (same pattern as #54).
4. **AI floorplan reading (#54):** floorplan image → draft property document, corrected in the trace editor. Planned straight after the share link: a vision model (e.g. Claude) plus our own clean-up step, prototyped in 2–3 days against 5–10 real local plans, then about a week to make it solid. CubiCasa5k is non-commercial only, so it isn't an option.
5. **AI photoreal stills (#59):** a "make it realistic" render of the current 3D view, guided by the user's photos, for listings and WhatsApp posts (images/short video, not navigable).
* Later: architect imports (IFC via `web-ifc`, FBX/OBJ/SKP via #43), measure tool, flooring/paint swaps, interior sunlight by sun angle, room scans (RoomPlan / Polycam).
* Realism ceiling: a phone browser can show a high-quality architectural visualization, not live photorealism. Photoreal output comes from server-side rendering (#59).

### Phase 5: AR — pending (#4, #7)
* `<model-viewer>` share links for one-tap AR on Android (Scene Viewer / WebXR) and iOS (Quick Look, USDZ generated on the device).
* Richer WebXR mode on Android (`@react-three/xr`): weather particles and full-scale interior walkthrough. iOS Safari has no WebXR, so iOS gets the static model.
* GPS-anchored placement on the real plot needs native ARCore/ARKit geospatial APIs — deferred to a future native app.

### Phase 6: Terrain, Backdrops & Your Own Models
* Done: Mapbox terrain at a lat/lon, centred on the requested coordinate (#5, #11); six ground-projected HDRI backdrops lighting the scene, hosted on S3 (#12–#14); **bring-your-own .glb** for signed-in users, private to the owner, opened at real size (#42, #44); model size control.
* Next: Google Photorealistic 3D Tiles for the real neighbourhood around a plot — coverage check first (#15), then a backdrop via `3d-tiles-renderer` with attribution (#16); real-site presets with satellite imagery (#18); FBX/OBJ/SKP/IFC conversion (#43); upload compression and a rotate-upright control (#45); transform gizmo, multiple objects, place at lat/lon + heading.

### Phase 7: Weather Telemetry & Timeline — pending (#21)
* Adapter layer normalizing every source to `{ t, temp, rh, pressure, windSpeed, windDir, gust, precipRate, precipType, cloudLow/Mid/High, visibility, solarRad, weatherCode }`.
* Sources: **Open-Meteo** default (forecast + historical); user stations via CSV, polled HTTP/JSON, or WebSocket/MQTT.
* Interpolation (circular for wind direction); weather proxy Lambda for caching, keys and CORS.
* Timeline scrubber with playback speeds, live mode, readings HUD and sparklines.

### Phase 8: Custom MCP Server
* A **Model Context Protocol** server (Node.js/TypeScript SDK) exposing backend capabilities as tools:
  * `generate_3d_asset`: Hunyuan3D (Standard) / Meshy (Polished) job.
  * `parse_floorplan`: floorplan image → property document (after #54).
  * `get_mapbox_terrain_mesh`: local elevation data.
  * `get_weather_series`: normalized weather for a location and time range.
  * (`convert_to_ar` dropped: USDZ is generated on the device.)

### Ongoing: Product, Output & Performance
* Done: Stage flow with named models and a 3-photo option on both plans (#27–#30); Shelf as a header destination with a generation tray (#30, #32, #38); landing page, logo, icons and link previews (#33, #34); cool-white light theme and mobile pass (#36, #37).
* Screenshot and canvas video export, embeddable read-only viewer for listings, scene save & share links (#17).
* Post-processing, adaptive quality, terrain LOD, low-power mobile profile.

### Open Questions
* When to remove `api.py`'s own endpoint (2.0 stays as the multi-view shape worker either way).
* Retire 2.0 entirely later by sending 3-photo Standard jobs to Meshy, or waiting for a 2.1 multi-view model?
* AR v1: are `<model-viewer>` share links enough, or is Android-only weather-in-AR needed at launch?
* Pinch-to-zoom in the plan editor on phones, or is tracing desktop-only?

---

## 4. Business Model

* **Plans (#47):** **Standard $3** (Hunyuan3D-2.1, PBR) and **Polished $5** (Meshy), for any input — text, 1 photo or 3 photos — with no 3-photo surcharge (it costs the same to generate). No "Basic" tier on Hunyuan 2.0.
* **Costs:** roughly $0.17–0.28 of GPU per Standard model at low traffic (container start-up dominates), ~$0.07–0.11 with steady traffic.
* **Credits (#48):** 1 credit = $1 (Standard 3, Polished 5); credits deducted when a job starts and refunded if it fails; sold in packs priced in PKR. Packs avoid paying a fixed card fee on every small purchase.
* **Payments (#49):** Easypaisa and JazzCash merchant APIs, plus bank transfer confirmed by an admin (Stripe doesn't serve businesses registered in Pakistan).
* Free during the preview: the Payment step shows prices but charges nothing yet.

---

## 5. Islamabad Go-to-Market Strategy

### Step-by-Step Execution Plan
1. **Demo assets (#6):** trace 3 real local plans (houses / villas in target societies) into properties, staged on their real terrain.
2. **AR field capture (#7):** a 15-second screen recording placing one of them on an outdoor surface in Islamabad.
3. **Identify agencies (#8)** and **outreach (#9):** send the clip via LinkedIn or WhatsApp (link previews are live on atomsphere.app).
4. **Value offer:** free 3D/AR conversions for 3 listings to prove the lift in enquiries.

### Target Audience Summary

| Niche | Target Location / Partner | Value Proposition |
| :--- | :--- | :--- |
| **Real Estate Marketing Agencies** | Sky Marketing, Zavyans, Ghafari (Blue Area / G-11) | Explorable 3D houses and one-tap AR links for listings, shared on WhatsApp. |
| **PropTech / NRP Portals** | COLABS, The Hive (Blue Area) | Remote verification of a property's layout, size and surroundings for overseas buyers. |
| **Architectural Studios** | Third Space, Timeline Design, MOSS (F-6 / F-7) | Plans to 3D quickly, staged with generated props for client presentations. |
