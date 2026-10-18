import { act, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { semanticHash } from "@world-studio/project-domain";
import { projectCanonicalFromStory } from "./canonical-project-adapter";
import { useWebReleaseInspection, WebReleaseReadiness } from "./WebReleaseReadiness";
import { App } from "./App";
import type { WebReleaseFinding } from "./web-release-readiness";

afterEach(() => vi.unstubAllGlobals());
const project = () => projectCanonicalFromStory({ schemaVersion: 0, id: "release-flow-story", title: "发布收尾", entrySceneId: "entry", characters: [], scenes: [
  { id: "entry", title: "开场", statements: [{ id: "jump", kind: "jump", targetLabel: "missing_label" }, { id: "finish", kind: "label", name: "finish" }, { id: "end", kind: "end", endingName: "雨停" }] }
] }, "release-flow-project");

it("discards a pending inspection when source changes, keeps draft input blocked, and releases state on leaving", async () => {
  const initial = project(), digest = `sha256:${"a".repeat(64)}`;
  const first = { ...initial, assets: { ...initial.assets, assets: [{ assetId: "image", kind: "cg", source: { digest, byteLength: 4, mimeType: "image/png" } }] } };
  let resolve: (value: Uint8Array | null) => void = () => {};
  const reader = { read: vi.fn(() => new Promise<Uint8Array | null>(done => { resolve = done; })) };
  const hook = renderHook(({ source, active, blocked }) => useWebReleaseInspection(source, reader, active, blocked), { initialProps: { source: first, active: true, blocked: false } });
  expect(hook.result.current.checking).toBe(true);
  hook.rerender({ source: { ...first, manifest: { ...first.manifest, title: "修改后" } }, active: true, blocked: true });
  await act(async () => resolve(null));
  expect(hook.result.current.report).toBeNull(); expect(hook.result.current.ready).toBe(false);
  hook.rerender({ source: first, active: false, blocked: false });
  expect(hook.result.current.report).toBeNull(); expect(hook.result.current.checking).toBe(false);
});

it("rechecks actual files and adopts structured blockers discovered while generating", async () => {
  const initial = project(), valid = { ...initial, scripts: { ...initial.scripts, entry: { ...initial.scripts.entry!, statements: [{ id: "end", kind: "end", endingName: "雨停" }] } } };
  const reader = { read: vi.fn(async () => null) }, hook = renderHook(() => useWebReleaseInspection(valid, reader, true, false));
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  act(() => hook.result.current.receiveBuildFailure([{ severity: "error", code: "WEB_ASSET_SOURCE_UNAVAILABLE", title: "素材缺失", message: "重新导入", target: "assets", assetId: "image" }]));
  expect(hook.result.current.ready).toBe(false);
  act(() => hook.result.current.recheck());
  expect(hook.result.current.ready).toBe(false);
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
});

it("paginates blockers, collapses warnings and accurately marks a stale playtest without gating export", () => {
  const initial = project(), onOpen = vi.fn();
  const findings: WebReleaseFinding[] = Array.from({ length: 8 }, (_, i) => ({ severity: "error", code: `missing-${i}`, title: `缺失素材 ${i}`, message: "请重新导入", target: "assets", assetId: `asset-${i}` }));
  findings.push({ severity: "warning", code: "UNREACHABLE_SCENE", title: "未连接场景", message: "仅提醒", target: "assets", assetId: "warning" });
  const inspection = { report: { project: initial, attempt: 0, findings, checked: 8 }, error: "", progress: 8, checking: false, ready: false, recheck: vi.fn(), receiveBuildFailure: vi.fn() };
  const trace = { sourceHash: semanticHash(initial), buildId: "build", status: "ended", startKind: "entry", endingName: "雨停", sceneIds: ["entry"], statementIds: ["end"], choiceIds: [] };
  const view = render(<WebReleaseReadiness project={initial} inspection={inspection} blocked={false} busy={false} trace={trace} onOpen={onOpen} onPreview={() => {}} onRoutes={() => {}} />);
  expect(screen.getByText("8 项问题需要修复")).toBeVisible(); expect(screen.queryByText("缺失素材 6")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "下一页" })); expect(screen.getByText("缺失素材 6")).toBeVisible();
  fireEvent.click(screen.getAllByRole("button", { name: "修复素材" })[0]!); expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ assetId: "asset-6" }));
  expect(screen.getByText("未连接场景")).not.toBeVisible();
  expect(screen.getByText("最近从入口试玩到结局：雨停")).toBeVisible();
  view.rerender(<WebReleaseReadiness project={{ ...initial, manifest: { ...initial.manifest, title: "新版" } }} inspection={inspection} blocked={false} busy={false} trace={trace} onOpen={onOpen} onPreview={() => {}} onRoutes={() => {}} />);
  expect(screen.getByText("作品已修改，请重新试玩")).toBeVisible();
});

it.each(['directory', 'website'] as const)("takes a creator from a real release blocker to its stable source and back to %s", async format => {
  const buildName = format === 'website' ? '构建网站上传 ZIP' : '构建目录 ZIP';
  render(<App initialProject={project()} autosaveDebounceMs={60_000} />);
  fireEvent.click(within(screen.getByRole("navigation", { name: "主要功能" })).getByRole("button", { name: "发布" }));
  fireEvent.click(screen.getByRole("button", { name: "继续：导出方式 →" }));
  fireEvent.click(screen.getByRole("radio", { name: format === 'website' ? /网站上传 ZIP/ : /网页目录 ZIP/ }));
  fireEvent.click(screen.getByRole("button", { name: "继续：生成游戏 →" }));
  const checklist = await screen.findByRole("region", { name: "生成前检查" });
  const finding = (await within(checklist).findByText("跳转目标不存在")).closest("li")!;
  expect(screen.getByRole("button", { name: buildName })).toBeDisabled();
  fireEvent.click(within(finding).getByRole("button", { name: "定位并修复" }));
  expect(screen.getByTestId("workspace-shell")).toHaveAttribute("data-context-statement-id", "jump");
  expect(screen.getByRole("button", { name: "返回生成游戏" })).toBeVisible();
  fireEvent.click(screen.getByRole("tab", { name: "Script" }));
  const input = screen.getByLabelText("权威脚本编辑器") as HTMLTextAreaElement;
  fireEvent.change(input, { target: { value: input.value.replace("missing_label", "finish") } }); fireEvent.blur(input);
  await waitFor(() => expect(screen.getByRole("button", { name: "返回生成游戏" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "返回生成游戏" }));
  expect(screen.getByRole("region", { name: "生成可运行的游戏" })).toBeVisible();
  await waitFor(() => expect(screen.getByRole("button", { name: buildName })).toBeEnabled());
  expect(screen.getByText("故事与素材检查通过")).toBeVisible();
});
