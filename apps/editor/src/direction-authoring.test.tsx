import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { createBlobDigest, type AssetIndex } from "@world-studio/project-persistence";
import type { StoryStatement } from "@world-studio/story-core";
import { DirectionInspector, DirectionInsertPanel } from "./App";
import { DirectionAssetPicker } from "./DirectionAssetPicker";
import { directionStageContext } from "./direction-stage-context";

const entries = (count: number): AssetIndex => ({ schemaVersion: 1, indexRevision: 1, assets: Array.from({ length: count }, (_, i) => ({ assetId: `portrait_${i}`, kind: "character" as const, displayName: `立绘 ${i}`, tags: i === 12 ? ["笑容"] : [], source: { digest: createBlobDigest(new Uint8Array([i])), byteLength: 1, mimeType: "image/png" }, preservedFields: { inspection: { status: "pass", width: 1, height: 1 } } })) });
const cue = (id: string, summary: string): StoryStatement => ({ id, kind: "direction", command: "show", summary });
const scene: readonly StoryStatement[] = [cue("a", "action=show asset=portrait_0 slot=primary position=left"), cue("b", "action=show asset=portrait_1 slot=actor_1 position=right"), cue("c", "action=hide slot=primary transition=fade duration=300ms"), cue("d", "action=move slot=actor_1 x=75 y=100")];

