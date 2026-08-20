import type { CanonicalProject, JsonObject } from "./types";

export type VariableType = "boolean" | "number" | "string";
export type VariableScope = "story" | "chapter" | "scene" | "meta";
export interface ProjectEntityReference { readonly path: string; readonly field: string; readonly targetId: string; }
export interface ProjectEntitySearchResult { readonly kind: "chapter" | "scene" | "character" | "variable"; readonly id: string; readonly label: string; readonly detail: string; }

export function createCharacterEntity(id:string,displayName:string,color:string,portraitSlots:readonly string[],defaultExpression:string):JsonObject {
  if(displayName.trim()===""||!/^#[0-9a-f]{6}$/i.test(color)||portraitSlots.some((slot)=>!/^[a-z][a-z0-9_]*$/.test(slot))||!/^[a-z][a-z0-9_]*$/.test(defaultExpression))throw new Error("Invalid character fields");
  return {id,displayName:displayName.trim(),color,portraitSlots:[...new Set(portraitSlots)],defaultExpression};
}
export function createVariableEntity(id:string,name:string,type:VariableType,defaultValue:boolean|number|string,scope:VariableScope):JsonObject {
  if(name.trim()===""||(type==="boolean"&&typeof defaultValue!=="boolean")||(type==="number"&&(typeof defaultValue!=="number"||!Number.isFinite(defaultValue)))||(type==="string"&&typeof defaultValue!=="string"))throw new Error("Invalid variable fields");
  return {id,name:name.trim(),type,defaultValue,scope};
}
export function analyzeProjectEntityReferences(project:CanonicalProject,targetId:string):readonly ProjectEntityReference[] {
  const output:ProjectEntityReference[]=[];
  const visit=(value:unknown,path:string,key="")=>{if(Array.isArray(value)){value.forEach((item,index)=>{if(key.endsWith("Ids")&&item===targetId)output.push({path:`${path}[${index}]`,field:key,targetId});else visit(item,`${path}[${index}]`,key);});return;}if(value===null||typeof value!=="object")return;for(const [field,item] of Object.entries(value)){const child=path?`${path}.${field}`:field;if(field!=="id"&&field!=="textId"&&field.endsWith("Id")&&item===targetId)output.push({path:child,field,targetId});else visit(item,child,field);}};
  visit(project,"");return output;
}
export function searchProjectEntities(project:CanonicalProject,query:string):readonly ProjectEntitySearchResult[]{const needle=query.trim().toLocaleLowerCase();const matches=(...values:unknown[])=>needle===""||values.some((value)=>typeof value==="string"&&value.toLocaleLowerCase().includes(needle));return [
  ...project.chapters.filter((item)=>matches(item.id,item.title)).map((item)=>({kind:"chapter" as const,id:item.id,label:item.title,detail:"章节"})),
  ...project.scenes.filter((item)=>matches(item.id,item.title)).map((item)=>({kind:"scene" as const,id:item.id,label:item.title,detail:item.id===project.manifest.entrySceneId?"场景 · 入口":"场景"})),
  ...project.characters.characters.filter((item)=>matches(item.id,item.displayName,item.defaultExpression)).map((item)=>({kind:"character" as const,id:String(item.id),label:String(item.displayName),detail:`角色 · ${String(item.defaultExpression??"")}`})),
  ...project.variables.variables.filter((item)=>matches(item.id,item.name,item.type,item.scope)).map((item)=>({kind:"variable" as const,id:String(item.id),label:String(item.name),detail:`变量 · ${String(item.type)} · ${String(item.scope)}`}))
];}
