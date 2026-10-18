import { expect, it } from "vitest";
import { semanticHash } from "@world-studio/project-domain";
import { compileProject } from "@world-studio/project-compiler";
import { buildRouteGraph } from "@world-studio/route-graph";
import { projectCanonicalFromStory } from "./canonical-project-adapter";
import { createRouteReview, routeReviewHtml, routeReviewSvg, type RouteReviewTrace } from "./route-review";

export const reviewProject = () => projectCanonicalFromStory({ schemaVersion: 0, id: "review_story", title: "<img src=x onerror=alert(1)>", entrySceneId: "start", characters: [], scenes: [
  { id: "start", title: "开始 <script>bad()</script>", statements: [{ id: "line", kind: "narration", textId: "text_line", text: "雨后的约定" }, { id: "background", kind: "direction", command: "background", summary: "asset=missing_bg" }, { id: "done", kind: "end", endingName: "完成" }] }
] }, "review-test");

it("reports source references and real translation statuses without treating registration or trace as acceptance", () => {
  const base = reviewProject();
  const project = { ...base, localization: { ...base.localization, locales: [{ locale: "en", entries: [{ key: "text_line", sourceText: "旧文本", translation: "Promise", status: "reviewed" }] }] } };
  const trace: RouteReviewTrace = { sourceHash: semanticHash(project), buildId: "build", status: "ended", startKind: "entry", endingName: "完成", sceneIds: ["start"], statementIds: ["line", "done"], choiceIds: [] };
  const report = createRouteReview(project, buildRouteGraph(project), trace, "en");
  expect(report.traceState).toBe("current");
  expect(report.scenes[0]).toMatchObject({ observedInLatestRun: true, textCharacters: 5, estimatedReadingSeconds: 1, resources: [{ assetId: "missing_bg", registered: false }], translation: { reviewed: 0, total: 2 } });
  expect(report.scenes[0]!.translation.pending).toEqual(expect.arrayContaining([expect.objectContaining({ key: "text_line", status: "outdated" }), expect.objectContaining({ key: "done", status: "missing" })]));
  const stale = createRouteReview({ ...project, manifest: { ...project.manifest, title: "修改" } }, report.graph, trace, "en");
  expect(stale.traceState).toBe("stale"); expect(stale.scenes[0]!.observedInLatestRun).toBe(false);
  expect(createRouteReview(base, report.graph, null, "en").locale).toBeNull();
});
it("exports escaped, offline review artifacts and caps only the SVG", () => {
  const project = reviewProject(), graph = buildRouteGraph(project), report = createRouteReview(project, graph, null, "");
  const html = routeReviewHtml(report), svg = routeReviewSvg(report);
  expect(html).not.toContain("<script>"); expect(html).not.toContain("<img src"); expect(html).toContain("&lt;script&gt;");
  expect(html).toContain("default-src 'none'"); expect(html).toContain('href="#scene-0"'); expect(svg).not.toContain("<script>");
  expect(JSON.parse(JSON.stringify(report)).graph).toEqual(graph);
  const large = { ...report, scenes: Array.from({ length: 250 }, (_, index) => ({ ...report.scenes[0]!, sceneId: `scene_${index}` })) };
  expect(routeReviewSvg(large)).toContain("200/250"); expect(routeReviewHtml(large)).toContain('id="scene-249"');
});
it("uses the same source identity as Compiler when a save compatibility receipt exists", () => {
  const initial = reviewProject(), base = { ...initial, scripts: { ...initial.scripts, start: { ...initial.scripts.start!, statements: [{ id: "done", kind: "end", endingName: "完成" }] } } };
  const project = { ...base, manifest: { ...base.manifest, preservedFields: { ...base.manifest.preservedFields, webSaveCompatibility: { schemaVersion: 1, fingerprint: "test", versions: ["1.0.0"] } } } };
  const compiled = compileProject(project, "debug"); expect(compiled.ok).toBe(true);
  if (!compiled.ok) throw Error("Expected a valid test project");
  const trace: RouteReviewTrace = { sourceHash: compiled.artifacts.manifest.sourceHash, buildId: compiled.artifacts.manifest.buildId, status: "ended", startKind: "entry", endingName: "完成", sceneIds: ["start"], statementIds: ["done"], choiceIds: [] };
  expect(createRouteReview(project, buildRouteGraph(project), trace, "").traceState).toBe("current");
  const changed = { ...project, manifest: { ...project.manifest, title: "修改了作品" } };
  expect(createRouteReview(changed, buildRouteGraph(changed), trace, "").traceState).toBe("stale");
});
it("keeps reviewed/locked/draft semantics and reports registered references without claiming readable files", () => {
  const base = reviewProject();
  for (const status of ["reviewed", "locked", "draft"]) {
    const project = { ...base, assets: { ...base.assets, assets: [{ assetId: "missing_bg", kind: "image" }] }, localization: { ...base.localization, locales: [{ locale: "en", entries: [{ key: "text_line", sourceText: "雨后的约定", translation: "Promise", status }] }] } };
    const report = createRouteReview(project, buildRouteGraph(project), null, "en");
    expect(report.scenes[0]!.resources[0]!.registered).toBe(true);
    expect(report.scenes[0]!.translation.reviewed).toBe(status === "draft" ? 0 : 1);
    expect(report.limits.join(" ")).toContain("未读取文件");
    expect(report.scenes[0]!.translation.pending.some(row => row.key === "text_line")).toBe(status === "draft");
  }
});
