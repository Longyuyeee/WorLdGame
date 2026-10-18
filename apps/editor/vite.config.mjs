import { defineConfig } from "vite";
import { playerExportPlugin } from "../../tools/player-export-bundle.mjs";
import { recoveryWorkerPlugin } from "../../tools/recovery-worker-bundle.mjs";

export default defineConfig({ plugins: [playerExportPlugin(), recoveryWorkerPlugin()] });
