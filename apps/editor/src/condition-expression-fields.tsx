import { useState } from 'react';

function comparisonDraft(expression: string, variableIds: readonly string[]) {
  const fallback = { variable: variableIds[0] ?? '', operator: '>=', type: 'number', value: '1' };
  const match = /^([A-Za-z_][\w.-]*)\s*(==|!=|>=|<=|>|<)\s*(.+)$/.exec(expression);
  if (!match || !variableIds.includes(match[1]!)) return fallback;
  try {
    const literal: unknown = JSON.parse(match[3]!);
    const type = typeof literal;
    if (!['number', 'boolean', 'string'].includes(type) || (type !== 'number' && !['==', '!='].includes(match[2]!))) return fallback;
    return { variable: match[1]!, operator: match[2]!, type, value: String(literal) };
  } catch { return fallback; }
}

// This is an authoring aid only: the resulting expression still uses the
// existing AST transaction and compiler, including their error diagnostics.
export function ConditionExpressionFields({ expression, variableIds, variableNames, disabled }: {
  expression: string;
  variableIds: readonly string[];
  variableNames: Readonly<Record<string, string>>;
  disabled: boolean;
}) {
  const [draft, setDraft] = useState(expression);
  const [initial] = useState(() => comparisonDraft(expression, variableIds));
  const [variable, setVariable] = useState(initial.variable);
  const [operator, setOperator] = useState(initial.operator);
  const [type, setType] = useState(initial.type);
  const [value, setValue] = useState(initial.value);
  const valid = variableIds.includes(variable) && (type !== 'number' || (value.trim() !== '' && Number.isFinite(Number(value))));
  const literal = type === 'string' ? JSON.stringify(value) : type === 'number' ? String(Number(value)) : value;
  return <>
    <fieldset disabled={disabled}>
      <legend>按变量配置条件</legend>
      <label><span>判断变量</span><select aria-label="判断变量" value={variable} onChange={event => setVariable(event.target.value)}>
        {variableIds.map(id => <option key={id} value={id}>{variableNames[id] ?? `脚本变量 · ${id}`}</option>)}
      </select></label>
      <label><span>比较方式</span><select aria-label="比较方式" value={operator} onChange={event => setOperator(event.target.value)}>
        {['==', '!=', ...(type === 'number' ? ['>', '>=', '<', '<='] : [])].map((op, index) => <option key={op} value={op}>{['等于', '不等于', '大于', '大于等于', '小于', '小于等于'][index]}</option>)}
      </select></label>
      <label><span>比较值类型</span><select aria-label="比较值类型" value={type} onChange={event => { setType(event.target.value); setValue(event.target.value === 'boolean' ? 'true' : event.target.value === 'number' ? '1' : ''); setOperator('=='); }}>
        <option value="number">数值</option><option value="boolean">是否</option><option value="string">文本</option>
      </select></label>
      <label><span>比较值</span>{type === 'boolean' ? <select aria-label="比较值" value={value} onChange={event => setValue(event.target.value)}><option value="true">是</option><option value="false">否</option></select> : <input aria-label="比较值" type={type === 'number' ? 'number' : 'text'} step="any" value={value} onChange={event => setValue(event.target.value)} />}</label>
      <button type="button" disabled={!valid} onClick={() => setDraft(`${variable} ${operator} ${literal}`)}>生成条件表达式</button>
      <small>生成后点击“应用类型化参数”保存。不成立时继续下一步骤；需要其他去向时，在下一步插入跳转。</small>
    </fieldset>
    <label><span>条件表达式（可手动编辑复杂条件）</span><input name="expression" value={draft} onChange={event => setDraft(event.target.value)} required disabled={disabled} /></label>
  </>;
}
