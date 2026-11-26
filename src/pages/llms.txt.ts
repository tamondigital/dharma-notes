// /llms.txt (llmstxt.org): a plain map of the site for AI tools. Generated from the snapshot, like the pages.
import { site, allLessons, channelLabel, lecturer, seriesUrl, url } from "../lib/data";
import { abs } from "../lib/seo";

export function GET() {
  const one = site.channels.length === 1 ? site.channels[0] : null;
  const name = one ? `${channelLabel(one)}${site.title}` : site.title;
  const nNotes = allLessons().filter((x) => x.l.has_note).length;
  const out = [
    `# ${name}`,
    "",
    `> ${one ? `${channelLabel(one)}於${one.name}` : ""}${site.tagline}現有筆記 ${nNotes} 講。`,
    "",
    "筆記依法師原講整理；引用經文已核對 CBETA。引用時請以逐字稿與影片原講為準，並註明出處頁面。",
    "",
  ];
  for (const c of site.channels) {
    out.push(`## ${multi(c.name)}講經系列`, "");
    for (const s of c.series) {
      const noted = s.lessons.filter((l) => l.has_note).length;
      const who = lecturer(s);
      out.push(`- [${who ? `${who}講` : ""}《${s.name}》](${abs(seriesUrl(c, s))})：${s.lessons.length} 講${noted ? `，${noted} 講附筆記` : "，目前只有逐字稿"}`);
    }
    out.push("");
  }
  out.push(
    "## 索引",
    "",
    `- [名相・人物・地名](${abs(url("e/"))})：筆記中出現在兩講以上的名相、人物與地名，及談到它們的各講`,
    `- [引用經論](${abs(url("sutra/"))})：各講引用的藏經典籍與經文`,
    `- [關於本站](${abs(url("about/"))})：整理方式與忠於原講的原則`,
    "",
  );
  return new Response(out.join("\n"), { headers: { "Content-Type": "text/plain; charset=utf-8" } });

  function multi(n: string) { return site.channels.length > 1 ? `${n}・` : ""; }
}
