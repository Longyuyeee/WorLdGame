import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { compileProject } from "@world-studio/project-compiler";
import { createProjectTemplate, type CanonicalProject } from "@world-studio/project-domain";
import { createAssetLifecycleManifest, type AssetIndex } from "@world-studio/project-persistence";
import { ProductionWorkspace } from "./ProductionWorkspace";
import { localizationSourceEntries } from "./localization-production";

const DIGEST = `sha256:${"a".repeat(64)}` as const;

function fixture(): { project: CanonicalProject; index: AssetIndex } {
  const base = createProjectTemplate("N62 authoring", "n62-additional-content-authoring-app");
  const sceneId = base.manifest.entrySceneId;
  const assets = [
    { assetId: "sunset", kind: "cg" as const, displayName: "Sunset", source: { digest: DIGEST, byteLength: 10, mimeType: "image/png" }, tags: [] },
    { assetId: "theme", kind: "audio" as const, displayName: "Theme", source: { digest: `sha256:${"b".repeat(64)}` as const, byteLength: 10, mimeType: "audio/wav" }, tags: [] }
  ];
  return {
    index: { schemaVersion: 1, indexRevision: 1, assets },
    project: {
      ...base,
      assets: { ...base.assets, assets: assets.map((entry) => ({ assetId: entry.assetId, kind: entry.kind, displayName: entry.displayName, source: entry.source })) },
      scripts: { ...base.scripts, [sceneId]: { ...base.scripts[sceneId]!, statements: [
        { id: "show_sunset", kind: "direction", command: "background", summary: "asset=sunset action=set" },
        { id: "play_theme", kind: "direction", command: "audio", summary: "asset=theme action=play bus=bgm" },
        { id: "ending", kind: "end", endingName: "Ending" }
      ] } }
    }
  };
}

describe("N62 additional-content authoring", () => {
  it("lets an author change player presentation without hand-maintaining catalog membership", () => {
    const initial = fixture();
    let latest = initial.project;
    function Harness() {
      const [project, setProject] = useState(initial.project);
      return <ProductionWorkspace project={project} index={initial.index} lifecycle={createAssetLifecycleManifest(initial.index, 0)} dicingReport={null} storageStatus="ready" onOpenPipeline={() => undefined} onProjectChange={(next) => { latest = next; setProject(next); }} />;
    }
    render(<Harness />);
    expect(screen.getByRole("heading", { name: "附加内容展示" })).toBeVisible();
    expect(screen.getByText("4 项由剧情自动生成 · 3 项缺少缩略图")).toBeVisible();

    const title = screen.getByLabelText(`${initial.project.manifest.entrySceneId} 的玩家显示名称`);
    fireEvent.change(title, { target: { value: "黄昏回想" } });
    fireEvent.blur(title);
    fireEvent.change(screen.getByLabelText(`${initial.project.manifest.entrySceneId} 的封面`), { target: { value: "sunset" } });
    fireEvent.click(screen.getByLabelText(`${initial.project.manifest.entrySceneId} 解锁前显示标题`));

    const compiled = compileProject(latest, "release");
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    expect(compiled.artifacts.catalogs.replay[0]).toMatchObject({ title: "黄昏回想", coverAssetId: "sunset", revealBeforeUnlock: true });
    expect(compiled.artifacts.catalogs.gallery.map((entry) => entry.assetId)).toEqual(["sunset"]);
    expect(localizationSourceEntries(latest)).toContainEqual(expect.objectContaining({ key: initial.project.manifest.entrySceneId, sourceText: "黄昏回想", kind: "replay-title" }));
  });
});
