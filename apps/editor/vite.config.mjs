import { defineConfig } from "vite";
import { playerExportPlugin } from "../../tools/player-export-bundle.mjs";

export default defineConfig({ plugins: [playerExportPlugin()] });
