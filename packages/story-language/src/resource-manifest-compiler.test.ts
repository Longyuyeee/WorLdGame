import { describe, expect, it } from "vitest";
import { campusStoryProject } from "@world-studio/story-core";
import { parseStory } from "./parser";
import { projectStoryScene } from "./projection";
import { compileSceneResourceManifest } from "./resource-manifest-compiler";

const documents = {
  scn_school_gate: parseStory(`scene "放学后的校门" @id(scn_school_gate)\n@background asset=bg_gate transition=fade @id(stmt_gate_bg)\nchar_xia: line @sid(stmt_gate_001) @id(txt_gate_001)\nchar_yu: line @sid(stmt_gate_002) @id(txt_gate_002)\nchoice "next" @id(stmt_gate_choice)\n  "radio" -> scn_broadcast_room @id(opt_broadcast)\n  "roof" -> scn_rooftop @id(opt_rooftop)\n`),
  scn_broadcast_room: parseStory(`scene "旧广播室" @id(scn_broadcast_room)\n@show asset=char_xia_smile expression=smile position=center transitionAsset=fx_fade @id(stmt_radio_bg)\n@audio asset=voice_radio_001 bus=voice loop=false @id(stmt_radio_001)\nend "end" @id(stmt_radio_end)\n`),
  scn_rooftop: parseStory(`scene "风中的天台" @id(scn_rooftop)\n@background asset=bg_roof future=value @id(stmt_rooftop_bg)\n@audio asset=bgm_roof bus=bgm loop=true @id(stmt_rooftop_001)\nend "end" @id(stmt_rooftop_end)\n`)
};
const compiledProject = {
  ...campusStoryProject,
  scenes: campusStoryProject.scenes.map((scene) => {
    const result = projectStoryScene(documents[scene.id as keyof typeof documents]);
    if (!result.ok) throw new Error(result.diagnostics[0]?.message);
    return result.scene;
  })
};

