import { useEffect, useMemo, useState, type ComponentProps } from "react";
import { flushSync } from "react-dom";
import { PlayerShell, type PlayerHostActivityV1 } from "./PlayerShell";
import { IndexedDbWorldPlayerSaveStoreV3 } from "./player-save-store";
import { IndexedDbWorldPlayerRecoveryStoreV1 } from "./player-recovery-store";

export interface WebPlayerHostProps extends Omit<ComponentProps<typeof PlayerShell>, "hostActivity" | "platform"> {
  readonly activityOverride?: PlayerHostActivityV1;
}

function documentActivity(): PlayerHostActivityV1 {
  return typeof document !== "undefined" && document.visibilityState === "hidden" ? "suspended" : "active";
}

export function WebPlayerHost({ activityOverride, saveStore, recoveryStore, ...props }: WebPlayerHostProps) {
  const [activity, setActivity] = useState(documentActivity);
  const [frozen, setFrozen] = useState(false);
  const resolvedSaveStore = useMemo(() => saveStore ?? (typeof indexedDB === "undefined" ? undefined : new IndexedDbWorldPlayerSaveStoreV3(indexedDB)), [saveStore]);
  const resolvedRecoveryStore = useMemo(() => recoveryStore ?? (typeof indexedDB === "undefined" ? undefined : new IndexedDbWorldPlayerRecoveryStoreV1(indexedDB)), [recoveryStore]);

  useEffect(() => {
    const onVisibilityChange = () => setActivity(documentActivity());
    // Commit timer/media suspension before the browser freezes the task queue.
    const onFreeze = () => flushSync(() => setFrozen(true));
    const onResume = () => flushSync(() => { setActivity(documentActivity()); setFrozen(false); });
    document.addEventListener("visibilitychange", onVisibilityChange);
    document.addEventListener("freeze", onFreeze);
    document.addEventListener("resume", onResume);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      document.removeEventListener("freeze", onFreeze);
      document.removeEventListener("resume", onResume);
    };
  }, []);

  // Host permission may suspend playback, but must never override a hidden page.
  const effectiveActivity = frozen || activity === "suspended" || activityOverride === "suspended" ? "suspended" : "active";
  return <PlayerShell {...props} {...(resolvedSaveStore === undefined ? {} : { saveStore: resolvedSaveStore })} {...(resolvedRecoveryStore === undefined ? {} : { recoveryStore: resolvedRecoveryStore })} platform="web" hostActivity={effectiveActivity} />;
}
