import { createProjectService, executeProjectBatch, loadProject, migrateS0Project, type S0Project } from "@world-studio/project-domain";
import { createScriptSourceSession } from "@world-studio/story-language";
import { describe, expect, it } from "vitest";
import { commandsFromCommittedSource } from "./project-service-source-adapter";

const source: S0Project={schemaVersion:0,id:"project_source_adapter",title:"Source Adapter",entrySceneId:"scene_start",characters:[{id:"character_guide",displayName:"Guide",color:"#fff"}],scenes:[{id:"scene_start",title:"Start",statements:[{id:"statement_old",kind:"end",endingName:"Old"}]}]};

describe("SourceSession to Project Service adapter",()=>{
  it("routes committed script semantics through one atomic command batch",()=>{
    const state=createProjectService(loadProject(migrateS0Project(source).files));
    const session=createScriptSourceSession('scene "Start" @id(scene_start)\ncharacter_guide: New line @sid(statement_line) @id(text_line)\nend "New" @id(statement_end)\n');
    const commands=commandsFromCommittedSource(state,"scene_start",session,"command_source_sync");
    const result=executeProjectBatch(state,commands);expect(result.ok?null:result.error).toBeNull();if(!result.ok)return;
    expect(result.state.project.scripts.scene_start?.statements.map(item=>item.id)).toEqual(["statement_line","statement_end"]);
    expect(result.state.revision).toBe(1);
  });
});
