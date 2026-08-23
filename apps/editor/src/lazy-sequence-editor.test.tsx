import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createProjectTemplate } from "@world-studio/project-domain";
import { createScriptSourceSession } from "@world-studio/story-language";
import { LazySequenceEditor } from "./lazy-sequence-editor";
import type { LazyScenePage } from "./lazy-scene-session";

describe("N40-E8g lazy Sequence window", () => {
  it("mounts at most 64 statement cards and pages deterministically", () => {
    const scene = createProjectTemplate("E8g Window", "e8g-window").scenes[0]!;
    const source = [`scene "${scene.title}" @id(${scene.id})`, ...Array.from({ length: 150 }, (_, index) => `narrate "Step ${index}" @sid(statement_${index}) @id(text_${index})`), ""].join("\n");
    const page: LazyScenePage = { schemaVersion: 1, scene, sourceVersion: "a".repeat(64), status: "ready", sourceSession: createScriptSourceSession(source), savedSource: source, selectedStatementId: "statement_0" };
    render(<LazySequenceEditor page={page} busy={false} createCommandId={() => "unused"} onPage={vi.fn()} />);
    const sequence = screen.getByLabelText("局部 Sequence 编辑器");

    expect(within(sequence).getAllByRole("button", { name: /^选择旁白：/ })).toHaveLength(64);
    expect(within(sequence).getByText(/当前显示 1–64 \/ 150/)).toBeVisible();
    fireEvent.click(within(sequence).getByRole("button", { name: "下一组语句" }));
    expect(within(sequence).getByText(/当前显示 65–128 \/ 150/)).toBeVisible();
    expect(within(sequence).getAllByRole("button", { name: /^选择旁白：/ })).toHaveLength(64);
    fireEvent.click(within(sequence).getByRole("button", { name: "下一组语句" }));
    expect(within(sequence).getByText(/当前显示 129–150 \/ 150/)).toBeVisible();
    expect(within(sequence).getAllByRole("button", { name: /^选择旁白：/ })).toHaveLength(22);
  });
});
