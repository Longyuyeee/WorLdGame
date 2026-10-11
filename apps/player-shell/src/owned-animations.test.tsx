import {render} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import {releaseAnimationsOnDetach} from './owned-animations';

it('cancels owned subtree animations on removing a keyed text node, not on ordinary rerenders',async()=>{
  const view=(key:string)=><span key={key} ref={releaseAnimationsOnDetach}>{key}</span>;
  const screen=render(view('one')),old=screen.container.firstElementChild!;
  const cancel=vi.fn(()=>expect(old.isConnected).toBe(false));
  const getAnimations=vi.fn(()=>[{cancel}]);Object.defineProperty(old,'getAnimations',{value:getAnimations});
  screen.rerender(view('one'));expect(cancel).not.toHaveBeenCalled();
  screen.rerender(view('two'));await Promise.resolve();expect(getAnimations).toHaveBeenCalledWith({subtree:true});expect(cancel).toHaveBeenCalledOnce();
  const current=screen.container.firstElementChild!,cancelCurrent=vi.fn();
  Object.defineProperty(current,'getAnimations',{value:()=>[{cancel:cancelCurrent}]});
  screen.unmount();await Promise.resolve();expect(cancelCurrent).toHaveBeenCalledOnce();expect(cancel).toHaveBeenCalledOnce();
});
it('supports environments without Web Animations and never scans the document',()=>{
  expect(releaseAnimationsOnDetach(null)).toBeUndefined();
  const node=document.createElement('span');
  Object.defineProperty(node,'getAnimations',{value:undefined});
  expect(()=>releaseAnimationsOnDetach(node)!()).not.toThrow();
});
it('releases a finished animation omitted from later enumeration and breaks its target/timeline references',async()=>{
  const node=document.createElement('span');document.body.append(node);
  const animation={cancel:vi.fn(),effect:{},timeline:{}};
  const enumerate=vi.fn().mockReturnValueOnce([animation]).mockReturnValue([]);
  Object.defineProperty(node,'getAnimations',{value:enumerate});
  const detach=releaseAnimationsOnDetach(node)!;detach();node.remove();await Promise.resolve();
  expect(animation.cancel).toHaveBeenCalledOnce();expect(animation.effect).toBeNull();expect(animation.timeline).toBeNull();
});
it('does not cancel animations when React replays a ref while its node remains connected',async()=>{
  const node=document.createElement('span');document.body.append(node);
  const animation={cancel:vi.fn(),effect:{},timeline:{}};
  Object.defineProperty(node,'getAnimations',{value:()=>[animation]});
  const first=releaseAnimationsOnDetach(node)!;first();
  const second=releaseAnimationsOnDetach(node)!;await Promise.resolve();
  expect(animation.cancel).not.toHaveBeenCalled();
  second();node.remove();await Promise.resolve();expect(animation.cancel).toHaveBeenCalledOnce();
});
