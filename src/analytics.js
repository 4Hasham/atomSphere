// Google Analytics 4, loaded only in production builds with VITE_GA_MEASUREMENT_ID set.
// Page views are sent by hand with the path only: Studio URLs carry property ids and
// prompts in the query, which shouldn't leave the browser. In GA, turn off Enhanced
// measurement → "Page changes based on browser history events" so views aren't counted twice.
const MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID;
const enabled = Boolean(import.meta.env.PROD && MEASUREMENT_ID && typeof window !== "undefined");

if (enabled) {
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    window.dataLayer.push(arguments);
  };
  window.gtag("js", new Date());
  window.gtag("config", MEASUREMENT_ID, { send_page_view: false });

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(MEASUREMENT_ID)}`;
  document.head.appendChild(script);
}

// The page as GA sees it: path only, and share links (/p/<token>) are private, so the
// token stays out too. Sent with every event, or gtag would report the full URL.
function currentPage() {
  const path = window.location.pathname.startsWith("/p/") ? "/p/" : window.location.pathname;
  return { page_location: window.location.origin + path, page_path: path };
}

/** Records a view of the current page. */
export function trackPageView() {
  if (!enabled) return;
  window.gtag("event", "page_view", { ...currentPage(), page_title: document.title });
}

/** Records a named event, e.g. trackEvent("sign_up"). Never pass emails or prompts. */
export function trackEvent(name, params = {}) {
  if (!enabled) return;
  window.gtag("event", name, { ...currentPage(), ...params });
}
