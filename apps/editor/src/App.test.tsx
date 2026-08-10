import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("WorLd Studio code prototype", () => {
  it("edits canonical dialogue and updates the live preview", () => {
    render(<App />);
    fireEvent.click(
      screen.getByRole("button", {
        name: /选择对白：广播站的灯还亮着/
      })
    );

    const editor = screen.getByLabelText("对白内容");
    fireEvent.change(editor, { target: { value: "这句修改会同步到即时预览。" } });

    const preview = screen.getByTestId("preview-step");
    expect(within(preview).getByText("这句修改会同步到即时预览。")).toBeVisible();
    expect(screen.getByText("本地草稿 · r1")).toBeVisible();
  });

  it("undoes and redoes a dialogue edit from the workspace header", () => {
    render(<App />);
    fireEvent.click(
      screen.getByRole("button", {
        name: /选择对白：广播站的灯还亮着/
      })
    );
    fireEvent.change(screen.getByLabelText("对白内容"), {
      target: { value: "可撤销的新对白。" }
    });
    fireEvent.click(screen.getByRole("button", { name: "撤销" }));

    expect(screen.getByLabelText("对白内容")).toHaveValue(
      "广播站的灯还亮着。你也听见那段没有署名的留言了吗？"
    );

    fireEvent.click(screen.getByRole("button", { name: "重做" }));
    expect(screen.getByLabelText("对白内容")).toHaveValue("可撤销的新对白。");
  });

  it("steps through every semantic statement", () => {
    render(<App />);
    expect(within(screen.getByTestId("preview-step")).getByText("演出指令")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    expect(
      within(screen.getByTestId("preview-step")).getByText(
        "广播站的灯还亮着。你也听见那段没有署名的留言了吗？"
      )
    ).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "上一步" }));
    expect(within(screen.getByTestId("preview-step")).getByText("演出指令")).toBeVisible();
  });

  it("derives and displays a route map without another story copy", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("tab", { name: "Flow" }));

    expect(screen.getByRole("heading", { name: "自动路线图" })).toBeVisible();
    expect(screen.getByText("无语义副本")).toBeVisible();
    expect(
      within(screen.getByLabelText("路线节点")).getByRole("button", { name: /旧广播室/ })
    ).toBeVisible();
    expect(screen.getByText("去天台")).toBeVisible();
  });
});
