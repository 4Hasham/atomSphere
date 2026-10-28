# React + Vite

## Creating a property or a model (Stage)

The home screen is a single stage with the steps shown in the header. The first input,
**Floorplan**, makes a property (an explorable 3D house); the other three make a 3D
object with Hunyuan3D (Standard) or Meshy (Polished).

- **Floorplan:** a name and an optional plan (PDF, JPG or PNG; PDFs are drawn with
  pdf.js in the browser). Input → Create: the property is created, the plan uploaded
  to its private folder, and Studio opens on the plan with the Scale tool. Signed-out
  users sign in first; the name is kept through the redirect. Properties are saved by
  `backend/lambdas/properties.js` and autosaved from Studio.
- **Describe it / 1 photo / 3 photos:** Input → Category → Payment → Account → Shelf.
  Photos up to 20 MB are accepted and shrunk in the browser (2048 px, ~0.5–1 MB) before
  upload; see `src/stage/prepareImage.js`. `suggestCategory()` in `src/stage/model.js` is
  the hook-point for automatic category suggestions. No payment provider is wired in
  yet; the step says it's free during preview.
- **Shelf:** the user's properties and models, polled every 10 seconds; a ready item
  opens in Studio.

Code lives in `src/stage/`; Studio styles are in `src/studio/studio.css`.

## Studio

Selecting a ready model on the shelf opens it in the same tab on the dedicated
`/studio?job=<job-id>` page; **Back to shelf** returns to it. Studio requests a fresh signed model URL when opened,
so reloading a Studio URL does not depend on a previously cached URL.

Netlify serves this Vite app as a single-page application. The redirect rule in
`public/_redirects` rewrites direct requests such as `/studio?job=<job-id>` to
the app entry point so client-side routes work after deployment and on refresh.

## Optional model terrain backdrop

When viewing a generated model, enter a latitude and longitude in the viewer's
"Add terrain backdrop" controls to load the surrounding elevation tile from
Mapbox Terrain-RGB. The model stays centered on top of the terrain; terrain is
optional and can be removed without closing the viewer.

Set `VITE_MAPBOX_ACCESS_TOKEN` in your local `.env` file to a Mapbox public access
token with `tiles:read` permission. Restrict the token to the domains where the
app is hosted. See `.env.example` for the frontend API settings and the terrain
token variable.

The displayed terrain tile uses zoom level 11. Elevation is decoded from
Mapbox Terrain-RGB and scaled against the tile's real-world width at its
latitude, with modest vertical exaggeration to keep hills visible.

## Studio scene presets

Use the **Scene presets** selector in Studio to change the scene's lighting,
background, and atmosphere. Presets include sunny morning, thunderstorm (with
animated rain and lightning), windy (with moving wind streaks), overcast, and
golden hour. Select **Studio** to restore the original neutral lighting.

The separate **Background** selector adds a procedural city scene with roads
and buildings, a mountain scene with trees, or the original studio backdrop.
A visible sun is framed in the scene and follows the camera as you orbit.

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
