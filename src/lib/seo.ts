// Metadata for search engines and link previews: meta descriptions, JSON-LD.
import { site } from "./data";

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

export const websiteRef = () => ({ "@type": "WebSite", name: site.title, url: abs(import.meta.env.BASE_URL) });

export const video = (id: string, name: string) => ({
  "@type": "VideoObject",
  name,
  url: `https://www.youtube.com/watch?v=${id}`,
  embedUrl: `https://www.youtube.com/embed/${id}`,
  thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
});

// a list of nodes becomes one @graph document
export const graph = (...nodes: object[]) => ({ "@context": "https://schema.org", "@graph": nodes });
