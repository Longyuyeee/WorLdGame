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
    expect(within(panel).getByRole("group", { name: "CG 画廊" })).toHaveTextContent("2 / 2 已发现");
    expect(within(panel).getByRole("group", { name: "场景回想" })).toHaveTextContent("0 / 1 已发现");
    expect(within(panel).getByRole("group", { name: "音乐室" })).toHaveTextContent("0 / 1 已发现");
    expect(within(panel).getByRole("group", { name: "结局" })).toHaveTextContent("0 / 1 已发现");

    fireEvent.click(within(panel).getByRole("button", { name: "返回剧情" }));
    expect(screen.queryByRole("dialog", { name: "附加内容" })).not.toBeInTheDocument();
    expect(shell).toHaveAttribute("data-runtime-state-hash", beforeHash);
    expect(shell).toHaveAttribute("data-history-cursor", beforeCursor);
  });
});
