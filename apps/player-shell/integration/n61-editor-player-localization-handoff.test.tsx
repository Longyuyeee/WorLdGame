import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, describe, expect, it, vi } from "vitest";
import { compileProject } from "@world-studio/project-compiler";
import type { CanonicalProject } from "@world-studio/project-domain";
import type { StoryProject } from "@world-studio/story-core";
import mediaGoldenSource from "../../../fixtures/projects/media/media-golden.json";
import { App } from "../../editor/src/App";
import { projectCanonicalFromStory } from "../../editor/src/canonical-project-adapter";
import { IndexedDbAssetRepository } from "../../editor/src/indexeddb-asset-repository";
import { addLocalizationTarget, updateLocalizationTranslation } from "../../editor/src/localization-production";
import { PlayerShell } from "../src/PlayerShell";
import type { PlayerMediaAssetSourceV1 } from "../src/player-presentation-adapter";

afterEach(() => vi.unstubAllGlobals());

const mediaById = new Map(mediaGoldenSource.assets.map((asset) => [asset.assetId, asset]));

function handoffProject(): CanonicalProject {
  const story: StoryProject = {
    schemaVersion: 0,
    id: "n61-editor-player-handoff",
    title: "N61 Editor Player Handoff",
    entrySceneId: "scene_entry",
    characters: [{ id: "character_guide", displayName: "Guide", color: "#ffffff" }],
    scenes: [{ id: "scene_entry", title: "Entry", statements: [
      { id: "scene_background", kind: "direction", command: "background", summary: "asset=base_scene action=set" },
      { id: "statement_hello", kind: "dialogue", speakerId: "character_guide", textId: "text_hello", text: "Welcome back." },
      { id: "scene_end", kind: "end", endingName: "Done" }
    ] }]
  };
  let project = projectCanonicalFromStory(story, story.id);
  project = addLocalizationTarget(project, "en", "zh-Hans");
  project = addLocalizationTarget(project, "en", "ja");
  project = updateLocalizationTranslation(project, "zh-Hans", "text_hello", "欢迎回来。", "reviewed");
  return updateLocalizationTranslation(project, "ja", "text_hello", "おかえりなさい。", "reviewed");
}

async function importAsset(fileName: string, assetId: string, kind: "cg" | "audio", fixtureId: "media_sunset" | "media_actor_sprite" | "media_theme") {
  const fixture = mediaById.get(fixtureId)!;
  const bytes = Uint8Array.from(atob(fixture.base64), (character) => character.charCodeAt(0));
  fireEvent.change(screen.getByLabelText("选择资源文件"), { target: { files: [new File([bytes], fileName, { type: fixture.mimeType })] } });
  fireEvent.change(screen.getByLabelText("资源 Asset ID"), { target: { value: assetId } });
  fireEvent.change(screen.getByLabelText("资源类型"), { target: { value: kind } });
  fireEvent.click(screen.getByRole("button", { name: "导入到资源保险库" }));
  await waitFor(() => expect(screen.getByText(new RegExp(`媒体检查通过.*${assetId}.*Index r`))).toBeVisible());
}

async function playerSources(indexedDB: IDBFactory, projectId: string): Promise<readonly PlayerMediaAssetSourceV1[]> {
  const repository = new IndexedDbAssetRepository(indexedDB, projectId);
  const index = await repository.loadIndex();
  return Promise.all(index.assets.map(async (entry) => {
    const bytes = await repository.read(entry.source.digest);
    if (bytes === null) throw new Error(`Missing imported Blob for ${entry.assetId}`);
    return {
      assetId: entry.assetId,
      displayName: entry.displayName,
      mimeType: entry.source.mimeType,
      url: `data:${entry.source.mimeType};base64,${Buffer.from(bytes).toString("base64")}`
    };
  }));
}

