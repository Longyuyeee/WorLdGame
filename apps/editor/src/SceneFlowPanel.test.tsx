import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { SceneFlowPanel } from "./SceneFlowPanel";

it("bounds the rendered list and follows a merge target outside the current page", () => {
  const onOpen = vi.fn();
  const steps = Array.from({ length: 81 }, (_, index) => ({ id: `step_${index}`, opcode: "jump", targets: [{ label: "跳转", sceneId: "scene", statementId: "step_80" }] }));
  render(<SceneFlowPanel steps={steps} sceneId="scene" titles={new Map([["step_80", "汇合结局"]])} sceneTitles={new Map()} onOpen={onOpen} />);
  expect(screen.getAllByRole("button", { name: /^编辑流程步骤/ })).toHaveLength(40);
  fireEvent.click(screen.getByRole("button", { name: "打开流程目标：step_0 · 0" }));
  expect(onOpen).toHaveBeenCalledWith("scene", "step_80");
  fireEvent.click(screen.getByRole("button", { name: "下一页步骤" }));
  fireEvent.click(screen.getByRole("button", { name: "下一页步骤" }));
  expect(screen.getAllByRole("button", { name: /^编辑流程步骤/ })).toHaveLength(1);
  expect(screen.getByRole("button", { name: "下一页步骤" })).toBeDisabled();
});
