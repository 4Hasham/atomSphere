// Runs after both builds (see "build" in package.json):
//   dist/index.html  the landing page, prerendered from src/entry-server.jsx (served at /)
//   dist/app.html    the empty app shell, noindex, served for every other route (_redirects)
//   dist/robots.txt and dist/sitemap.xml for VITE_SITE_URL
import { readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadEnv } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = (file) => `${root}dist/${file}`;
const PLACEHOLDER = "<!--app-html-->";

// .env files plus VITE_* variables from the environment (e.g. Netlify's).
const env = loadEnv("production", root, "VITE_");
const siteUrl = (env.VITE_SITE_URL || "https://atomsphere.app").replace(/\/+$/, "");

const shell = await readFile(dist("index.html"), "utf8");
if (!shell.includes(PLACEHOLDER)) throw new Error(`dist/index.html has no ${PLACEHOLDER} in #root`);

// The app's other pages (Stage, Shelf, Studio, sign-in) are private or per-user.
const appShell = shell
  .replace(PLACEHOLDER, "")
  .replace(/\s*<link rel="canonical"[^>]*>/, "")
  .replace("</title>", '</title>\n    <meta name="robots" content="noindex" />');
await writeFile(dist("app.html"), appShell);

const { render } = await import(pathToFileURL(`${root}dist-ssr/entry-server.js`).href);
await writeFile(dist("index.html"), shell.replace(PLACEHOLDER, render()));
await rm(`${root}dist-ssr`, { recursive: true, force: true });

await writeFile(
  dist("robots.txt"),
  `User-agent: *
Allow: /
Disallow: /studio
Disallow: /create
Disallow: /signin

Sitemap: ${siteUrl}/sitemap.xml
`
);

await writeFile(
  dist("sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${siteUrl}/</loc>
    <lastmod>${new Date().toISOString().slice(0, 10)}</lastmod>
  </url>
</urlset>
`
);

console.log(`Prerendered the landing page; robots.txt and sitemap.xml for ${siteUrl}`);
