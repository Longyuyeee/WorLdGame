import { describe, expect, it } from "vitest";
import {
  activeSourceDraft,
  activeSourceSession,
  createStudioSession,
  hasPendingDraft,
  reduceStudioSession
} from "./studio-session";

describe("S0.7 studio source projection session", () => {
  it("starts from projectable canonical sources without a second model", () => {
    const session = createStudioSession();

    expect(session.project.scenes).toHaveLength(3);
    expect(session.project.scenes[0]?.title).toBe("放学后的校门");
    expect(activeSourceDraft(session)).toContain("# S0.8：注释由权威 CST 保留");
    expect(activeSourceSession(session).revision).toBe(0);
  });

  it("patches Writer dialogue through stable IDs and updates source projection", () => {
    const initial = createStudioSession();
    const edited = reduceStudioSession(initial, {
      type: "patch-dialogue",
      commandId: "cmd_ui_patch",
      statementId: "stmt_gate_001",
      text: "从 Writer 写回权威脚本。"
    });

    expect(activeSourceSession(edited).committedSource).toContain(
      "char_xia: 从 Writer 写回权威脚本。 @sid(stmt_gate_001) @id(txt_gate_001)"
    );
    expect(activeSourceSession(edited).committedSource).toContain(
      "# S0.8：注释由权威 CST 保留"
    );
    expect(edited.project.scenes[0]?.statements[1]).toEqual(
      expect.objectContaining({ id: "stmt_gate_001", text: "从 Writer 写回权威脚本。" })
    );
    expect(activeSourceSession(edited).revision).toBe(1);
  });

  it("keeps invalid Script input as a draft and protects Writer and Preview", () => {
    const initial = createStudioSession();
    const invalidSource = activeSourceDraft(initial).replace(
      'scene "放学后的校门"',
      'scene "放学后的校门'
    );
    const drafted = reduceStudioSession(initial, {
      type: "edit-script",
      commandId: "cmd_ui_invalid",
      source: invalidSource
    });

    expect(hasPendingDraft(drafted)).toBe(true);
    expect(drafted.notice.tone).toBe("draft");
    expect(drafted.diagnostics[drafted.activeSceneId]).toEqual(
      expect.arrayContaining([expect.objectContaining({ severity: "error" })])
    );
    expect(drafted.project.scenes[0]?.title).toBe("放学后的校门");
    expect(activeSourceSession(drafted).revision).toBe(0);

    const blockedWriter = reduceStudioSession(drafted, {
      type: "patch-dialogue",
      commandId: "cmd_ui_blocked_patch",
      statementId: "stmt_gate_001",
      text: "不应提交"
    });
    expect(blockedWriter.notice.title).toBe("先处理脚本草稿");
    expect(activeSourceSession(blockedWriter).revision).toBe(0);

    const discarded = reduceStudioSession(blockedWriter, { type: "discard-draft" });
    expect(hasPendingDraft(discarded)).toBe(false);
    expect(activeSourceDraft(discarded)).toBe(activeSourceSession(discarded).committedSource);
  });

  it("commits valid Script edits and rejects project reference damage", () => {
    const initial = createStudioSession();
    const validSource = activeSourceDraft(initial).replace(
      "声音像是从很多年前传过来的。",
      "声音来自被遗忘的旧磁带。"
    );
    const committed = reduceStudioSession(initial, {
      type: "edit-script",
      commandId: "cmd_ui_valid_script",
      source: validSource
    });

    expect(hasPendingDraft(committed)).toBe(false);
    expect(committed.project.scenes[0]?.statements[2]).toEqual(
      expect.objectContaining({ text: "听见了。声音来自被遗忘的旧磁带。" })
    );
    expect(activeSourceSession(committed).revision).toBe(1);

    const brokenReference = activeSourceDraft(committed).replace(
      "-> scn_rooftop",
      "-> scn_missing"
    );
    const rejected = reduceStudioSession(committed, {
      type: "edit-script",
      commandId: "cmd_ui_broken_reference",
      source: brokenReference
    });
    expect(hasPendingDraft(rejected)).toBe(true);
    expect(rejected.notice.title).toBe("项目引用检查失败");
    expect(activeSourceSession(rejected).revision).toBe(1);
  });

  it("inserts, deletes, exposes tombstones, and restores history deterministically", () => {
    const initial = createStudioSession();
    const inserted = reduceStudioSession(initial, {
      type: "insert-dialogue",
      commandId: "cmd_ui_insert",
      afterId: "stmt_gate_001",
      statementId: "stmt_ui_inserted",
      textId: "txt_ui_inserted",
      speakerId: "char_xia",
      text: "新插入的对白。"
    });
    expect(inserted.selectedStatementId).toBe("stmt_ui_inserted");
    expect(inserted.project.scenes[0]?.statements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "stmt_ui_inserted", text: "新插入的对白。" })
      ])
    );

    const deleted = reduceStudioSession(inserted, {
      type: "delete-dialogue",
      commandId: "cmd_ui_delete",
      statementId: "stmt_ui_inserted"
    });
    expect(activeSourceSession(deleted).tombstones).toEqual([
      expect.objectContaining({ statementId: "stmt_ui_inserted", textId: "txt_ui_inserted" })
    ]);
    expect(deleted.project.scenes[0]?.statements.some((item) => item.id === "stmt_ui_inserted"))
      .toBe(false);

    const undoDelete = reduceStudioSession(deleted, { type: "undo" });
    expect(activeSourceSession(undoDelete).tombstones).toEqual([]);
    expect(
      undoDelete.project.scenes[0]?.statements.some((item) => item.id === "stmt_ui_inserted")
    ).toBe(true);

    const redoDelete = reduceStudioSession(undoDelete, { type: "redo" });
    expect(activeSourceSession(redoDelete).tombstones).toHaveLength(1);
    expect(
      redoDelete.project.scenes[0]?.statements.some((item) => item.id === "stmt_ui_inserted")
    ).toBe(false);
  });

  it("moves dialogue using source order and keeps selection stable", () => {
    const initial = createStudioSession();
    const moved = reduceStudioSession(initial, {
      type: "move-dialogue",
      commandId: "cmd_ui_move",
      statementId: "stmt_gate_001",
      afterId: "stmt_gate_002"
    });

    const statements = moved.project.scenes[0]?.statements ?? [];
    expect(statements.findIndex((item) => item.id === "stmt_gate_002")).toBeLessThan(
      statements.findIndex((item) => item.id === "stmt_gate_001")
    );
    expect(moved.selectedStatementId).toBe("stmt_gate_001");
  });

  it("keeps scene drafts isolated when switching between source sessions", () => {
    const initial = createStudioSession();
    const drafted = reduceStudioSession(initial, {
      type: "edit-script",
      commandId: "cmd_scene_draft",
      source: activeSourceDraft(initial).replace(
        'scene "放学后的校门"',
        'scene "放学后的校门'
      )
    });
    const cleanScene = reduceStudioSession(drafted, {
      type: "select-scene",
      sceneId: "scn_broadcast_room"
    });
    expect(hasPendingDraft(cleanScene)).toBe(false);
    expect(cleanScene.notice.title).toBe("场景事务已切换");

    const returned = reduceStudioSession(cleanScene, {
      type: "select-scene",
      sceneId: "scn_school_gate"
    });
    expect(hasPendingDraft(returned)).toBe(true);
    expect(returned.notice.title).toBe("此场景有未提交草稿");
  });
});
