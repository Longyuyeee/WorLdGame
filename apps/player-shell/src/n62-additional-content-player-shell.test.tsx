import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PlayerShell } from "./PlayerShell";
import { createPlayerMediaDemoV1 } from "./media-demo";

describe("N62-E1 additional-content Player path", () => {
  it("opens Compiler-backed summaries and returns without changing the active story", () => {
    const demo = createPlayerMediaDemoV1();
    const view = render(<PlayerShell project={demo.project} mediaAssets={demo.mediaAssets} />);
    fireEvent.click(screen.getByRole("button", { name: /开始故事/u }));
    expect(screen.getByRole("button", { name: "打开附加内容" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "完成动效" }));
    const shell = view.container.querySelector("main")!;
    const beforeHash = shell.getAttribute("data-runtime-state-hash");
    const beforeCursor = shell.getAttribute("data-history-cursor");

    fireEvent.click(screen.getByRole("button", { name: "打开附加内容" }));
    const panel = screen.getByRole("dialog", { name: "附加内容" });
    expect(within(panel).getByRole("heading", { name: "附加内容" })).toBeVisible();
    expect(within(panel).getByRole("button", { name: "返回剧情" })).toHaveFocus();
    expect(within(panel).getByText("随着剧情推进，已发现的收藏与结局会自动记录在这里。")).toBeVisible();
    expect(panel).not.toHaveTextContent(/Compiler|Runtime|后续切片/u);
    expect(within(panel).getByRole("group", { name: "CG 画廊" })).toHaveTextContent("2 / 2 已发现");
    expect(within(panel).getByRole("group", { name: "场景回想" })).toHaveTextContent("0 / 1 已发现");
    expect(within(panel).getByRole("group", { name: "音乐室" })).toHaveTextContent("0 / 1 已发现");
    expect(within(panel).getByRole("group", { name: "结局" })).toHaveTextContent("0 / 1 已发现");

    fireEvent.click(within(panel).getByRole("button", { name: "查看 CG 画廊" }));
    const gallery = within(panel).getByRole("region", { name: "CG 画廊内容" });
    expect(within(gallery).getByRole("button", { name: "返回附加内容总览" })).toHaveFocus();
    expect(within(gallery).getByRole("img", { name: "Deterministic Actor" })).toBeVisible();
    expect(within(gallery).getByRole("img", { name: "Deterministic Sunset" })).toBeVisible();
    const sunset = within(gallery).getByRole("button", { name: "查看画面 Deterministic Sunset" });
    fireEvent.click(sunset);
    expect(within(gallery).getByRole("group", { name: "Deterministic Sunset 画面预览" })).toBeVisible();
    expect(within(gallery).getByRole("button", { name: "关闭画面预览" })).toHaveFocus();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(within(gallery).queryByRole("group", { name: "Deterministic Sunset 画面预览" })).not.toBeInTheDocument();
    expect(sunset).toHaveFocus();
    fireEvent.click(within(gallery).getByRole("button", { name: "返回附加内容总览" }));
    expect(within(panel).getByRole("button", { name: "查看 CG 画廊" })).toHaveFocus();

    fireEvent.click(within(panel).getByRole("button", { name: "返回剧情" }));
    expect(screen.queryByRole("dialog", { name: "附加内容" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开附加内容" })).toHaveFocus();
    expect(shell).toHaveAttribute("data-runtime-state-hash", beforeHash);
    expect(shell).toHaveAttribute("data-history-cursor", beforeCursor);
  });

  it("keeps keyboard focus inside the modal and returns it after Escape", () => {
    const demo = createPlayerMediaDemoV1();
    render(<PlayerShell project={demo.project} mediaAssets={demo.mediaAssets} />);
    fireEvent.click(screen.getByRole("button", { name: "打开附加内容" }));
    const close = screen.getByRole("button", { name: "返回剧情" });
    expect(close).toHaveFocus();

    fireEvent.keyDown(window, { key: "Tab" });
    expect(screen.getByRole("button", { name: "查看 CG 画廊" })).toHaveFocus();
    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.queryByRole("dialog", { name: "附加内容" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开附加内容" })).toHaveFocus();
  });

  it("does not reveal locked names and explains an unlocked resource that is unavailable", () => {
    const demo = createPlayerMediaDemoV1();
    const view = render(<PlayerShell project={demo.project} mediaAssets={demo.mediaAssets} />);
    fireEvent.click(screen.getByRole("button", { name: "打开附加内容" }));
    fireEvent.click(screen.getByRole("button", { name: "查看 CG 画廊" }));
    const lockedGallery = screen.getByRole("region", { name: "CG 画廊内容" });
    expect(within(lockedGallery).getAllByText("未发现的画面")).toHaveLength(2);
    expect(lockedGallery).not.toHaveTextContent(/Deterministic Actor|Deterministic Sunset/u);
    fireEvent.click(within(lockedGallery).getByRole("button", { name: "返回附加内容总览" }));
    fireEvent.click(screen.getByRole("button", { name: "返回剧情" }));

    fireEvent.click(screen.getByRole("button", { name: /开始故事/u }));
    fireEvent.click(screen.getByRole("button", { name: "完成动效" }));
    view.rerender(<PlayerShell project={demo.project} mediaAssets={demo.mediaAssets.filter((asset) => asset.assetId !== "media_actor_sprite")} />);
    const shell = view.container.querySelector("main")!;
    const beforeHash = shell.getAttribute("data-runtime-state-hash");
    fireEvent.click(screen.getByRole("button", { name: "打开附加内容" }));
    fireEvent.click(screen.getByRole("button", { name: "查看 CG 画廊" }));
    const gallery = screen.getByRole("region", { name: "CG 画廊内容" });
    expect(within(gallery).getByRole("status", { name: "Deterministic Actor 资源状态" })).toHaveTextContent("资源暂不可用");
    expect(within(gallery).getByRole("img", { name: "Deterministic Sunset" })).toBeVisible();
    expect(shell).toHaveAttribute("data-runtime-state-hash", beforeHash);
  });

  it("reveals a reached ending without changing the ended session", () => {
    const demo = createPlayerMediaDemoV1();
    const view = render(<PlayerShell project={demo.project} mediaAssets={demo.mediaAssets} />);
    fireEvent.click(screen.getByRole("button", { name: /开始故事/u }));
    fireEvent.click(screen.getByRole("button", { name: "完成动效" }));
    fireEvent.click(screen.getByRole("button", { name: "继续下一句" }));
    fireEvent.click(screen.getByRole("button", { name: "继续下一句" }));
    expect(screen.getByRole("heading", { name: "Curtain" })).toBeVisible();
    const shell = view.container.querySelector("main")!;
    const beforeHash = shell.getAttribute("data-runtime-state-hash");
    const beforeCursor = shell.getAttribute("data-history-cursor");

    fireEvent.click(screen.getByRole("button", { name: "打开附加内容" }));
    fireEvent.click(screen.getByRole("button", { name: "查看 结局" }));
    const endings = screen.getByRole("region", { name: "结局内容" });
    expect(within(endings).getByRole("button", { name: "返回附加内容总览" })).toHaveFocus();
    expect(within(endings).getByText("Curtain")).toBeVisible();
    expect(within(endings).getByText("已达成")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "返回剧情" }));

    expect(screen.getByRole("heading", { name: "Curtain" })).toBeVisible();
    expect(shell).toHaveAttribute("data-runtime-state-hash", beforeHash);
    expect(shell).toHaveAttribute("data-history-cursor", beforeCursor);
  });
});
