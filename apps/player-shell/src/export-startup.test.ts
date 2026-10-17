import { afterEach, expect, it, vi } from "vitest";
import { startExportedPlayer } from "./export-startup";
import { prepareNativeAtlasMediaAsync as hydrateNativeAtlasMediaAsync } from "./lazy-atlas-media";
import { mountWorldPlayerV1 } from "./mount-player";
vi.mock("./lazy-atlas-media",()=>({prepareNativeAtlasMediaAsync:vi.fn()}));
vi.mock("./mount-player",()=>({mountWorldPlayerV1:vi.fn()}));
afterEach(()=>{ vi.resetAllMocks(); document.body.replaceChildren(); document.querySelector('meta[name="world-release"]')?.remove(); history.replaceState(null, '', '/'); });
const fixture=()=>{const root=document.createElement("div"),payload=document.createElement("script");payload.textContent="{}";return{root,payload};};
it("shows loading, cancels, retries and cleans up only its own successful attempt",async()=>{
  const {root,payload}=fixture(),dispose=vi.fn(),unmount=vi.fn(),trimIdle=vi.fn(),notifyMemoryPressure=vi.fn();
  let finish!:(value:{media:never[];dispose:()=>void;trimIdle:()=>void})=>void;
  vi.mocked(hydrateNativeAtlasMediaAsync).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
  vi.mocked(hydrateNativeAtlasMediaAsync).mockResolvedValue({media:[],dispose,trimIdle});
  vi.mocked(mountWorldPlayerV1).mockReturnValue({unmount,notifyMemoryPressure} as unknown as ReturnType<typeof mountWorldPlayerV1>);
  const handle=startExportedPlayer(root,payload);expect(root.textContent).toContain("取消加载");
  expect(()=>handle.notifyMemoryPressure("critical")).toThrow("NOT_READY");
  await vi.waitFor(()=>expect(finish).toBeTypeOf("function"));root.querySelector("button")!.click();
  expect(root.dataset.startupState).toBe("cancelled");
  const staleDispose=vi.fn();finish({media:[],dispose:staleDispose,trimIdle:vi.fn()});
  root.querySelector("button")!.click();await vi.waitFor(()=>expect(root.dataset.startupState).toBe("ready"));
  expect(staleDispose).toHaveBeenCalledOnce();expect(mountWorldPlayerV1).toHaveBeenCalledOnce();
  expect(vi.mocked(mountWorldPlayerV1).mock.calls[0]![1].onReleaseIdleResources).toBe(trimIdle);
  vi.mocked(mountWorldPlayerV1).mock.calls[0]![1].onReleaseIdleResources!();expect(trimIdle).toHaveBeenCalledOnce();
  handle.notifyMemoryPressure("critical");expect(notifyMemoryPressure).toHaveBeenCalledWith("critical");
  handle.dispose();handle.dispose();expect(dispose).toHaveBeenCalledOnce();expect(unmount).toHaveBeenCalledOnce();
  expect(()=>handle.notifyMemoryPressure("critical")).toThrow("NOT_READY");
});
it("offers retry on damaged payload and does not mount after non-persisted pagehide",async()=>{
  const {root,payload}=fixture();payload.textContent="invalid";
  const handle=startExportedPlayer(root,payload);await vi.waitFor(()=>expect(root.dataset.startupState).toBe("failed"));
  expect(root.querySelector('[role="alert"]')?.textContent).toContain("重新下载");
  payload.textContent="{}";root.querySelector("button")!.click();
  window.dispatchEvent(new PageTransitionEvent("pagehide",{persisted:false}));
  await new Promise(resolve=>setTimeout(resolve,20));expect(mountWorldPlayerV1).not.toHaveBeenCalled();handle.dispose();
});
it("keeps game information available during loading, cancellation and failure, hiding its home only after mounting", async () => {
  const { root, payload } = fixture(); root.id = 'player-root';
  const home = document.createElement('div'); home.id = 'world-publication-home'; home.hidden = true; document.body.append(home, root);
  payload.textContent = 'invalid'; const handle = startExportedPlayer(root, payload); expect(home.hidden).toBe(false);
  root.querySelector('button')!.click(); expect(root.dataset.startupState).toBe('cancelled'); expect(home.hidden).toBe(false);
  root.querySelector('button')!.click(); await vi.waitFor(() => expect(root.dataset.startupState).toBe('failed')); expect(home.hidden).toBe(false);
  payload.textContent = '{}'; vi.mocked(hydrateNativeAtlasMediaAsync).mockResolvedValue({ media: [], dispose: vi.fn(), trimIdle: vi.fn() });
  vi.mocked(mountWorldPlayerV1).mockReturnValue({ unmount: vi.fn() } as unknown as ReturnType<typeof mountWorldPlayerV1>);
  root.querySelector('button')!.click(); await vi.waitFor(() => expect(root.dataset.startupState).toBe('ready')); expect(home.hidden).toBe(true);
  handle.dispose(); expect(home.hidden).toBe(false);
});

