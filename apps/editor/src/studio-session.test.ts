import { describe, expect, it } from "vitest";
import {
  activeSourceDraft,
  activeSourceSession,
  createProjectSnapshot,
  createStudioSession,
  hasPendingDraft,
  reduceStudioSession,
  restoreStudioSession
} from "./studio-session";

describe("S0.9 studio source projection and recovery session", () => {
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

  it("patches a graphical direction through the same revision, projection and undo contract", () => {
    const initial = createStudioSession();
    const edited = reduceStudioSession(initial, {
      type: "patch-direction",
      commandId: "cmd_ui_direction",
      statementId: "stmt_gate_bg",
      parameters: {
        asset: "bg_gate_evening",
        transition: "fade",
        transitionAsset: null,
        duration: "400ms"
      },
      removeLegacyPositional: true
    });

    expect(activeSourceSession(edited).committedSource).toContain(
      "@background asset=bg_gate_evening transition=fade duration=400ms @id(stmt_gate_bg)"
    );
    expect(edited.project.scenes[0]?.statements[0]).toEqual(expect.objectContaining({
      id: "stmt_gate_bg",
      command: "background",
      summary: "asset=bg_gate_evening transition=fade duration=400ms"
    }));
    expect(activeSourceSession(edited).lastChange?.changedStatementIds).toEqual(["stmt_gate_bg"]);
    expect(activeSourceSession(edited).revision).toBe(1);

    const undone = reduceStudioSession(edited, { type: "undo" });
    expect(activeSourceSession(undone).committedSource).toBe(activeSourceSession(initial).committedSource);
  });

  it("inserts a graphical direction, selects it and restores it through source history", () => {
    const initial = createStudioSession();
    const inserted = reduceStudioSession(initial, {
      type: "insert-direction",
      commandId: "cmd_ui_insert_direction",
      afterId: "stmt_gate_001",
      statementId: "stmt_ui_audio_stop",
      command: "audio",
      parameters: { action: "stop", bus: "bgm" }
    });
    expect(inserted.selectedStatementId).toBe("stmt_ui_audio_stop");
    expect(inserted.previewIndex).toBe(2);
    expect(inserted.project.scenes[0]?.statements[2]).toEqual(expect.objectContaining({
      id: "stmt_ui_audio_stop",
      kind: "direction",
      command: "audio",
      summary: "action=stop bus=bgm"
    }));
    expect(activeSourceSession(inserted).lastChange?.changedStatementIds).toEqual(["stmt_ui_audio_stop"]);
    const undone = reduceStudioSession(inserted, { type: "undo" });
    expect(undone.project.scenes[0]?.statements.some((statement) => statement.id === "stmt_ui_audio_stop")).toBe(false);
    const redone = reduceStudioSession(undone, { type: "redo" });
    expect(redone.project.scenes[0]?.statements.some((statement) => statement.id === "stmt_ui_audio_stop")).toBe(true);
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

  it("moves and deletes direction cues while keeping preview selection coherent", () => {
    const initial = createStudioSession();
    const moved = reduceStudioSession(initial, {
      type: "move-direction",
      commandId: "cmd_ui_move_direction",
      statementId: "stmt_gate_bg",
      afterId: "stmt_gate_001"
    });
    const movedStatements = moved.project.scenes[0]?.statements ?? [];
    expect(movedStatements.findIndex((item) => item.id === "stmt_gate_001")).toBeLessThan(
      movedStatements.findIndex((item) => item.id === "stmt_gate_bg")
    );
    expect(moved.selectedStatementId).toBe("stmt_gate_bg");
    expect(movedStatements[moved.previewIndex]?.id).toBe("stmt_gate_bg");

    const deleted = reduceStudioSession(moved, {
      type: "delete-direction",
      commandId: "cmd_ui_delete_direction",
      statementId: "stmt_gate_bg"
    });
    expect(deleted.project.scenes[0]?.statements.some((item) => item.id === "stmt_gate_bg")).toBe(false);
    expect(activeSourceSession(deleted).tombstones).toEqual([expect.objectContaining({
      kind: "directive",
      statementId: "stmt_gate_bg",
      command: "background"
    })]);
    expect(deleted.project.scenes[0]?.statements[deleted.previewIndex]?.id).toBe(deleted.selectedStatementId);

    const undone = reduceStudioSession(deleted, { type: "undo" });
    expect(undone.project.scenes[0]?.statements.some((item) => item.id === "stmt_gate_bg")).toBe(true);
    expect(activeSourceSession(undone).tombstones).toEqual([]);
  });

  it("duplicates a direction losslessly and batch-patches cues in one Studio revision", () => {
    const initial = createStudioSession();
    const duplicated = reduceStudioSession(initial, {
      type: "duplicate-direction",
      commandId: "cmd_ui_duplicate_direction",
      statementId: "stmt_gate_bg",
      newStatementId: "stmt_gate_bg_copy"
    });
    expect(duplicated.selectedStatementId).toBe("stmt_gate_bg_copy");
    expect(activeSourceSession(duplicated).revision).toBe(1);
    expect(activeSourceSession(duplicated).committedSource).toContain(
      "@background 黄昏校门 · 云层缓慢移动 @id(stmt_gate_bg_copy)"
    );

    const batched = reduceStudioSession(duplicated, {
      type: "patch-directions",
      commandId: "cmd_ui_batch_direction",
      statementIds: ["stmt_gate_bg", "stmt_gate_bg_copy"],
      parameters: { transition: "fade", duration: "300ms" }
    });
    expect(activeSourceSession(batched).revision).toBe(2);
    expect(activeSourceSession(batched).committedSource.match(/transition=fade/g)).toHaveLength(2);
    expect(activeSourceSession(batched).committedSource.match(/duration=300ms/g)).toHaveLength(2);
    const undone = reduceStudioSession(batched, { type: "undo" });
    expect(activeSourceSession(undone).committedSource).not.toContain("transition=fade");
    expect(undone.project.scenes[0]?.statements.some((item) => item.id === "stmt_gate_bg_copy")).toBe(true);
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

  it("restores an error draft without replacing the last valid projection", () => {
    const initial = createStudioSession();
    const invalidDraft = reduceStudioSession(initial, {
      type: "edit-script",
      commandId: "cmd_persisted_draft",
      source: activeSourceDraft(initial).replace(
        'scene "放学后的校门"',
        'scene "放学后的校门'
      )
    });
    const restored = restoreStudioSession(createProjectSnapshot(invalidDraft, 4));

    expect(hasPendingDraft(restored)).toBe(true);
    expect(restored.diagnostics[restored.activeSceneId]?.some((item) => item.severity === "error"))
      .toBe(true);
    expect(restored.project.scenes[0]?.title).toBe("放学后的校门");
    expect(activeSourceSession(restored).history).toEqual([]);
    expect(restored.notice.detail).toContain("storage revision 4");
  });

  it("carries preserved project and scene fields through a Studio Session save", () => {
    const initial = createProjectSnapshot(createStudioSession(), 1);
    const persisted = {
      ...initial,
      preservedFields: { pluginProjectState: { enabled: true } },
      scenes: initial.scenes.map((scene, index) => index === 0
        ? { ...scene, preservedFields: { pluginSceneState: ["rain", 0.7] } }
        : scene)
    } as const;

    const saved = createProjectSnapshot(restoreStudioSession(persisted), 2, persisted);
    expect(saved.preservedFields).toEqual({ pluginProjectState: { enabled: true } });
    expect(saved.scenes[0]?.preservedFields).toEqual({ pluginSceneState: ["rain", 0.7] });
  });
});
