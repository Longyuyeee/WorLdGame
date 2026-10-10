import { mountWorldPlayerV1 } from "./mount-player";

const root = document.getElementById("player-root");
const payload = document.getElementById("world-project");
if (root !== null && payload !== null) {
  try {
    const data = JSON.parse(payload.textContent ?? "");
    mountWorldPlayerV1(root, data);
  } catch {
    root.textContent = "游戏未能打开，请重新下载完整游戏文件后再试。";
    root.setAttribute("role", "alert");
  }
}
