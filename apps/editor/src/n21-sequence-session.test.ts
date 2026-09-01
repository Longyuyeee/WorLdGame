import { describe,expect,it } from "vitest";
import { parseStory } from "@world-studio/story-language";
import { activeSourceSession,createProjectSnapshot,createStudioSession,reduceStudioSession,restoreStudioSession } from "./studio-session";

describe("N21 non-programmer sequence task",()=>{
  it("atomically creates dialogue, two-option choice, state, condition, endings and basic media",()=>{
    let session=createStudioSession();const sceneId=session.activeSceneId,targetScene=session.project.scenes[1]?.id??sceneId,afterId=session.selectedStatementId;
    const operations=[
      {kind:"insert" as const,afterId,node:{kind:"dialogue" as const,speakerId:session.project.characters[0]!.id,statementId:"stmt_n21_dialogue",textId:"text_n21_dialogue",textRaw:"我们从这里开始。",trailingMetadata:""}},
      {kind:"insert" as const,afterId:"stmt_n21_dialogue",node:{kind:"choice" as const,promptRaw:"\"选择路线\"",id:"stmt_n21_choice",trailingMetadata:""}},
      {kind:"insert" as const,afterId:"stmt_n21_choice",node:{kind:"choice-option" as const,labelRaw:"\"留下\"",targetLabel:sceneId,id:"option_n21_stay",trailingMetadata:""}},
      {kind:"insert" as const,afterId:"option_n21_stay",node:{kind:"choice-option" as const,labelRaw:"\"前往下一幕\"",targetLabel:targetScene,id:"option_n21_go",trailingMetadata:""}},
      {kind:"insert" as const,afterId:"option_n21_go",node:{kind:"set" as const,variable:"route_open",expressionRaw:"true",id:"stmt_n21_set",trailingMetadata:""}},
      {kind:"insert" as const,afterId:"stmt_n21_set",node:{kind:"label" as const,name:"ending_a",id:"stmt_n21_label",trailingMetadata:""}},
      {kind:"insert" as const,afterId:"stmt_n21_label",node:{kind:"condition" as const,expressionRaw:"route_open",targetLabel:"ending_a",id:"stmt_n21_condition",trailingMetadata:""}},
      {kind:"insert" as const,afterId:"stmt_n21_condition",node:{kind:"directive" as const,command:"background" as const,id:"stmt_n21_bg",argumentsRaw:"asset=background_twilight"}},
      {kind:"insert" as const,afterId:"stmt_n21_bg",node:{kind:"directive" as const,command:"audio" as const,id:"stmt_n21_bgm",argumentsRaw:"asset=bgm_theme bus=bgm"}},
      {kind:"insert" as const,afterId:"stmt_n21_bgm",node:{kind:"end" as const,nameRaw:"\"路线 A\"",id:"stmt_n21_end",trailingMetadata:""}}
    ];
    session=reduceStudioSession(session,{type:"p0-batch",commandId:"cmd_n21_task",operations,selectedStatementId:"stmt_n21_dialogue"});
    expect(session.notice.tone).toBe("success");expect(activeSourceSession(session).revision).toBe(1);
    const source=activeSourceSession(session).committedSource,story=parseStory(source);expect(story.diagnostics.filter((item)=>item.severity==="error")).toEqual([]);
    expect(source).toContain('choice "选择路线" @id(stmt_n21_choice)');expect(source).toContain('if route_open -> ending_a @id(stmt_n21_condition)');expect(source).toContain('@background asset=background_twilight @id(stmt_n21_bg)');expect(source).toContain('@audio asset=bgm_theme bus=bgm @id(stmt_n21_bgm)');
    expect(session.project.scenes.find((item)=>item.id===sceneId)?.statements.map((item)=>item.id)).toEqual(expect.arrayContaining(["stmt_n21_dialogue","stmt_n21_choice","stmt_n21_set","stmt_n21_condition","stmt_n21_end"]));
    const reopened=restoreStudioSession(createProjectSnapshot(session,7));expect(activeSourceSession(reopened).committedSource).toBe(source);expect(reopened.project.scenes.find((item)=>item.id===sceneId)?.statements.map((item)=>item.id)).toEqual(expect.arrayContaining(["stmt_n21_choice","stmt_n21_condition","stmt_n21_bg","stmt_n21_bgm"]));
  });

  it("rejects an unsafe typed-expression edit without polluting the last valid projection",()=>{let session=createStudioSession(),before=activeSourceSession(session);session=reduceStudioSession(session,{type:"p0-insert",commandId:"cmd_set",afterId:session.selectedStatementId,node:{kind:"set",variable:"safe_flag",expressionRaw:"true",id:"stmt_safe_set",trailingMetadata:""}});expect(session.notice.tone).toBe("success");const valid=activeSourceSession(session);session=reduceStudioSession(session,{type:"p0-update",commandId:"cmd_unsafe",statementId:"stmt_safe_set",patch:{expressionRaw:"globalThis.process.exit()"}});expect(session.notice).toMatchObject({tone:"error",title:"操作未执行"});expect(activeSourceSession(session)).toBe(valid);expect(activeSourceSession(session).committedSource).not.toContain("globalThis");expect(before.revision).toBe(0);});
});
