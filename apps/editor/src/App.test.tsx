import { createEvent, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProjectStoreError } from "@world-studio/project-persistence";
import { compileProject, compileProjectIncremental } from "@world-studio/project-compiler";
import { semanticHash } from "@world-studio/project-domain";
import { campusStoryProject, type StoryProject } from "@world-studio/story-core";
import { App, persistenceErrorLabel, persistenceFailure } from "./App";
import { projectCanonicalFromStory } from "./canonical-project-adapter";

function legacyDirectionProject() {
  const story: StoryProject = {
    ...campusStoryProject,
    scenes: campusStoryProject.scenes.map((scene) => scene.id !== campusStoryProject.entrySceneId
      ? scene
      : {
          ...scene,
          statements: scene.statements.map((statement) => statement.id === "stmt_gate_bg"
            ? { ...statement, summary: "黄昏校门 · 云层缓慢移动" }
            : statement)
        })
  };
  return projectCanonicalFromStory(story, "app-legacy-direction-tests");
}

function renderLegacyDirectionApp() {
  return render(<App initialProject={legacyDirectionProject()} />);
}

function characterDirectionProject({ y = 80, scale = 0.9, rotation = 4 } = {}) {
  const story: StoryProject = {
    ...campusStoryProject,
    scenes: campusStoryProject.scenes.map((scene) => scene.id !== campusStoryProject.entrySceneId
      ? scene
      : {
          ...scene,
          statements: scene.statements.map((statement) => statement.id === "stmt_gate_bg"
            ? {
                kind: "direction" as const,
                id: statement.id,
                command: "show",
                summary: `action=show asset=asset_missing slot=hero z=2 x=20 y=${y} scale=${scale} rotation=${rotation} anchorX=0.5 anchorY=1`
              }
            : statement)
        })
  };
  return projectCanonicalFromStory(story, "app-character-direction-tests");
}

function textboxPresentationProject() {
  const story: StoryProject = {
    ...campusStoryProject,
    scenes: campusStoryProject.scenes.map((scene) => scene.id !== campusStoryProject.entrySceneId ? scene : {
      ...scene,
      statements: [
        { kind: "direction", id: "textbox_nvl", command: "textbox", summary: "action=set template=nvl" },
        { kind: "dialogue", id: "textbox_line_1", speakerId: "char_xia", textId: "textbox_text_1", text: "第一行 NVL" },
        { kind: "narration", id: "textbox_line_2", textId: "textbox_text_2", text: "第二行 NVL" },
        { kind: "direction", id: "textbox_reset", command: "textbox", summary: "action=reset" },
        { kind: "dialogue", id: "textbox_line_3", speakerId: "char_xia", textId: "textbox_text_3", text: "恢复 ADV" },
        { kind: "end", id: "textbox_end", endingName: "Done" }
      ]
    })
  };
  return projectCanonicalFromStory(story, "app-textbox-presentation-tests");
}

function selectFirstDialogue() {
  fireEvent.click(
    screen.getByRole("button", {
      name: /选择对白：广播站的灯还亮着/
    })
  );
}

