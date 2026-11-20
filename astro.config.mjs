import { readFileSync } from "node:fs";
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

const SITE = "https://tamondigital.github.io", BASE = "/dharma-notes";

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

// GitHub Pages project site: https://tamondigital.github.io/dharma-notes/
export default defineConfig({
  site: SITE,
  base: BASE,
  trailingSlash: "always",
  build: { format: "directory" },
  integrations: [sitemap({
    serialize(item) {
      const d = dated.get(decodeURI(item.url));
      return d ? { ...item, lastmod: d } : item;
    },
  })],
});
