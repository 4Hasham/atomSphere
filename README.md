# React + Vite

## Studio

Selecting **View model** opens the model in a new tab on the dedicated
`/studio?job=<job-id>` page. Studio requests a fresh signed model URL when opened,
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

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
