import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { createProjectTemplate } from "@world-studio/project-domain";
import { MotionPresetDialog } from "./MotionPresetDialog";
import { readMotionPresets } from "./motion-presets";
vi.mock("./player-skin-preview", () => ({ PlayerSkinPreview: () => <aside>静音正式预览</aside>, skinPreviewProject: () => null }));
function props() {
  const project = createProjectTemplate("Story", "018f08d8-71a1-7bc2-a627-2f4a843ee150");
  return { project, sceneId: project.manifest.entrySceneId, statements: [{ id: "line", kind: "narration" as const, textId: "words", text: "一句话" }], selectedId: "line", reader: null, createId: (p: string) => p, onApply: vi.fn(), onClose: vi.fn(), onProjectChange: vi.fn(), onDirtyChange: vi.fn() };
}
it("applies a previewed line effect only on explicit confirmation and protects rejected drafts", () => {
  const p = props(); p.onApply.mockImplementationOnce(() => { throw Error("事务被拒绝"); });
  render(<MotionPresetDialog {...p} />);
  fireEvent.click(screen.getByRole("button", { name: "文字轻提" }));
  fireEvent.change(screen.getByLabelText("动效时长"), { target: { value: "1200" } });
  expect(p.onApply).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "应用到当前剧情" }));
  expect(screen.getByRole("status")).toHaveTextContent("事务被拒绝");
  expect(p.onClose).not.toHaveBeenCalled(); expect(screen.getByLabelText("动效时长")).toHaveValue(1200);
  fireEvent.click(screen.getByRole("button", { name: "应用到当前剧情" }));
  expect(p.onClose).toHaveBeenCalledOnce(); expect(p.onApply.mock.calls[1]![0]).toHaveLength(2);
});
it("stores a named project preset without applying it to the story", () => {
  const p = props(); render(<MotionPresetDialog {...p} />);
  fireEvent.change(screen.getByLabelText("动效预设名称"), { target: { value: "回信的强调" } });
  fireEvent.click(screen.getByRole("button", { name: "保存为工程预设" }));
  expect(readMotionPresets(p.onProjectChange.mock.calls[0]![0])).toMatchObject([{ name: "回信的强调", target: "text" }]);
  expect(p.onApply).not.toHaveBeenCalled(); expect(p.onClose).not.toHaveBeenCalled();
});
it("shows only relevant controls and blocks invalid drafts before mutation", () => {
  const p = props(); render(<MotionPresetDialog {...p} />);
  fireEvent.change(screen.getByLabelText("动效时长"), { target: { value: "9999" } });
  expect(screen.getByRole("button", { name: "应用到当前剧情" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "保存为工程预设" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("动效对象"), { target: { value: "character" } });
  expect(screen.queryByLabelText("动效重复次数")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("动效强度")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "轻柔呼吸" }));
  expect(screen.getByLabelText("动效重复次数")).toHaveValue(3);
  fireEvent.click(screen.getByRole("button", { name: "停止人物动效" }));
  expect(screen.queryByLabelText("动效时长")).not.toBeInTheDocument();
});
