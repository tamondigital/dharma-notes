import { readFileSync } from "node:fs";
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import { sutraIndexable, entityIndexable } from "./src/lib/indexable.mjs";

const SITE = "https://tiedy.com", BASE = "/dharma-notes";

// <lastmod> per page from the notes' dates: a lesson and its transcript take the note's date,
// a series its newest lesson. Pages without a dated note get none.
function lastmods() {
  const site = JSON.parse(readFileSync(new URL("./content/site.json", import.meta.url), "utf-8"));
  const m = new Map();
  for (const c of site.channels) for (const s of c.series) {
    let newest = null;
    for (const l of s.lessons) {
      const d = l.modified ?? l.published;
      if (!d) continue;
      const page = `${SITE}${BASE}/${c.slug}/${s.slug}/${l.no}/`;
      m.set(page, d).set(page + "transcript/", d);
      if (!newest || d > newest) newest = d;
    }
    if (newest) m.set(`${SITE}${BASE}/${c.slug}/${s.slug}/`, newest);
  }
  return m;
}
const dated = lastmods();

// thin sutra and entity pages carry noindex (src/lib/indexable.mjs); keep them out of the sitemap too
const readJson = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf-8"));
const sutras = readJson("./content/sutras.json").sutras, entities = readJson("./content/entities.json");
function indexable(page) {
  const p = decodeURI(new URL(page).pathname).slice(BASE.length);
  let m;
  if ((m = p.match(/^\/sutra\/([^/]+)\/$/))) return !sutras[m[1]] || sutraIndexable(sutras[m[1]]);
  if ((m = p.match(/^\/e\/([^/]+)\/([^/]+)\/$/))) return !entities[m[1]]?.[m[2]] || entityIndexable(entities[m[1]][m[2]]);
  return true;
}

// GitHub Pages project site at https://tiedy.com/dharma-notes/ (custom domain on the tamondigital.github.io root repo)
export default defineConfig({
  site: SITE,
  base: BASE,
  trailingSlash: "always",
  build: { format: "directory" },
  integrations: [sitemap({
    filter: indexable,
    serialize(item) {
      const d = dated.get(decodeURI(item.url));
      return d ? { ...item, lastmod: d } : item;
    },
  })],
});
