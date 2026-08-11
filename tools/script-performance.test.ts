import { describe, expect, it } from "vitest";
import {
  parseStory,
  patchDialogueText,
  projectStoryScene
} from "@world-studio/story-language";

const dialogueCount = 10_000;
const budgets = {
  parseMs: 4_000,
  projectionMs: 4_000,
  patchLastDialogueMs: 8_000,
  totalMs: 12_000
};

describe("large script performance audit", () => {
  it("parses, projects, and patches the final stable ID within the S0.8 baseline", () => {
    const lines = ['scene "大文本基线" @id(scn_large_baseline)'];
    for (let index = 0; index < dialogueCount; index += 1) {
      lines.push(
        `char_xia: 第 ${index} 句性能基线对白 @sid(stmt_large_${index}) @id(txt_large_${index})`
      );
    }
    lines.push('end "性能基线结束" @id(stmt_large_end)');
    const source = `${lines.join("\n")}\n`;

    parseStory('scene "预热" @id(scn_warmup)\nend "完成" @id(stmt_warmup_end)\n');

    const totalStart = performance.now();
    const parseStart = performance.now();
    const parsedDocument = parseStory(source);
    const parseMs = performance.now() - parseStart;

    const projectionStart = performance.now();
    const projection = projectStoryScene(parsedDocument);
    const projectionMs = performance.now() - projectionStart;

    const patchStart = performance.now();
    const patch = patchDialogueText(
      source,
      parsedDocument,
      `stmt_large_${dialogueCount - 1}`,
      "最后一句已经完成稳定 ID 局部修改"
    );
    const patchLastDialogueMs = performance.now() - patchStart;
    const totalMs = performance.now() - totalStart;

    const report = {
      status: "PASS",
      baseline: {
        dialogueLines: dialogueCount,
        semanticStatements: projection.ok ? projection.scene.statements.length : 0,
        sourceBytes: new TextEncoder().encode(source).byteLength
      },
      measurementsMs: {
        parse: Number(parseMs.toFixed(2)),
        projection: Number(projectionMs.toFixed(2)),
        patchLastDialogue: Number(patchLastDialogueMs.toFixed(2)),
        total: Number(totalMs.toFixed(2))
      },
      budgetsMs: budgets
    };

    expect(parsedDocument.diagnostics.filter((item) => item.severity === "error")).toEqual([]);
    expect(projection.ok).toBe(true);
    if (!projection.ok) {
      throw new Error(`Large-source projection failed: ${projection.diagnostics[0]?.code}`);
    }
    expect(projection.scene.statements).toHaveLength(dialogueCount + 1);
    expect(patch.ok).toBe(true);
    if (!patch.ok) {
      throw new Error(`Large-source patch failed: ${patch.error.code}`);
    }
    expect(patch.source).toContain("最后一句已经完成稳定 ID 局部修改");
    expect(parseMs).toBeLessThanOrEqual(budgets.parseMs);
    expect(projectionMs).toBeLessThanOrEqual(budgets.projectionMs);
    expect(patchLastDialogueMs).toBeLessThanOrEqual(budgets.patchLastDialogueMs);
    expect(totalMs).toBeLessThanOrEqual(budgets.totalMs);

    console.log(JSON.stringify(report, null, 2));
  });
});
