import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { createProjectTemplate, DEFAULT_WEB_PLAYER_APPEARANCE, webPlayerSkinPreset } from "@world-studio/project-domain";
import { PlayerSkinBundleTools } from "./PlayerSkinBundleTools";
import { exportSkinBundle } from "./player-skin-bundle";
vi.mock("./player-skin-preview", () => ({ PlayerSkinPreview: ({ project }: { project: unknown }) => <aside>{project ? "已检查的静音预览" : "尚未预览"}</aside> }));
const project = () => createProjectTemplate("新故事", "018f08d8-71a1-7bc2-a627-2f4a843ee155");
const appearance = { ...DEFAULT_WEB_PLAYER_APPEARANCE, skin: webPlayerSkinPreset("letter") };
async function file() { return new File([new Uint8Array(await exportSkinBundle(project(), appearance, "信纸", null, "", false))], "skin.worldskin.zip", { type: "application/zip" }); }
it("opens a mapping draft and cancels it without mutating the project or committing assets", async () => {
  const commit = vi.fn(), block = vi.fn(); render(<PlayerSkinBundleTools project={project()} appearance={appearance} name="信纸" reader={null} importBlocked={false} onCommit={commit} onBlockingChange={block} />);
  fireEvent.change(screen.getByLabelText("导入皮肤与素材"), { target: { files: [await file()] } });
  const dialog = await screen.findByRole("dialog", { name: "对应皮肤素材并预览" });
  expect(within(dialog).getByRole("button", { name: "导入皮肤与素材到工程" })).toBeDisabled(); expect(commit).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole("button", { name: "取消导入" }));
  await waitFor(() => expect(block).toHaveBeenLastCalledWith(false)); expect(commit).not.toHaveBeenCalled();
});
it("requires a checked preview and retains a rejected import for retry", async () => {
  const p = project(), commit = vi.fn().mockRejectedValueOnce(Error("写入失败，整批已回滚")).mockResolvedValue(p);
  render(<PlayerSkinBundleTools project={p} appearance={appearance} name="信纸" reader={null} importBlocked={false} onCommit={commit} onBlockingChange={() => {}} />);
  fireEvent.change(screen.getByLabelText("导入皮肤与素材"), { target: { files: [await file()] } });
  const dialog = await screen.findByRole("dialog", { name: "对应皮肤素材并预览" });
  fireEvent.click(within(dialog).getByRole("button", { name: "检查并预览皮肤" }));
  await within(dialog).findByText("已检查的静音预览");
  fireEvent.click(within(dialog).getByRole("button", { name: "导入皮肤与素材到工程" }));
  await within(dialog).findByText("写入失败，整批已回滚"); expect(dialog).toBeInTheDocument();
  expect(within(dialog).getByRole("button", { name: "导入皮肤与素材到工程" })).toBeDisabled();
  fireEvent.click(within(dialog).getByRole("button", { name: "检查并预览皮肤" })); await within(dialog).findByText("已检查的静音预览");
  fireEvent.click(within(dialog).getByRole("button", { name: "导入皮肤与素材到工程" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument()); expect(commit).toHaveBeenCalledTimes(2);
});
it("blocks importing over an unapplied appearance draft and excludes private receipts by default", () => {
  render(<PlayerSkinBundleTools project={project()} appearance={appearance} name="信纸" reader={null} importBlocked={true} onCommit={vi.fn()} onBlockingChange={() => {}} />);
  expect(screen.getByLabelText("导入皮肤与素材")).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "导出皮肤与素材" }));
  expect(screen.getByLabelText("附带内部来源台账")).not.toBeChecked();
});
