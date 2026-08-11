import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProjectStoreError } from "@world-studio/project-persistence";
import { App, persistenceErrorLabel, persistenceFailure } from "./App";

function selectFirstDialogue() {
  fireEvent.click(
    screen.getByRole("button", {
      name: /选择对白：广播站的灯还亮着/
    })
  );
}

describe("WorLd Studio S0.18 untrusted media inspection UI prototype", () => {
  it("surfaces the audited asset-vault contract and unavailable state without claiming content", () => {
    render(<App />);
    const vault = screen.getByRole("button", { name: "打开资源保险库" });
    expect(within(vault).getByText("资源保险库")).toBeVisible();
    expect(within(vault).getByText("签名验证")).toBeVisible();
    expect(within(vault).getByText("预算闸门")).toBeVisible();
    expect(within(vault).getByText("SHA-256 去重")).toBeVisible();
    expect(within(vault).getByText(/本机资源存储不可用/)).toBeVisible();
    fireEvent.click(vault);
    expect(screen.getByRole("heading", { name: "资源保险库" })).toBeVisible();
    expect(screen.getByLabelText("选择资源文件")).toBeDisabled();
  });
  it("maps storage failures to actionable local-save labels", () => {
    expect(persistenceErrorLabel("NO_SPACE")).toBe("本机空间不足");
    expect(persistenceErrorLabel("PERMISSION_DENIED")).toBe("无写入权限");
    expect(persistenceErrorLabel("BUSY")).toBe("存储正忙");
    expect(persistenceErrorLabel("STALE_STORAGE_REVISION")).toBe("保存版本冲突");
    expect(persistenceErrorLabel("LEASE_REQUIRED")).toBe("另一窗口正在编辑");
    expect(persistenceErrorLabel("LEASE_LOST")).toBe("另一窗口正在编辑");
    expect(persistenceErrorLabel("CORRUPT_BACKUP")).toBe("备份需要检查");
    expect(persistenceErrorLabel("CORRUPT_WAL")).toBe("项目需要恢复");
    expect(persistenceFailure(
      new ProjectStoreError("NO_SPACE", "write", "project.json", "disk full"),
      3
    )).toEqual({
      status: "error",
      revision: 3,
      errorCode: "NO_SPACE",
      detail: "NO_SPACE · disk full"
    });
  });
  it("patches Writer dialogue through canonical source and updates Preview", () => {
    render(<App />);
    selectFirstDialogue();

    const dialogueEditor = screen.getByLabelText("对白内容");
    fireEvent.change(dialogueEditor, {
      target: { value: "这句修改通过稳定 ID 写回脚本。" }
    });

    expect(screen.getByText("BUFFER")).toBeVisible();
    expect(
      within(screen.getByTestId("preview-step")).getByText(
        "广播站的灯还亮着。你也听见那段没有署名的留言了吗？"
      )
    ).toBeVisible();
    fireEvent.blur(dialogueEditor);

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
    fireEvent.blur(scriptEditor);

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
    fireEvent.blur(scriptEditor);

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
    fireEvent.keyDown(screen.getByLabelText("权威脚本编辑器"), { key: "Escape" });
    expect(screen.getByText("错误草稿已丢弃")).toBeVisible();
    expect(screen.getByText("LIVE")).toBeVisible();
  });

  it("coalesces rapid Writer input into one source revision", () => {
    render(<App />);
    selectFirstDialogue();
    const editor = screen.getByLabelText("对白内容");

    fireEvent.change(editor, { target: { value: "批" } });
    fireEvent.change(editor, { target: { value: "批次" } });
    fireEvent.change(editor, { target: { value: "批次提交" } });
    expect(screen.getByText("输入批次 · 未提交")).toBeVisible();
    expect(screen.getByText("BUFFER")).toBeVisible();
    fireEvent.blur(editor);

    expect(screen.getByText("本地事务 · r1")).toBeVisible();
    expect(within(screen.getByTestId("preview-step")).getByText("批次提交")).toBeVisible();
  });

  it("keeps IME composition out of Preview until one final commit", () => {
    render(<App />);
    selectFirstDialogue();
    const editor = screen.getByLabelText("对白内容");

    fireEvent.compositionStart(editor);
    fireEvent.change(editor, { target: { value: "pin" } });
    expect(
      within(screen.getByTestId("preview-step")).getByText(
        "广播站的灯还亮着。你也听见那段没有署名的留言了吗？"
      )
    ).toBeVisible();
    fireEvent.change(editor, { target: { value: "拼音输入完成" } });
    fireEvent.compositionEnd(editor);
    fireEvent.blur(editor);

    expect(screen.getByText("本地事务 · r1")).toBeVisible();
    expect(
      within(screen.getByTestId("preview-step")).getByText("拼音输入完成")
    ).toBeVisible();
  });

  it("commits Script input immediately with Ctrl+S", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("tab", { name: "Script" }));
    const scriptEditor = screen.getByLabelText("权威脚本编辑器");
    const source = String((scriptEditor as HTMLTextAreaElement).value);
    fireEvent.change(scriptEditor, {
      target: {
        value: source.replace("声音像是从很多年前传过来的。", "快捷键提交成功。")
      }
    });
    fireEvent.keyDown(scriptEditor, { key: "s", ctrlKey: true });

    expect(screen.getByText("脚本已原子提交")).toBeVisible();
    expect(screen.getByText("本地事务 · r1")).toBeVisible();
  });

  it("keeps rejected Writer text buffered and exposes the patch error", () => {
    render(<App />);
    selectFirstDialogue();
    const editor = screen.getByLabelText("对白内容");
    fireEvent.change(editor, { target: { value: "暂不支持\n多行对白" } });
    fireEvent.blur(editor);

    expect(screen.getByText("操作未执行")).toBeVisible();
    expect(screen.getByText(/raw newline/)).toBeVisible();
    expect(screen.getByText("BUFFER")).toBeVisible();
    expect(editor).toHaveValue("暂不支持\n多行对白");
    expect(
      within(screen.getByTestId("preview-step")).getByText(
        "广播站的灯还亮着。你也听见那段没有署名的留言了吗？"
      )
    ).toBeVisible();

    fireEvent.keyDown(editor, { key: "Escape" });
    expect(editor).toHaveValue("广播站的灯还亮着。你也听见那段没有署名的留言了吗？");
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
    const undoEditor = screen.getByLabelText("对白内容");
    fireEvent.change(undoEditor, {
      target: { value: "可撤销的新对白。" }
    });
    fireEvent.blur(undoEditor);
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

  it("defaults Preview to 16:9 and switches canvas profiles without editing the story", () => {
    render(<App />);
    const stage = screen.getByTestId("preview-stage");
    const profile = screen.getByLabelText("预览尺寸");

    expect(profile).toHaveValue("landscape-16-9");
    expect(stage).toHaveAttribute("data-preview-width", "1920");
    expect(stage).toHaveAttribute("data-preview-height", "1080");
    expect(stage.style.getPropertyValue("--preview-aspect")).toBe("1920 / 1080");

    fireEvent.change(profile, { target: { value: "portrait-9-16" } });
    expect(profile).toHaveValue("portrait-9-16");
    expect(stage).toHaveAttribute("data-preview-width", "1080");
    expect(stage).toHaveAttribute("data-preview-height", "1920");
    expect(stage).toHaveClass("stage-preview--portrait");
    expect(screen.getByText("9:16 · Balanced")).toBeVisible();

    fireEvent.change(profile, { target: { value: "custom" } });
    fireEvent.change(screen.getByLabelText("自定义预览宽度"), { target: { value: "1000" } });
    fireEvent.change(screen.getByLabelText("自定义预览高度"), { target: { value: "1000" } });
    expect(screen.getByLabelText("自定义预览比例")).toHaveTextContent("1:1");
    expect(stage).toHaveAttribute("data-preview-width", "1000");
    expect(stage).toHaveAttribute("data-preview-height", "1000");
    expect(screen.getByText("本地事务 · r0")).toBeVisible();
  });
});
