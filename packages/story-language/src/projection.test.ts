import { describe, expect, it } from "vitest";
import { validateStoryProject, type StoryProject } from "@world-studio/story-core";
import { formatStory, parseStory, projectStoryScene } from "./index";

const entrySource = `# 注释保留在 CST
scene "校门" @id(scn_gate)

@background school_gate transition=fade @id(stmt_gate_bg)
xia: 去哪里调查？ @sid(stmt_gate_line) @id(txt_gate_line)
choice "调查路线" @id(stmt_gate_choice)
  "广播室" -> scn_radio @id(opt_radio)
  # 选项注释不改变结构
  "天台" -> scn_rooftop @id(opt_rooftop)
`;

const radioSource = `scene "广播室" @id(scn_radio)
@audio mystery_tape loop=true @id(stmt_radio_audio)
xia: 找到磁带了。 @sid(stmt_radio_line) @id(txt_radio_line)
end "电波里的名字" @id(stmt_radio_end)
`;

const rooftopSource = `scene "风中的\\"天台\\"" @id(scn_rooftop)
yu: 晚风知道答案。 @sid(stmt_rooftop_line) @id(txt_rooftop_line)
end "晚风\\n终章" @id(stmt_rooftop_end)
`;

describe("CST to StoryScene projection", () => {
  it("projects an explicit @stop() author marker without changing the visible narration", () => {
    const source = `scene "Stop source" @id(stop_scene)
narrate "Pause here" @stop() @sid(stop_line) @id(stop_text)
end "Done" @id(stop_end)
`;
    const document = parseStory(source);
    const result = projectStoryScene(document);

    expect(formatStory(document)).toContain('narrate "Pause here" @stop() @sid(stop_line) @id(stop_text)');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scene.statements[0]).toEqual({
      id: "stop_line",
      kind: "narration",
      textId: "stop_text",
      text: "Pause here",
      playerStopPoint: true
    });
  });

  it("projects the supported subset with independent statement and text IDs", () => {
    const result = projectStoryScene(parseStory(entrySource));

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected a valid scene projection");
    }
    expect(result.scene).toEqual({
      id: "scn_gate",
      title: "校门",
      statements: [
        {
          id: "stmt_gate_bg",
          kind: "direction",
          command: "background",
          summary: "school_gate transition=fade"
        },
        {
          id: "stmt_gate_line",
          kind: "dialogue",
          speakerId: "xia",
          textId: "txt_gate_line",
          text: "去哪里调查？"
        },
        {
          id: "stmt_gate_choice",
          kind: "choice",
          prompt: "调查路线",
          options: [
            { id: "opt_radio", label: "广播室", targetSceneId: "scn_radio" },
            { id: "opt_rooftop", label: "天台", targetSceneId: "scn_rooftop" }
          ]
        }
      ]
    });
  });

  it("produces scenes that pass project-level ID and route validation", () => {
    const sources = [entrySource, radioSource, rooftopSource];
    const scenes = sources.map((source) => {
      const result = projectStoryScene(parseStory(source));
      if (!result.ok) {
        throw new Error(`Projection failed: ${result.diagnostics[0]?.code}`);
      }
      return result.scene;
    });
    const project: StoryProject = {
      schemaVersion: 0,
      id: "prj_projection",
      title: "投影测试",
      entrySceneId: "scn_gate",
      characters: [
        { id: "xia", displayName: "林夏", color: "#ff62a5" },
        { id: "yu", displayName: "陆雨", color: "#8b7cff" }
      ],
      scenes
    };

    expect(validateStoryProject(project)).toEqual([]);
    expect(scenes[2]?.title).toBe('风中的"天台"');
    expect(scenes[2]?.statements[1]).toEqual(
      expect.objectContaining({ endingName: "晚风\n终章" })
    );
  });

  it("round-trips direction and dialogue identities without merging their roles", () => {
    const first = parseStory(entrySource);
    const second = parseStory(formatStory(first));
    const direction = second.nodes.find((node) => node.kind === "directive");
    const dialogue = second.nodes.find((node) => node.kind === "dialogue");

    expect(direction).toEqual(expect.objectContaining({ id: "stmt_gate_bg" }));
    expect(dialogue).toEqual(
      expect.objectContaining({
        statementId: "stmt_gate_line",
        textId: "txt_gate_line",
        textRaw: "去哪里调查？"
      })
    );
  });

  it("keeps projected semantics identical across canonical formatting", () => {
    for (const source of [entrySource, radioSource, rooftopSource]) {
      const before = projectStoryScene(parseStory(source));
      const formatted = formatStory(parseStory(source));
      const after = projectStoryScene(parseStory(formatted));

      expect(before.ok).toBe(true);
      expect(after).toEqual(before);
    }
  });

  it("rejects missing IDs instead of synthesizing unstable identities", () => {
    const result = projectStoryScene(
      parseStory(`scene "缺失 ID"
@background room
lin: 没有任何 ID
choice "选择"
  "继续" -> next
end "结束"
`)
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected missing identities to block projection");
    }
    expect(result.scene).toBeNull();
    expect(result.diagnostics.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        "MISSING_SCENE_ID",
        "MISSING_STATEMENT_ID",
        "MISSING_TEXT_ID",
        "ORPHAN_CHOICE_OPTION"
      ])
    );
  });

  it("projects every N20 P0 node into the authoritative StoryScene", () => {
    const result=projectStoryScene(parseStory(`scene "P0" @id(scene_p0)
narrate "旁白" @sid(stmt_narrate) @id(text_narrate)
label local_branch @id(stmt_label)
set promised = true @id(stmt_set)
if promised -> local_branch @id(stmt_if)
jump local_branch @id(stmt_jump)
call local_branch @id(stmt_call)
return @id(stmt_return)
wait 500ms @id(stmt_wait)
checkpoint @id(stmt_checkpoint)
end "Done" @id(stmt_end)
`));
    expect(result.ok).toBe(true);if(!result.ok)return;
    expect(result.scene.statements.map((item)=>item.kind)).toEqual(["narration","label","set","condition","jump","call","return","wait","checkpoint","end"]);
    expect(result.scene.statements.map((item)=>item.id)).toEqual(["stmt_narrate","stmt_label","stmt_set","stmt_if","stmt_jump","stmt_call","stmt_return","stmt_wait","stmt_checkpoint","stmt_end"]);
  });

  it("still rejects unknown executable plugin nodes", () => {
    const result = projectStoryScene(parseStory(`scene "不支持节点" @id(scn_unsupported)\n@weather.set kind=snow\n`));
    expect(result).toEqual(expect.objectContaining({ok:false,scene:null,diagnostics:expect.arrayContaining([expect.objectContaining({code:"UNSUPPORTED_EXECUTABLE_NODE"})])}));
  });

  it("rejects parser errors, multiple scene headers and orphan options", () => {
    const malformed = projectStoryScene(parseStory('scene "未闭合'));
    expect(malformed).toEqual(
      expect.objectContaining({
        ok: false,
        diagnostics: expect.arrayContaining([
          expect.objectContaining({ code: "SOURCE_ERROR" })
        ])
      })
    );

    const structural = projectStoryScene(
      parseStory(`scene "第一场" @id(scn_one)
scene "第二场" @id(scn_two)
  "孤立选项" -> scn_two @id(opt_orphan)
`)
    );
    expect(structural.ok).toBe(false);
    if (structural.ok) {
      throw new Error("Expected invalid scene structure");
    }
    expect(structural.diagnostics.map((item) => item.code)).toEqual(
      expect.arrayContaining(["MULTIPLE_SCENE_HEADERS", "ORPHAN_CHOICE_OPTION"])
    );
  });

  it("rejects empty choices and options without stable IDs", () => {
    const result = projectStoryScene(
      parseStory(`scene "选择检查" @id(scn_choice_check)
choice "空选择" @id(stmt_empty_choice)
choice "缺失选项 ID" @id(stmt_missing_option)
  "继续" -> scn_choice_check
`)
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected invalid choices to block projection");
    }
    expect(result.diagnostics.map((item) => item.code)).toEqual(
      expect.arrayContaining(["EMPTY_CHOICE", "MISSING_OPTION_ID"])
    );
  });
});
