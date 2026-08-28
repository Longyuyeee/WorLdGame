import { useEffect, useState, type ComponentProps } from "react";
import { PlayerShell, type PlayerHostActivityV1 } from "./PlayerShell";

export interface WebPlayerHostProps extends Omit<ComponentProps<typeof PlayerShell>, "hostActivity" | "platform"> {
  readonly activityOverride?: PlayerHostActivityV1;
}

function documentActivity(): PlayerHostActivityV1 {
  return typeof document !== "undefined" && document.visibilityState === "hidden" ? "suspended" : "active";
}

export function WebPlayerHost({ activityOverride, ...props }: WebPlayerHostProps) {
  const [activity, setActivity] = useState(documentActivity);

  useEffect(() => {
    const onVisibilityChange = () => setActivity(documentActivity());
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  return <PlayerShell {...props} platform="web" hostActivity={activityOverride ?? activity} />;
}
