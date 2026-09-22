import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { utils, write } from "xlsx";
import type { CanonicalProject } from "@world-studio/project-domain";
import type { StoryProject } from "@world-studio/story-core";
import { App } from "./App";
import { projectCanonicalFromStory } from "./canonical-project-adapter";

function localizationGoldenProject(): StoryProject {
  return {
    schemaVersion: 0,
    id: "n61-localization-golden",
    title: "N61 Localization Golden",
    entrySceneId: "scene_entry",
    characters: [{ id: "character_guide", displayName: "Guide", color: "#ffffff" }],
    scenes: [{
      id: "scene_entry",
      title: "Entry",
      statements: [
        { id: "statement_hello", kind: "dialogue", speakerId: "character_guide", textId: "text_hello", text: "欢迎回来。" },
        { id: "statement_hint", kind: "narration", textId: "text_hint", text: "雨还在下。" },
        {
          id: "statement_route",
          kind: "choice",
          prompt: "要去哪里？",
          options: [
            { id: "option_station", label: "车站", targetSceneId: "scene_entry" },
            { id: "option_home", label: "回家", targetSceneId: "scene_entry" }
          ]
        }
      ]
    }]
  };
}

describe("N61-E1 Localization production path", () => {
  it("creates a target locale, persists a reviewed translation, and detects changed source text", () => {
    const project = projectCanonicalFromStory(localizationGoldenProject(), "n61-e1-localization-golden");
    let changedProject: CanonicalProject | undefined;
    const first = render(<App initialProject={project} autosaveDebounceMs={60_000} onCanonicalProjectChange={(changed) => { changedProject = changed; }} />);

    fireEvent.click(screen.getByRole("radio", { name: "Production" }));
    const localization = screen.getByRole("region", { name: "本地化生产" });
    expect(within(localization).getByText("5 个稳定文本键")).toBeVisible();
    fireEvent.change(within(localization).getByRole("textbox", { name: "源语言" }), { target: { value: "zh-Hans" } });
    fireEvent.change(within(localization).getByRole("textbox", { name: "新目标语言" }), { target: { value: "not a locale" } });
    fireEvent.click(within(localization).getByRole("button", { name: "添加目标语言" }));
    expect(within(localization).getByRole("status")).toHaveTextContent("语言代码无效");
    fireEvent.change(within(localization).getByRole("textbox", { name: "新目标语言" }), { target: { value: "en" } });
    fireEvent.click(within(localization).getByRole("button", { name: "添加目标语言" }));

    const helloRow = within(localization).getByText("text_hello").closest("tr");
    expect(helloRow).not.toBeNull();
    expect(within(helloRow!).getByText("缺失")).toBeVisible();
    fireEvent.change(within(helloRow!).getByRole("textbox", { name: "text_hello 的 en 翻译" }), { target: { value: "Welcome back." } });
    fireEvent.change(within(helloRow!).getByRole("combobox", { name: "text_hello 的状态" }), { target: { value: "reviewed" } });
    expect(helloRow!.querySelector('[data-status="reviewed"]')).toHaveTextContent("已审阅");
    expect(changedProject?.manifest.defaultLocale).toBe("zh-Hans");

    first.unmount();
    const changedSource: CanonicalProject = {
      ...changedProject!,
      scripts: {
        ...changedProject!.scripts,
        scene_entry: {
          ...changedProject!.scripts.scene_entry!,
          statements: changedProject!.scripts.scene_entry!.statements.map((statement) => statement.id === "statement_hello"
            ? { ...statement, text: "欢迎再次回来。" }
            : statement)
        }
      }
    };
    render(<App initialProject={changedSource} autosaveDebounceMs={60_000} />);
    fireEvent.click(screen.getByRole("radio", { name: "Production" }));
    const reopened = screen.getByRole("region", { name: "本地化生产" });
    expect(within(reopened).getByDisplayValue("Welcome back.")).toBeVisible();
    const reopenedHelloRow = within(reopened).getByText("text_hello").closest("tr");
    expect(reopenedHelloRow).not.toBeNull();
    expect(within(reopenedHelloRow!).getByText("已过期")).toBeVisible();
  });

  it("blocks a duplicate CSV and applies a real XLSX only after difference preview", async () => {
    const project = projectCanonicalFromStory(localizationGoldenProject(), "n61-e2-localization-exchange");
    let changedProject: CanonicalProject | undefined;
    const session = render(<App initialProject={project} autosaveDebounceMs={60_000} onCanonicalProjectChange={(changed) => { changedProject = changed; }} />);
    fireEvent.click(screen.getByRole("radio", { name: "Production" }));
    const localization = screen.getByRole("region", { name: "本地化生产" });
    fireEvent.change(within(localization).getByRole("textbox", { name: "源语言" }), { target: { value: "zh-Hans" } });
    fireEvent.change(within(localization).getByRole("textbox", { name: "新目标语言" }), { target: { value: "en" } });
    fireEvent.click(within(localization).getByRole("button", { name: "添加目标语言" }));

    const duplicateCsv = [
      "key,source_locale,target_locale,source_text,translation,status,scene_id,statement_id,kind",
      "text_hello,zh-Hans,en,欢迎回来。,Welcome back.,reviewed,scene_entry,statement_hello,dialogue",
      "text_hello,zh-Hans,en,欢迎回来。,Duplicate,reviewed,scene_entry,statement_hello,dialogue"
    ].join("\r\n");
    fireEvent.change(within(localization).getByLabelText("导入 CSV 或 XLSX"), {
      target: { files: [new File([duplicateCsv], "duplicate.csv", { type: "text/csv" })] }
    });
    const blockedPreview = await within(localization).findByRole("region", { name: "翻译导入预览" });
    expect(within(blockedPreview).getByText(/重复稳定键 text_hello/)).toBeVisible();
    expect(within(blockedPreview).getByRole("button", { name: "确认写入 0 项" })).toBeDisabled();

    const sheet = utils.aoa_to_sheet([
      ["key", "source_locale", "target_locale", "source_text", "translation", "status", "scene_id", "statement_id", "kind"],
      ["text_hello", "zh-Hans", "en", "欢迎回来。", "Welcome back.\nGood to see you.", "reviewed", "scene_entry", "statement_hello", "dialogue"]
    ]);
    const workbook = utils.book_new();
    utils.book_append_sheet(workbook, sheet, "Localization");
    const workbookBytes = write(workbook, { type: "array", bookType: "xlsx" });
    fireEvent.change(within(localization).getByLabelText("导入 CSV 或 XLSX"), {
      target: { files: [new File([workbookBytes], "translations.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })] }
    });

    const readyPreview = await within(localization).findByRole("region", { name: "翻译导入预览" });
    await waitFor(() => expect(within(readyPreview).getByText("1 项更新 · 0 项不变 · 0 项错误")).toBeVisible());
    expect(within(readyPreview).getByText(/Welcome back./)).toBeVisible();
    fireEvent.click(within(readyPreview).getByRole("button", { name: "确认写入 1 项" }));
    expect(within(localization).getByRole("textbox", { name: "text_hello 的 en 翻译" })).toHaveValue("Welcome back.\nGood to see you.");
    expect(changedProject).toBeDefined();
    expect(changedProject!.localization.locales[0]).toMatchObject({ locale: "en" });

    session.unmount();
    render(<App initialProject={changedProject!} autosaveDebounceMs={60_000} />);
    fireEvent.click(screen.getByRole("radio", { name: "Production" }));
    expect(screen.getByRole("textbox", { name: "text_hello 的 en 翻译" })).toHaveValue("Welcome back.\nGood to see you.");
  }, 30_000);
});
