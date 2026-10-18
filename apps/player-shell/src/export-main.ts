import { startExportedPlayer } from "./export-startup";

const root = document.getElementById("player-root");
const payload = document.getElementById("world-project");
if (root !== null && payload !== null) {
  startExportedPlayer(root, payload);
}
