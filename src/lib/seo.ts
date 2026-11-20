// Metadata for search engines and link previews: meta descriptions, JSON-LD.
import { site, channelLabel, lecturer, type Series, type Channel } from "./data";

// Search results show roughly 80–100 CJK characters; cut at a sentence end when one falls in range.
export function metaDesc(text: string, n = 100): string {
  const t = (text || "").replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  const head = t.slice(0, n);
  const stop = Math.max(head.lastIndexOf("。"), head.lastIndexOf("；"), head.lastIndexOf("！"), head.lastIndexOf("？"));
  return stop >= n * 0.5 ? head.slice(0, stop + 1) : head + "…";
}

// absolute URL for a site path that already includes the base (as url() returns)
export const abs = (p: string) => new URL(p, import.meta.env.SITE).href;

export type Crumb = [name: string, path: string];
export const breadcrumbs = (items: Crumb[]) => ({
  "@type": "BreadcrumbList",
  itemListElement: items.map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: abs(path) })),
});

// with one teacher the site is also known as 「<teacher>講經筆記」
const altName = site.channels.length === 1 ? `${channelLabel(site.channels[0])}${site.title}` : undefined;
export const websiteRef = () => ({
  "@type": "WebSite", "@id": abs(import.meta.env.BASE_URL) + "#website", name: site.title, ...(altName && { alternateName: altName }), url: abs(import.meta.env.BASE_URL),
});

// "1:58:33" or "58:33" as ISO 8601 ("PT1H58M33S")
export function isoDuration(d?: string | null): string | undefined {
  const p = (d ?? "").split(":").map(Number);
  if (p.length < 2 || p.length > 3 || p.some(Number.isNaN)) return undefined;
  const [h, m, s] = p.length === 3 ? p : [0, ...p];
  return `PT${h ? h + "H" : ""}${m ? m + "M" : ""}${s}S`;
}

// the 法師 who gave the talk, when it was one (see lecturer())
export const teacherNode = (c: Channel, s: Series) => {
  const name = lecturer(s);
  return name ? { "@type": "Person", name, affiliation: { "@type": "Organization", name: c.name } } : undefined;
};

// entity types as the entity pages declare them
export const entityType = (type: string) => ({ 名相: "DefinedTerm", 人物: "Person", 地名: "Place" } as Record<string, string>)[type] ?? "Thing";

// date: the talk's upload date as the notes and transcripts record it
export const video = (id: string, name: string, o: { date?: string | null; duration?: string | null; description?: string; creator?: object } = {}) => ({
  "@type": "VideoObject",
  name,
  ...(o.description && { description: o.description }),
  url: `https://www.youtube.com/watch?v=${id}`,
  embedUrl: `https://www.youtube.com/embed/${id}`,
  thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
  ...(o.date && { uploadDate: o.date }),
  ...(isoDuration(o.duration) && { duration: isoDuration(o.duration) }),
  inLanguage: "zh-Hant",
  ...(o.creator && { creator: o.creator }),
});

// a list of nodes becomes one @graph document
export const graph = (...nodes: object[]) => ({ "@context": "https://schema.org", "@graph": nodes });
