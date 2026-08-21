import { describe, expect, it } from "vitest";
import { createProjectService, executeProjectBatch, executeProjectCommand, loadProject, migrateS0Project, redoProject, semanticHash, serializeCommittedRevision, undoProject, type ProjectCommand, type S0Project } from "./index";

const emptyStory: S0Project = { schemaVersion: 0, id: "project_command_story", title: "Command Story", entrySceneId: "scene_empty", characters: [], scenes: [{ id: "scene_empty", title: "Empty", statements: [] }] };
const initial = () => createProjectService(loadProject(migrateS0Project(emptyStory).files));
const command = <T extends Omit<ProjectCommand, "commandId" | "expectedRevision">>(commandId: string, value: T): ProjectCommand => ({ commandId, expectedRevision: 0, ...value } as unknown as ProjectCommand);

const storyCommands: readonly ProjectCommand[] = [
  command("command_character", { kind: "character.create", character: { id: "character_guide", displayName: "Guide", color: "#fff" } }),
  command("command_scene_start", { kind: "scene.create", chapterId: "chapter_main", sceneId: "scene_start", title: "Start", makeEntry: true }),
  command("command_scene_end", { kind: "scene.create", chapterId: "chapter_main", sceneId: "scene_end", title: "Ending" }),
  command("command_line", { kind: "statement.insert", sceneId: "scene_start", statement: { id: "statement_line", kind: "dialogue", speakerId: "character_guide", textId: "text_line", text: "Choose." } }),
  command("command_choice", { kind: "statement.insert", sceneId: "scene_start", statement: { id: "statement_choice", kind: "choice", prompt: "Continue?", options: [{ id: "option_continue", label: "Continue", targetSceneId: "scene_end" }] } }),
  command("command_end", { kind: "statement.insert", sceneId: "scene_end", statement: { id: "statement_end", kind: "end", endingName: "Complete" } }),
  command("command_remove_empty", { kind: "scene.delete", sceneId: "scene_empty" })
];