it("lists actors before the selected step, excluding an exiting actor", () => {
  expect(directionStageContext(scene, 0).characters).toHaveLength(0);
  expect(directionStageContext(scene, 2).characters.map(layer => layer.slot).sort()).toEqual(["actor_1", "primary"]);
  const context = directionStageContext(scene, 4);
  expect(context.characters.map(layer => [layer.slot, layer.x])).toEqual([["actor_1", 75]]);
});
it("reserves future and other-scene positions for a new actor", () => {
  expect(directionStageContext(scene, 0).newSlot).toBe("actor_2");
  expect(directionStageContext(scene, 1, [...scene, cue("next", "action=hide slot=actor_2")]).newSlot).toBe("actor_3");
});
it("offers cross-scene actor references without pretending they are active or choosing them automatically", () => {
  const previous = [cue("earlier", "action=show asset=portrait_0 slot=primary position=right")];
  const context = directionStageContext([], 0, previous);
  expect(context.characters).toEqual([]);
  expect(context.otherCharacters).toEqual([{ slot: "primary", assetId: "portrait_0" }]);
  expect(directionStageContext([], 0, [cue("implicit", "asset=portrait_0 slot=primary")]).otherCharacters).toEqual(context.otherCharacters);
  const dispatch = vi.fn();
  render(<DirectionInsertPanel command="show" afterId="branch" insertionLabel="分支开头" stageContext={context} assetIndex={entries(1)} disabled={false} createCommandId={() => "cmd"} createEntityId={() => "insert"} dispatch={dispatch} onClose={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("新增演出动作"), { target: { value: "hide" } });
  expect(screen.getByLabelText("新增角色槽位选择")).toHaveValue("");
  expect(screen.getByRole("button", { name: "插入演出" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("新增角色槽位选择"), { target: { value: "primary" } });
  fireEvent.click(screen.getByRole("button", { name: "插入演出" }));
  expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ afterId: "branch", parameters: expect.objectContaining({ action: "hide", slot: "primary" }) }));
  expect(directionStageContext(previous, 1, previous).otherCharacters).toEqual([]);
});
it("searches labels/tags across pages and keeps selection local until submission", () => {
  const change = vi.fn();
  render(<DirectionAssetPicker assets={entries(14).assets} value="" reader={null} disabled={false} label="选择资源" onChange={change} />);
  expect(screen.getAllByRole("button", { name: /^选择素材：/ })).toHaveLength(12);
  fireEvent.click(screen.getByRole("button", { name: "下一页素材" }));
  expect(screen.getAllByRole("button", { name: /^选择素材：/ })).toHaveLength(2);
  fireEvent.change(screen.getByLabelText("搜索演出素材"), { target: { value: "笑容" } });
  fireEvent.click(screen.getByRole("button", { name: "选择素材：立绘 12" }));
  expect(change).toHaveBeenCalledOnce(); expect(change).toHaveBeenCalledWith("portrait_12");
  expect(screen.getByRole("button", { name: "浏览素材" })).toHaveFocus();
});
it("visual selection protects the draft and discard restores the original actor", () => {
  const dispatch = vi.fn(), dirty = vi.fn();
  render(<DirectionInspector statement={scene[0] as Extract<StoryStatement, { kind: "direction" }>} assetIndex={entries(2)} disabled={false} createCommandId={() => "cmd"} dispatch={dispatch} onDirtyChange={dirty} stageContext={directionStageContext(scene, 0)} />);
  fireEvent.click(screen.getByRole("button", { name: "浏览素材" }));
  fireEvent.click(screen.getByRole("button", { name: "选择素材：立绘 1" }));
  expect(dirty).toHaveBeenLastCalledWith(true); expect(dispatch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "放弃演出修改" }));
  expect(screen.getByLabelText("演出主资源")).toHaveValue("portrait_0"); expect(dirty).toHaveBeenLastCalledWith(false);
  expect(screen.getByText("精细位置、缩放与锚点").closest("details")).not.toHaveAttribute("open");
});
it("inserts a separate actor by default and allows an explicit portrait replacement", () => {
  const dispatch = vi.fn(), onClose = vi.fn(), context = directionStageContext(scene, 2);
  render(<DirectionInsertPanel command="show" afterId="b" insertionLabel="在当前步骤之后" stageContext={context} assetIndex={entries(2)} disabled={false} createCommandId={() => "cmd"} createEntityId={() => "insert"} dispatch={dispatch} onClose={onClose} />);
  const dialog = screen.getByRole("dialog", { name: "添加角色演出" });
  expect(within(dialog).getByLabelText("新增角色槽位选择")).toHaveValue("actor_2");
  fireEvent.click(within(dialog).getByRole("button", { name: "选择素材：立绘 1" }));
  fireEvent.change(within(dialog).getByLabelText("新增角色槽位选择"), { target: { value: "primary" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "插入演出" }));
  expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ afterId: "b", parameters: expect.objectContaining({ asset: "portrait_1", slot: "primary" }) })); expect(onClose).toHaveBeenCalledOnce();
});
it("makes invalid precision parameters visible even when their section is collapsed", () => {
  render(<DirectionInspector statement={cue("bad", "action=show asset=portrait_0 slot=primary x=999") as Extract<StoryStatement, { kind: "direction" }>} assetIndex={entries(1)} disabled={false} createCommandId={() => "cmd"} dispatch={vi.fn()} />);
  expect(screen.getByRole("alert")).toHaveTextContent("精细位置或高级过渡素材需要修正");
  expect(screen.getByRole("button", { name: "应用演出参数" })).toBeDisabled();
});
it("move/hide chooses an active actor and rejects an empty target", () => {
  render(<DirectionInsertPanel command="show" afterId="b" insertionLabel="插入" stageContext={directionStageContext(scene, 2)} assetIndex={entries(2)} disabled={false} createCommandId={() => "cmd"} createEntityId={() => "insert"} dispatch={vi.fn()} onClose={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("新增演出动作"), { target: { value: "hide" } });
  expect(screen.getByLabelText("新增角色槽位选择")).toHaveValue("");
  expect(screen.getByRole("button", { name: "插入演出" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("新增角色槽位选择"), { target: { value: "primary" } });
  expect(screen.getByRole("button", { name: "插入演出" })).toBeEnabled();
  fireEvent.change(screen.getByLabelText("新增角色槽位"), { target: { value: "" } });
  expect(screen.getByRole("button", { name: "插入演出" })).toBeDisabled();
});
it("permits resource-free actions and retains a rejected insert draft", () => {
  const close = vi.fn();
  render(<DirectionInsertPanel command="background" afterId="scene" insertionLabel="场景开头" stageContext={directionStageContext([], 0)} assetIndex={entries(0)} disabled={false} createCommandId={() => "cmd"} createEntityId={() => "insert"} dispatch={() => { throw Error("提交被拒绝"); }} onClose={close} />);
  expect(screen.getByRole("button", { name: "插入演出" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("新增演出动作"), { target: { value: "clear" } });
  fireEvent.click(screen.getByRole("button", { name: "插入演出" }));
  expect(screen.getByRole("alert")).toHaveTextContent("提交被拒绝"); expect(close).not.toHaveBeenCalled();
});
it("defaults sustained audio to loop and spoken/effect audio to one play", () => {
  render(<DirectionInsertPanel command="audio" afterId="scene" insertionLabel="插入" stageContext={directionStageContext([], 0)} assetIndex={entries(0)} disabled={false} createCommandId={() => "cmd"} createEntityId={() => "insert"} dispatch={vi.fn()} onClose={vi.fn()} />);
  expect(screen.getByLabelText("循环播放音频")).toBeChecked();
  fireEvent.change(screen.getByLabelText("新增音频总线"), { target: { value: "voice" } });
  expect(screen.getByLabelText("循环播放音频")).not.toBeChecked();
  fireEvent.change(screen.getByLabelText("新增音频总线"), { target: { value: "ambient" } });
  expect(screen.getByLabelText("循环播放音频")).toBeChecked();
});
