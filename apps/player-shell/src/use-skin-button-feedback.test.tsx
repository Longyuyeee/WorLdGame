import { useRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useSkinButtonFeedback } from "./use-skin-button-feedback";
afterEach(() => vi.unstubAllGlobals());
function Controls({ enabled = true }: { enabled?: boolean }) {
  const root = useRef<HTMLDivElement | null>(null); useSkinButtonFeedback(root, enabled);
  return <div ref={root}><button>开始</button><button disabled>不可用</button><button><img alt="画廊" /></button><button className="player-dialogue">继续下一句</button><div className="player-history-list"><button>历史正文</button></div></div>;
}
it("clears decorative pointer feedback on release, pan, cancellation, blur and teardown without consuming clicks", () => {
  vi.stubGlobal("PointerEvent", MouseEvent);
  const { unmount } = render(<Controls />), button = screen.getByRole("button", { name: "开始" }), clicked = vi.fn(); button.addEventListener("click", clicked);
  const press = () => { fireEvent.pointerDown(button, { button: 0, clientX: 0, clientY: 0 }); expect(button).toHaveAttribute("data-skin-pressed", "true"); };
  press(); fireEvent.pointerUp(window); expect(button).not.toHaveAttribute("data-skin-pressed"); fireEvent.click(button); expect(clicked).toHaveBeenCalledOnce();
  press(); fireEvent.pointerMove(button, { clientX: 30, clientY: 0 }); expect(button).not.toHaveAttribute("data-skin-pressed");
  press(); fireEvent.pointerCancel(window); expect(button).not.toHaveAttribute("data-skin-pressed");
  press(); fireEvent.blur(window); expect(button).not.toHaveAttribute("data-skin-pressed");
  press(); unmount(); expect(button).not.toHaveAttribute("data-skin-pressed");
});
it("shows keyboard press feedback, excludes disabled/image buttons and leaves unskinned controls untouched", () => {
  vi.stubGlobal("PointerEvent", MouseEvent);
  const { rerender } = render(<Controls />), button = screen.getByRole("button", { name: "开始" });
  fireEvent.keyDown(button, { key: " " }); expect(button).toHaveAttribute("data-skin-pressed", "true");
  fireEvent.keyUp(window, { key: " " }); expect(button).not.toHaveAttribute("data-skin-pressed");
  for (const name of ["不可用", "画廊", "继续下一句", "历史正文"]) { const item = screen.getByRole("button", { name }); fireEvent.pointerDown(item, { button: 0 }); expect(item).not.toHaveAttribute("data-skin-pressed"); }
  fireEvent.pointerDown(button, { button: 2 }); expect(button).not.toHaveAttribute("data-skin-pressed");
  rerender(<Controls enabled={false} />); fireEvent.keyDown(button, { key: "Enter" }); expect(button).not.toHaveAttribute("data-skin-pressed");
});