describe("Project Service", () => {
  it("builds a two-scene branch atomically, undoes to the empty story, and redoes to the same hash", () => {
    const start = initial(); const result = executeProjectBatch(start, storyCommands); expect(result.ok ? null : result.error).toBeNull(); if(!result.ok)return;
    const finalHash = semanticHash(result.state.project); expect(result.state.project.scenes.map(x=>x.id)).toEqual(["scene_start","scene_end"]); expect(result.changeSet.changedEntityIds).toContain("statement_choice");
    const undone = undoProject(result.state); expect(undone.project.scenes.map(x=>x.id)).toEqual(["scene_empty"]);
    const redone = redoProject(undone); expect(semanticHash(redone.project)).toBe(finalHash); expect(serializeCommittedRevision(redone,redone.revision)["world.project.json"]).toBeDefined();
  });
  it("rejects a stale revision without changing the project", () => {
    const start=initial();const result=executeProjectCommand(start,{...storyCommands[0]!,expectedRevision:9});expect(result.ok).toBe(false);if(result.ok)return;expect(result.error.code).toBe("STALE_REVISION");expect(semanticHash(result.state.project)).toBe(semanticHash(start.project));
  });
  it("makes command replay idempotent through the command receipt", () => {
    const first=executeProjectCommand(initial(),storyCommands[0]!);expect(first.ok).toBe(true);if(!first.ok)return;const replay=executeProjectCommand(first.state,{...storyCommands[0]!,expectedRevision:first.state.revision});expect(replay.ok).toBe(false);if(replay.ok)return;expect(replay.error.code).toBe("DUPLICATE_COMMAND");expect(replay.state.revision).toBe(1);
  });
  it("rolls back the entire batch when a later command fails", () => {
    const start=initial();const invalid=[storyCommands[0]!,command("command_missing_scene",{kind:"statement.insert",sceneId:"scene_missing",statement:{id:"statement_orphan",kind:"end",endingName:"No"}})];const result=executeProjectBatch(start,invalid);expect(result.ok).toBe(false);expect(result.state).toBe(start);expect(result.state.project.characters.characters).toEqual([]);
  });
  it("rejects deleting referenced characters and scenes", () => {
    const built=executeProjectBatch(initial(),storyCommands);expect(built).toMatchObject({ok:true});if(!built.ok)return;const characterDelete=executeProjectCommand(built.state,{commandId:"command_delete_character",expectedRevision:1,kind:"character.delete",characterId:"character_guide"});expect(characterDelete.ok).toBe(false);if(characterDelete.ok)return;expect(characterDelete.error.code).toBe("REFERENCE_CONFLICT");const sceneDelete=executeProjectCommand(built.state,{commandId:"command_delete_target",expectedRevision:1,kind:"scene.delete",sceneId:"scene_end"});expect(sceneDelete.ok).toBe(false);if(sceneDelete.ok)return;expect(sceneDelete.error.code).toBe("REFERENCE_CONFLICT");
  });
  it("requires the exact committed revision when serializing", () => {
    const built=executeProjectBatch(initial(),storyCommands);expect(built).toMatchObject({ok:true});if(!built.ok)return;expect(()=>serializeCommittedRevision(built.state,0)).toThrow(/STALE_REVISION/);
  });
  it("commits, serializes, undoes, and redoes layout sidecar positions independently", () => {
    const start=initial();const sceneId=start.project.manifest.entrySceneId;const result=executeProjectCommand(start,{commandId:"command_layout_position",expectedRevision:0,kind:"layout.node.set",sceneId,nodeId:sceneId,x:320,y:180});
    expect(result.ok).toBe(true);if(!result.ok)return;
    expect(result.state.project.scripts).toEqual(start.project.scripts);
    expect(result.state.project.layouts[sceneId]?.nodes).toEqual([{nodeId:sceneId,x:320,y:180}]);
    expect(loadProject(serializeCommittedRevision(result.state,1)).layouts[sceneId]?.nodes).toEqual([{nodeId:sceneId,x:320,y:180}]);
    const undone=undoProject(result.state);expect(undone.project.layouts[sceneId]?.nodes).toEqual([]);
    expect(redoProject(undone).project.layouts[sceneId]?.nodes).toEqual([{nodeId:sceneId,x:320,y:180}]);
  });
  it("rejects invalid layout coordinates without changing the project", () => {
    const start=initial();const sceneId=start.project.manifest.entrySceneId;const result=executeProjectCommand(start,{commandId:"command_layout_invalid",expectedRevision:0,kind:"layout.node.set",sceneId,nodeId:sceneId,x:Number.POSITIVE_INFINITY,y:0});
    expect(result).toMatchObject({ok:false,state:start,error:{code:"INVALID_COMMAND"}});
  });
  it("covers rename, move, update, and delete commands across every N11 entity collection", () => {
    const built=executeProjectBatch(initial(),storyCommands);expect(built.ok).toBe(true);if(!built.ok)return;let state=built.state;
    const run=(value:Record<string,unknown>&{kind:string},id:string)=>{const result=executeProjectCommand(state,{commandId:id,expectedRevision:state.revision,...value} as unknown as ProjectCommand);expect(result.ok?null:result.error).toBeNull();if(result.ok)state=result.state;};
    run({kind:"chapter.create",chapterId:"chapter_bonus",title:"Bonus"},"command_chapter_create");
    run({kind:"chapter.rename",chapterId:"chapter_bonus",title:"Bonus Route"},"command_chapter_rename");
    run({kind:"chapter.move",chapterId:"chapter_bonus",index:0},"command_chapter_move");
    run({kind:"scene.rename",sceneId:"scene_end",title:"True Ending"},"command_scene_rename");
    run({kind:"scene.move",sceneId:"scene_end",chapterId:"chapter_bonus",index:0},"command_scene_move");
    run({kind:"variable.create",variable:{id:"variable_trust",name:"Trust",type:"number",defaultValue:0}},"command_variable_create");
    run({kind:"variable.rename",variableId:"variable_trust",name:"Trust Score"},"command_variable_rename");
    run({kind:"variable.move",variableId:"variable_trust",index:0},"command_variable_move");
    run({kind:"variable.delete",variableId:"variable_trust"},"command_variable_delete");
    run({kind:"asset.create",asset:{id:"asset_background",name:"Background",kind:"image",source:"assets/bg.png"}},"command_asset_create");
    run({kind:"asset.rename",assetId:"asset_background",name:"Sunset Background"},"command_asset_rename");
    run({kind:"asset.move",assetId:"asset_background",index:0},"command_asset_move");
    run({kind:"asset.delete",assetId:"asset_background"},"command_asset_delete");
    run({kind:"character.rename",characterId:"character_guide",displayName:"Senior Guide"},"command_character_rename");
    run({kind:"character.move",characterId:"character_guide",index:0},"command_character_move");
    run({kind:"statement.update",sceneId:"scene_start",statementId:"statement_line",patch:{text:"Choose carefully."}},"command_statement_update");
    run({kind:"statement.move",sceneId:"scene_start",statementId:"statement_choice",index:0},"command_statement_move");
    run({kind:"statement.delete",sceneId:"scene_start",statementId:"statement_line"},"command_statement_delete");
    run({kind:"character.delete",characterId:"character_guide"},"command_character_delete");
    run({kind:"scene.move",sceneId:"scene_start",chapterId:"chapter_bonus",index:0},"command_scene_move_start");
    run({kind:"chapter.delete",chapterId:"chapter_main"},"command_chapter_delete");
    expect(loadProject(serializeCommittedRevision(state,state.revision)).chapters.map(x=>x.id)).toEqual(["chapter_bonus"]);
    expect(state.project.scripts.scene_start?.statements[0]?.id).toBe("statement_choice");
  });
});
