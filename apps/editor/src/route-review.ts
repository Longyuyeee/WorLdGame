import { semanticHash, webProjectSourceForRuntime, type CanonicalProject } from "@world-studio/project-domain";
import type { RouteGraphV1 } from "@world-studio/route-graph";
import { inspectDirectiveArguments } from "@world-studio/story-language";
import { localizationSourceEntries, localizationTranslations, targetLocales } from "./localization-production";

export interface RouteReviewTrace {
  readonly sourceHash: string;
  readonly buildId: string;
  readonly status: string;
  readonly startKind: string;
  readonly endingName: string | null;
  readonly sceneIds: readonly string[];
  readonly statementIds: readonly string[];
  readonly choiceIds: readonly string[];
  readonly playtestSourceHash?: string | null;
  readonly endingId?: string | null;
  readonly endingSceneId?: string | null;
  /** Transient editor review request identity, not a content approval or completion receipt. */
  readonly reviewSerial?: number | null;
}

export const routeReviewSourceHash = (project: CanonicalProject) => semanticHash(webProjectSourceForRuntime(project));

export function createRouteReview(project: CanonicalProject, graph: RouteGraphV1, trace: RouteReviewTrace | null, locale: string) {
  const sourceHash = routeReviewSourceHash(project);
  const locales = targetLocales(project);
  const selectedLocale = locales.includes(locale) ? locale : null;
  const sources = localizationSourceEntries(project, false);
  const translations = selectedLocale === null ? [] : localizationTranslations(project, selectedLocale, sources);
  const byScene = new Map<string, (typeof translations)[number][]>();
  for (const entry of translations) { const rows = byScene.get(entry.sceneId); if (rows) rows.push(entry); else byScene.set(entry.sceneId, [entry]); }
  const registered = new Set(project.assets.assets.flatMap(asset => typeof (asset.assetId ?? asset.id) === "string" ? [String(asset.assetId ?? asset.id)] : []));
  const traceState = trace === null ? "none" : trace.sourceHash === sourceHash ? "current" : "stale";
  const visited = new Set(traceState === "current" ? trace?.sceneIds : []);
  const diagnosticsByScene = new Map<string, (typeof graph.diagnostics)[number][]>();
  for (const diagnostic of graph.diagnostics) {
    if (diagnostic.sceneId === undefined) continue;
    const rows = diagnosticsByScene.get(diagnostic.sceneId);
    if (rows) rows.push(diagnostic); else diagnosticsByScene.set(diagnostic.sceneId, [diagnostic]);
  }
  const scenes = project.scenes.map(scene => {
    const statements = project.scripts[scene.id]?.statements ?? [];
    const resources = statements.flatMap(statement => {
      if (statement.kind !== "direction" || typeof statement.summary !== "string" || typeof statement.id !== "string") return [];
      const inspected = inspectDirectiveArguments(statement.summary);
      return ["asset", "transitionAsset"].flatMap(parameter => {
        const assetId = inspected.parameters[parameter];
        return !assetId || inspected.duplicateKeys.includes(parameter) ? [] : [{ assetId, statementId: statement.id as string, parameter, registered: registered.has(assetId) }];
      });
    });
    const textCharacters = statements.reduce((sum, statement) => sum + ((statement.kind === "dialogue" || statement.kind === "narration") && typeof statement.text === "string" ? Array.from(statement.text).filter(c => !/\s/u.test(c)).length : 0), 0);
    const textRows = byScene.get(scene.id) ?? [];
    return { sceneId: scene.id, title: scene.title, statementCount: statements.length, textCharacters,
      estimatedReadingSeconds: Math.ceil(textCharacters / 5), resources,
      translation: { locale: selectedLocale, total: textRows.length, reviewed: textRows.filter(row => row.status === "reviewed" || row.status === "locked").length,
        pending: textRows.filter(row => row.status !== "reviewed" && row.status !== "locked").map(row => ({ key: row.key, statementId: row.statementId, status: row.status })) },
      observedInLatestRun: visited.has(scene.id), diagnostics: diagnosticsByScene.get(scene.id) ?? [] };
  });
  return { schemaVersion: 1 as const, kind: "world-route-review" as const, projectId: project.manifest.projectId, title: project.manifest.title, sourceHash,
    locale: selectedLocale, traceState, trace, scenes, graph,
    limits: ["结构连接不是条件可行性证明；存在剧透。", "仅最近一次本机会话的 Runtime History 停靠事件/已选选项，不累计为全部语句或分支覆盖；刷新后需重新试玩。", "源码版本不一致的试玩记录标为过期，不计当前已观察场景。", "资源只核对演出 asset/transitionAsset 引用是否登记，未读取文件或验证所有资源类型。", "翻译仅场景剧情文本，沿用正式 missing/draft/outdated/reviewed/locked 状态；不含附加内容目录，未配置语言不等于翻译完成。", "阅读量按每分钟 300 个非空白对白/旁白字符估算，不含选择、媒体、等待、循环或语速差异，不是实际通关时长。", "报告包含已提交到剧情模型的内容；不替代可编辑工程 ZIP、游戏导出或验收结论。"] };
}
export type RouteReviewReport = ReturnType<typeof createRouteReview>;
export const reviewEscape = (value: unknown) => String(value).replace(/[&<>"']/gu, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function routeReviewHtml(report: RouteReviewReport): string {
  const e = reviewEscape;
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>${e(report.title)} · 路线评审</title><style>body{font:16px/1.7 system-ui;max-width:1100px;margin:auto;padding:24px;color:#203040}article{border:1px solid #aaa;padding:16px;margin:16px 0}code{overflow-wrap:anywhere}a{color:#1749a0}pre{white-space:pre-wrap;overflow-wrap:anywhere}li{overflow-wrap:anywhere}</style><h1>${e(report.title)} · 路线评审</h1><p>源码版本 <code>${e(report.sourceHash)}</code> · 翻译语言 ${e(report.locale ?? "未选择 / 未配置")} · 试玩记录 ${e(report.traceState)}</p><ul>${report.limits.map(limit => `<li>${e(limit)}</li>`).join("")}</ul><h2>最近一次试玩</h2><p>${e(report.traceState === "none" ? "尚无记录" : report.traceState === "stale" ? "旧版本记录，需重新试玩" : "记录与当前源码一致")} · ${e(report.trace?.endingName ?? "尚未到达结局")} · 起点 ${e(report.trace?.startKind ?? "无")}。不代表全路线覆盖。</p><details><summary>展开原始版本与停靠事件记录</summary><pre>${e(JSON.stringify(report.trace, null, 2))}</pre></details><h2>场景导航</h2><nav>${report.scenes.map((scene, index) => `<a href="#scene-${index}">${e(scene.title)}</a> `).join("")}</nav>${report.scenes.map((scene, index) => `<article id="scene-${index}"><h2>${e(scene.title)}</h2><code>${e(scene.sceneId)}</code><p>${scene.statementCount} 步骤 · ${scene.textCharacters} 字符 · 阅读量估算 ${scene.estimatedReadingSeconds} 秒 · 本版最近试玩${scene.observedInLatestRun ? "已观察" : "未观察"}</p><p>资源引用 ${scene.resources.length}，未登记 ${scene.resources.filter(r => !r.registered).length}；翻译 ${e(scene.translation.locale ?? "未配置")}：已审 ${scene.translation.reviewed}/${scene.translation.total}</p><details><summary>资源与翻译待办（稳定语句 ID）</summary><pre>${e(JSON.stringify({ resources: scene.resources, translation: scene.translation }, null, 2))}</pre></details><ul>${scene.diagnostics.map(d => `<li>${e(d.code)} · ${e(d.statementId ?? "场景")} · ${e(d.message)}</li>`).join("")}</ul></article>`).join("")}<h2>结构连接</h2><ul>${report.graph.edges.map(edge => `<li>${e(edge.sourceSceneId)} → ${e(edge.targetSceneId)} · ${e(edge.label)} · ${e(edge.statementId)}</li>`).join("")}</ul><h2>全局诊断</h2><ul>${report.graph.diagnostics.filter(d => d.sceneId === undefined).map(d => `<li>${e(d.code)} · ${e(d.message)}</li>`).join("")}</ul></html>`;
}

export function routeReviewSvg(report: RouteReviewReport): string {
  const scenes = report.scenes.slice(0, 200), e = reviewEscape;
  // Fixed deterministic review layout; bounded image, full graph remains in JSON.
  const indices = new Map(scenes.map((scene, index) => [scene.sceneId, index]));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="${130 + scenes.length * 80}" viewBox="0 0 960 ${130 + scenes.length * 80}"><defs><marker id="arrow" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6" fill="#8ab8dd"/></marker></defs><rect width="100%" height="100%" fill="#101b2b"/><g font-family="sans-serif" fill="white"><text x="24" y="30">${e(report.title.slice(0, 60))} · 结构路线评审（含剧透）</text><text x="24" y="55">显示前 ${scenes.length}/${report.scenes.length} 场景 / 最多400连接；全部连接见 JSON；不证明条件可行性</text><text x="24" y="80">源码 ${e(report.sourceHash)}</text>${report.graph.edges.filter(edge => indices.has(edge.sourceSceneId) && indices.has(edge.targetSceneId)).slice(0, 400).map(edge => `<path d="M 750 ${130 + indices.get(edge.sourceSceneId)! * 80} Q 930 ${130 + indices.get(edge.sourceSceneId)! * 80} 750 ${130 + indices.get(edge.targetSceneId)! * 80}" fill="none" stroke="#5b87ac" marker-end="url(#arrow)"/>`).join("")}${scenes.map((scene, i) => `<rect x="24" y="${100 + i * 80}" width="726" height="66" rx="8" fill="#24354b"/><text x="40" y="${125 + i * 80}">${i + 1}. ${e(scene.title.slice(0, 50))} · ${scene.observedInLatestRun ? "本版最近试玩已观察" : "未观察"}</text><text x="40" y="${150 + i * 80}">${e(scene.sceneId)} · ${scene.diagnostics.length} 诊断 · 阅读估算 ${scene.estimatedReadingSeconds}s</text>`).join("")}</g></svg>`;
}
