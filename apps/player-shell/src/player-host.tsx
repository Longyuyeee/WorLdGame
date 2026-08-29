import { useEffect, useMemo, useState, type ComponentProps } from "react";
import { PlayerShell, type PlayerHostActivityV1 } from "./PlayerShell";
import { IndexedDbWorldPlayerSaveStoreV2 } from "./player-save-store";
import { IndexedDbWorldPlayerRecoveryStoreV1 } from "./player-recovery-store";

export interface WebPlayerHostProps extends Omit<ComponentProps<typeof PlayerShell>, "hostActivity" | "platform"> {
  readonly activityOverride?: PlayerHostActivityV1;
}

function documentActivity(): PlayerHostActivityV1 {
  return typeof document !== "undefined" && document.visibilityState === "hidden" ? "suspended" : "active";
}

export function WebPlayerHost({ activityOverride, saveStore, recoveryStore, ...props }: WebPlayerHostProps) {
  const [activity, setActivity] = useState(documentActivity);
  const resolvedSaveStore = useMemo(() => saveStore ?? (typeof indexedDB === "undefined" ? undefined : new IndexedDbWorldPlayerSaveStoreV2(indexedDB)), [saveStore]);
  const resolvedRecoveryStore = useMemo(() => recoveryStore ?? (typeof indexedDB === "undefined" ? undefined : new IndexedDbWorldPlayerRecoveryStoreV1(indexedDB)), [recoveryStore]);

  useEffect(() => {
    const onVisibilityChange = () => setActivity(documentActivity());
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  return <PlayerShell {...props} {...(resolvedSaveStore === undefined ? {} : { saveStore: resolvedSaveStore })} {...(resolvedRecoveryStore === undefined ? {} : { recoveryStore: resolvedRecoveryStore })} platform="web" hostActivity={activityOverride ?? activity} />;
}
