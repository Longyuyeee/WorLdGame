import { useState } from "react";
import { assignmentDraft, assignmentExpression, comparisonDraft, expressionLiteral, type AuthoringVariableType, type VariableAssignmentOperation } from "./expression-edit";

const TYPE_NAMES = { number: "数值", boolean: "是否", string: "文本" };
const defaultValue = (type: AuthoringVariableType) => type === "number" ? "0" : type === "boolean" ? "true" : "";

export function VariableAssignmentFields({ variable: savedVariable, expression, variableIds, variableNames, variableTypes, disabled, onDraftChange }: {
  variable: string; expression: string; variableIds: readonly string[]; variableNames: Readonly<Record<string, string>>;
  variableTypes: Readonly<Record<string, AuthoringVariableType>>; disabled: boolean; onDraftChange: (expression: string, variable: string) => void;
}) {
  const [variable, setVariable] = useState(savedVariable), type = variableTypes[variable];
  const [initial] = useState(() => assignmentDraft(savedVariable, expression, type ?? "number"));
  const [operation, setOperation] = useState<VariableAssignmentOperation>(initial.operation);
  const [value, setValue] = useState(initial.value), [draft, setDraft] = useState(expression);
  let generated: string | null = null;
  try { if (type) generated = assignmentExpression(variable, type, operation, value); } catch { /* Invalid builder input has no generated expression. */ }
  return <>
    <label><span>要修改的变量</span><select name="variable" aria-label="要修改的变量" value={variable} disabled={disabled} onChange={event => {
      const next = event.target.value, nextType = variableTypes[next]; setVariable(next); setOperation("set");
      if (nextType) setValue(defaultValue(nextType)); onDraftChange(draft, next);
    }}>{[...new Set([savedVariable, ...variableIds])].map(id => <option key={id} value={id}>{variableNames[id] ?? `脚本变量（未声明） · ${id}`}</option>)}</select></label>
    {type && <fieldset className="expression-builder" disabled={disabled}><legend>按{TYPE_NAMES[type]}修改</legend>
      {type === "number" && <label><span>修改方式</span><select aria-label="变量修改方式" value={operation} onChange={event => setOperation(event.target.value as VariableAssignmentOperation)}><option value="set">设为这个值</option><option value="add">增加</option><option value="subtract">减少</option></select></label>}
      <label><span>{operation === "set" ? "新的值" : "增减量"}</span>{type === "boolean" ? <select aria-label="变量的新值" value={value} onChange={event => setValue(event.target.value)}><option value="true">是</option><option value="false">否</option></select> : <input aria-label="变量的新值" type={type === "number" ? "number" : "text"} step="any" {...(type === "number" && operation !== "set" ? { min: 0 } : {})} value={value} onChange={event => setValue(event.target.value)} />}</label>
      <button type="button" disabled={generated === null} onClick={() => { if (generated !== null) { setDraft(generated); onDraftChange(generated, variable); } }}>生成赋值表达式</button><small>生成后点击“应用修改”保存。文本会自动加引号，数值增减使用当前变量。</small>
    </fieldset>}
    {!initial.simple && <small className="expression-preserved">当前使用复杂表达式，已完整保留；只有生成新值才会替换。</small>}
    <details className="expression-source" open={!initial.simple || !type}><summary>表达式与脚本</summary><label><span>新的值或计算式</span><input name="expression" aria-label="新的值或计算式" value={draft} required disabled={disabled} onChange={event => { setDraft(event.target.value); onDraftChange(event.target.value, variable); }} /></label></details>
  </>;
}

export function ConditionExpressionFields({ expression, variableIds, variableNames, variableTypes = {}, disabled, onDraftChange }: {
  expression: string; variableIds: readonly string[]; variableNames: Readonly<Record<string, string>>;
  variableTypes?: Readonly<Record<string, AuthoringVariableType>>; disabled: boolean; onDraftChange?: (expression: string) => void;
}) {
  const [draft, setDraft] = useState(expression);
  const [initial] = useState(() => comparisonDraft(expression, variableIds, variableTypes));
  const [variable, setVariable] = useState(initial.variable), [operator, setOperator] = useState(initial.operator);
  const [type, setType] = useState<AuthoringVariableType>(initial.type), [value, setValue] = useState(initial.value);
  let literal: string | null = null; try { literal = expressionLiteral(type, value); } catch { /* Invalid builder input has no generated condition. */ }
  const valid = variableIds.includes(variable) && literal !== null;
  const update = (next: string) => { setDraft(next); onDraftChange?.(next); };
  return <>
    <fieldset className="expression-builder" disabled={disabled}><legend>按变量配置条件</legend>
      <label><span>判断变量</span><select aria-label="判断变量" value={variable} onChange={event => {
        const next = event.target.value; setVariable(next);
        if (variableTypes[next]) { const nextType = variableTypes[next]!; setType(nextType); setValue(defaultValue(nextType)); setOperator(nextType === "number" ? ">=" : "=="); }
      }}>{variableIds.map(id => <option key={id} value={id}>{variableNames[id] ?? `脚本变量 · ${id}`}</option>)}</select></label>
      <label><span>比较方式</span><select aria-label="比较方式" value={operator} onChange={event => setOperator(event.target.value)}>{[["==", "等于"], ["!=", "不等于"], ...(type === "number" ? [[">", "大于"], [">=", "大于等于"], ["<", "小于"], ["<=", "小于等于"]] : [])].map(([op, label]) => <option key={op} value={op}>{label}</option>)}</select></label>
      <label><span>比较值类型</span><select aria-label="比较值类型" value={type} disabled={disabled || variableTypes[variable] !== undefined} onChange={event => { const next = event.target.value as AuthoringVariableType; setType(next); setValue(defaultValue(next)); setOperator("=="); }}>{Object.entries(TYPE_NAMES).map(([value, title]) => <option key={value} value={value}>{title}</option>)}</select></label>
      <label><span>比较值</span>{type === "boolean" ? <select aria-label="比较值" value={value} onChange={event => setValue(event.target.value)}><option value="true">是</option><option value="false">否</option></select> : <input aria-label="比较值" type={type === "number" ? "number" : "text"} step="any" value={value} onChange={event => setValue(event.target.value)} />}</label>
      <button type="button" disabled={!valid} onClick={() => update(`${variable} ${operator} ${literal}`)}>生成条件表达式</button>
      <small>生成后点击“应用修改”保存。不成立时继续下一步骤；需要其他去向时，在下一步插入跳转。</small>
    </fieldset>
    <label><span>条件表达式（可手动编辑复杂条件）</span><input name="expression" value={draft} onChange={event => update(event.target.value)} required disabled={disabled} /></label>
  </>;
}
