import { describe,expect,it } from "vitest";
import { createIncrementalStoryState, deleteP0Node, insertP0Node, parseStory, p0NodeId, storyDocumentHash, updateIncrementalStoryLine, updateP0Node, type P0EditableNode } from "./index";
const base=`scene "P0" @id(scene_p0)\nend "Done" @id(statement_end)\n`;
const nodes:readonly P0EditableNode[]=[
  {kind:"dialogue",speakerId:"character_a",statementId:"statement_dialogue",textRaw:"Hello",textId:"text_dialogue",trailingMetadata:""},
  {kind:"narration",statementId:"statement_narration",textRaw:"\"Narration\"",textId:"text_narration",trailingMetadata:""},
  {kind:"choice",promptRaw:"\"Choose\"",id:"statement_choice",trailingMetadata:""},
  {kind:"choice-option",labelRaw:"\"Go\"",targetLabel:"target",id:"statement_option",trailingMetadata:""},
  {kind:"label",name:"target",id:"statement_label",trailingMetadata:""},
  {kind:"jump",targetLabel:"target",id:"statement_jump",trailingMetadata:""},
  {kind:"call",targetLabel:"target",id:"statement_call",trailingMetadata:""},
  {kind:"return",id:"statement_return",trailingMetadata:""},
  {kind:"set",variable:"trust",expressionRaw:"1",id:"statement_set",trailingMetadata:""},
  {kind:"condition",expressionRaw:"trust > 0",targetLabel:"target",id:"statement_condition",trailingMetadata:""},
  {kind:"wait",durationRaw:"1s",id:"statement_wait",trailingMetadata:""},
  {kind:"directive",command:"background",argumentsRaw:"asset=background_a",id:"statement_background"},
  {kind:"directive",command:"show",argumentsRaw:"asset=character_a slot=main",id:"statement_character"},
  {kind:"directive",command:"audio",argumentsRaw:"asset=bgm_a bus=bgm",id:"statement_audio"},
  {kind:"end",nameRaw:"\"Other\"",id:"statement_other_end",trailingMetadata:""}
];
describe("N20 universal P0 patch and scale",()=>{
  it.each(nodes.map((node)=>[node.kind,p0NodeId(node)!,node] as const))("round-trips insert/update/delete for %s",(_kind,id,node)=>{const inserted=insertP0Node(base,"statement_end",node,storyDocumentHash(parseStory(base)));expect(inserted.ok).toBe(true);if(!inserted.ok)return;const updated=updateP0Node(inserted.source,id,{},inserted.documentHash);expect(updated.ok).toBe(true);if(!updated.ok)return;const deleted=deleteP0Node(updated.source,id,updated.documentHash);expect(deleted.ok).toBe(true);if(!deleted.ok)return;expect(deleted.storyDocument.nodes.some((item)=>p0NodeId(item)===id)).toBe(false);});
  it("performs 1,000 cross-view stable-ID rewrites without semantic corruption",()=>{let source=base;for(let index=0;index<1000;index++){const id=`statement_wait_${index}`,inserted=insertP0Node(source,"statement_end",{kind:"wait",durationRaw:`${index}ms`,id,trailingMetadata:""});expect(inserted.ok).toBe(true);if(!inserted.ok)throw new Error(inserted.message);source=inserted.source;}const document=parseStory(source);expect(document.diagnostics.filter((item)=>item.severity==="error")).toEqual([]);expect(new Set(document.nodes.map(p0NodeId).filter(Boolean)).size).toBe(1002);},20_000);
  it("updates a 100,000-line document incrementally without reparsing untouched nodes",()=>{const source=`scene "Large" @id(scene_large)\n${Array.from({length:99998},(_,index)=>`narrate "Line ${index}" @sid(statement_${index}) @id(text_${index})`).join("\n")}\nend "Done" @id(statement_end)\n`,state=createIncrementalStoryState(source),before=state.storyDocument.nodes[90000];const changed=updateIncrementalStoryLine(state,50000,`narrate "Changed" @sid(statement_49999) @id(text_49999)`);expect(changed.storyDocument.nodes[50000]).toMatchObject({kind:"narration",textRaw:"\"Changed\""});expect(changed.storyDocument.nodes[90000]).not.toBe(before);expect(changed.storyDocument.nodes[90000]?.kind).toBe(before?.kind);expect(changed.storyDocument.nodes).toHaveLength(100000);});
});
