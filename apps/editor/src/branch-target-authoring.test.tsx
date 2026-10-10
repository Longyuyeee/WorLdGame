import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import { App } from './App';
import { projectCanonicalFromStory } from './canonical-project-adapter';

it('chooses named scenes but writes stable IDs into Script, including duplicate titles', () => {
  const project=projectCanonicalFromStory({schemaVersion:0,id:'branch-author',title:'分支写作',entrySceneId:'scene_start',characters:[],scenes:[
    {id:'scene_start',title:'开场',statements:[{id:'jump_start',kind:'jump',targetLabel:'scene_left'}]},
    {id:'scene_left',title:'旧车站',statements:[{id:'end_left',kind:'end',endingName:'左线'}]},
    {id:'scene_right',title:'旧车站',statements:[{id:'end_right',kind:'end',endingName:'右线'}]},
  ]},'branch-author-project');
  render(<App initialProject={project}/>);
  const target=screen.getByLabelText('目标稳定 ID');
  expect(within(target).getByRole('option',{name:'场景：旧车站 · scene_right'})).toHaveValue('scene_right');
  expect(within(target).getByRole('option',{name:'场景：旧车站 · scene_left'})).toHaveValue('scene_left');
  fireEvent.change(target,{target:{value:'scene_right'}});
  fireEvent.click(screen.getByRole('button',{name:'应用类型化参数'}));
  fireEvent.click(screen.getByRole('tab',{name:'Script'}));
  expect((screen.getByLabelText('权威脚本编辑器') as HTMLTextAreaElement).value).toContain('scene_right');
  expect((screen.getByLabelText('权威脚本编辑器') as HTMLTextAreaElement).value).not.toContain('旧车站');
});