describe("S0.30 typed direction resource manifest compiler", () => {
  it("compiles background, character, voice, BGM and transition dependencies deterministically", () => {
    const result = compileSceneResourceManifest(compiledProject, documents, { knownAssetIds: [
      "bg_gate", "char_xia_smile", "fx_fade", "voice_radio_001", "bg_roof", "bgm_roof"
    ] });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.diagnostics[0]?.message);
    expect(result.compilation.manifest).toEqual({ schemaVersion: 1, scenes: [
      { sceneId: "scn_school_gate", assetIds: ["bg_gate"] },
      { sceneId: "scn_broadcast_room", assetIds: ["char_xia_smile", "fx_fade", "voice_radio_001"] },
      { sceneId: "scn_rooftop", assetIds: ["bg_roof", "bgm_roof"] }
    ] });
    expect(result.compilation.timelines[1]?.statements[0]).toEqual({ statementId: "stmt_radio_bg",
      requiredAssetIds: ["char_xia_smile", "fx_fade"], nextAssetIds: ["char_xia_smile", "voice_radio_001"] });
    expect(result.compilation.diagnostics).toContainEqual(expect.objectContaining({ code: "UNKNOWN_RESOURCE_PARAMETER", severity: "warning" }));
  });

  it("compiles cumulative resource windows for set, show, move, hide, pause, resume, stop and clear", () => {
    const document = parseStory(`scene "controls" @id(scn_controls)
@background action=set asset=bg @id(bg)
@show action=show asset=hero slot=left z=2 @id(show_left)
@show action=move slot=left x=80 duration=300ms @id(move_left)
@audio action=play asset=theme bus=bgm @id(play)
@audio action=pause bus=bgm @id(pause)
@audio action=resume bus=bgm @id(resume)
@show action=hide slot=left @id(hide_left)
@audio action=stop bus=bgm @id(stop)
@background action=clear @id(clear)
end "done" @id(end)
`);
    const projected = projectStoryScene(document);
    if (!projected.ok) throw new Error(projected.diagnostics[0]?.message);
    const result = compileSceneResourceManifest({ ...campusStoryProject, scenes: [projected.scene] }, { scn_controls: document }, { knownAssetIds: ["bg", "hero", "theme"] });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.diagnostics[0]?.message);
    expect(result.compilation.manifest.scenes[0]?.assetIds).toEqual(["bg", "hero", "theme"]);
    expect(result.compilation.timelines[0]?.statements.map((statement) => statement.requiredAssetIds)).toEqual([
      ["bg"], ["bg", "hero"], ["bg", "hero"], ["bg", "hero", "theme"], ["bg", "hero", "theme"],
      ["bg", "hero", "theme"], ["bg", "theme"], ["bg"], [], []
    ]);
  });

  it("fails closed when move has no geometry, carries a resource, or targets an inactive slot", () => {
    const document = parseStory(`scene "invalid move" @id(scn_move)
@show action=move slot=missing x=80 @id(missing)
@show action=show asset=hero slot=hero @id(show)
@show action=move slot=hero asset=stale @id(resource)
@show action=move slot=hero @id(empty)
end "done" @id(end)
`);
    const projected = projectStoryScene(document);
    if (!projected.ok) throw new Error(projected.diagnostics[0]?.message);
    const result = compileSceneResourceManifest({ ...campusStoryProject, scenes: [projected.scene] }, { scn_move: document }, { knownAssetIds: ["hero"] });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected invalid move compilation");
    expect(result.diagnostics.map((item) => item.code)).toEqual(expect.arrayContaining([
      "MISSING_STAGE_TARGET", "INVALID_ACTION_PARAMETER", "EMPTY_STAGE_MOVE"
    ]));
  });

  it("rejects invalid action, slot and z-order values", () => {
    const document = parseStory(`scene "invalid" @id(scn_invalid)
@background action=hide @id(bg)
@show action=show asset=hero slot=bad/slot z=101 @id(show)
end "done" @id(end)
`);
    const projected = projectStoryScene(document);
    if (!projected.ok) throw new Error(projected.diagnostics[0]?.message);
    const result = compileSceneResourceManifest({ ...campusStoryProject, scenes: [projected.scene] }, { scn_invalid: document }, { knownAssetIds: ["hero"] });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected compilation failure");
    expect(result.diagnostics.map((item) => item.code)).toEqual(expect.arrayContaining(["INVALID_ACTION", "INVALID_STAGE_SLOT", "INVALID_STAGE_Z"]));
  });

  it("accepts bounded Stage geometry and rejects values outside production ranges", () => {
    const valid = parseStory(`scene "valid geometry" @id(scn_geometry)
@show asset=hero slot=primary x=27.5 y=91 scale=1.25 rotation=-8 anchorX=0.4 anchorY=0.95 @id(show)
end "done" @id(end)
`);
    const validScene = projectStoryScene(valid);
    if (!validScene.ok) throw new Error(validScene.diagnostics[0]?.message);
    expect(compileSceneResourceManifest({ ...campusStoryProject, scenes: [validScene.scene] }, { scn_geometry: valid }, { knownAssetIds: ["hero"] }).ok).toBe(true);

    const invalid = parseStory(`scene "invalid geometry" @id(scn_geometry)
@show asset=hero x=101 scale=0 rotation=361 anchorY=1.1 @id(show)
end "done" @id(end)
`);
    const invalidScene = projectStoryScene(invalid);
    if (!invalidScene.ok) throw new Error(invalidScene.diagnostics[0]?.message);
    const result = compileSceneResourceManifest({ ...campusStoryProject, scenes: [invalidScene.scene] }, { scn_geometry: invalid }, { knownAssetIds: ["hero"] });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected invalid Stage geometry");
    expect(result.diagnostics.filter((item) => item.code === "INVALID_STAGE_GEOMETRY")).toHaveLength(4);
  });

  it("fails closed for positional text, missing assets, invalid buses, duplicates and unknown Asset Index entries", () => {
    const broken = { ...documents, scn_school_gate: parseStory(`scene "gate" @id(scn_school_gate)\n@audio old_name asset=missing asset=again bus=music loop=yes volume=2 fade=fast @id(stmt_gate_bg)\n@audio asset=voice bus=music loop=yes @id(stmt_gate_audio)\n`) };
    const result = compileSceneResourceManifest(compiledProject, broken, { knownAssetIds: ["voice"] });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected compilation failure");
    expect(result.diagnostics.map((item) => item.code)).toEqual(expect.arrayContaining([
      "UNTYPED_RESOURCE_REFERENCE", "DUPLICATE_PARAMETER", "UNKNOWN_ASSET", "INVALID_AUDIO_BUS", "INVALID_BOOLEAN",
      "INVALID_VOLUME", "INVALID_DURATION", "STATEMENT_SEMANTICS_MISMATCH"
    ]));
  });

  it("rejects missing, unexpected and mismatched scene documents", () => {
    const result = compileSceneResourceManifest(compiledProject, {
      scn_school_gate: documents.scn_broadcast_room,
      unexpected: documents.scn_rooftop
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected compilation failure");
    expect(result.diagnostics.map((item) => item.code)).toEqual(expect.arrayContaining([
      "SCENE_ID_MISMATCH", "UNEXPECTED_SCENE_DOCUMENT", "MISSING_SCENE_DOCUMENT"
    ]));
  });
});
