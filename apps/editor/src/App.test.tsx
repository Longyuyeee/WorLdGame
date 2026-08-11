import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

function selectFirstDialogue() {
  fireEvent.click(
    screen.getByRole("button", {
      name: /选择对白：广播站的灯还亮着/
    })
  );
}

describe("WorLd Studio S0.7 Script UI prototype", () => {
  it("patches Writer dialogue through canonical source and updates Preview", () => {
    render(<App />);
    selectFirstDialogue();

    fireEvent.change(screen.getByLabelText("对白内容"), {
      target: { value: "这句修改通过稳定 ID 写回脚本。" }
    });

    expect(
      within(screen.getByTestId("preview-step")).getByText("这句修改通过稳定 ID 写回脚本。")
    ).toBeVisible();
    expect(screen.getByText("本地事务 · r1")).toBeVisible();

    fireEvent.click(screen.getByRole("tab", { name: "Script" }));
    expect(String((screen.getByLabelText("权威脚本编辑器") as HTMLTextAreaElement).value))
      .toContain(
        "char_xia: 这句修改通过稳定 ID 写回脚本。 @sid(stmt_gate_001) @id(txt_gate_001)"
      );
  });

  it("commits valid Script changes back to Writer and Preview", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("tab", { name: "Script" }));
    const scriptEditor = screen.getByLabelText("权威脚本编辑器");
    const source = String((scriptEditor as HTMLTextAreaElement).value);
    fireEvent.change(scriptEditor, {
      target: {
        value: source.replace(
          "声音像是从很多年前传过来的。",
          "声音来自那盘被遗忘的磁带。"
        )
      }
    });

    expect(screen.getByText("脚本已原子提交")).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: "Writer" }));
    fireEvent.click(
      screen.getByRole("button", { name: /选择对白：听见了。声音来自那盘被遗忘的磁带。/ })
    );
    expect(
      within(screen.getByTestId("preview-step")).getByText(
        "听见了。声音来自那盘被遗忘的磁带。"
      )
    ).toBeVisible();
  });

  it("isolates invalid Script drafts without polluting Writer or Preview", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("tab", { name: "Script" }));
    const scriptEditor = screen.getByLabelText("权威脚本编辑器");
    const source = String((scriptEditor as HTMLTextAreaElement).value);
    fireEvent.change(scriptEditor, {
      target: {
        value: source.replace('scene "放学后的校门"', 'scene "放学后的校门')
      }
    });

    expect(screen.getByText("草稿尚未提交")).toBeVisible();
    expect(screen.getByText("LOCKED")).toBeVisible();
    expect(screen.getByText("错误草稿 · 未提交")).toBeVisible();

    fireEvent.click(screen.getByRole("tab", { name: "Writer" }));
    selectFirstDialogue();
    expect(screen.getByLabelText("对白内容")).toBeDisabled();
    expect(
      within(screen.getByTestId("preview-step")).getByText(
        "广播站的灯还亮着。你也听见那段没有署名的留言了吗？"
      )
    ).toBeVisible();

    fireEvent.click(screen.getByRole("tab", { name: "Script" }));
    fireEvent.click(screen.getByRole("button", { name: "丢弃草稿" }));
    expect(screen.getByText("错误草稿已丢弃")).toBeVisible();
    expect(screen.getByText("LIVE")).toBeVisible();
  });

  it("inserts and deletes dialogue with visible tombstone evidence", () => {
    render(<App />);
    selectFirstDialogue();
    fireEvent.click(screen.getByRole("button", { name: /插入对白/ }));

    expect(screen.getByLabelText("对白内容")).toHaveValue("新对白");
    fireEvent.click(screen.getByRole("button", { name: "删除" }));

    expect(screen.getByLabelText("已删除对白记录")).toBeVisible();
    expect(within(screen.getByLabelText("已删除对白记录")).getByText(/stmt_ui_/)).toBeVisible();
    expect(screen.getByText("1 tombstone")).toBeVisible();
  });

  it("undoes and redoes source transactions from the workspace header", () => {
    render(<App />);
    selectFirstDialogue();
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

  it("steps through statements and derives the route map from projection", () => {
    render(<App />);
    expect(within(screen.getByTestId("preview-step")).getByText("演出指令")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    expect(
      within(screen.getByTestId("preview-step")).getByText(
        "广播站的灯还亮着。你也听见那段没有署名的留言了吗？"
      )
    ).toBeVisible();

    fireEvent.click(screen.getByRole("tab", { name: "Flow" }));
    expect(screen.getByRole("heading", { name: "自动路线图" })).toBeVisible();
    expect(screen.getByText("无语义副本")).toBeVisible();
    expect(screen.getByText("去天台")).toBeVisible();
  });
});
