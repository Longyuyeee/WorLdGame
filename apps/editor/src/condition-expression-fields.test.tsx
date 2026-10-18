import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { ConditionExpressionFields } from './condition-expression-fields';

const setup = () => render(<ConditionExpressionFields expression="visits >= 2 && ready" variableIds={['visits']} variableNames={{visits:'同行次数 · number · story'}} disabled={false}/>);

it('restores the saved simple comparison in the controls', () => {
  render(<ConditionExpressionFields expression="visits == 0" variableIds={['visits']} variableNames={{visits:'同行次数'}} disabled={false}/>);
  expect(screen.getByLabelText('比较方式')).toHaveValue('==');
  expect(screen.getByLabelText('比较值')).toHaveValue(0);
});

it('preserves complex conditions until the author explicitly generates a replacement', () => {
  setup();
  const expression = screen.getByLabelText('条件表达式（可手动编辑复杂条件）');
  expect(expression).toHaveValue('visits >= 2 && ready');
  expect(screen.getByRole('option', {name:'同行次数 · number · story'})).toHaveValue('visits');
  fireEvent.change(screen.getByLabelText('比较值'), {target:{value:'2'}});
  expect(expression).toHaveValue('visits >= 2 && ready');
  fireEvent.click(screen.getByRole('button', {name:'生成条件表达式'}));
  expect(expression).toHaveValue('visits >= 2');
});

it('quotes text, restricts boolean comparisons and rejects empty numeric values', () => {
  setup();
  fireEvent.change(screen.getByLabelText('比较值'), {target:{value:''}});
  expect(screen.getByRole('button', {name:'生成条件表达式'})).toBeDisabled();
  fireEvent.change(screen.getByLabelText('比较值类型'), {target:{value:'string'}});
  fireEvent.change(screen.getByLabelText('比较值'), {target:{value:'雨后的"约定"'}});
  fireEvent.click(screen.getByRole('button', {name:'生成条件表达式'}));
  expect(screen.getByLabelText('条件表达式（可手动编辑复杂条件）')).toHaveValue('visits == "雨后的\\"约定\\""');
  fireEvent.change(screen.getByLabelText('比较值类型'), {target:{value:'boolean'}});
  fireEvent.click(screen.getByRole('button', {name:'生成条件表达式'}));
  expect(screen.getByLabelText('条件表达式（可手动编辑复杂条件）')).toHaveValue('visits == true');
  expect(screen.queryByRole('option', {name:'大于'})).not.toBeInTheDocument();
});
