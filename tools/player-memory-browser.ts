import { loadProject, migrateS0Project, type S0Project } from "../packages/project-domain/src/index";
import { withProjectSettings } from "../packages/gal-settings/src/index";
import { createPlayerCore, createPlayerCoreSessionSaveV1, createPlayerCoreSnapshotV1, dispatchPlayerCoreIntentV1 } from "../packages/player-core/src/index";
import { mountWorldPlayerV1, type WorldPlayerHandleV1 } from "../apps/player-shell/src/mount-player";
import { createWorldPlayerRecoveryRecordV1, IndexedDbWorldPlayerRecoveryStoreV1 } from "../apps/player-shell/src/player-recovery-store";
import { IndexedDbWorldPlayerSaveStoreV3 } from "../apps/player-shell/src/player-save-store";
import css from "../apps/player-shell/src/player-shell.css?inline";
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const main = () => document.querySelector<HTMLElement>('main')!;
function check(condition: unknown, message: string): asserts condition { if (!condition) throw Error(message); }
async function until(test: () => boolean) { for (let i = 0; i < 400; i++) { if (test()) return; await pause(20); } throw Error(`Memory workflow timeout: ${JSON.stringify(main()?.dataset)}`); }
function click(name: string) { const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent?.trim() === name || item.getAttribute('aria-label') === name); check(button && !button.disabled, `Missing ${name}`); button.click(); }

export function start(id: string) {
  const style = document.createElement('style'); style.textContent = css; document.head.append(style);
  const source: S0Project = { schemaVersion: 0, id, title: "低内存进度保护", entrySceneId: "long", characters: [], scenes: [{ id: "long", title: "长篇", statements: [
    ...Array.from({ length: 200 }, (_, i) => ({ id: `line_${i}`, kind: 'narration' as const, textId: `text_${i}`, text: `长篇故事第 ${i} 句` })),
    { id: 'end', kind: 'end', endingName: 'Done' }
  ] }] };
  const base = loadProject(migrateS0Project(source).files);
  const project = { ...base, settings: withProjectSettings(base.settings, { text: { revealMode: 'instant' } }) };
  let state = dispatchPlayerCoreIntentV1(createPlayerCore(project), project, { kind: 'primary' });
  for (let i = 0; i < 150; i++) state = dispatchPlayerCoreIntentV1(state, project, { kind: 'primary' });
  for (let i = 0; i < 10; i++) state = dispatchPlayerCoreIntentV1(state, project, { kind: 'back' });
  const saved = createPlayerCoreSessionSaveV1(state), snapshot = createPlayerCoreSnapshotV1(state);
  check(saved.ok, 'Seed save failed');
  const backend = new IndexedDbWorldPlayerRecoveryStoreV1(), saves = new IndexedDbWorldPlayerSaveStoreV3();
  let failed = false, releases = 0, handle: WorldPlayerHandleV1;
  const initial = backend.write(createWorldPlayerRecoveryRecordV1({ projectId: id, title: project.manifest.title, sceneId: 'long', presentationKind: 'narration',
    savedAtEpochMilliseconds: Date.now(), buildId: snapshot.identities.buildId!, runtimeStateHash: snapshot.runtimeStateHash!, sessionArtifactHash: saved.artifactHash, serializedSessionSave: saved.serialized })).then(() => {
    handle = mountWorldPlayerV1(document.getElementById('player-root')!, { project, saveStore: saves,
      recoveryStore: { version: backend.version, backend: 'IndexedDB-injected-write-failure', read: key => backend.read(key), clear: key => backend.clear(key), write: async record => { if (failed) throw Error('injected disk failure'); await backend.write(record); } },
      onReleaseIdleResources: () => { releases++; } });
  });
  let beforeHash = '', beforeLength = 0, quickHash = '';
  return {
    async ready() { await initial; await until(() => main().dataset.recoveryOperation === 'available'); click('恢复上次进度'); await until(() => main().dataset.playerStatus === 'presenting');
      beforeHash = main().dataset.runtimeStateHash!; beforeLength = Number(main().dataset.historyLength);
      click('快速保存'); await until(() => main().dataset.saveOperation === 'saved'); quickHash = (await saves.read(id, 'quick-1'))!.sessionArtifactHash;
      return { beforeHash, beforeLength, cursor: Number(main().dataset.historyCursor) };
    },
    async protect() { handle.notifyMemoryPressure('critical'); await until(() => handle.getObservation().memoryPressure === 'protected');
      check(main().dataset.runtimeStateHash === beforeHash, 'Protection changed current authority');
      check(Number(main().dataset.historyLength) < beforeLength && main().dataset.historyArchives === '1', 'History did not shrink into archive');
      check((await backend.read(id))!.runtimeStateHash === beforeHash, 'Protected point mismatch');
      check((await saves.read(id, 'quick-1'))!.sessionArtifactHash === quickHash, 'Formal quick slot was modified');
      const length = Number(main().dataset.historyLength), cursor = Number(main().dataset.historyCursor);
      check(length - cursor === 10, 'Recorded future lost');
      click('前进一步'); await until(() => main().dataset.runtimeStateHash !== beforeHash); click('后退一步'); await until(() => main().dataset.runtimeStateHash === beforeHash);
      click('打开剧情历史'); await until(() => Boolean(document.querySelector('.player-history-panel__archive'))); click('关闭剧情历史'); await until(() => !document.querySelector('.player-history-panel'));
      return { beforeLength, afterLength: length, cursor, future: 10, statePreserved: true, quickPreserved: true, archiveVisible: true, backForwardHeld: true, releases };
    },
    async fail() { click('快速读取'); await until(() => main().dataset.saveOperation === 'loaded' && Number(main().dataset.historyLength) === beforeLength); beforeHash = main().dataset.runtimeStateHash!;
      failed = true; handle.notifyMemoryPressure('critical'); await until(() => handle.getObservation().memoryPressure === 'error');
      check(Number(main().dataset.historyLength) === beforeLength && main().dataset.runtimeStateHash === beforeHash, 'Failed protection removed history'); return { failedWriteHeld: true };
    },
    async retry() { failed = false; click('重试内存保护'); await until(() => handle.getObservation().memoryPressure === 'protected'); check(main().dataset.runtimeStateHash === beforeHash, 'Retry changed current line'); return { retryProtected: true }; },
    close() { handle.unmount(); style.remove(); return { unmounted: !document.querySelector('main') }; }
  };
}
