import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import { it, expect, vi } from 'vitest';
import { createProject, type ProjectWorkspace, type ProjectFiles } from '@world-studio/project-domain';
import { ProjectEntityManager } from './project-entity-manager';
import { App } from './App';

it('carries a newly created scene into content editing without changing the game entry', async () => {
  let files: ProjectFiles = {};
  const workspace: ProjectWorkspace = {
    reference: { referenceId:'writing',hostKind:'memory-test',displayLocation:'Writing',permissionKey:'writing' },
    readFiles: async () => ({files,version:'0'}),
    writeFiles: async next => { files=next; return {version:'0'}; },
  };
  const session=await createProject(workspace,'写作测试','018f08d8-71a1-7bc2-a627-2f4a843ee190');
  const open=vi.fn(); let serial=0;
  render(<ProjectEntityManager session={session} workspace={workspace} onSession={()=>{}} onOpenEditor={open} idFactory={()=>`writing${++serial}`}/>);
  fireEvent.click(screen.getByRole('button',{name:'新增场景'}));
  fireEvent.change(screen.getByLabelText('新场景名称'),{target:{value:'第二幕'}});
  fireEvent.click(screen.getByRole('button',{name:'创建场景'}));
  fireEvent.click(screen.getByRole('button',{name:'编辑场景：第二幕'}));
  const [project,sceneId]=open.mock.calls[0]!;
  expect(project.manifest.entrySceneId).toBe(session.project!.manifest.entrySceneId);
  expect(sceneId).not.toBe(project.manifest.entrySceneId);
  expect(project.scenes.find((scene:{id:string})=>scene.id===sceneId).title).toBe('第二幕');
  cleanup();
  const rendered=render(<App initialProject={project} initialSceneId={sceneId}/>);
  expect(rendered.container.querySelector('.scene-item.is-active')).toHaveTextContent('第二幕');
});
