import { acquireOrdinaryCanvasImage, nativeAtlasDiagnostics } from "../../apps/player-shell/src/native-atlas";

const probes = ((window as unknown as { imageProbes?: unknown[] }).imageProbes ??= []);
probes.push({ acquire: acquireOrdinaryCanvasImage, diagnostics: nativeAtlasDiagnostics });
