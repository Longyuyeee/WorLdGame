import { loadProject, migrateS0Project, type S0Project } from "../packages/project-domain/src/index";
import { withProjectSettings } from "../packages/gal-settings/src/index";
import { mountWorldPlayerV1 } from "../apps/player-shell/src/mount-player";
import { IndexedDbWorldPlayerRecoveryStoreV1 } from "../apps/player-shell/src/player-recovery-store";
import { IndexedDbWorldPlayerSaveStoreV3 } from "../apps/player-shell/src/player-save-store";
import css from "../apps/player-shell/src/player-shell.css?inline";

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
function check(value: unknown, message: string): asserts value { if (!value) throw Error(message); }
const main = () => document.querySelector<HTMLElement>("main")!;
const hash = () => main().dataset.runtimeStateHash!;
async function until(test: () => boolean) { for (let n = 0; n < 550; n++) { if (test()) return; await pause(20); } throw Error(`Backpressure timeout: ${JSON.stringify(main()?.dataset)}`); }
function click(name: string) {
  const button = [...document.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent?.trim().startsWith(name) || item.getAttribute("aria-label") === name);
  check(button && !button.disabled, `Unavailable: ${name}`); button.click();
}

export function start(id: string) {
  const style = document.createElement("style"); style.textContent = css; document.head.append(style);
  const source: S0Project = { schemaVersion: 0, id, title: "长故事慢存储恢复", entrySceneId: "long", characters: [], scenes: [{ id: "long", title: "Long", statements: [
    ...Array.from({ length: 300 }, (_, n) => ({ id: `line_${n}`, kind: "narration" as const, textId: `text_${n}`, text: `连续故事 ${n}` })), { id: "end", kind: "end", endingName: "Done" }
  ] }] };
  const base = loadProject(migrateS0Project(source).files);
  const project = { ...base, settings: withProjectSettings(base.settings, { text: { revealMode: "instant" } }) };
  const backend = new IndexedDbWorldPlayerRecoveryStoreV1(), saves = new IndexedDbWorldPlayerSaveStoreV3();
  let gate: Promise<void> | null = null, release = () => {}, writes = 0, quota = false;
  const hold = () => { gate = new Promise<void>(resolve => { release = () => { gate = null; resolve(); }; }); };
  const store = { version: backend.version, backend: "real-IndexedDB-with-injected-delay-and-quota", read: (key: string) => backend.read(key), clear: (key: string) => backend.clear(key),
    write: async (record: Parameters<typeof backend.write>[0]) => { writes++; if (gate) await gate; if (quota) throw new DOMException("injected capacity failure", "QuotaExceededError"); await backend.write(record); } };
  const mount = () => mountWorldPlayerV1(document.getElementById("player-root")!, { project, recoveryStore: store, saveStore: saves });
  let handle = mount();
  let initialHash = "", latestHash = "", quickArtifact = "";
  return {
    async run() {
      await until(() => main().dataset.recoveryOperation === "idle"); hold(); click("开始故事"); await until(() => writes === 1);
      initialHash = hash();
      for (let n = 0; n < 150; n++) { await pause(25); const previous = hash(); click("继续下一句"); await until(() => hash() !== previous); }
      latestHash = hash(); check(writes === 1, "Recovery queued per story line");
      release(); await until(() => main().dataset.recoveryOperation === "ready" && writes === 2);
      await until(() => main().dataset.runtimeStateHash === latestHash);
      check((await backend.read(id))?.runtimeStateHash === latestHash, "Latest boundary not durable");
      click("快速保存"); await until(() => main().dataset.saveOperation === "saved"); quickArtifact = (await saves.read(id, "quick-1"))!.sessionArtifactHash;
      const writesAfterBurst = writes;
      hold(); const previous = hash(); click("继续下一句"); await until(() => hash() !== previous && writes === 3);
      await until(() => main().dataset.recoveryOperation === "error");
      const retry = [...document.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent === "重试恢复保护")!;
      check(retry.disabled && document.body.textContent?.includes("保存超时"), "Timeout must explain pending IO");
      click("继续下一句"); await pause(30); const afterTimeoutHash = hash(); check(writes === 3, "Timeout queued another physical write");
      release(); await until(() => !retry.disabled);
      check(main().dataset.recoveryOperation === "error", "Late completion hid timeout");
      click("重试恢复保护"); await until(() => main().dataset.recoveryOperation === "ready");
      check((await backend.read(id))?.runtimeStateHash === afterTimeoutHash, "Retry did not capture latest state");
      const prior = await backend.read(id); quota = true; click("继续下一句"); await until(() => main().dataset.recoveryOperation === "error");
      check(document.body.textContent?.includes("设备存储空间不足"), "Missing quota guidance");
      check((await backend.read(id))?.sessionArtifactHash === prior?.sessionArtifactHash, "Quota destroyed prior recovery");
      quota = false; click("重试恢复保护"); await until(() => main().dataset.recoveryOperation === "ready"); latestHash = hash();
      check((await backend.read(id))?.runtimeStateHash === latestHash, "Quota retry failed");
      handle.setHostActivity("suspended"); await pause(80); check(hash() === latestHash, "Suspension changed story"); handle.setHostActivity("active");
      check((await saves.read(id, "quick-1"))!.sessionArtifactHash === quickArtifact, "Recovery changed formal quick slot");
      return { storySteps: 150, mountsBeforeReopen: 1, writesAfterBurst, initialHash, latestHash, boundedWrites: true, timeoutHeld: true, lateSuccessRequiresRetry: true, quotaPreservesPrior: true, quotaRetry: true, quickSlotPreserved: true, suspendedHashHeld: true };
    },
    async reopen() {
      handle.unmount(); handle = mount(); await until(() => main().dataset.recoveryOperation === "available"); click("恢复上次进度"); await until(() => main().dataset.playerStatus === "presenting");
      check(hash() === latestHash, "Reopened recovery changed current state");
      const current = hash(); click("后退一步"); await until(() => hash() !== current); click("前进一步"); await until(() => hash() === current);
      return { recoveryHash: hash(), reopened: true, historyRoundTrip: true };
    },
    close() { handle.unmount(); style.remove(); return { unmounted: document.querySelector("main") === null }; }
  };
}
