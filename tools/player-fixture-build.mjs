import { build as viteBuild } from "vite";
import { recoveryWorkerPlugin } from "./recovery-worker-bundle.mjs";

/** Keep configFile:false fixtures usable with the same worker resolver. Frozen
 * baseline transforms must apply inside the worker as well as on the UI thread.
 */
export function build(options) {
  const overrides = options.plugins ?? [];
  return viteBuild({ ...options, plugins: [...overrides, recoveryWorkerPlugin(overrides)] });
}
