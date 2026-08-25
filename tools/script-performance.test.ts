import { describe, expect, it } from "vitest";
import {
  compileSceneResourceManifest,
  createIncrementalStoryState,
  inspectDirectiveBatch,
  parseStory,
  patchDirectiveBatch,
  patchDialogueText,
  projectStoryScene,
  updateIncrementalStoryLine
} from "@world-studio/story-language";
import { predictStoryResources, type StoryProject } from "@world-studio/story-core";
import { compilePreviewStageTimeline } from "../apps/editor/src/preview-media-runtime";
import { createProjectSearchIndex, searchProjectIndex } from "../apps/editor/src/project-search";
import { selectStageDirectionLane, selectStageDirectionRange } from "../apps/editor/src/stage-selection";
import { createStageSearchIndex, searchStageIndex } from "../apps/editor/src/stage-search";
import { createStageWindow, moveStageWindow, revealStageIndex } from "../apps/editor/src/stage-window";
import { projectStageTimeline } from "../apps/editor/src/stage-timeline";
import { defaultStageMotionPathDraft, planStageMotionPath } from "../apps/editor/src/stage-motion-path";
import type { StageMoveKeyframeSeed } from "../apps/editor/src/stage-keyframe";

const dialogueCount = 10_000;
const budgets = {
  parseMs: 4_000,
  projectionMs: 4_000,
  patchLastDialogueMs: 8_000,
  totalMs: 12_000
};

