// Which generated index pages search engines are asked to index. Sutra and entity pages that only
// list a lesson or two are thin; they stay on the site and are linked from the notes, but carry
// noindex and are left out of the sitemap. Shared by the page templates and astro.config.mjs.

// a sutra page: holding 2+ quoted passages, or cited by 6+ lessons
export const sutraIndexable = (s) =>
  s.talks.length >= 6 || s.talks.reduce((a, t) => a + t.quotes.length, 0) >= 2;

// an entity page: discussed in 6+ lessons, or in 3+ with a dictionary gloss
export const entityIndexable = (e) => e.talks.length >= 6 || (!!e.gloss && e.talks.length >= 3);
