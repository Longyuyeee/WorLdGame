import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

afterEach(() => {
  vi.useRealTimers();
});

function advanceInstantStep(): void {
  act(() => vi.advanceTimersByTime(60));
}

describe("S0.15 Preview transport integration", () => {
  it("runs every step at infinite test speed and stops before a choice", () => {
    vi.useFakeTimers();
    render(<App />);
    fireEvent.change(screen.getByLabelText("预览测试倍率"), {
      target: { value: "instant" }
    });
    fireEvent.click(screen.getByRole("button", { name: "开始预览" }));
    expect(screen.getByText("运行中 · ∞")).toBeVisible();

    advanceInstantStep();
    expect(within(screen.getByTestId("preview-step")).getByText(
      "广播站的灯还亮着。你也听见那段没有署名的留言了吗？"
    )).toBeVisible();
    advanceInstantStep();
    expect(within(screen.getByTestId("preview-step")).getByText(
      "听见了。声音像是从很多年前传过来的。"
    )).toBeVisible();
    advanceInstantStep();
    expect(within(screen.getByTestId("preview-step")).getByText("先去哪里调查？"))
      .toBeVisible();
    expect(screen.getByText("选择停止点")).toBeVisible();
    expect(screen.getByRole("button", { name: "开始预览" })).toBeDisabled();
  });

  it("cancels automatic scheduling when the user steps manually", () => {
    vi.useFakeTimers();
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "开始预览" }));
    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    expect(screen.getByText("手动定位")).toBeVisible();
    expect(within(screen.getByTestId("preview-step")).getByText(
      "广播站的灯还亮着。你也听见那段没有署名的留言了吗？"
    )).toBeVisible();

    act(() => vi.advanceTimersByTime(10_000));
    expect(within(screen.getByTestId("preview-step")).getByText(
      "广播站的灯还亮着。你也听见那段没有署名的留言了吗？"
    )).toBeVisible();
  });

  it("blocks playback while an invalid Script draft protects the last valid preview", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("tab", { name: "Script" }));
    const editor = screen.getByLabelText("权威脚本编辑器");
    fireEvent.change(editor, {
      target: { value: String((editor as HTMLTextAreaElement).value).replace(
        'scene "放学后的校门"',
        'scene "放学后的校门'
      ) }
    });
    fireEvent.blur(editor);

    expect(screen.getByText("草稿未提交")).toBeVisible();
    expect(screen.getByRole("button", { name: "开始预览" })).toBeDisabled();
  });
});
