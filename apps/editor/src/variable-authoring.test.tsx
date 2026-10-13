import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import { App } from './App';
import { projectCanonicalFromStory } from './canonical-project-adapter';
import { createVariableEntity } from '@world-studio/project-domain';

it('shows variable meaning and scope while committing stable IDs', () => {
  const base=projectCanonicalFromStory({schemaVersion:0,id:'variable-author',title:'变量写作',entrySceneId:'scene_start',characters:[],scenes:[
    {id:'scene_start',title:'开场',statements:[{id:'set_start',kind:'set',variable:'trust_story',expression:'1'},{id:'end_start',kind:'end',endingName:'结束'}]},
  ]},'variable-author-project');
  const project={...base,variables:{...base.variables,variables:[createVariableEntity('trust_story','好感度','number',0,'story'),createVariableEntity('trust_scene','好感度','number',0,'scene')]}};
  render(<App initialProject={project}/>);
  const input=screen.getByLabelText('要修改的变量');
  expect(within(input).getByRole('option',{name:'好感度 · 数值 · 故事 · trust_story'})).toHaveValue('trust_story');
  fireEvent.change(input,{target:{value:'trust_scene'}});
  expect(within(input).getByRole('option',{name:'好感度 · 数值 · 场景 · trust_scene'})).toHaveValue('trust_scene');
  fireEvent.click(screen.getByRole('button',{name:'应用修改'}));
  fireEvent.click(screen.getByRole('tab',{name:'Script'}));
  expect((screen.getByLabelText('权威脚本编辑器') as HTMLTextAreaElement).value).toContain('trust_scene');
  expect((screen.getByLabelText('权威脚本编辑器') as HTMLTextAreaElement).value).not.toContain('好感度');
});