it('refuses a requested old release when a fresh browser receives a different server build, without parsing or mounting it', () => {
  const meta = document.createElement('meta'); meta.name = 'world-release'; meta.content = 'sha256:' + 'a'.repeat(64); document.head.append(meta);
  history.replaceState(null, '', '/game/?world-release=' + encodeURIComponent('sha256:' + 'b'.repeat(64)));
  const { root, payload } = fixture(); const handle = startExportedPlayer(root, payload);
  expect(root.dataset.startupState).toBe('release-missing'); expect(root.querySelector('[role="alert"]')).toHaveTextContent('未打开新版或改写存档');
  expect(new URL(root.querySelector('a')!.href).searchParams.has('world-release')).toBe(false); expect(mountWorldPlayerV1).not.toHaveBeenCalled(); expect(hydrateNativeAtlasMediaAsync).not.toHaveBeenCalled(); handle.dispose();
});

it('navigates an unversioned website entry before mounting so replacement Workers see a pinned client URL', () => {
  const doc = document.implementation.createHTMLDocument(), replace = vi.fn(); Object.defineProperty(doc, 'defaultView', { value: { location: { protocol: 'http:', href: 'http://localhost/game/?setting=keep#place', replace } } });
  const meta = doc.createElement('meta'); meta.name = 'world-release'; meta.content = 'sha256:' + 'a'.repeat(64); doc.head.append(meta);
  const root = doc.createElement('div'), payload = doc.createElement('script'); payload.textContent = '{}'; const handle = startExportedPlayer(root, payload);
  const target = new URL(replace.mock.calls[0]![0]); expect(target.searchParams.get('world-release')).toBe(meta.content); expect(target.searchParams.get('setting')).toBe('keep'); expect(target.hash).toBe('#place');
  expect(root.dataset.startupState).toBe('pinning'); expect(mountWorldPlayerV1).not.toHaveBeenCalled(); expect(hydrateNativeAtlasMediaAsync).not.toHaveBeenCalled(); handle.dispose();
});

it('mounts a matching pinned website without another navigation', async () => {
  const meta = document.createElement('meta'); meta.name = 'world-release'; meta.content = 'sha256:' + 'a'.repeat(64); document.head.append(meta); history.replaceState(null, '', '/game/?world-release=' + encodeURIComponent(meta.content));
  vi.mocked(hydrateNativeAtlasMediaAsync).mockResolvedValue({ media: [], dispose: vi.fn(), trimIdle: vi.fn() }); vi.mocked(mountWorldPlayerV1).mockReturnValue({ unmount: vi.fn() } as unknown as ReturnType<typeof mountWorldPlayerV1>);
  const { root, payload } = fixture(); const handle = startExportedPlayer(root, payload);
  expect(new URL(location.href).searchParams.get('world-release')).toBe(meta.content);
  await vi.waitFor(() => expect(root.dataset.startupState).toBe('ready')); handle.dispose();
});