describe("N61-E7 Editor to Player localization handoff", () => {
  it("plays the exact Canonical and Blobs saved by Production without rebuilding locale mappings", async () => {
    const indexedDB = new IDBFactory();
    vi.stubGlobal("indexedDB", indexedDB);
    let savedProject: CanonicalProject | undefined;
    const editor = render(<App initialProject={handoffProject()} autosaveDebounceMs={60_000} onCanonicalProjectSave={async (project) => { savedProject = project; }} />);

    fireEvent.click(await screen.findByRole("radio", { name: "Production" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "打开资源生产流水线" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "打开资源生产流水线" }));
    await importAsset("Base Scene.png", "base_scene", "cg", "media_sunset");
    await importAsset("Chinese Scene.png", "chinese_scene", "cg", "media_actor_sprite");
    await importAsset("Voice English.wav", "voice_english", "audio", "media_theme");
    await importAsset("Voice Chinese.wav", "voice_chinese", "audio", "media_theme");
    fireEvent.click(screen.getByRole("button", { name: "关闭资源保险库" }));

    const production = screen.getByRole("region", { name: "语言媒体与配音" });
    fireEvent.change(within(production).getByRole("combobox", { name: "媒体与配音语言" }), { target: { value: "en" } });
    const englishVoice = within(production).getByText("text_hello").closest("tr")!;
    fireEvent.change(within(englishVoice).getByRole("combobox", { name: "text_hello 的 en 配音资源" }), { target: { value: "voice_english" } });
    fireEvent.click(within(englishVoice).getByRole("button", { name: "绑定 text_hello 的 en 配音" }));

    fireEvent.change(within(production).getByRole("combobox", { name: "媒体与配音语言" }), { target: { value: "zh-Hans" } });
    const chineseVoice = within(production).getByText("text_hello").closest("tr")!;
    fireEvent.change(within(chineseVoice).getByRole("combobox", { name: "text_hello 的 zh-Hans 配音资源" }), { target: { value: "voice_chinese" } });
    fireEvent.click(within(chineseVoice).getByRole("button", { name: "绑定 text_hello 的 zh-Hans 配音" }));
    const chineseVisual = within(production).getByText("base_scene").closest("tr")!;
    fireEvent.change(within(chineseVisual).getByRole("combobox", { name: "base_scene 的 zh-Hans 语言资源" }), { target: { value: "chinese_scene" } });
    fireEvent.click(within(chineseVisual).getByRole("button", { name: "绑定 base_scene 的 zh-Hans 资源" }));
    fireEvent.click(screen.getByRole("button", { name: "保存到本机" }));
    await waitFor(() => expect(savedProject).toBeDefined());

    const compilation = compileProject(savedProject!);
    expect(compilation.ok).toBe(true);
    if (!compilation.ok) throw new Error("Saved Production project did not compile");
    expect(compilation.artifacts.assetManifest.assets).toEqual(expect.arrayContaining([
      expect.objectContaining({ assetId: "voice_chinese", voiceTextId: "text_hello", locale: "zh-Hans" }),
      expect.objectContaining({ assetId: "chinese_scene", localeVariantOf: "base_scene", locale: "zh-Hans" })
    ]));
    expect(compilation.artifacts.catalogs.localization).toEqual(expect.arrayContaining([expect.objectContaining({ locale: "zh-Hans" }), expect.objectContaining({ locale: "ja" })]));
    const sources = await playerSources(indexedDB, savedProject!.manifest.projectId);

    editor.unmount();
    const { container } = render(<PlayerShell project={savedProject!} mediaAssets={sources} />);
    fireEvent.click(screen.getByRole("button", { name: /开始故事/u }));
    expect(await screen.findByText("Welcome back.")).toBeVisible();
    expect(container.querySelector('audio[data-asset-id="voice_english"]')).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: "显示语言" }), { target: { value: "zh-Hans" } });
    expect(screen.getByText("欢迎回来。")).toBeVisible();
    expect(container.querySelector('img[data-asset-id="base_scene"]')).toHaveAttribute("src", expect.stringContaining(mediaById.get("media_actor_sprite")!.base64));
    expect(container.querySelector('audio[data-asset-id="voice_chinese"]')).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: "显示语言" }), { target: { value: "ja" } });
    expect(screen.getByText("おかえりなさい。")).toBeVisible();
    expect(container.querySelector('img[data-asset-id="base_scene"]')).toHaveAttribute("src", expect.stringContaining(mediaById.get("media_sunset")!.base64));
    expect(container.querySelector('audio[data-asset-id="voice_english"]')).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "语言资源状态" })).toHaveTextContent("ja 缺少 2 个语言资源");
  }, 30_000);
});
