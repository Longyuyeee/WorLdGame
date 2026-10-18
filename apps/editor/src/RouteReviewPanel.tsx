import { useEffect, useState } from "react";
import type { CanonicalProject } from "@world-studio/project-domain";
import type { RouteGraphV1 } from "@world-studio/route-graph";
import { targetLocales } from "./localization-production";
import { createRouteReview, routeReviewHtml, routeReviewSvg, type RouteReviewReport, type RouteReviewTrace } from "./route-review";

export function RouteReviewPanel({ project, graph, trace, blocked, onOpen }: {
  project: CanonicalProject; graph: RouteGraphV1; trace: RouteReviewTrace | null; blocked: boolean;
  onOpen: (sceneId: string, statementId?: string) => void;
}) {
  const [locale, setLocale] = useState("");
  const [offset, setOffset] = useState(0);
  const [snapshot, setSnapshot] = useState<{ project: CanonicalProject; trace: RouteReviewTrace | null; locale: string; report: RouteReviewReport } | null>(null);
  const [links, setLinks] = useState<readonly { href: string; name: string; label: string }[]>([]);
  const [error, setError] = useState("");
  const current = snapshot !== null && snapshot.project === project && snapshot.trace === trace && snapshot.locale === locale && !blocked;
  useEffect(() => {
    setLinks([]);
    if (!current || snapshot === null) return;
    const report = snapshot.report;
    const created: { href: string; name: string; label: string }[] = [];
    try {
      const exports = [
      { name: "route-review.json", label: "下载评审 JSON", mime: "application/json", content: JSON.stringify(report, null, 2) },
      { name: "route-review.html", label: "下载离线评审 HTML", mime: "text/html", content: routeReviewHtml(report) },
      { name: "route-review.svg", label: "下载路线评审 SVG", mime: "image/svg+xml", content: routeReviewSvg(report) }
    ];
      for (const item of exports) created.push({ href: URL.createObjectURL(new Blob([item.content], { type: `${item.mime};charset=utf-8` })), name: item.name, label: item.label });
      setLinks(created);
    } catch { setError("生成下载失败，请重试；工程内容未改变。"); }
    return () => { for (const item of created) URL.revokeObjectURL(item.href); };
  }, [current, snapshot]);
  return <section className="route-review-delivery" aria-label="路线评审交付">
    <h3>路线评审与交接</h3>
    <p>先生成当前版本摘要，再定位待办、试玩复验并重新生成。导出包含剧透，不等于全路径验收。</p>
    <label>评审翻译语言 <select aria-label="评审翻译语言" value={locale} onChange={event => setLocale(event.target.value)}>
      <option value="">不评审翻译 / 未选择</option>{targetLocales(project).map(value => <option key={value} value={value}>{value}</option>)}
    </select></label>
    <button type="button" disabled={blocked} onClick={() => {
      try { setSnapshot({ project, trace, locale, report: createRouteReview(project, graph, trace, locale) }); setOffset(0); setError(""); }
      catch { setError("生成评审失败，请检查工程诊断后重试；工程内容未改变。"); }
    }}>生成当前版本评审</button>
    {blocked && <p role="status">有未提交输入或脚本草稿，请先应用或撤销；不导出旧版本冒充当前评审。</p>}
    {error && <p role="alert">{error}</p>}
    {snapshot !== null && !current && <p role="status">评审已过期：工程、语言或试玩记录发生变化，请重新生成。</p>}
    {snapshot !== null && current && <>
      <p>{snapshot.report.scenes.length} 场景 · {snapshot.report.graph.edges.length} 结构连接 · {snapshot.report.graph.diagnostics.length} 编译诊断</p>
      {snapshot.report.graph.diagnostics.filter(d => d.sceneId === undefined).map((d, index) => <p key={index}>{d.code} · {d.message}</p>)}
      <p aria-label="评审试玩状态">{snapshot.report.traceState === "none" ? "尚无试玩记录" : snapshot.report.traceState === "stale" ? "试玩记录已过期，请重新试玩" : `最近一次试玩记录与源码一致 · ${trace?.status} · ${trace?.endingName ?? "尚未到达结局"}`}。仅 History 停靠事件与已选选项，不代表全分支覆盖；刷新后记录不保留。</p>
      <p>源码版本 <code>{snapshot.report.sourceHash}</code></p>
      <details><summary>评审口径与未验证边界</summary><ul>{snapshot.report.limits.map(limit => <li key={limit}>{limit}</li>)}</ul></details>
      <nav aria-label="评审下载">{links.map(link => <a key={link.name} href={link.href} download={link.name}>{link.label}</a>)}</nav>
      <p>SVG 最多 200 场景 / 400 条窗口内连接；JSON 和 HTML 保留完整结构。无需联网，HTML 可按场景导航和浏览器查找。</p>
      <div aria-label="评审场景摘要">{snapshot.report.scenes.slice(offset, offset + 24).map(scene => <article key={scene.sceneId}>
        <h4>{scene.title}</h4><p>{scene.statementCount} 步骤 · 阅读量估算 {scene.estimatedReadingSeconds} 秒 · {scene.observedInLatestRun ? "最近试玩已观察" : "最近试玩未观察"}</p>
        <p>资源引用 {scene.resources.length} / 未登记 {scene.resources.filter(r => !r.registered).length}（文件未校验）；翻译 {scene.translation.locale ?? "未选择"}：已审 {scene.translation.reviewed}/{scene.translation.total}；诊断 {scene.diagnostics.length}</p>
        <button type="button" onClick={() => onOpen(scene.sceneId)}>进入场景：{scene.title}</button>
        {scene.resources.filter(r => !r.registered).slice(0, 3).map((r, i) => <button type="button" key={`${r.statementId}-${i}`} onClick={() => onOpen(scene.sceneId, r.statementId)}>定位缺失引用：{r.assetId}</button>)}
        {scene.translation.pending.slice(0, 3).map(row => <button type="button" key={row.key} onClick={() => onOpen(scene.sceneId, row.statementId)}>定位翻译源：{row.status} · {row.key}</button>)}
        {scene.diagnostics.slice(0, 3).map((d, i) => <button type="button" key={i} onClick={() => onOpen(scene.sceneId, d.statementId)}>定位评审问题：{d.code}</button>)}
      </article>)}</div>
      <button type="button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 24))}>上一页评审</button>
      <span> {offset + 1}–{Math.min(offset + 24, snapshot.report.scenes.length)} / {snapshot.report.scenes.length} 场景；每类待办每场景仅展示前 3 项，完整清单见导出 </span>
      <button type="button" disabled={offset + 24 >= snapshot.report.scenes.length} onClick={() => setOffset(offset + 24)}>下一页评审</button>
    </>}
  </section>;
}
