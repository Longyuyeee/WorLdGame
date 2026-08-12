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

describe("WorLd Studio S0.32 verified live-stage media prototype", () => {
  it("searches committed scene steps by text and number without changing the project revision", () => {
    render(<App />);
    const search = screen.getByRole("searchbox", { name: "定位步骤" });
    fireEvent.change(search, { target: { value: "广播站" } });
    expect(screen.getByText("1 / 1 项")).toBeVisible();
    const result = screen.getByRole("option", { name: /广播站的灯还亮着/ });
    fireEvent.click(result);
    const dialogueCard = screen.getByRole("button", { name: /选择对白：广播站的灯还亮着/ });
    expect(dialogueCard).toHaveFocus();

    fireEvent.change(search, { target: { value: "#4" } });
    fireEvent.submit(screen.getByRole("search", { name: "搜索当前场景步骤" }));
    expect(screen.getByRole("button", { name: /选择选择：先去哪里调查/ })).toHaveFocus();
    expect(screen.getByText("本地事务 · r0")).toBeVisible();
  });

  it("reports empty stage searches and exposes keyboard-sized result navigation", () => {
    render(<App />);
    const search = screen.getByRole("searchbox", { name: "定位步骤" });
    fireEvent.change(search, { target: { value: "不存在的对白" } });
    expect(screen.getByText("没有匹配步骤")).toBeVisible();
    expect(screen.getByText(/尝试输入 #65/)).toBeVisible();
    expect(screen.getByRole("button", { name: "上一个搜索结果" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "下一个搜索结果" })).toBeDisabled();
  });

  it("exposes a typed graphical Inspector for the selected direction without guessing legacy text", () => {
    render(<App />);
    expect(screen.getByText("图形化演出参数")).toBeVisible();
    expect(screen.getByText("检测到旧式描述")).toBeVisible();
    expect(screen.getByLabelText("演出主资源")).toHaveValue("");
    expect(screen.getByRole("button", { name: "迁移旧描述并应用" })).toBeDisabled();
    expect(screen.getByText(/Asset Index 中没有可用于 @background 的资源/)).toBeVisible();
  });

  it("fails closed to the visual placeholder when a legacy direction has no executable Asset ID", async () => {
    render(<App />);
    expect(await screen.findByText("安全占位")).toBeVisible();
    expect(screen.getByText("1 项资源未执行")).toBeVisible();
    expect(screen.queryByTestId("preview-background")).not.toBeInTheDocument();
  });
  it("commits background clear without requiring or leaking resource-only fields", () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText("演出动作"), { target: { value: "clear" } });
    expect(screen.queryByLabelText("演出主资源")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("演出过渡")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "迁移旧描述并应用" }));
    expect(screen.getByRole("button", { name: "选择演出：action=clear" })).toBeVisible();
    expect(screen.queryByTestId("preview-background")).not.toBeInTheDocument();
    expect(screen.getByText("本地事务 · r1")).toBeVisible();
  });
  it("inserts stage directions from the graphical track and supports keyboard access", () => {
    render(<App />);
    expect(screen.getByLabelText("图形化演出轨道")).toBeVisible();
    expect(screen.getAllByText("BG")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "＋ 背景" }));
    expect(screen.getByRole("form", { name: "新增背景演出" })).toBeVisible();
    expect(screen.getByRole("button", { name: "插入演出" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("新增演出动作"), { target: { value: "clear" } });
    expect(screen.queryByLabelText("新增演出资源")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "插入演出" }));
    expect(screen.getAllByText("action=clear").length).toBeGreaterThan(0);
    expect(screen.getByText("本地事务 · r1")).toBeVisible();

    fireEvent.keyDown(window, { key: "3", altKey: true });
    expect(screen.getByRole("form", { name: "新增音频演出" })).toBeVisible();
    fireEvent.change(screen.getByLabelText("新增演出动作"), { target: { value: "stop" } });
    fireEvent.click(screen.getByRole("button", { name: "插入演出" }));
    expect(screen.getAllByText("action=stop bus=bgm").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "撤销" }));
    expect(screen.queryAllByText("action=stop bus=bgm")).toHaveLength(0);
  });
  it("reorders and deletes direction cues through accessible track controls", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "演出右移" }));
    fireEvent.click(screen.getByRole("tab", { name: "Script" }));
    const movedSource = String((screen.getByLabelText("权威脚本编辑器") as HTMLTextAreaElement).value);
    expect(movedSource.indexOf("stmt_gate_001")).toBeLessThan(movedSource.indexOf("stmt_gate_bg"));

    fireEvent.click(screen.getByRole("tab", { name: "Writer" }));
    const selectedCue = screen.getByRole("button", { name: /轨道步骤 2：/ });
    fireEvent.keyDown(selectedCue, { key: "Delete" });
    expect(screen.getByLabelText("已删除步骤记录")).toBeVisible();
    expect(within(screen.getByLabelText("已删除步骤记录")).getByText("stmt_gate_bg")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "撤销" }));
    expect(screen.queryByLabelText("已删除步骤记录")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /轨道步骤 2：/ })).toBeVisible();
  });
  it("accepts a direction drop before React drag state has rerendered", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "＋ 背景" }));
    fireEvent.change(screen.getByLabelText("新增演出动作"), { target: { value: "clear" } });
    fireEvent.click(screen.getByRole("button", { name: "插入演出" }));
    const sourceCue = screen.getByRole("button", { name: /轨道步骤 2：action=clear/ });
    const targetCue = screen.getByRole("button", { name: /轨道步骤 3：广播站的灯还亮着/ });
    const data = new Map<string, string>();
    const dataTransfer = {
      effectAllowed: "none",
      dropEffect: "none",
      types: ["text/plain"],
      setData: (type: string, value: string) => data.set(type, value),
      getData: (type: string) => data.get(type) ?? ""
    };
    fireEvent.dragStart(sourceCue, { dataTransfer });
    fireEvent.dragOver(targetCue, { dataTransfer });
    fireEvent.drop(targetCue, { dataTransfer });
    expect(screen.getByRole("button", { name: /轨道步骤 3：action=clear/ })).toBeVisible();
    expect(screen.getByText("本地事务 · r2")).toBeVisible();
  });
  it("duplicates a cue and applies one atomic batch parameter transaction", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "复制演出" }));
    expect(screen.getByText("本地事务 · r1")).toBeVisible();
    expect(screen.getAllByRole("button", { name: /轨道步骤 [12]：黄昏校门/ })).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "开始演出多选" }));
    const originalCue = screen.getByRole("button", { name: "轨道步骤 1：黄昏校门 · 云层缓慢移动" });
    expect(originalCue).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("场景步骤 #2")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "选择本场景同类" }));
    expect(originalCue).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("form", { name: "批量演出参数" })).toBeVisible();
    expect(screen.getByText("2 个 Cue · 单步撤销")).toBeVisible();
    expect(screen.getByText("场景步骤 #1、#2")).toBeVisible();
    fireEvent.change(screen.getByLabelText("批量演出参数值"), { target: { value: "fade" } });
    const batchForm = screen.getByRole("form", { name: "批量演出参数" });
    expect(within(batchForm).getByLabelText("2 将修改")).toBeVisible();
    expect(within(batchForm).getByLabelText("0 已一致")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "原子应用 2 项修改" }));
    expect(screen.getByText("本地事务 · r2")).toBeVisible();
    expect(within(batchForm).getByLabelText("0 将修改")).toBeVisible();
    expect(within(batchForm).getByLabelText("2 已一致")).toBeVisible();
    expect(screen.getByRole("button", { name: "原子应用 0 项修改" })).toBeDisabled();

    fireEvent.click(screen.getByRole("tab", { name: "Script" }));
    const source = String((screen.getByLabelText("权威脚本编辑器") as HTMLTextAreaElement).value);
    expect(source.match(/transition=fade/g)).toHaveLength(2);
    expect(source.match(/黄昏校门 · 云层缓慢移动/g)).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "撤销" }));
    expect(String((screen.getByLabelText("权威脚本编辑器") as HTMLTextAreaElement).value)).not.toContain("transition=fade");
  });

  it("clears an explicit batch selection without changing the source revision", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "开始演出多选" }));
    expect(screen.getByText("1 个 Cue · 单步撤销")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "清空选择" }));
    expect(screen.getByText("0 个 Cue · 单步撤销")).toBeVisible();
    expect(screen.getByText("尚未选择 Cue")).toBeVisible();
    expect(screen.getByText("尚未选择")).toBeVisible();
    expect(screen.getByText("请选择至少两个同类 Cue 后再预检。")).toBeVisible();
    expect(screen.queryByText(/类型不一致；当前选择不会被部分修改/)).not.toBeInTheDocument();
    expect(screen.getByText("本地事务 · r0")).toBeVisible();
  });

  it("selects a same-command range by keyboard and offers touch-equivalent lane controls", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "复制演出" }));
    fireEvent.click(screen.getByRole("button", { name: "复制演出" }));
    expect(screen.getByText("本地事务 · r2")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "开始演出多选" }));
    const firstCue = screen.getByRole("button", { name: "轨道步骤 1：黄昏校门 · 云层缓慢移动" });
    const thirdCue = screen.getByRole("button", { name: "轨道步骤 3：黄昏校门 · 云层缓慢移动" });
    fireEvent.click(firstCue);
    fireEvent.keyDown(thirdCue, { key: " ", shiftKey: true });
    expect(screen.getByText("3 个 Cue · 单步撤销")).toBeVisible();
    expect(screen.getByText("已从范围锚点选择 3 个 @background Cue。")).toBeVisible();
    expect(firstCue).toHaveAttribute("aria-keyshortcuts", "Shift+Space");

    fireEvent.keyDown(firstCue, { key: "Delete" });
    expect(screen.getAllByRole("button", { name: /轨道步骤 [123]：黄昏校门/ })).toHaveLength(3);
    expect(screen.getByText("本地事务 · r2")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "清空选择" }));
    fireEvent.click(screen.getByRole("button", { name: "BG · 3" }));
    expect(screen.getByText("已选择该轨道全部 3 个 Cue。")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "填充首尾范围" }));
    expect(screen.getByText("已填充首尾范围，共 3 个 @background Cue。")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "AUDIO · 0" }));
    expect(screen.getByText("该轨道没有 Cue；选择已清空。")).toBeVisible();
    expect(screen.getByText("本地事务 · r2")).toBeVisible();
  });
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
    expect(screen.getByRole("searchbox", { name: "定位步骤" })).toHaveValue("");
    expect(screen.getByText("当前 Script 草稿尚未提交；搜索继续使用最后一次有效场景。")).toBeVisible();
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

    expect(screen.getByLabelText("已删除步骤记录")).toBeVisible();
    expect(within(screen.getByLabelText("已删除步骤记录")).getByText(/stmt_ui_/)).toBeVisible();
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

  it("shares one bounded render window between the stage track and statement cards", () => {
    render(<App />);
    expect(screen.getByRole("group", { name: "演出轨道可视窗口" })).toBeVisible();
    expect(screen.getByText("步骤 1–4 / 4")).toBeVisible();
    expect(screen.getByRole("button", { name: "上一段演出步骤" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "下一段演出步骤" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "定位当前演出步骤" })).toBeDisabled();
    expect(screen.getByRole("region", { name: "图形化演出轨道" })).toHaveAttribute("data-window-size", "64");
    expect(screen.getByRole("region", { name: "图形化演出轨道" })).toHaveAttribute("data-rendered-statements", "4");
    expect(screen.getByLabelText("剧情步骤，当前显示 1 至 4，共 4 步")).toBeVisible();
    expect(screen.getAllByRole("button", { name: /^选择/ })).toHaveLength(4);
    expect(screen.getByText("窗口外选择仍保留 · 拖放仅限当前窗口")).toBeVisible();
  });
});
