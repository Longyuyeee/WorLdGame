import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { defaultWebPlayerLayout, type WebPageLayout } from "@world-studio/project-domain";
import { useState } from "react";
import { LayoutCanvasEditor } from "./PlayerLayoutCanvas";

afterEach(() => { vi.unstubAllGlobals(); });
function setup() {
  vi.stubGlobal("PointerEvent", MouseEvent);
  const host = document.createElement("div"); document.body.append(host);
  const change = vi.fn(), page = { ...defaultWebPlayerLayout().title, enabled: true };
  function Harness() {
    const [value, setValue] = useState<WebPageLayout>(page), [selection, select] = useState("primary");
    return <LayoutCanvasEditor host={host} scale={.5} geometry={{ left: 0, top: 0, area: { left: 16, top: 16, width: 1000, height: 600 } }} binding={{ surface: "title", device: "desktop", page: value, selection, onSelect: select, onDevice: () => {}, onChange: next => { change(next); setValue(next); } }} />;
  }
  const view = render(<Harness />);
  return { change, page, cleanup: () => { view.unmount(); host.remove(); } };
}
it("commits a scaled drag once, while clicks and Escape/pointer cancellation do not dirty the draft", () => {
  const { change, cleanup } = setup(), handle = screen.getByRole("button", { name: "移动布局组件：作品信息" });
  fireEvent.pointerDown(handle, { button: 0, clientX: 100, clientY: 100 }); fireEvent.pointerUp(handle, { clientX: 100, clientY: 100 }); expect(change).not.toHaveBeenCalled();
  fireEvent.pointerDown(handle, { button: 0, clientX: 100, clientY: 100 }); fireEvent.pointerMove(handle, { clientX: 120, clientY: 120 }); expect(change).not.toHaveBeenCalled(); fireEvent.pointerMove(handle, { clientX: 130, clientY: 130 }); fireEvent.pointerUp(handle, { clientX: 130, clientY: 130 }); expect(change).toHaveBeenCalledOnce();
  fireEvent.pointerDown(handle, { button: 0, clientX: 100, clientY: 100 }); fireEvent.pointerMove(handle, { clientX: 140, clientY: 140 }); fireEvent.keyDown(handle, { key: "Escape" }); fireEvent.pointerUp(handle, { clientX: 140, clientY: 140 }); expect(change).toHaveBeenCalledOnce();
  fireEvent.pointerDown(handle, { button: 0, clientX: 100, clientY: 100 }); fireEvent.pointerMove(handle, { clientX: 140, clientY: 140 }); fireEvent.pointerCancel(handle); fireEvent.pointerUp(handle, { clientX: 140, clientY: 140 }); expect(change).toHaveBeenCalledOnce(); cleanup();
});
it("supports keyboard move/resize and actionable conflict fixes without invoking game actions", () => {
  const { change, cleanup } = setup(), handle = screen.getByRole("button", { name: "移动布局组件：作品信息" });
  fireEvent.keyDown(handle, { key: "ArrowDown" }); expect(change.mock.lastCall![0].desktop.primary.y).toBe(1);
  fireEvent.keyDown(handle, { key: "ArrowDown", shiftKey: true }); expect(change.mock.lastCall![0].desktop.primary.y).toBe(6);
  fireEvent.keyDown(handle, { key: "ArrowDown", altKey: true }); expect(change.mock.lastCall![0].desktop.primary.height).toBe(33);
  fireEvent.keyDown(handle, { key: "ArrowDown", ctrlKey: true }); expect(change).toHaveBeenCalledTimes(3);
  cleanup();
});
it("never replays an old locate-focus request after choosing another inspector component", () => {
  const { cleanup } = setup();
  fireEvent.change(screen.getByLabelText("预览布局组件"), { target: { value: "primary" } });
  fireEvent.change(screen.getByLabelText("预览布局组件"), { target: { value: "secondary" } });
  expect(screen.getByLabelText("预览布局组件")).toHaveValue("secondary"); expect(screen.getByRole("button", { name: "移动布局组件：开始与作品操作" })).toHaveAttribute("aria-pressed", "true"); cleanup();
});
