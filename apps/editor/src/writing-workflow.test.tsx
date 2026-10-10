import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it } from 'vitest';
import { App } from './App';
import { projectCanonicalFromStory } from './canonical-project-adapter';
import { sequenceInsertionAnchor } from './sequence-editor-model';

it('keeps insertion before an ending, after all options of a preceding choice',()=>{
  const choice={id:'pick',kind:'choice',prompt:'选',options:[{id:'option_a',label:'A',targetSceneId:'scene_b'}]} as const;
  const end={id:'end',kind:'end',endingName:'终'} as const;
  expect(sequenceInsertionAnchor([end],'scene','end')).toBe('scene');
  expect(sequenceInsertionAnchor([choice,end],'scene','end')).toBe('option_a');
});

it('writes before a new scene ending and changes speaker without replacing text',async()=>{
  const project=projectCanonicalFromStory({schemaVersion:0,id:'writing-flow',title:'连续写作',entrySceneId:'scene_start',characters:[
    {id:'char_a',displayName:'阿岚',color:'#112233'},{id:'char_b',displayName:'小夏',color:'#445566'}
  ],scenes:[{id:'scene_start',title:'开场',statements:[{id:'ending',kind:'end',endingName:'结束'}]}]},'writing-flow-project');
  render(<App initialProject={project}/>);
  fireEvent.click(screen.getByRole('button',{name:'＋ 插入'}));
  fireEvent.change(screen.getByLabelText('对白内容'),{target:{value:'我们一起去车站。'}});
  fireEvent.blur(screen.getByLabelText('对白内容'));
  await waitFor(()=>expect(screen.getByRole('button',{name:'选择对白：我们一起去车站。'})).toBeVisible());
  fireEvent.change(screen.getByLabelText('说话人'),{target:{value:'char_b'}});
  expect(screen.getByLabelText('对白内容')).toHaveValue('我们一起去车站。');
  fireEvent.click(screen.getByRole('tab',{name:'Script'}));
  const source=(screen.getByLabelText('权威脚本编辑器') as HTMLTextAreaElement).value;
  expect(source).toContain('char_b');
  expect(source.indexOf('我们一起去车站。')).toBeLessThan(source.indexOf('end '));
});
