import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { buildRouteGraph } from "@world-studio/route-graph";
import { RouteReviewPanel } from "./RouteReviewPanel";
import { projectCanonicalFromStory } from "./canonical-project-adapter";

afterEach(() => vi.restoreAllMocks());
it("generates review downloads, locates issues, and invalidates exports on changes or drafts", async () => {
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:review"); const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const project = projectCanonicalFromStory({ schemaVersion: 0, id: "review_ui", title: "评审", entrySceneId: "start", characters: [], scenes: [{ id: "start", title: "入口", statements: [{ id: "bg", kind: "direction", command: "background", summary: "asset=missing_bg" }, { id: "done", kind: "end", endingName: "完成" }] }] }, "review-ui");
  const graph = buildRouteGraph(project), onOpen = vi.fn();
  const props = { project, graph, trace: null, blocked: false, onOpen };
  const view = render(<RouteReviewPanel {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "生成当前版本评审" }));
  expect(await screen.findByRole("link", { name: "下载评审 JSON" })).toHaveAttribute("download", "route-review.json");
  expect(within(screen.getByLabelText("评审试玩状态")).getByText(/尚无试玩记录/)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "定位缺失引用：missing_bg" })); expect(onOpen).toHaveBeenCalledWith("start", "bg");
  view.rerender(<RouteReviewPanel {...props} blocked />);
  expect(screen.queryByRole("link")).not.toBeInTheDocument(); expect(screen.getByRole("button", { name: "生成当前版本评审" })).toBeDisabled(); expect(revoke).toHaveBeenCalledTimes(3);
  view.rerender(<RouteReviewPanel {...props} project={{ ...project }} />);
  expect(screen.getByText(/评审已过期/)).toBeVisible();
});
it("bounds the mounted summary to 24 scenes and exposes remaining scenes through paging", () => {
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:review"); vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const project = projectCanonicalFromStory({ schemaVersion: 0, id: "paged_review", title: "分页评审", entrySceneId: "scene_0", characters: [], scenes: Array.from({ length: 25 }, (_, index) => ({ id: `scene_${index}`, title: `场景 ${index}`, statements: [{ id: `done_${index}`, kind: "end" as const, endingName: "完成" }] })) }, "paged-review");
  render(<RouteReviewPanel project={project} graph={buildRouteGraph(project)} trace={null} blocked={false} onOpen={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "生成当前版本评审" }));
  expect(screen.getByLabelText("评审场景摘要").querySelectorAll("article")).toHaveLength(24);
  expect(screen.queryByRole("button", { name: "进入场景：场景 24" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "下一页评审" }));
  expect(screen.getByRole("button", { name: "进入场景：场景 24" })).toBeEnabled();
  expect(screen.getByLabelText("评审场景摘要").querySelectorAll("article")).toHaveLength(1);
});
