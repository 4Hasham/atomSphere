import { renderToString } from "react-dom/server";
import Landing from "./landing/Landing";

// Build-time render of the landing page (scripts/prerender.js), so crawlers and link
// previews get its text without running JavaScript. The browser then renders the app over
// it (main.jsx); the 3D house is lazy, so its loading cube is what appears here.
export function render() {
  const noop = () => {};
  return renderToString(
    <div data-prerendered="">
      <Landing theme="dark" toggleTheme={noop} onStart={noop} onSignIn={noop} />
    </div>
  );
}