describe("large script performance audit", () => {
  it("updates one line in a 100k-line N20 document within the incremental budget", () => {
    const lineCount=100_000,source=`scene "N20 Large" @id(scene_n20_large)\n${Array.from({length:lineCount-2},(_,index)=>`narrate "Line ${index}" @sid(statement_n20_${index}) @id(text_n20_${index})`).join("\n")}\nend "Done" @id(statement_n20_end)\n`;
    const initialStart=performance.now(),state=createIncrementalStoryState(source),initialParseMs=performance.now()-initialStart,targetLine=50_000;
    const updateStart=performance.now(),changed=updateIncrementalStoryLine(state,targetLine,`narrate "Changed" @sid(statement_n20_${targetLine-1}) @id(text_n20_${targetLine-1})`),incrementalUpdateMs=performance.now()-updateStart;
    console.log(JSON.stringify({status:"PASS",baseline:{lineCount,sourceBytes:new TextEncoder().encode(source).byteLength},measurementsMs:{initialParse:Number(initialParseMs.toFixed(2)),incrementalUpdate:Number(incrementalUpdateMs.toFixed(2))},budgetsMs:{initialParse:6000,incrementalUpdate:2000},result:{changedKind:changed.storyDocument.nodes[targetLine]?.kind,needsFullValidation:changed.needsFullValidation}},null,2));
    expect(state.storyDocument.nodes).toHaveLength(lineCount);expect(changed.storyDocument.nodes[targetLine]).toMatchObject({kind:"narration",textRaw:"\"Changed\""});expect(initialParseMs).toBeLessThan(6000);expect(incrementalUpdateMs).toBeLessThan(2000);
  });
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

  it("predicts resources across a 10k-scene Story Graph within budget", () => {
    const sceneCount = 10_000;
    const scenes = Array.from({ length: sceneCount }, (_, index) => ({
      id: `scene_${index}`,
      title: `Scene ${index}`,
      statements: index >= sceneCount - 1 ? [{ id: `end_${index}`, kind: "end" as const, endingName: "End" }] : [{
        id: `choice_${index}`,
        kind: "choice" as const,
        prompt: "Next",
        options: [{ id: `option_${index}`, label: "Continue", targetSceneId: `scene_${index + 1}` }]
      }]
    }));
    const project: StoryProject = { schemaVersion: 0, id: "prediction_benchmark", title: "Prediction Benchmark",
      characters: [], scenes, entrySceneId: "scene_0" };
    const manifest = { schemaVersion: 1 as const, scenes: scenes.map((scene, index) => ({
      sceneId: scene.id, assetIds: [`scene_asset_${index}`, "shared_runtime_ui"]
    })) };
    const start = performance.now();
    const prediction = predictStoryResources(project, manifest, "scene_5000", { rollbackSceneIds: ["scene_4999"] });
    const predictionMs = performance.now() - start;
    console.log(JSON.stringify({ status: "PASS", baseline: { sceneCount, manifestEntries: manifest.scenes.length },
      measurementsMs: { storyGraphResourcePrediction: Number(predictionMs.toFixed(2)) },
      budgetsMs: { storyGraphResourcePrediction: 2_000 },
      result: { outgoingScenes: prediction.outgoingSceneIds.length, resources: prediction.resources.length } }, null, 2));
    expect(prediction.resources).toContainEqual(expect.objectContaining({ assetId: "scene_asset_5000", role: "current" }));
    expect(prediction.resources).toContainEqual(expect.objectContaining({ assetId: "scene_asset_4999", role: "rollback" }));
    expect(prediction.resources).toContainEqual(expect.objectContaining({ assetId: "scene_asset_5001", role: "prefetch" }));
    expect(predictionMs).toBeLessThan(2_000);
  });

  it("compiles ten thousand typed scene resource documents within budget", () => {
    const sceneCount = 10_000;
    const scenes = Array.from({ length: sceneCount }, (_, index) => ({
      id: `compiled_scene_${index}`,
      title: `Compiled Scene ${index}`,
      statements: [
        { id: `compiled_bg_${index}`, kind: "direction" as const, command: "background" as const, summary: `asset=compiled_asset_${index}` },
        { id: `compiled_end_${index}`, kind: "end" as const, endingName: "End" }
      ]
    }));
    const project: StoryProject = { schemaVersion: 0, id: "compiler_benchmark", title: "Compiler Benchmark",
      characters: [], scenes, entrySceneId: scenes[0]!.id };
    const documents = Object.fromEntries(scenes.map((scene, index) => [scene.id, parseStory(
      `scene "${scene.title}" @id(${scene.id})\n@background asset=compiled_asset_${index} transition=fade @id(compiled_bg_${index})\nend "End" @id(compiled_end_${index})\n`
    )]));
    const knownAssetIds = Array.from({ length: sceneCount }, (_, index) => `compiled_asset_${index}`);
    const start = performance.now();
    const result = compileSceneResourceManifest(project, documents, { knownAssetIds });
    const compilationMs = performance.now() - start;
    console.log(JSON.stringify({ status: "PASS", baseline: { sceneCount, documents: Object.keys(documents).length },
      measurementsMs: { typedResourceManifestCompilation: Number(compilationMs.toFixed(2)) },
      budgetsMs: { typedResourceManifestCompilation: 2_000 },
      result: { ok: result.ok, manifestScenes: result.ok ? result.compilation.manifest.scenes.length : 0 } }, null, 2));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.diagnostics[0]?.message);
    expect(result.compilation.manifest.scenes).toHaveLength(sceneCount);
    expect(result.compilation.timelines).toHaveLength(sceneCount);
    expect(compilationMs).toBeLessThan(2_000);
  });

  it("compiles a ten-thousand-step cumulative Preview timeline once within budget", () => {
    const statementCount = 10_000;
    const statements = Array.from({ length: statementCount }, (_, index) => index % 100 === 0
      ? { id: `preview_bg_${index}`, kind: "direction" as const, command: "background" as const, summary: `asset=background_${index} transition=fade duration=300ms` }
      : { id: `preview_line_${index}`, kind: "dialogue" as const, speakerId: "hero", textId: `preview_text_${index}`, text: `Line ${index}` });
    const start = performance.now();
    const timeline = compilePreviewStageTimeline(statements);
    const compilationMs = performance.now() - start;
    console.log(JSON.stringify({ status: "PASS", baseline: { statementCount }, measurementsMs: {
      cumulativePreviewTimelineCompilation: Number(compilationMs.toFixed(2)) }, budgetsMs: {
      cumulativePreviewTimelineCompilation: 2_000 }, result: { plans: timeline.length,
      finalBackground: timeline.at(-1)?.background?.assetId } }, null, 2));
    expect(timeline).toHaveLength(statementCount);
    expect(timeline.at(-1)?.background?.assetId).toBe("background_9900");
    expect(compilationMs).toBeLessThan(2_000);
  });

  it("projects a ten-thousand-step authoring time ruler within budget", () => {
    const statementCount = 10_000;
    const statements = Array.from({ length: statementCount }, (_, index) => index % 4 === 0
      ? { id: `timeline_move_${index}`, kind: "direction" as const, command: "show" as const, summary: "action=move duration=650ms easing=ease-out" }
      : { id: `timeline_line_${index}`, kind: "dialogue" as const, speakerId: "hero", textId: `timeline_text_${index}`, text: "x" });
    const start = performance.now();
    const projection = projectStageTimeline(statements);
    const projectionMs = performance.now() - start;
    console.log(JSON.stringify({ status: "PASS", baseline: { statementCount }, measurementsMs: {
      derivedStageTimelineProjection: Number(projectionMs.toFixed(2)) }, budgetsMs: {
      derivedStageTimelineProjection: 500 }, result: {
      cues: projection.cues.length, totalDurationMilliseconds: projection.totalDurationMilliseconds } }, null, 2));
    expect(projection.cues).toHaveLength(statementCount);
    expect(projection.totalDurationMilliseconds).toBe(10_625_000);
    expect(projectionMs).toBeLessThan(500);
  });

  it("plans ten thousand two-segment canonical motion paths within budget", () => {
    const pathCount = 10_000;
    const seed: StageMoveKeyframeSeed = {
      sourceStatementId: "path_perf_source", slot: "hero", z: 1, x: 20, y: 80, scale: 1,
      rotation: 0, anchorX: 0.5, anchorY: 1, duration: "600ms", easing: "ease-in-out"
    };
    const draft = defaultStageMotionPathDraft(seed);
    const start = performance.now();
    let last = planStageMotionPath(seed, draft);
    for (let index = 1; index < pathCount; index += 1) last = planStageMotionPath(seed, draft);
    const planningMs = performance.now() - start;
    console.log(JSON.stringify({ status: "PASS", baseline: { pathCount, canonicalMoves: pathCount * 2 }, measurementsMs: {
      twoSegmentMotionPathPlanning: Number(planningMs.toFixed(2)) }, budgetsMs: {
      twoSegmentMotionPathPlanning: 500 }, result: {
      ok: last.ok, finalDestination: last.ok ? [last.segments[1].x, last.segments[1].y] : null } }, null, 2));
    expect(last.ok).toBe(true);
    expect(planningMs).toBeLessThan(500);
  });

  it("atomically patches the maximum 256 direction-cue batch within budget", () => {
    const targetCount = 256;
    const ids = Array.from({ length: targetCount }, (_, index) => `batch_perf_${index}`);
    const source = [
      'scene "批量性能" @id(scn_batch_perf)',
      ...ids.map((id) => `@background action=clear @id(${id})`),
      'end "完成" @id(stmt_batch_perf_end)',
      ""
    ].join("\n");
    const document = parseStory(source);
    const preflightStart = performance.now();
    const inspection = inspectDirectiveBatch(source, document, ids);
    const batchPreflightMs = performance.now() - preflightStart;
    const start = performance.now();
    const result = patchDirectiveBatch(source, document, ids, { parameters: { transition: "fade", duration: "300ms" } });
    const batchPatchMs = performance.now() - start;
    console.log(JSON.stringify({ status: "PASS", baseline: { targetCount }, measurementsMs: {
      maximumDirectiveBatchPreflight: Number(batchPreflightMs.toFixed(2)),
      maximumAtomicDirectiveBatchPatch: Number(batchPatchMs.toFixed(2)) }, budgetsMs: {
      maximumDirectiveBatchPreflight: 500, maximumAtomicDirectiveBatchPatch: 2_000 }, result: { ok: result.ok,
      changedTargets: result.ok ? result.changedStatementIds.length : 0 } }, null, 2));
    expect(inspection.ok).toBe(true);
    if (!inspection.ok) throw new Error(inspection.error.message);
    expect(inspection.targets).toHaveLength(targetCount);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.changedStatementIds).toHaveLength(targetCount);
    expect(result.source.match(/transition=fade/g)).toHaveLength(targetCount);
    expect(batchPreflightMs).toBeLessThan(500);
    expect(batchPatchMs).toBeLessThan(2_000);
  });

  it("selects lanes and ranges across ten thousand direction cues within budget", () => {
    const directionCount = 10_000;
    const directions = Array.from({ length: directionCount }, (_, index) => ({
      id: `selection_perf_${index}`,
      command: index % 3 === 0 ? "background" as const : index % 3 === 1 ? "show" as const : "audio" as const
    }));
    const start = performance.now();
    const lane = selectStageDirectionLane(directions, "background", directionCount);
    const range = selectStageDirectionRange(directions, "selection_perf_0", "selection_perf_9999", directionCount);
    const selectionMs = performance.now() - start;
    console.log(JSON.stringify({ status: "PASS", baseline: { directionCount }, measurementsMs: {
      largeSceneLaneAndRangeSelection: Number(selectionMs.toFixed(2)) }, budgetsMs: {
      largeSceneLaneAndRangeSelection: 100 }, result: {
      laneTargets: lane.ok ? lane.statementIds.length : 0,
      rangeTargets: range.ok ? range.statementIds.length : 0 } }, null, 2));
    expect(lane.ok).toBe(true);
    expect(range.ok).toBe(true);
    if (!lane.ok || !range.ok) throw new Error("Large-scene selection failed");
    expect(lane.statementIds).toHaveLength(3_334);
    expect(range.statementIds).toHaveLength(3_334);
    expect(selectionMs).toBeLessThan(100);
  });

  it("navigates a bounded render window across ten thousand steps within budget", () => {
    const statementCount = 10_000;
    let window = createStageWindow(statementCount, 0);
    const start = performance.now();
    for (let index = 0; index < statementCount; index += 17) {
      window = revealStageIndex(window, index);
      if (window.hasNext && index % 51 === 0) window = moveStageWindow(window, 1);
    }
    const windowNavigationMs = performance.now() - start;
    console.log(JSON.stringify({ status: "PASS", baseline: { statementCount, windowSize: window.size }, measurementsMs: {
      largeSceneWindowNavigation: Number(windowNavigationMs.toFixed(2)) }, budgetsMs: {
      largeSceneWindowNavigation: 100 }, result: {
      finalStart: window.start, finalEnd: window.end, maximumRenderedStatements: window.size } }, null, 2));
    expect(window.end - window.start).toBeLessThanOrEqual(64);
    expect(windowNavigationMs).toBeLessThan(100);
  });

  it("indexes and searches ten thousand committed steps within the interactive budget", () => {
    const statementCount = 10_000;
    const statements = Array.from({ length: statementCount }, (_, index) => ({
      id: `search_stmt_${index}`,
      kind: "dialogue" as const,
      speakerId: index % 2 === 0 ? "hero" : "friend",
      textId: `search_text_${index}`,
      text: index === 9_743 ? "雨后的天台藏着唯一的约定" : `校园对白 ${index}`
    }));
    const indexStart = performance.now();
    const index = createStageSearchIndex(statements);
    const indexingMs = performance.now() - indexStart;
    const searchStart = performance.now();
    const byText = searchStageIndex(index, "唯一的约定");
    const byStableId = searchStageIndex(index, "SEARCH_STMT_9743");
    const byStep = searchStageIndex(index, "#9744");
    const searchMs = performance.now() - searchStart;
    console.log(JSON.stringify({ status: "PASS", baseline: { statementCount }, measurementsMs: {
      committedStageSearchIndexing: Number(indexingMs.toFixed(2)),
      threeStageSearchQueries: Number(searchMs.toFixed(2)) }, budgetsMs: {
      committedStageSearchIndexing: 300, threeStageSearchQueries: 100 }, result: {
      textIndex: byText.matches[0]?.index, stableIdIndex: byStableId.matches[0]?.index,
      stepIndex: byStep.matches[0]?.index, maximumMountedResults: 50 } }, null, 2));
    expect(byText.matches[0]?.index).toBe(9_743);
    expect(byStableId.matches[0]?.index).toBe(9_743);
    expect(byStep.matches[0]?.index).toBe(9_743);
    expect(indexingMs).toBeLessThan(300);
    expect(searchMs).toBeLessThan(100);
  });

  it("indexes and searches a one-hundred-thousand-step committed project within budget", () => {
    const sceneCount = 1_000;
    const statementsPerScene = 100;
    const project: StoryProject = { schemaVersion: 0, id: "project_global_search_perf", title: "Global Search", characters: [],
      entrySceneId: "global_scene_0", scenes: Array.from({ length: sceneCount }, (_, sceneIndex) => ({
        id: `global_scene_${sceneIndex}`, title: `章节 ${sceneIndex}`, statements: Array.from({ length: statementsPerScene }, (_, statementIndex) => ({
          id: `global_stmt_${sceneIndex}_${statementIndex}`, kind: "dialogue" as const, speakerId: "hero",
          textId: `global_text_${sceneIndex}_${statementIndex}`,
          text: sceneIndex === 947 && statementIndex === 82 ? "跨场景索引唯一约定" : `场景 ${sceneIndex} 对白 ${statementIndex}`
        }))
      })) };
    const indexStart = performance.now();
    const index = createProjectSearchIndex(project);
    const indexingMs = performance.now() - indexStart;
    const searchStart = performance.now();
    const byText = searchProjectIndex(index, "唯一约定");
    const byId = searchProjectIndex(index, "GLOBAL_STMT_947_82");
    const byScene = searchProjectIndex(index, "章节 947");
    const searchMs = performance.now() - searchStart;
    console.log(JSON.stringify({ status: "PASS", baseline: { sceneCount, statementCount: sceneCount * statementsPerScene },
      measurementsMs: { committedProjectSearchIndexing: Number(indexingMs.toFixed(2)), threeProjectSearchQueries: Number(searchMs.toFixed(2)) },
      budgetsMs: { committedProjectSearchIndexing: 2_000, threeProjectSearchQueries: 300 }, result: {
        textTarget: byText.matches[0]?.statementId, idTarget: byId.matches[0]?.statementId,
        sceneTarget: byScene.matches[0]?.sceneId, maximumMountedResults: 100 } }, null, 2));
    expect(byText.matches[0]?.statementId).toBe("global_stmt_947_82");
    expect(byId.matches[0]?.statementId).toBe("global_stmt_947_82");
    expect(byScene.matches[0]).toMatchObject({ sceneId: "global_scene_947", matchedBy: "scene" });
    expect(indexingMs).toBeLessThan(2_000);
    expect(searchMs).toBeLessThan(300);
  });
});
