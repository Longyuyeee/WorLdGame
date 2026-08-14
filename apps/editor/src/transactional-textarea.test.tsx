import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_INPUT_BATCH_DELAY_MS,
  TransactionalTextarea,
  type TextCommitReason
} from "./transactional-textarea";

afterEach(() => {
  vi.useRealTimers();
});

describe("TransactionalTextarea", () => {
  it("coalesces rapid input into one idle commit", () => {
    vi.useFakeTimers();
    const commits: Array<{ value: string; reason: TextCommitReason }> = [];
    render(
      <TransactionalTextarea
        aria-label="批次编辑器"
        value="初始"
        onCommit={(value, reason) => commits.push({ value, reason })}
      />
    );
    const editor = screen.getByLabelText("批次编辑器");

    fireEvent.change(editor, { target: { value: "初始一" } });
    vi.advanceTimersByTime(200);
    fireEvent.change(editor, { target: { value: "初始一二" } });
    vi.advanceTimersByTime(DEFAULT_INPUT_BATCH_DELAY_MS - 1);
    expect(commits).toEqual([]);
    vi.advanceTimersByTime(1);

    expect(commits).toEqual([{ value: "初始一二", reason: "idle" }]);
  });

  it("does not commit partial IME composition and commits after composition ends", () => {
    vi.useFakeTimers();
    const onCommit = vi.fn();
    render(
      <TransactionalTextarea aria-label="IME 编辑器" value="" onCommit={onCommit} />
    );
    const editor = screen.getByLabelText("IME 编辑器");

    fireEvent.compositionStart(editor);
    fireEvent.change(editor, { target: { value: "pin" } });
    vi.advanceTimersByTime(DEFAULT_INPUT_BATCH_DELAY_MS * 2);
    expect(onCommit).not.toHaveBeenCalled();

    fireEvent.change(editor, { target: { value: "拼音" } });
    fireEvent.compositionEnd(editor);
    act(() => vi.advanceTimersByTime(DEFAULT_INPUT_BATCH_DELAY_MS));
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("拼音", "idle");
  });

  it("flushes on blur and Ctrl/Cmd+S without duplicate idle commits", () => {
    vi.useFakeTimers();
    const onCommit = vi.fn();
    const { rerender } = render(
      <TransactionalTextarea aria-label="快捷键编辑器" value="A" onCommit={onCommit} />
    );
    const editor = screen.getByLabelText("快捷键编辑器");

    fireEvent.change(editor, { target: { value: "AB" } });
    fireEvent.keyDown(editor, { key: "s", ctrlKey: true });
    expect(onCommit).toHaveBeenCalledWith("AB", "shortcut");
    vi.advanceTimersByTime(DEFAULT_INPUT_BATCH_DELAY_MS * 2);
    expect(onCommit).toHaveBeenCalledTimes(1);

    rerender(
      <TransactionalTextarea aria-label="快捷键编辑器" value="AB" onCommit={onCommit} />
    );
    fireEvent.change(editor, { target: { value: "ABC" } });
    fireEvent.blur(editor);
    expect(onCommit).toHaveBeenLastCalledWith("ABC", "blur");
  });

  it("uses Escape to revert a local buffer before discarding committed drafts", () => {
    vi.useFakeTimers();
    const onCommit = vi.fn();
    const onEscapeWhenClean = vi.fn();
    render(
      <TransactionalTextarea
        aria-label="回退编辑器"
        value="权威值"
        onCommit={onCommit}
        onEscapeWhenClean={onEscapeWhenClean}
      />
    );
    const editor = screen.getByLabelText("回退编辑器");

    fireEvent.change(editor, { target: { value: "本地缓冲" } });
    expect(editor).toHaveAttribute("data-input-state", "buffered");
    fireEvent.keyDown(editor, { key: "Escape" });
    expect(editor).toHaveValue("权威值");
    expect(onCommit).not.toHaveBeenCalled();
    expect(onEscapeWhenClean).not.toHaveBeenCalled();

    fireEvent.keyDown(editor, { key: "Escape" });
    expect(onEscapeWhenClean).toHaveBeenCalledTimes(1);
  });

  it("clears dirty state only after the parent acknowledges the committed value", () => {
    vi.useFakeTimers();
    const dirtyStates: boolean[] = [];
    function Harness() {
      const [value, setValue] = useState("旧值");
      return (
        <TransactionalTextarea
          aria-label="确认编辑器"
          value={value}
          onCommit={(nextValue) => setValue(nextValue)}
          onDirtyChange={(dirty) => dirtyStates.push(dirty)}
        />
      );
    }
    render(<Harness />);
    const editor = screen.getByLabelText("确认编辑器");

    fireEvent.change(editor, { target: { value: "新值" } });
    expect(editor).toHaveAttribute("data-input-state", "buffered");
    act(() => vi.advanceTimersByTime(DEFAULT_INPUT_BATCH_DELAY_MS));

    expect(editor).toHaveValue("新值");
    expect(editor).toHaveAttribute("data-input-state", "committed");
    expect(dirtyStates).toContain(true);
    expect(dirtyStates.at(-1)).toBe(false);
  });
});
