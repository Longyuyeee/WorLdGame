import type { StoryStatement } from "@world-studio/story-core";
import type { P0EditableNode } from "@world-studio/story-language";

export type SequenceInsertKind = "dialogue" | "narration" | "choice" | "label" | "jump" | "call" | "return" | "set" | "condition" | "wait" | "end" | "background" | "show" | "camera" | "audio";
export interface SequenceReferences { readonly characterIds: readonly string[]; readonly sceneIds: readonly string[]; readonly labelIds: readonly string[]; readonly variableIds: readonly string[]; readonly assetIds: readonly string[]; }
export interface SequenceInsertStep { readonly afterId: string; readonly node: P0EditableNode; }
export type SequenceIdFactory = (prefix: string) => string;

const quote = (value: string) => JSON.stringify(value);
const stable = (values: readonly string[], fallback: string) => values[0] ?? fallback;
export function createSequenceInsertPlan(kind: SequenceInsertKind, afterId: string, refs: SequenceReferences, createId: SequenceIdFactory): readonly SequenceInsertStep[] {
  const statementId=createId("stmt"), textId=createId("txt"), target=stable(refs.labelIds,stable(refs.sceneIds,"label_start")), asset=stable(refs.assetIds,"asset_missing"), variable=stable(refs.variableIds,"flag"), character=stable(refs.characterIds,"character_missing");
  const one=(node:P0EditableNode):readonly SequenceInsertStep[]=>[{afterId,node}];
  if(kind==="dialogue")return one({kind:"dialogue",speakerId:character,statementId,textId,textRaw:"新对白",trailingMetadata:""});
  if(kind==="narration")return one({kind:"narration",statementId,textId,textRaw:quote("新旁白"),trailingMetadata:""});
  if(kind==="camera")return one({kind:"directive",command:kind,id:statementId,argumentsRaw:"action=move x=0 y=0 zoom=1 rotation=0 duration=600ms easing=ease-in-out"});
  if(kind==="background"||kind==="show"||kind==="audio")return one({kind:"directive",command:kind,id:statementId,argumentsRaw:`asset=${asset}`});
  if(kind==="label")return one({kind:"label",name:createId("label"),id:statementId,trailingMetadata:""});
  if(kind==="jump")return one({kind:"jump",targetLabel:target,id:statementId,trailingMetadata:""});
  if(kind==="call")return one({kind:"call",targetLabel:target,id:statementId,trailingMetadata:""});
  if(kind==="return")return one({kind:"return",id:statementId,trailingMetadata:""});
  if(kind==="set")return one({kind:"set",variable,expressionRaw:"true",id:statementId,trailingMetadata:""});
  if(kind==="condition")return one({kind:"condition",expressionRaw:variable,targetLabel:target,id:statementId,trailingMetadata:""});
  if(kind==="wait")return one({kind:"wait",durationRaw:"500ms",id:statementId,trailingMetadata:""});
  if(kind==="end")return one({kind:"end",nameRaw:quote("新结局"),id:statementId,trailingMetadata:""});
  const optionA=createId("option"),optionB=createId("option");
  return [
    {afterId,node:{kind:"choice",promptRaw:quote("请选择"),id:statementId,trailingMetadata:""}},
    {afterId:statementId,node:{kind:"choice-option",labelRaw:quote("选项 A"),targetLabel:target,id:optionA,trailingMetadata:""}},
    {afterId:optionA,node:{kind:"choice-option",labelRaw:quote("选项 B"),targetLabel:target,id:optionB,trailingMetadata:""}}
  ];
}

export function duplicateSequencePlan(statement: StoryStatement, afterId: string, createId: SequenceIdFactory): readonly SequenceInsertStep[] {
  const statementId=createId("stmt"),textId=createId("txt");
  if(statement.kind==="dialogue")return [{afterId,node:{kind:"dialogue",speakerId:statement.speakerId,statementId,textId,textRaw:statement.text,trailingMetadata:""}}];
  if(statement.kind==="narration")return [{afterId,node:{kind:"narration",statementId,textId,textRaw:quote(statement.text),trailingMetadata:""}}];
  if(statement.kind==="direction")return [{afterId,node:{kind:"directive",command:statement.command,id:statementId,argumentsRaw:statement.summary}}];
  if(statement.kind==="choice"){
    const steps:SequenceInsertStep[]=[{afterId,node:{kind:"choice",promptRaw:quote(statement.prompt),id:statementId,trailingMetadata:""}}];let anchor=statementId;
    for(const option of statement.options){const id=createId("option");steps.push({afterId:anchor,node:{kind:"choice-option",labelRaw:quote(option.label),targetLabel:option.targetSceneId,id,trailingMetadata:""}});anchor=id;}return steps;
  }
  if(statement.kind==="label")return [{afterId,node:{kind:"label",name:createId("label"),id:statementId,trailingMetadata:""}}];
  if(statement.kind==="jump")return [{afterId,node:{kind:"jump",targetLabel:statement.targetLabel,id:statementId,trailingMetadata:""}}];
  if(statement.kind==="call")return [{afterId,node:{kind:"call",targetLabel:statement.targetLabel,id:statementId,trailingMetadata:""}}];
  if(statement.kind==="return")return [{afterId,node:{kind:"return",id:statementId,trailingMetadata:""}}];
  if(statement.kind==="set")return [{afterId,node:{kind:"set",variable:statement.variable,expressionRaw:statement.expression,id:statementId,trailingMetadata:""}}];
  if(statement.kind==="condition")return [{afterId,node:{kind:"condition",expressionRaw:statement.expression,targetLabel:statement.targetLabel,id:statementId,trailingMetadata:""}}];
  if(statement.kind==="wait")return [{afterId,node:{kind:"wait",durationRaw:statement.duration,id:statementId,trailingMetadata:""}}];
  return [{afterId,node:{kind:"end",nameRaw:quote(statement.endingName),id:statementId,trailingMetadata:""}}];
}

export function sequenceRangeSelection(statements: readonly StoryStatement[], anchorId: string, targetId: string, maximum=256): readonly string[] {
  const a=statements.findIndex((item)=>item.id===anchorId),b=statements.findIndex((item)=>item.id===targetId);if(a<0||b<0)return[];const ids=statements.slice(Math.min(a,b),Math.max(a,b)+1).map((item)=>item.id);return ids.length<=maximum?ids:[];
}
export function sequenceMoveAfterId(statements: readonly StoryStatement[], sceneId:string, statementId:string, direction:-1|1):string|undefined{const index=statements.findIndex((item)=>item.id===statementId);if(index<0)return undefined;if(direction<0){if(index===0)return undefined;return index===1?sceneId:statements[index-2]?.id;}const next=statements[index+1];return next?.kind==="end"||next===undefined?undefined:next.id;}
