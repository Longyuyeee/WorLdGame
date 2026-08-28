import { useEffect, useMemo, useState, type ComponentProps } from "react";
import { PlayerShell, type PlayerHostActivityV1 } from "./PlayerShell";
import { IndexedDbWorldPlayerSaveStoreV1 } from "./player-save-store";

export interface WebPlayerHostProps extends Omit<ComponentProps<typeof PlayerShell>, "hostActivity" | "platform"> {
  readonly activityOverride?: PlayerHostActivityV1;
}

function documentActivity(): PlayerHostActivityV1 {
  return typeof document !== "undefined" && document.visibilityState === "hidden" ? "suspended" : "active";
}

export function WebPlayerHost({ activityOverride, saveStore, ...props }: WebPlayerHostProps) {
  const [activity, setActivity] = useState(documentActivity);
  const resolvedSaveStore = useMemo(() => saveStore ?? (typeof indexedDB === "undefined" ? undefined : new IndexedDbWorldPlayerSaveStoreV1(indexedDB)), [saveStore]);

  useEffect(() => {
    const onVisibilityChange = () => setActivity(documentActivity());
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  return <PlayerShell {...props} {...(resolvedSaveStore === undefined ? {} : { saveStore: resolvedSaveStore })} platform="web" hostActivity={activityOverride ?? activity} />;
}
