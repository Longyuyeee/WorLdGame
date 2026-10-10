import type { JsonObject } from '@world-studio/project-domain';

export function variableOptionLabels(variables: readonly JsonObject[]): Readonly<Record<string,string>> {
  const types: Record<string,string> = {boolean:'布尔',number:'数值',string:'文本'};
  const scopes: Record<string,string> = {story:'故事',chapter:'章节',scene:'场景',meta:'元数据（meta）'};
  return Object.fromEntries(variables.flatMap(variable => typeof variable.id !== 'string' ? [] : [[variable.id,
    `${typeof variable.name === 'string' ? variable.name : variable.id} · ${types[String(variable.type)] ?? '未知类型'} · ${scopes[String(variable.scope)] ?? '未指定作用域'} · ${variable.id}`
  ]]));
}
