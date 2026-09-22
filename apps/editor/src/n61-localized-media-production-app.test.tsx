import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CanonicalProject } from "@world-studio/project-domain";
import type { StoryProject } from "@world-studio/story-core";
import mediaGoldenSource from "../../../fixtures/projects/media/media-golden.json";
import { App } from "./App";
import { projectCanonicalFromStory } from "./canonical-project-adapter";
import { addLocalizationTarget } from "./localization-production";

afterEach(() => vi.unstubAllGlobals());

const mediaById = new Map(mediaGoldenSource.assets.map((asset) => [asset.assetId, asset]));

function productionProject(): CanonicalProject {
  const story: StoryProject = {
    schemaVersion: 0,
    id: "n61-media-production",
    title: "N61 Media Production",
    entrySceneId: "scene_entry",
    characters: [{ id: "character_guide", displayName: "Guide", color: "#ffffff" }],
    scenes: [{ id: "scene_entry", title: "Entry", statements: [
      { id: "scene_background", kind: "direction", command: "background", summary: "asset=base_scene action=set" },
      { id: "statement_hello", kind: "dialogue", speakerId: "character_guide", textId: "text_hello", text: "Welcome back." },
      { id: "scene_end", kind: "end", endingName: "Done" }
    ] }]
  };
  return addLocalizationTarget(projectCanonicalFromStory(story, "n61-media-production"), "en", "zh-Hans");
}

async function importAsset(fileName: string, assetId: string, kind: "cg" | "audio", fixtureId: "media_sunset" | "media_theme") {
  const fixture = mediaById.get(fixtureId)!;
  const bytes = Uint8Array.from(atob(fixture.base64), (character) => character.charCodeAt(0));
  fireEvent.change(screen.getByLabelText("选择资源文件"), {
    target: { files: [new File([bytes], fileName, { type: fixture.mimeType })] }
  });
  expect(screen.getByLabelText("资源 Asset ID")).toHaveValue(assetId);
  fireEvent.change(screen.getByLabelText("资源类型"), { target: { value: kind } });
  fireEvent.click(screen.getByRole("button", { name: "导入到资源保险库" }));
  await waitFor(() => expect(screen.getByText(new RegExp(`媒体检查通过.*${assetId}.*Index r`))).toBeVisible());
}

describe("N61-E6 localized media production", () => {
  it("imports real files, binds locale media and voice by stable IDs, then saves and reopens them", async () => {
    vi.stubGlobal("indexedDB", new IDBFactory());
    let savedProject: CanonicalProject | undefined;
    const session = render(<App
      initialProject={productionProject()}
      autosaveDebounceMs={60_000}
      onCanonicalProjectSave={async (project) => { savedProject = project; }}
    />);

    fireEvent.click(await screen.findByRole("radio", { name: "Production" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "打开资源生产流水线" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "打开资源生产流水线" }));
    await importAsset("Base Scene.png", "base_scene", "cg", "media_sunset");
    await importAsset("Chinese Scene.png", "chinese_scene", "cg", "media_sunset");
    await importAsset("Voice English.wav", "voice_english", "audio", "media_theme");
    await importAsset("Voice Chinese.wav", "voice_chinese", "audio", "media_theme");
    fireEvent.click(screen.getByRole("button", { name: "关闭资源保险库" }));

    const production = screen.getByRole("region", { name: "语言媒体与配音" });
    fireEvent.change(within(production).getByRole("combobox", { name: "媒体与配音语言" }), { target: { value: "en" } });
    const sourceVoiceRow = within(production).getByText("text_hello").closest("tr")!;
    expect(sourceVoiceRow.querySelector('[data-status="missing"]')).toHaveTextContent("缺失");
    fireEvent.change(within(sourceVoiceRow).getByRole("combobox", { name: "text_hello 的 en 配音资源" }), { target: { value: "voice_english" } });
    fireEvent.click(within(sourceVoiceRow).getByRole("button", { name: "绑定 text_hello 的 en 配音" }));

    fireEvent.change(within(production).getByRole("combobox", { name: "媒体与配音语言" }), { target: { value: "zh-Hans" } });
    const targetVoiceRow = within(production).getByText("text_hello").closest("tr")!;
    expect(targetVoiceRow.querySelector('[data-status="missing"]')).toHaveTextContent("缺失");
    fireEvent.change(within(targetVoiceRow).getByRole("combobox", { name: "text_hello 的 zh-Hans 配音资源" }), { target: { value: "voice_chinese" } });
    fireEvent.click(within(targetVoiceRow).getByRole("button", { name: "绑定 text_hello 的 zh-Hans 配音" }));
    fireEvent.change(within(targetVoiceRow).getByRole("combobox", { name: "text_hello 的 zh-Hans 配音状态" }), { target: { value: "reviewed" } });

    const visualRow = within(production).getByText("base_scene").closest("tr")!;
    expect(visualRow.querySelector('[data-status="missing"]')).toHaveTextContent("缺失");
    fireEvent.change(within(visualRow).getByRole("combobox", { name: "base_scene 的 zh-Hans 语言资源" }), { target: { value: "chinese_scene" } });
    fireEvent.click(within(visualRow).getByRole("button", { name: "绑定 base_scene 的 zh-Hans 资源" }));
    expect(within(production).getByRole("status")).toHaveTextContent("已绑定 chinese_scene");

    fireEvent.click(screen.getByRole("button", { name: "保存到本机" }));
    await waitFor(() => expect(savedProject).toBeDefined());
    expect(savedProject!.assets.assets).toEqual(expect.arrayContaining([
      expect.objectContaining({ assetId: "voice_english", voiceTextId: "text_hello", locale: "en" }),
      expect.objectContaining({ assetId: "voice_chinese", voiceTextId: "text_hello", locale: "zh-Hans", localizationStatus: "reviewed" }),
      expect.objectContaining({ assetId: "chinese_scene", localeVariantOf: "base_scene", locale: "zh-Hans" })
    ]));

    session.unmount();
    render(<App initialProject={savedProject!} autosaveDebounceMs={60_000} />);
    fireEvent.click(await screen.findByRole("radio", { name: "Production" }));
    const reopened = await screen.findByRole("region", { name: "语言媒体与配音" });
    fireEvent.change(within(reopened).getByRole("combobox", { name: "媒体与配音语言" }), { target: { value: "zh-Hans" } });
    expect(within(reopened).getByRole("combobox", { name: "text_hello 的 zh-Hans 配音资源" })).toHaveValue("voice_chinese");
    expect(within(reopened).getByRole("combobox", { name: "text_hello 的 zh-Hans 配音状态" })).toHaveValue("reviewed");
    expect(within(reopened).getByRole("combobox", { name: "base_scene 的 zh-Hans 语言资源" })).toHaveValue("chinese_scene");
  }, 30_000);
});