describe("WorLd Studio S0.32 verified live-stage media prototype", () => {
  it("searches the committed project and jumps across scenes without creating a revision", () => {
    render(<App />);
    const search = screen.getByRole("searchbox", { name: "全局搜索" });
    fireEvent.change(search, { target: { value: "风中的天台" } });
    expect(screen.getByText("1 / 1 项")).toBeVisible();
    fireEvent.click(screen.getByRole("option", { name: /打开场景 · 风中的天台/ }));
    expect(screen.getByRole("heading", { name: "风中的天台" })).toBeVisible();
    expect(screen.getByRole("button", { name: /选择演出/ })).toHaveFocus();
    expect(screen.getByText("本地事务 · r0")).toBeVisible();
    fireEvent.change(search, { target: { value: "旧广播室" } });
    fireEvent.submit(screen.getByRole("search", { name: "搜索全部场景" }));
    expect(screen.getByRole("heading", { name: "旧广播室" })).toBeVisible();
  });

  it("reports empty global searches without mutating the active scene", () => {
    render(<App />);
    const search = screen.getByRole("searchbox", { name: "全局搜索" });
    fireEvent.change(search, { target: { value: "不存在的全局内容" } });
    expect(screen.getByText("没有全局匹配")).toBeVisible();
    expect(screen.getByText(/尝试输入场景标题/)).toBeVisible();
    expect(screen.getByRole("button", { name: "上一个全局搜索结果" })).toBeDisabled();
    expect(screen.getByRole("heading", { name: "放学后的校门" })).toBeVisible();
  });

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
    renderLegacyDirectionApp();
    expect(screen.getByText("图形化演出参数")).toBeVisible();
    expect(screen.getByText("检测到旧式描述")).toBeVisible();
    expect(screen.getByLabelText("演出主资源")).toHaveValue("");
    expect(screen.getByRole("button", { name: "迁移旧描述并应用" })).toBeDisabled();
    expect(screen.getByText(/Asset Index 中没有可用于 @background 的资源/)).toBeVisible();
  });

  it("exposes bounded character geometry without requiring Script syntax", () => {
    renderLegacyDirectionApp();
    fireEvent.click(screen.getByRole("tab", { name: "Script" }));
    const scriptEditor = screen.getByLabelText("权威脚本编辑器");
    const source = String((scriptEditor as HTMLTextAreaElement).value);
    fireEvent.change(scriptEditor, { target: { value: source.replace(
      "@background 黄昏校门 · 云层缓慢移动 @id(stmt_gate_bg)",
      "@show action=show asset=asset_missing slot=primary @id(stmt_gate_bg)"
    ) } });
    fireEvent.keyDown(scriptEditor, { key: "s", ctrlKey: true });
    fireEvent.click(screen.getByRole("tab", { name: "Sequence" }));
    expect(screen.getByLabelText("角色舞台几何")).toBeVisible();
    expect(screen.getByLabelText("角色水平位置")).toHaveAttribute("min", "0");
    expect(screen.getByLabelText("角色缩放")).toHaveAttribute("max", "4");
    fireEvent.change(screen.getByLabelText("角色水平锚点"), { target: { value: "1.1" } });
    expect(screen.getByText(/位置 0–100/)).toBeVisible();
    expect(screen.getByRole("button", { name: "应用演出参数" })).toBeDisabled();
  });

  it("converts an existing Show cue into a resource-free Move without dropping geometry controls", () => {
    renderLegacyDirectionApp();
    fireEvent.click(screen.getByRole("tab", { name: "Script" }));
    const scriptEditor = screen.getByLabelText("权威脚本编辑器");
    const source = String((scriptEditor as HTMLTextAreaElement).value);
    fireEvent.change(scriptEditor, { target: { value: source.replace(
      "@background 黄昏校门 · 云层缓慢移动 @id(stmt_gate_bg)",
      "@show action=show asset=asset_missing slot=hero x=20 expression=smile @id(stmt_gate_bg)"
    ) } });
    fireEvent.keyDown(scriptEditor, { key: "s", ctrlKey: true });
    fireEvent.click(screen.getByRole("tab", { name: "Sequence" }));
    fireEvent.change(screen.getByLabelText("演出动作"), { target: { value: "move" } });
    expect(screen.queryByLabelText("演出主资源")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("角色表情")).not.toBeInTheDocument();
    expect(screen.getByLabelText("角色舞台几何")).toBeVisible();
    fireEvent.change(screen.getByLabelText("角色水平位置"), { target: { value: "80" } });
    fireEvent.change(screen.getByLabelText("移动缓动"), { target: { value: "ease-out" } });
    fireEvent.click(screen.getByRole("button", { name: "应用演出参数" }));
    fireEvent.click(screen.getByRole("tab", { name: "Script" }));
    const movedSource = String((screen.getByLabelText("权威脚本编辑器") as HTMLTextAreaElement).value);
    const movedLine = movedSource.split(/\r?\n/u).find((line) => line.includes("@id(stmt_gate_bg)"));
    expect(movedLine).toContain("@show action=move slot=hero x=80 easing=ease-out");
    expect(movedLine).not.toContain("asset=");
    expect(movedLine).not.toContain("expression=");
  });

  it("places a selected character on the Stage through a stable-ID semantic patch", () => {
    renderLegacyDirectionApp();
    fireEvent.click(screen.getByRole("tab", { name: "Script" }));
    const scriptEditor = screen.getByLabelText("权威脚本编辑器");
    const source = String((scriptEditor as HTMLTextAreaElement).value);
    fireEvent.change(scriptEditor, { target: { value: source.replace(
      "@background 黄昏校门 · 云层缓慢移动 @id(stmt_gate_bg)",
      "@show action=show asset=asset_missing slot=lead x=20 y=100 @id(stmt_gate_bg)"
    ) } });
    fireEvent.keyDown(scriptEditor, { key: "s", ctrlKey: true });
    fireEvent.click(screen.getByRole("tab", { name: "Sequence" }));

    const stage = screen.getByTestId("preview-stage");
    Object.defineProperty(stage, "getBoundingClientRect", { configurable: true, value: () => ({ left: 0, top: 0, width: 1000, height: 562.5, right: 1000, bottom: 562.5, x: 0, y: 0, toJSON: () => ({}) }) });
    const stageContent = stage.querySelector(".stage-content");
    expect(stageContent).not.toBeNull();
    fireEvent.pointerDown(stageContent!, { clientX: 750, clientY: 253.125 });

    expect(screen.getByText("lead 已定位到 X 75% · Y 45%")).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: "Script" }));
    const placed = String((screen.getByLabelText("权威脚本编辑器") as HTMLTextAreaElement).value);
    expect(placed).toContain("@show action=show asset=asset_missing slot=lead x=75 y=45 @id(stmt_gate_bg)");
    expect(screen.getByText("本地事务 · r2")).toBeVisible();
  });

  it("fails closed to the visual placeholder when a legacy direction has no executable Asset ID", async () => {
    renderLegacyDirectionApp();
    expect(await screen.findByText("安全占位")).toBeVisible();
    expect(screen.getByText("1 项资源未执行")).toBeVisible();
    expect(screen.queryByTestId("preview-background")).not.toBeInTheDocument();
  });
  it("commits background clear without requiring resource-only fields while keeping optional transition controls", () => {
    renderLegacyDirectionApp();
    fireEvent.change(screen.getByLabelText("演出动作"), { target: { value: "clear" } });
    expect(screen.queryByLabelText("演出主资源")).not.toBeInTheDocument();
    expect(screen.getByLabelText("演出过渡")).toHaveValue("");
    expect(screen.queryByLabelText("过渡资源")).not.toBeInTheDocument();
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
  it("inserts a resource-free bounded Move cue from the graphical Stage track", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "＋ 角色" }));
    fireEvent.change(screen.getByLabelText("新增演出动作"), { target: { value: "move" } });
    expect(screen.queryByLabelText("新增演出资源")).not.toBeInTheDocument();
    expect(screen.getByLabelText("新增移动水平位置")).toHaveValue(50);
    expect(screen.getByLabelText("新增移动垂直位置")).toHaveValue(100);
    expect(screen.getByLabelText("新增移动缓动")).toHaveValue("ease-in-out");
    fireEvent.change(screen.getByLabelText("新增移动水平位置"), { target: { value: "101" } });
    expect(screen.getByRole("button", { name: "插入演出" })).toBeDisabled();
    expect(screen.getByText("移动位置必须在 0–100 之间")).toBeVisible();
    fireEvent.change(screen.getByLabelText("新增移动水平位置"), { target: { value: "80" } });
    fireEvent.change(screen.getByLabelText("新增移动垂直位置"), { target: { value: "90" } });
    fireEvent.click(screen.getByRole("button", { name: "插入演出" }));
    fireEvent.click(screen.getByRole("tab", { name: "Script" }));
    expect(String((screen.getByLabelText("权威脚本编辑器") as HTMLTextAreaElement).value)).toContain(
      "@show action=move slot=primary x=80 y=90 transition=slide duration=300ms easing=ease-in-out"
    );
  });
  it("authors a scoped background clear transition from the graphical Stage track", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "＋ 背景" }));
    fireEvent.change(screen.getByLabelText("新增演出动作"), { target: { value: "clear" } });
    fireEvent.change(screen.getByLabelText("新增背景转场"), { target: { value: "dissolve" } });
    expect(screen.getByLabelText("新增背景转场时长")).toHaveValue("600ms");
    fireEvent.change(screen.getByLabelText("新增背景转场时长"), { target: { value: "soon" } });
    expect(screen.getByRole("button", { name: "插入演出" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("新增背景转场时长"), { target: { value: "700ms" } });
    fireEvent.click(screen.getByRole("button", { name: "插入演出" }));
    fireEvent.click(screen.getByRole("tab", { name: "Script" }));
    expect(String((screen.getByLabelText("权威脚本编辑器") as HTMLTextAreaElement).value)).toContain(
      "@background action=clear transition=dissolve duration=700ms"
    );
  });
  it("authors a canonical NVL textbox template from the graphical Stage track", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "＋ 文本框" }));
    expect(screen.getByRole("form", { name: "新增文本框演出" })).toBeVisible();
    fireEvent.change(screen.getByLabelText("新增文本框模板"), { target: { value: "nvl" } });
    fireEvent.click(screen.getByRole("button", { name: "插入演出" }));
    expect(screen.getByText("TEXT")).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: "Script" }));
    expect(String((screen.getByLabelText("权威脚本编辑器") as HTMLTextAreaElement).value)).toContain(
      "@textbox action=set template=nvl"
    );
  });
  it("authors a bounded camera cue and exposes it on the dedicated timeline lane", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "＋ 镜头" }));
    expect(screen.queryByLabelText("新增演出资源")).not.toBeInTheDocument();
    expect(screen.getByLabelText("新增镜头倍率")).toHaveValue(1.15);
    fireEvent.change(screen.getByLabelText("新增镜头倍率"), { target: { value: "3.1" } });
    expect(screen.getByRole("button", { name: "插入演出" })).toBeDisabled();
    expect(screen.getByText(/镜头偏移 -100–100/)).toBeVisible();
    fireEvent.change(screen.getByLabelText("新增镜头倍率"), { target: { value: "1.25" } });
    fireEvent.change(screen.getByLabelText("新增镜头水平偏移"), { target: { value: "18" } });
    fireEvent.change(screen.getByLabelText("新增镜头垂直偏移"), { target: { value: "-10" } });
    fireEvent.click(screen.getByRole("button", { name: "插入演出" }));
    expect(screen.getByRole("button", { name: /轨道步骤 2：action=move x=18 y=-10 zoom=1.25/ })).toBeVisible();
    expect(screen.getByText("CAM")).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: "Script" }));
    expect(String((screen.getByLabelText("权威脚本编辑器") as HTMLTextAreaElement).value)).toContain(
      "@camera action=move x=18 y=-10 zoom=1.25 rotation=0 duration=600ms easing=ease-in-out"
    );
  });
  it("authors the next character keyframe from the selected Show cue and writes it back to Script", () => {
    render(<App initialProject={characterDirectionProject({ y: 100, scale: 1, rotation: 0 })} />);

    fireEvent.click(screen.getByRole("button", { name: "＋ 关键帧" }));
    expect(screen.getByRole("form", { name: "新增角色关键帧" })).toBeVisible();
    expect(screen.getByLabelText("关键帧水平位置")).toHaveValue(20);
    expect(screen.getByRole("button", { name: "插入关键帧" })).toBeDisabled();
    expect(screen.getByText("请调整至少一个舞台几何值；不会创建空关键帧。")).toBeVisible();
    fireEvent.change(screen.getByLabelText("关键帧水平位置"), { target: { value: "72" } });
    fireEvent.change(screen.getByLabelText("关键帧垂直位置"), { target: { value: "84" } });
    fireEvent.change(screen.getByLabelText("关键帧缩放"), { target: { value: "1.05" } });
    fireEvent.change(screen.getByLabelText("关键帧时长"), { target: { value: "650ms" } });
    fireEvent.change(screen.getByLabelText("关键帧缓动"), { target: { value: "ease-out" } });
    fireEvent.click(screen.getByRole("button", { name: "插入关键帧" }));

    expect(screen.getByText("KF")).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: "Script" }));
    expect(String((screen.getByLabelText("权威脚本编辑器") as HTMLTextAreaElement).value)).toMatch(
      /@show action=move slot=hero z=2 x=72 y=84 scale=1\.05 rotation=0 anchorX=0\.5 anchorY=1 transition=slide duration=650ms easing=ease-out @id\(stmt_[^)]+\)/u
    );
  });
  it("authors a two-segment character path as one atomic pair of canonical Move keyframes", () => {
    render(<App initialProject={characterDirectionProject()} />);

    fireEvent.click(screen.getByRole("button", { name: "＋ 路径" }));
    expect(screen.getByRole("form", { name: "新增角色运动路径" })).toBeVisible();
    expect(screen.getByLabelText(/运动路径画布/)).toHaveAccessibleName(/当前编辑路径点/);
    fireEvent.change(screen.getByLabelText("路径点水平位置"), { target: { value: "45" } });
    fireEvent.change(screen.getByLabelText("路径点垂直位置"), { target: { value: "55" } });
    fireEvent.change(screen.getByLabelText("路径点移动时长"), { target: { value: "400ms" } });
    fireEvent.change(screen.getByLabelText("路径点缓动"), { target: { value: "ease-out" } });
    fireEvent.change(screen.getByLabelText("终点水平位置"), { target: { value: "75" } });
    fireEvent.change(screen.getByLabelText("终点垂直位置"), { target: { value: "82" } });
    fireEvent.change(screen.getByLabelText("终点移动时长"), { target: { value: "650ms" } });
    fireEvent.click(screen.getByRole("button", { name: "创建运动路径" }));

    expect(screen.getByText("本地事务 · r1")).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: "Script" }));
    const pathSource = String((screen.getByLabelText("权威脚本编辑器") as HTMLTextAreaElement).value);
    expect(pathSource).toMatch(/@show action=move slot=hero z=2 x=45 y=55 scale=0\.9 rotation=4 anchorX=0\.5 anchorY=1 transition=slide duration=400ms easing=ease-out @id\(stmt_[^)]+\)\r?\n@show action=move slot=hero z=2 x=75 y=82 scale=0\.9 rotation=4 anchorX=0\.5 anchorY=1 transition=slide duration=650ms easing=ease-in-out @id\(stmt_[^)]+\)/u);
    fireEvent.click(screen.getByRole("button", { name: "撤销" }));
    expect(String((screen.getByLabelText("权威脚本编辑器") as HTMLTextAreaElement).value)).not.toContain("x=45 y=55");
    expect(String((screen.getByLabelText("权威脚本编辑器") as HTMLTextAreaElement).value)).not.toContain("x=75 y=82");
  });
  it("authors one graphical cubic Bezier Move with four absolute control coordinates", () => {
    render(<App initialProject={characterDirectionProject()} />);
    fireEvent.click(screen.getByRole("button", { name: "＋ 贝塞尔" }));
    expect(screen.getByRole("form", { name: "新增贝塞尔角色路径" })).toBeVisible();
    fireEvent.change(screen.getByLabelText("贝塞尔控制点 1 X"), { target: { value: "30" } });
    fireEvent.change(screen.getByLabelText("贝塞尔控制点 1 Y"), { target: { value: "20" } });
    fireEvent.change(screen.getByLabelText("贝塞尔控制点 2 X"), { target: { value: "70" } });
    fireEvent.change(screen.getByLabelText("贝塞尔控制点 2 Y"), { target: { value: "20" } });
    fireEvent.change(screen.getByLabelText("贝塞尔终点 X"), { target: { value: "80" } });
    fireEvent.change(screen.getByLabelText("贝塞尔终点 Y"), { target: { value: "80" } });
    fireEvent.change(screen.getByLabelText("贝塞尔移动时长"), { target: { value: "650ms" } });
    fireEvent.click(screen.getByRole("button", { name: "创建贝塞尔路径" }));
    expect(screen.getByLabelText("角色空间路径")).toHaveValue("bezier");
    expect(screen.getByLabelText("角色贝塞尔控制点 1 X")).toHaveValue(30);
    expect(screen.getByLabelText("角色贝塞尔控制点 2 Y")).toHaveValue(20);
    fireEvent.click(screen.getByRole("tab", { name: "Script" }));
    expect(String((screen.getByLabelText("权威脚本编辑器") as HTMLTextAreaElement).value)).toMatch(/@show action=move slot=hero z=2 x=80 y=80 scale=0\.9 rotation=4 anchorX=0\.5 anchorY=1 curve=bezier control1X=30 control1Y=20 control2X=70 control2Y=20 transition=slide duration=650ms easing=ease-in-out @id\(stmt_[^)]+\)/u);
  });
  it("inserts a resource-free Hide cue with the frozen fade default", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "＋ 角色" }));
    fireEvent.change(screen.getByLabelText("新增演出动作"), { target: { value: "hide" } });
    expect(screen.queryByLabelText("新增演出资源")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("新增移动水平位置")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("新增角色槽位"), { target: { value: "hero" } });
    fireEvent.click(screen.getByRole("button", { name: "插入演出" }));
    fireEvent.click(screen.getByRole("tab", { name: "Script" }));
    expect(String((screen.getByLabelText("权威脚本编辑器") as HTMLTextAreaElement).value)).toContain(
      "@show action=hide slot=hero transition=fade duration=300ms"
    );
  });
  it("reorders and deletes direction cues through accessible track controls", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "演出右移" }));
    fireEvent.click(screen.getByRole("tab", { name: "Script" }));
    const movedSource = String((screen.getByLabelText("权威脚本编辑器") as HTMLTextAreaElement).value);
    expect(movedSource.indexOf("stmt_gate_001")).toBeLessThan(movedSource.indexOf("stmt_gate_bg"));

    fireEvent.click(screen.getByRole("tab", { name: "Sequence" }));
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
    renderLegacyDirectionApp();
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
    renderLegacyDirectionApp();
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
    fireEvent.click(screen.getByRole("tab", { name: "Sequence" }));
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

    fireEvent.click(screen.getByRole("tab", { name: "Sequence" }));
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
    expect(screen.getByRole("heading", { name: "Route Map" })).toBeVisible();
    expect(screen.getByText("Compiler 图事实")).toBeVisible();
    expect(screen.getByRole("button", { name: "路线场景：风中的天台 · scn_rooftop" })).toBeVisible();
    expect(screen.getByText("去天台")).toBeVisible();
  });

  it("shows the verified workspace Compiler cache result consumed by Route", () => {
    const project = legacyDirectionProject();
    const first = compileProject(project, "debug");
    const compilation = compileProjectIncremental(project, { profile: "debug", previousCache: first.cache });
    render(<App initialProject={project} routeCompiler={{ cacheStatus: "hit", projectHash: semanticHash(project), compilation }} />);
    fireEvent.click(screen.getByRole("tab", { name: "Flow" }));
    expect(screen.getByRole("status", { name: "Route Compiler 缓存状态" })).toHaveTextContent("缓存命中");
    expect(screen.getByRole("status", { name: "Route Compiler 缓存状态" })).toHaveTextContent("0 编译");
    fireEvent.change(screen.getByLabelText("路线场景名称"), { target: { value: "内存修改" } });
    fireEvent.click(screen.getByRole("button", { name: "通过 Project Service 保存" }));
    expect(screen.getByRole("status", { name: "Route Compiler 缓存状态" })).toHaveTextContent("存在未保存改动");
    expect(screen.getByRole("status", { name: "Route Compiler 缓存状态" })).toHaveTextContent("内存增量分析");
    expect(screen.getByRole("status", { name: "Route Compiler 缓存状态" })).toHaveTextContent("1 编译");
    expect(screen.getByRole("button", { name: "路线场景：内存修改 · scn_school_gate" })).toBeVisible();
  });

  it("edits and resets a canonical route layout sidecar through Project Service", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("tab", { name: "Flow" }));
    fireEvent.click(screen.getByRole("button", { name: "路线场景：风中的天台 · scn_rooftop" }));
    fireEvent.change(screen.getByLabelText("路线节点 X"), { target: { value: "640" } });
    fireEvent.change(screen.getByLabelText("路线节点 Y"), { target: { value: "360" } });
    fireEvent.click(screen.getByRole("button", { name: "保存节点布局" }));

    expect(screen.getByText(/布局 Sidecar 已提交/)).toBeVisible();
    expect(screen.getByRole("button", { name: "路线场景：风中的天台 · scn_rooftop" }).style.getPropertyValue("--route-x")).toBe("640px");
    expect(screen.getByRole("button", { name: "路线场景：风中的天台 · scn_rooftop" }).style.getPropertyValue("--route-y")).toBe("360px");

    fireEvent.click(screen.getByRole("button", { name: "重建自动布局" }));
    expect(screen.getByText(/已重建自动布局/)).toBeVisible();
    expect(screen.getByLabelText("路线节点 X")).toHaveValue(648);
    expect(screen.getByLabelText("路线节点 Y")).toHaveValue(96);
    expect(screen.getByText(/脚本与 Compiler 图未修改/)).toBeVisible();
  });

  it("groups, folds, pans, zooms, and keyboard-moves Route nodes through canonical commands", () => {
    render(<App />);fireEvent.click(screen.getByRole("tab",{name:"Flow"}));
    fireEvent.change(screen.getByLabelText("新路线分组 ID"),{target:{value:"group_rooftop"}});
    fireEvent.change(screen.getByLabelText("新路线分组名称"),{target:{value:"天台线"}});
    fireEvent.click(screen.getByRole("button",{name:"创建路线分组"}));
    fireEvent.click(screen.getByRole("button",{name:"路线场景：风中的天台 · scn_rooftop"}));
    fireEvent.change(screen.getByLabelText("节点所属分组"),{target:{value:"group_rooftop"}});
    fireEvent.click(screen.getByRole("button",{name:"保存节点分组"}));
    const rooftop=screen.getByRole("button",{name:"路线场景：风中的天台 · scn_rooftop"});
    expect(rooftop).toHaveAttribute("data-route-group","group_rooftop");

    fireEvent.keyDown(rooftop,{key:"ArrowRight",altKey:true});
    expect(rooftop.style.getPropertyValue("--route-x")).toBe("672px");
    fireEvent.click(screen.getByRole("button",{name:"节点下移 24"}));
    expect(rooftop.style.getPropertyValue("--route-y")).toBe("120px");

    fireEvent.change(screen.getByLabelText("路线视口 X"),{target:{value:"100"}});
    fireEvent.change(screen.getByLabelText("路线视口 Y"),{target:{value:"50"}});
    fireEvent.change(screen.getByLabelText("路线视口缩放"),{target:{value:"1.25"}});
    fireEvent.click(screen.getByRole("button",{name:"保存路线视口"}));
    expect(screen.getByLabelText("路线画布表面").style.transform).toBe("translate(-100px, -50px) scale(1.25)");

    fireEvent.click(screen.getByRole("button",{name:"折叠分组：天台线"}));
    expect(screen.queryByRole("button",{name:"路线场景：风中的天台 · scn_rooftop"})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"展开分组：天台线"}));
    expect(screen.getByRole("button",{name:"路线场景：风中的天台 · scn_rooftop"})).toBeVisible();
  });

  it("writes pointer drag coordinates through the same canonical layout command",()=>{
    render(<App/>);fireEvent.click(screen.getByRole("tab",{name:"Flow"}));const node=screen.getByRole("button",{name:"路线场景：风中的天台 · scn_rooftop"}),canvas=screen.getByLabelText("路线场景节点");const dataTransfer={effectAllowed:"move",setData:()=>undefined,getData:()=>"scn_rooftop"};
    expect(node).toHaveAttribute("draggable","true");const drop=createEvent.drop(canvas,{dataTransfer});Object.defineProperty(drop,"clientX",{value:500});Object.defineProperty(drop,"clientY",{value:300});fireEvent(canvas,drop);
    expect(node.style.getPropertyValue("--route-x")).toBe("500px");expect(node.style.getPropertyValue("--route-y")).toBe("300px");expect(screen.getByText(/拖拽位置已写入 Layout Sidecar/)).toBeVisible();
  });

  it("defaults Preview to 16:9 and switches canvas profiles without editing the story", () => {
    render(<App />);
    const stage = screen.getByTestId("preview-stage");
    const profile = screen.getByLabelText("预览尺寸");

    expect(profile).toHaveValue("landscape-16-9");
    expect(stage).toHaveAttribute("data-preview-width", "1920");
    expect(stage).toHaveAttribute("data-preview-height", "1080");
    expect(stage).toHaveAttribute("data-stage-dpr", "1");
    expect(stage).toHaveAttribute("data-stage-pixel-width", "1920");
    expect(stage).toHaveAttribute("data-stage-pixel-height", "1080");
    expect(stage).toHaveAttribute("data-stage-resolution-limited", "false");
    expect(screen.getByTestId("preview-visual-host")).toHaveAttribute("data-render-contract", "2");
    expect(screen.getByTestId("preview-visual-host")).toHaveAttribute("data-render-backend", "dom-media-v1");
    expect(stage.style.getPropertyValue("--preview-aspect")).toBe("1920 / 1080");
    expect(screen.getByTestId("preview-safe-area")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("安全区"));
    expect(screen.queryByTestId("preview-safe-area")).not.toBeInTheDocument();

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

  it("switches bounded N43 workspace modes without changing the canonical selection or revision", () => {
    render(<App />);
    selectFirstDialogue();

    expect(screen.getByRole("radio", { name: "Writer" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Production" })).toBeEnabled();
    expect(screen.getByRole("radio", { name: "Debug & QA" })).toBeEnabled();
    expect(screen.getByRole("radio", { name: "Mobile Focus" })).toBeDisabled();

    fireEvent.click(screen.getByRole("radio", { name: "Production" }));
    expect(screen.getByRole("heading", { name: "资源生产工作区" })).toBeVisible();
    expect(screen.getByTestId("workspace-shell")).toHaveAttribute("data-context-statement-id", "stmt_gate_001");
    expect(screen.getByText("本地事务 · r0")).toBeVisible();

    fireEvent.click(screen.getByRole("radio", { name: "Debug & QA" }));
    expect(screen.getByRole("heading", { name: "诊断与运行检查台" })).toBeVisible();
    expect(screen.getByTestId("workspace-shell")).toHaveAttribute("data-context-statement-id", "stmt_gate_001");
    expect(screen.getByText("本地事务 · r0")).toBeVisible();

    fireEvent.click(screen.getByRole("radio", { name: "Director" }));
    expect(screen.getByTestId("workspace-shell")).toHaveAttribute("data-workspace-mode", "director");
    expect(screen.getByLabelText("对白内容")).toHaveValue(
      "广播站的灯还亮着。你也听见那段没有署名的留言了吗？"
    );
    expect(screen.getByText("本地事务 · r0")).toBeVisible();

    fireEvent.click(screen.getByRole("radio", { name: "Flow 模式" }));
    expect(screen.getByRole("heading", { name: "Route Map" })).toBeVisible();
    fireEvent.click(screen.getByRole("radio", { name: "Quick Start" }));
    expect(screen.getByTestId("workspace-shell")).toHaveAttribute("data-workspace-mode", "quick-start");
    expect(screen.getByRole("heading", { name: "放学后的校门" })).toBeVisible();
    expect(screen.getByText("本地事务 · r0")).toBeVisible();
  });

  it("scrubs a derived time ruler through canonical statement selection", () => {
    render(<App />);
    const timeline = screen.getByRole("group", { name: "时间线播放头" });
    const playhead = within(timeline).getByRole("slider", { name: "时间线播放头位置" });
    expect(timeline).toHaveAttribute("data-playhead-source", "selection");
    expect(playhead).toHaveValue("0");
    expect(screen.getAllByRole("button", { name: /^时间标记/ })).toHaveLength(4);

    fireEvent.change(playhead, { target: { value: "1" } });
    expect(playhead).toHaveValue("1");
    expect(screen.getByRole("button", { name: /^选择对白：广播站/ })).toHaveClass("is-active");
    expect(within(timeline).getByText(/选中步骤 · stmt_gate_001/)).toBeVisible();
  });

  it("renders actual NVL accumulation and canonical reset in Preview", () => {
    render(<App initialProject={textboxPresentationProject()} />);
    const next = screen.getByRole("button", { name: "下一步" });
    fireEvent.click(next);
    fireEvent.click(next);
    const nvl = document.querySelector('[data-dialogue-template="nvl"]');
    expect(nvl).not.toBeNull();
    expect(within(nvl as HTMLElement).getByText("第一行 NVL")).toBeVisible();
    expect(within(nvl as HTMLElement).getByText("第二行 NVL")).toBeVisible();
    fireEvent.click(next);
    fireEvent.click(next);
    const adv = document.querySelector('[data-dialogue-template="adv"]');
    expect(adv).not.toBeNull();
    expect(within(adv as HTMLElement).getByText("恢复 ADV")).toBeVisible();
    expect(within(adv as HTMLElement).queryByText("第一行 NVL")).toBeNull();
  });
});
