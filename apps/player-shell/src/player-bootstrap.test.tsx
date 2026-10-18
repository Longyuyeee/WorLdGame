import { afterEach,expect,it,vi } from "vitest";
import { fireEvent,render,screen } from "@testing-library/react";
import { loadProject,migrateS0Project } from "@world-studio/project-domain";
import { createPlayerCore } from "@world-studio/player-core";
import { withProjectSettings } from "@world-studio/gal-settings";
import { PlayerShell } from "./PlayerShell";

vi.mock("@world-studio/player-core",async importOriginal=>{
  const actual=await importOriginal<typeof import("@world-studio/player-core")>();return {...actual,createPlayerCore:vi.fn(actual.createPlayerCore)};
});
afterEach(()=>{vi.clearAllMocks();localStorage.clear();});
function project(){return loadProject(migrateS0Project({schemaVersion:0,id:"boot_once",title:"Start once",entrySceneId:"story",characters:[],scenes:[{id:"story",title:"Story",statements:[{id:"line",kind:"narration",textId:"text",text:"Read this line"},{id:"end",kind:"end",endingName:"Done"}]}]}).files);}

it("compiles once on first mount instead of resetting the same initial Core in a passive effect",()=>{
  render(<PlayerShell project={project()}/>);expect(createPlayerCore).toHaveBeenCalledOnce();expect(screen.getByRole('button',{name:'开始故事'})).toBeInTheDocument();
});
it("keeps progress for equivalent project objects, but compiles a genuinely changed project exactly once",()=>{
  const first=project(),view=render(<PlayerShell project={first}/>);fireEvent.click(screen.getByRole('button',{name:'开始故事'}));
  const hash=view.container.querySelector('main')!.getAttribute('data-runtime-state-hash');
  view.rerender(<PlayerShell project={{...first}}/>);expect(createPlayerCore).toHaveBeenCalledTimes(1);expect(view.container.querySelector('main')).toHaveAttribute('data-runtime-state-hash',hash);
  const changed={...first,manifest:{...first.manifest,title:'Changed'}};view.rerender(<PlayerShell project={changed}/>);expect(createPlayerCore).toHaveBeenCalledTimes(2);expect(screen.getByRole('button',{name:'开始故事'})).toBeInTheDocument();
  view.rerender(<PlayerShell project={{...changed}}/>);expect(createPlayerCore).toHaveBeenCalledTimes(2);
});
it("updates history policy without recompiling or losing the current line",()=>{
  const first=project(),view=render(<PlayerShell project={first}/>);fireEvent.click(screen.getByRole('button',{name:'开始故事'}));
  const hash=view.container.querySelector('main')!.getAttribute('data-runtime-state-hash');
  view.rerender(<PlayerShell project={{...first,settings:withProjectSettings(first.settings,{history:{allowForwardAfterBack:false}})}}/>);
  expect(createPlayerCore).toHaveBeenCalledOnce();expect(view.container.querySelector('main')).toHaveAttribute('data-runtime-state-hash',hash);expect(view.container.querySelector('main')).toHaveAttribute('data-history-forward-policy','false');
});
