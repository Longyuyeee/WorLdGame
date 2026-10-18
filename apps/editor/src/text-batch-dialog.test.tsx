import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { TextBatchDialog } from "./TextBatchDialog";
it("keeps a pasted draft on Escape and applies all lines once", () => {
  const apply = vi.fn(), close = vi.fn(), dirty = vi.fn(); let serial = 0;
  render(<TextBatchDialog characters={[]} afterId="scene" createId={prefix => `${prefix}_${++serial}`} onApply={apply} onClose={close} onDirtyChange={dirty} />);
  fireEvent.change(screen.getByLabelText("成段文字"), { target: { value: "第一句\n第二句" } });
  const event = new Event("cancel", { cancelable: true }); fireEvent(screen.getByRole("dialog"), event);
  expect(event.defaultPrevented).toBe(true); expect(close).not.toHaveBeenCalled();
  expect(screen.getByLabelText("成段文字")).toHaveValue("第一句\n第二句");
  expect(dirty).toHaveBeenLastCalledWith(true);
  fireEvent.click(screen.getByRole("button", { name: "添加到故事" }));
  expect(apply).toHaveBeenCalledOnce(); expect(apply.mock.calls[0]![0]).toHaveLength(2); expect(apply.mock.calls[0]![1]).toBe("stmt_3"); expect(close).toHaveBeenCalledOnce();
});
it("retains the entire pasted draft when the source transaction is rejected", () => {
  const close = vi.fn(); let serial = 0;
  render(<TextBatchDialog characters={[]} afterId="scene" createId={prefix => `${prefix}_${++serial}`} onApply={() => { throw Error("事务被拒绝，请修复原文"); }} onClose={close} onDirtyChange={() => {}} />);
  fireEvent.change(screen.getByLabelText("成段文字"), { target: { value: "不要丢失这段文字" } });
  fireEvent.click(screen.getByRole("button", { name: "添加到故事" }));
  expect(screen.getByRole("alert")).toHaveTextContent("事务被拒绝");
  expect(screen.getByLabelText("成段文字")).toHaveValue("不要丢失这段文字"); expect(close).not.toHaveBeenCalled();
});
