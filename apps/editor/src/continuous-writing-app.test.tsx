import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import { App } from './App';
import { projectCanonicalFromStory } from './canonical-project-adapter';

const project = () => projectCanonicalFromStory({ schemaVersion: 0, id: 'continuous-writing', title: '连续写作', entrySceneId: 'opening', characters: [{ id: 'a', displayName: '小夏', color: '#123456' }], scenes: [
  { id: 'opening', title: '开场', statements: [
    { id: 'first', kind: 'narration', text: '开场第一段', textId: 'text_first' },
    { id: 'cue', kind: 'direction', command: 'background', summary: 'asset=station' },
    { id: 'second', kind: 'dialogue', speakerId: 'a', text: '第二段对白', textId: 'text_second' },
    { id: 'third', kind: 'narration', text: '第三段旁白', textId: 'text_third' },
    { id: 'branch', kind: 'choice', prompt: '去哪里', options: [{ id: 'option', label: '去车站', targetSceneId: 'station' }] }
  ] },
  { id: 'station', title: '车站', statements: [{ id: 'ending', kind: 'end', endingName: '结束' }] }
] }, 'continuous-writing-project');
const field = () => screen.getByRole('textbox', { name: /旁白文本|对白内容/ });
function open() { render(<App initialProject={project()}/>); fireEvent.click(screen.getByRole('button', { name: '选择旁白：开场第一段' })); }

it('auto-applies narration without remounting its input or losing whitespace; undo and redo retain IDs', async () => {
  open(); const input = field(), text = ' 开场修改\n第二行。 ';
  fireEvent.change(input, { target: { value: text } });
  await waitFor(() => expect(document.getElementById('statement-card-first')).toHaveTextContent('开场修改 第二行。'));
  await waitFor(() => expect(input).toHaveAttribute('data-input-state', 'committed'));
  expect(field()).toBe(input); expect(input).toHaveValue(text);
  fireEvent.click(screen.getByRole('button', { name: '撤销' })); expect(field()).toHaveValue('开场第一段');
  fireEvent.click(screen.getByRole('button', { name: '重做' })); expect(field()).toHaveValue(text);
  fireEvent.click(screen.getByRole('tab', { name: 'Script' }));
  expect((screen.getByLabelText('权威脚本编辑器') as HTMLTextAreaElement).value).toContain('@sid(first) @id(text_first)');
});

it('flushes one text batch and focuses the next text across cues without inserting or changing the route', async () => {
  open(); fireEvent.change(field(), { target: { value: '新的开场' } });
  fireEvent.click(screen.getByRole('button', { name: '下一段文字' }));
  expect(field()).toHaveValue('第二段对白'); expect(field()).toHaveFocus();
  fireEvent.change(field(), { target: { value: '新的对白' } });
  fireEvent.keyDown(field(), { key: 'PageDown', altKey: true });
  expect(field()).toHaveValue('第三段旁白'); expect(field()).toHaveFocus();
  expect(screen.getByRole('button', { name: '下一段文字' })).toBeDisabled();
  expect(screen.getByRole('heading', { name: '开场' })).toBeVisible();
  fireEvent.keyDown(field(), { key: 'PageUp', altKey: true });
  expect(field()).toHaveValue('新的对白');
  fireEvent.click(screen.getByRole('button', { name: '撤销' })); expect(field()).toHaveValue('第二段对白');
  fireEvent.click(screen.getByRole('button', { name: '重做' })); expect(field()).toHaveValue('新的对白');
  await waitFor(() => expect(screen.getByRole('button', { name: '选择旁白：新的开场' })).toBeEnabled());
});

it('retains empty text for correction and prevents both paragraph and scene loss until Escape', async () => {
  open(); fireEvent.change(field(), { target: { value: ' ' } });
  fireEvent.click(screen.getByRole('button', { name: '下一段文字' }));
  expect(screen.getByRole('alert')).toHaveTextContent('文字不能为空');
  expect(field()).toHaveValue(' '); expect(screen.getByRole('button', { name: '选择对白：第二段对白' })).toBeDisabled();
  fireEvent.keyDown(field(), { key: 'PageDown', altKey: true }); expect(field()).toHaveValue(' ');
  fireEvent.keyDown(field(), { key: 'Escape' }); expect(field()).toHaveValue('开场第一段');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '下一段文字' })); expect(field()).toHaveValue('第二段对白');
});

it('does not navigate or commit composition text even through the pointer controls', () => {
  open(); fireEvent.compositionStart(field()); fireEvent.change(field(), { target: { value: 'pin' } });
  fireEvent.click(screen.getByRole('button', { name: '下一段文字' })); expect(field()).toHaveValue('pin');
  expect(screen.getByRole('button', { name: '选择旁白：开场第一段' })).toBeDisabled();
  fireEvent.compositionEnd(field()); fireEvent.change(field(), { target: { value: '拼音落定' } });
  fireEvent.click(screen.getByRole('button', { name: '下一段文字' })); expect(field()).toHaveValue('第二段对白');
  expect(screen.getByRole('button', { name: '选择旁白：拼音落定' })).toBeVisible();
});

it('manual application cancels the idle batch and paragraph boundaries never create content', async () => {
  open(); expect(screen.getByRole('button', { name: '上一段文字' })).toBeDisabled();
  fireEvent.change(field(), { target: { value: '立即应用' } }); fireEvent.click(screen.getByRole('button', { name: '应用修改' }));
  await waitFor(() => expect(field()).toHaveAttribute('data-input-state', 'committed'));
  fireEvent.click(screen.getByRole('button', { name: '撤销' })); expect(field()).toHaveValue('开场第一段');
  expect(screen.getByRole('button', { name: '撤销' })).toBeDisabled();
  fireEvent.keyDown(field(), { key: 'PageUp', altKey: true }); expect(field()).toHaveValue('开场第一段');
  expect(document.querySelectorAll('.statement-card')).toHaveLength(5);
});

it('reveals and focuses the next paragraph when crossing a bounded card window', async () => {
  const large = projectCanonicalFromStory({ schemaVersion: 0, id: 'long-writing', title: '长场景', entrySceneId: 'long', characters: [], scenes: [{ id: 'long', title: '长场景', statements: Array.from({ length: 80 }, (_, i) => ({ id: `p_${i}`, kind: 'narration' as const, textId: `t_${i}`, text: `第${i}段` })) }] }, 'long-writing-project');
  render(<App initialProject={large}/>);
  fireEvent.click(document.getElementById('statement-card-p_63')!);
  const controls = () => within(document.querySelector('.writing-text-inspector') as HTMLElement);
  fireEvent.change(controls().getByLabelText('旁白文本'), { target: { value: '窗口末尾改稿' } });
  fireEvent.click(controls().getByRole('button', { name: '下一段文字' }));
  expect(controls().getByLabelText('旁白文本')).toHaveValue('第64段');
  expect(document.activeElement?.id).toBe('writing-text-p_64');
  expect(document.getElementById('statement-card-p_64')).toBeVisible();
  fireEvent.click(controls().getByRole('button', { name: '上一段文字' }));
  expect(controls().getByLabelText('旁白文本')).toHaveValue('窗口末尾改稿');
  expect(document.activeElement?.id).toBe('writing-text-p_63');
});
